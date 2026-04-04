import { closeBrackets, deleteBracketPair } from "@codemirror/autocomplete";
import { Compartment, Extension, Facet } from "@codemirror/state";
import { EditorView, highlightSpecialChars, highlightTrailingWhitespace, highlightWhitespace, keymap, lineNumbers } from "@codemirror/view";
import { detectTabStopsFromAsm } from "../common/tabdetect";
import { getDialect } from "../common/toolutil";
import { getCurrentEditorFilename, platform } from "./ui";
import { isMobileDevice } from "./views/baseviews";
import { debugHighlightTagsTooltip } from "./views/debug";
import { tabExtension, TabStopSettings } from "./views/tabs";

declare var bootbox;
declare var $: JQueryStatic;

export const tabCompartment = new Compartment();
export const showLineNumbersCompartment = new Compartment();
export const highlightSpecialCharsCompartment = new Compartment();
export const highlightTrailingWhitespaceCompartment = new Compartment();
export const highlightWhitespaceCompartment = new Compartment();
export const closeBracketsCompartment = new Compartment();
export const debugHighlightTagsCompartment = new Compartment();

export function tabStopsEquals(a: TabStopSettings, b: TabStopSettings): boolean {
  return a.opcodes === b.opcodes && a.operands === b.operands && a.comments === b.comments;
}

const MAX_COLS = 300;
const MIN_TAB_SIZE = 1;
const MAX_TAB_SIZE = 40;
const DEFAULT_TAB_SIZE = 8;
const DEFAULT_TAB_STOPS = {
  opcodes: 10,
  operands: 15,
  comments: 35,
};

const editors: Set<EditorView> = new Set();

export function registerEditor(editor: EditorView) {
  editors.add(editor);
}

export function unregisterEditor(editor: EditorView) {
  editors.delete(editor);
}

function uniformTabStops(interval: number): number[] {
  const stops: number[] = [];
  for (let col = interval; col <= MAX_COLS; col += interval) stops.push(col);
  return stops;
}

function tabStopsToColumns(tabStops: TabStopSettings): number[] {
  return [tabStops.opcodes, tabStops.operands, tabStops.comments].filter(n => n > 0).sort((a, b) => a - b);
}

export const tabStopsFacet = Facet.define<TabStopSettings, TabStopSettings>({
  combine: values => values[0],
});

export interface EditorSettings {
  tabSize: number;
  tabsToSpaces: boolean;
  tabStopsSettings: TabStopSettings;
  showLineNumbers: boolean;
  highlightSpecialChars: boolean;
  highlightTrailingWhitespace: boolean;
  highlightWhitespace: boolean;
  closeBrackets: boolean;
  debugHighlightTags: boolean;
}

const SETTINGS_KEY = "8bitworkshop/editorSettings";

const defaultSettings: EditorSettings = {
  tabSize: DEFAULT_TAB_SIZE,
  tabsToSpaces: true,
  tabStopsSettings: DEFAULT_TAB_STOPS,
  showLineNumbers: !isMobileDevice,
  highlightSpecialChars: true,
  highlightTrailingWhitespace: true,
  highlightWhitespace: false,
  closeBrackets: false,
  debugHighlightTags: false,
};

export function loadSettings(): EditorSettings {
  try {
    var stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      var settings = { ...defaultSettings, ...JSON.parse(stored) };
      return settings;
    }
  } catch (e) { }
  return defaultSettings;
}

export function saveAndApplySettings(isAsm: boolean, settings: EditorSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  var effects = compartmentValues.map(([c, fn]) => c.reconfigure(fn(settings, isAsm)));
  for (var editor of editors) {
    editor.dispatch({ effects });
  }
}

