import { closeBrackets, deleteBracketPair } from "@codemirror/autocomplete";
import { Compartment, Extension, Facet } from "@codemirror/state";
import { EditorView, highlightSpecialChars, highlightTrailingWhitespace, highlightWhitespace, keymap, lineNumbers } from "@codemirror/view";
import { detectTabStopsFromAsm, Dialect } from "../common/tabdetect";
import { getDialect } from "../common/toolutil";
import { current_project, getCurrentEditorFilename, platform, projectWindows } from "./ui";
import { isMobileDevice } from "./views/baseviews";
import { debugHighlightTagsTooltip } from "./views/debug";
import { AsmTabStops, tabExtension } from "./views/tabs";

declare var bootbox;
declare var $: JQueryStatic;

export const tabCompartment = new Compartment();
export const showLineNumbersCompartment = new Compartment();
export const highlightSpecialCharsCompartment = new Compartment();
export const highlightTrailingWhitespaceCompartment = new Compartment();
export const highlightWhitespaceCompartment = new Compartment();
export const closeBracketsCompartment = new Compartment();
export const debugHighlightTagsCompartment = new Compartment();

export function tabStopsEquals(a: AsmTabStops, b: AsmTabStops): boolean {
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

function tabStopsToColumns(tabStops: AsmTabStops): number[] {
  return [tabStops.opcodes, tabStops.operands, tabStops.comments].filter(n => n > 0).sort((a, b) => a - b);
}

export const tabStopsFacet = Facet.define<AsmTabStops, AsmTabStops>({
  combine: values => values[0],
});

export interface EditorSettings {
  tabSize: number;
  tabsToSpaces: boolean;
  asmTabStops: AsmTabStops;
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
  asmTabStops: DEFAULT_TAB_STOPS,
  showLineNumbers: !isMobileDevice,
  highlightSpecialChars: true,
  highlightTrailingWhitespace: true,
  highlightWhitespace: false,
  closeBrackets: false,
  debugHighlightTags: false,
};

export function loadSettings(): EditorSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      const settings = { ...defaultSettings, ...JSON.parse(stored) };
      return settings;
    }
  } catch (e) { }
  return defaultSettings;
}

export function saveAndApplySettings(isAsm: boolean, settings: EditorSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  const effects = compartmentValues.map(([c, fn]) => c.reconfigure(fn(settings, isAsm)));
  for (const editor of editors) {
    editor.dispatch({ effects });
  }
}

const compartmentValues: [Compartment, (s: EditorSettings, isAsm?: boolean) => Extension][] = [
  [tabCompartment, (s, isAsm) => tabExtension({
    tabSize: s.tabSize,
    tabsToSpaces: s.tabsToSpaces,
    asmTabStops: s.asmTabStops,
    tabStops: isAsm ? tabStopsToColumns(s.asmTabStops) : uniformTabStops(s.tabSize)
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

export function isAsmDialect(dialect: Dialect): boolean {
  return dialect === '6502' || dialect === 'z80' || dialect === '6809';
}

export function detectTabStops(dialect: Dialect, tabSize: number, text: string) {
  if (isAsmDialect(dialect)) {
    return detectTabStopsFromAsm(dialect, tabSize, text);
  } else {
    return {};
  }
}

export function detectAndApplyTabStops(filename: string, text: string) {
  const tool = platform.getToolForFilename(filename);
  const dialect = getDialect(tool);
  const isAsm = isAsmDialect(dialect);
  const settings = loadSettings();
  settings.asmTabStops = detectTabStops(dialect, settings.tabSize, text);
  saveAndApplySettings(isAsm, settings);
}

export function openSettings() {
  const activeView = projectWindows.getActive();
  const editorView = (activeView as any)?.editor ?? (projectWindows.id2window[current_project.mainPath] as any)?.editor;
  const editor = editorView as EditorView;
  const text = editor.state.doc.toString();
  const tool = platform.getToolForFilename(getCurrentEditorFilename());
  const dialect = getDialect(tool);
  const isAsm = isAsmDialect(dialect);

  function updateTabStopRow() {
    if (isAsm) {
      $('#setting_asmColumns').removeClass('disabled');
      $('#setting_asmOpcodes, #setting_asmOperands, #setting_asmComments').prop('disabled', false);
    } else {
      $('#setting_asmColumns').addClass('disabled');
      $('#setting_asmOpcodes, #setting_asmOperands, #setting_asmComments').prop('disabled', true);
    }
  }

  function updateUI(s: EditorSettings) {
    $('#setting_tabSize').val(s.tabSize);
    updateTabStopRow();
    $('#setting_tabInsertsTabs').prop('checked', !s.tabsToSpaces);
    $('#setting_tabInsertsSpaces').prop('checked', s.tabsToSpaces);
    $('#setting_asmOpcodes').val(s.asmTabStops.opcodes || "");
    $('#setting_asmOperands').val(s.asmTabStops.operands || "");
    $('#setting_asmComments').val(s.asmTabStops.comments || "");
    $('#setting_showLineNumbers').prop('checked', s.showLineNumbers);
    $('#setting_highlightSpecialChars').prop('checked', s.highlightSpecialChars);
    $('#setting_highlightTrailingWhitespace').prop('checked', s.highlightTrailingWhitespace);
    $('#setting_highlightWhitespace').prop('checked', s.highlightWhitespace);
    $('#setting_closeBrackets').prop('checked', s.closeBrackets);
    $('#setting_debugHighlightTags').prop('checked', s.debugHighlightTags);
    $('input[name="tabMode"]').first().trigger('change');
  }

  let settings = loadSettings();
  const dialog = bootbox.dialog({
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
      <div class="tab-stops" id="setting_asmColumns">
        <label class="main">Format assembly</label>
        <label class="tab-stop">opcodes</label>: <input type="text" id="setting_asmOpcodes">
        <label class="tab-stop">operands</label>: <input type="text" id="setting_asmOperands">
        <label class="tab-stop">comments</label>: <input type="text" id="setting_asmComments">
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
          settings.asmTabStops = detectTabStopsFromAsm(dialect, defaultSettings.tabSize, text);
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
          settings.asmTabStops.opcodes = parseInt($('#setting_asmOpcodes').val() as string) || undefined;
          settings.asmTabStops.operands = parseInt($('#setting_asmOperands').val() as string) || undefined;
          settings.asmTabStops.comments = parseInt($('#setting_asmComments').val() as string) || undefined;
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
    $('#setting_tabSize').focus().select().on('input', () => {
      settings.tabSize = parseInt($('#setting_tabSize').val() as string) || MIN_TAB_SIZE;
      settings.asmTabStops = detectTabStops(dialect, settings.tabSize, editor.state.doc.toString());
      $('#setting_asmOpcodes').val(settings.asmTabStops.opcodes || "");
      $('#setting_asmOperands').val(settings.asmTabStops.operands || "");
      $('#setting_asmComments').val(settings.asmTabStops.comments || "");
    });
  });
  dialog.on('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      dialog.find('.modal-footer .btn-primary').trigger('click');
    }
  });
}