const compartmentValues: [Compartment, (s: EditorSettings, isAsm?: boolean) => Extension][] = [
  [tabCompartment, (s, isAsm) => tabExtension({
    tabSize: s.tabSize,
    tabsToSpaces: s.tabsToSpaces,
    tabStopsSettings: s.tabStopsSettings,
    tabStops: isAsm ? tabStopsToColumns(s.tabStopsSettings) : uniformTabStops(s.tabSize)
  })],
  [showLineNumbersCompartment, s => s.showLineNumbers ? lineNumbers() : []],
  [highlightSpecialCharsCompartment, s => s.highlightSpecialChars ? highlightSpecialChars() : []],
  [highlightTrailingWhitespaceCompartment, s => s.highlightTrailingWhitespace ? highlightTrailingWhitespace() : []],
  [highlightWhitespaceCompartment, s => s.highlightWhitespace ? highlightWhitespace() : []],
  [closeBracketsCompartment, s => s.closeBrackets ? [closeBrackets(), keymap.of([{ key: "Backspace", run: deleteBracketPair }])] : []],
  [debugHighlightTagsCompartment, s => s.debugHighlightTags ? debugHighlightTagsTooltip : []],
];

export function settingsExtensions(isAsm: boolean, settings: EditorSettings): Extension[] {
  return compartmentValues.map(([c, fn]) => c.of(fn(settings, isAsm)));
}

export function autoDetectTabStops(filename: string, text: string) {
  var tool = platform.getToolForFilename(filename);
  var dialect = getDialect(tool);
  var settings = loadSettings();
  var isAsm = dialect === '6502' || dialect === 'z80' || dialect === '6809';
  if (isAsm) {
    settings.tabStopsSettings = detectTabStopsFromAsm(text, dialect, settings.tabSize);
  } else {
    settings.tabStopsSettings = {};
  }
  saveAndApplySettings(isAsm, settings);
}

export function openSettings() {
  const editor = editors.values().next().value;
  const text = editor.state.doc.toString();
  const tool = platform.getToolForFilename(getCurrentEditorFilename());
  const dialect = getDialect(tool);
  const isAsm = dialect === '6502' || dialect === 'z80' || dialect === '6809';

  function getSelectedTabSize() {
    return parseInt($('#setting_tabSize').val() as string) || DEFAULT_TAB_SIZE;
  }

  function updateTabStopRow(tabsToSpaces: boolean) {
    if (isAsm && tabsToSpaces) {
      $('#setting_tabStopsRow').removeClass('disabled');
      $('#setting_tabStopOpcodes, #setting_tabStopOperands, #setting_tabStopComments').prop('disabled', false);
    } else {
      $('#setting_tabStopsRow').addClass('disabled');
      $('#setting_tabStopOpcodes, #setting_tabStopOperands, #setting_tabStopComments').prop('disabled', true);
    }
  }

  function updateUI(s: EditorSettings) {
    $('#setting_tabSize').val(s.tabSize);
    updateTabStopRow(s.tabsToSpaces);
    $('#setting_tabInsertsTabs').prop('checked', !s.tabsToSpaces);
    $('#setting_tabInsertsSpaces').prop('checked', s.tabsToSpaces);
    $('#setting_tabStopOpcodes').val(s.tabStopsSettings.opcodes || "");
    $('#setting_tabStopOperands').val(s.tabStopsSettings.operands || "");
    $('#setting_tabStopComments').val(s.tabStopsSettings.comments || "");
    $('#setting_showLineNumbers').prop('checked', s.showLineNumbers);
    $('#setting_highlightSpecialChars').prop('checked', s.highlightSpecialChars);
    $('#setting_highlightTrailingWhitespace').prop('checked', s.highlightTrailingWhitespace);
    $('#setting_highlightWhitespace').prop('checked', s.highlightWhitespace);
    $('#setting_closeBrackets').prop('checked', s.closeBrackets);
    $('#setting_debugHighlightTags').prop('checked', s.debugHighlightTags);
    $('input[name="tabMode"]').first().trigger('change');
  }

  let settings = loadSettings();
  var dialog = bootbox.dialog({
    onEscape: true,
    // title: "Settings",
    message: `<form id="settingsForm" onsubmit="return false">
      <h5>Editor settings</h5>
      <div>
        <label class="main">Tab size</label> <input type="number" id="setting_tabSize" min="${MIN_TAB_SIZE}" max="${MAX_TAB_SIZE}" style="width:4em">
      </div>
      <div>
        <label class="main">Tab key inserts</label>
        <label><input type="radio" name="tabMode" id="setting_tabInsertsTabs"> tabs</label>
        <label><input type="radio" name="tabMode" id="setting_tabInsertsSpaces"> spaces</label>
      </div>
      <div class="tab-stops" id="setting_tabStopsRow">
        <label class="main">Tab stops</label> [assembly only]
        <label class="tab-stop">opcodes</label>: <input type="text" id="setting_tabStopOpcodes">
        <label class="tab-stop">operands</label>: <input type="text" id="setting_tabStopOperands">
        <label class="tab-stop">comments</label>: <input type="text" id="setting_tabStopComments">
      </div>

      <div class="checkbox"><label><input type="checkbox" id="setting_showLineNumbers"> Show line numbers</label></div>
      <div class="checkbox"><label><input type="checkbox" id="setting_highlightSpecialChars"> Show special characters</label></div>
      <div class="checkbox"><label><input type="checkbox" id="setting_highlightTrailingWhitespace"> Highlight trailing whitespace</label></div>
      <div class="checkbox"><label><input type="checkbox" id="setting_highlightWhitespace"> Show whitespace</label></div>
      <div class="checkbox"><label><input type="checkbox" id="setting_closeBrackets"> Automatically add and remove closing brackets</label></div>

      <h5>8bitworkshop IDE internal settings</h5>
      <div class="checkbox"><label><input type="checkbox" id="setting_debugHighlightTags"> Debug parser and syntax highlighting</label></div>
    </form>`,
    buttons: {
      reset: {
        label: "Reset",
        className: "btn-default",
        callback: () => {
          settings = { ...defaultSettings };
          settings.tabStopsSettings = detectTabStopsFromAsm(text, dialect, defaultSettings.tabSize);
          updateUI(settings);
          return false;
        }
      },
      cancel: {
        label: "Cancel",
        className: "btn-default"
      },
      ok: {
        label: "SAVE",
        className: "btn-primary",
        callback: () => {
          settings.tabSize = Math.min(MAX_TAB_SIZE, Math.max(MIN_TAB_SIZE, parseInt($('#setting_tabSize').val() as string) || MIN_TAB_SIZE));
          settings.tabsToSpaces = $('#setting_tabInsertsSpaces').is(':checked');
          settings.tabStopsSettings.opcodes = parseInt($('#setting_tabStopOpcodes').val() as string) || undefined;
          settings.tabStopsSettings.operands = parseInt($('#setting_tabStopOperands').val() as string) || undefined;
          settings.tabStopsSettings.comments = parseInt($('#setting_tabStopComments').val() as string) || undefined;
          settings.showLineNumbers = $('#setting_showLineNumbers').is(':checked');
          settings.highlightSpecialChars = $('#setting_highlightSpecialChars').is(':checked');
          settings.highlightTrailingWhitespace = $('#setting_highlightTrailingWhitespace').is(':checked');
          settings.highlightWhitespace = $('#setting_highlightWhitespace').is(':checked');
          settings.closeBrackets = $('#setting_closeBrackets').is(':checked');
          settings.debugHighlightTags = $('#setting_debugHighlightTags').is(':checked');
          saveAndApplySettings(isAsm, settings);
        }
      }
    }
  });
  dialog.on('shown.bs.modal', () => {
    updateUI(settings);
    $('#setting_tabSize').focus().select();
    $('#setting_tabInsertsTabs, #setting_tabInsertsSpaces').on('change', () => {
      updateTabStopRow($('#setting_tabInsertsSpaces').is(':checked'));
    });
  });
  dialog.on('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      dialog.find('.modal-footer .btn-primary').trigger('click');
    }
  });
}
