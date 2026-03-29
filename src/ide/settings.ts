import { closeBrackets, deleteBracketPair } from "@codemirror/autocomplete";
import { indentLess, insertTab } from "@codemirror/commands";
import { indentUnit } from "@codemirror/language";
import { Compartment, EditorState, Extension, Facet } from "@codemirror/state";
import { EditorView, highlightSpecialChars, highlightTrailingWhitespace, highlightWhitespace, keymap, lineNumbers } from "@codemirror/view";
import { isMobileDevice } from "./views/baseviews";
import { debugHighlightTagsTooltip } from "./views/debug";

declare var bootbox;
declare var $: JQueryStatic;

export const tabCompartment = new Compartment();
export const showLineNumbersCompartment = new Compartment();
export const highlightSpecialCharsCompartment = new Compartment();
export const highlightWhitespaceCompartment = new Compartment();
export const highlightTrailingWhitespaceCompartment = new Compartment();
export const closeBracketsCompartment = new Compartment();
export const debugHighlightTagsCompartment = new Compartment();


const MAX_COLS = 300;
const MIN_TAB_SIZE = 1;
const MAX_TAB_SIZE = 40;
const DEFAULT_TAB_SIZE = 8;
const DEFAULT_TAB_STOPS = "10 15 35";

const editors: Set<EditorView> = new Set();

export function registerEditor(editor: EditorView) {
  editors.add(editor);
}

export function unregisterEditor(editor: EditorView) {
  editors.delete(editor);
}

export function parseTabStops(input: string): number[] {
  return input.split(/\D+/).map(s => parseInt(s)).filter(n => n > 0);
}

function uniformTabStops(interval: number): number[] {
  const stops: number[] = [];
  for (let col = interval; col <= MAX_COLS; col += interval) stops.push(col);
  return stops;
}

export const tabStopsFacet = Facet.define<number[], number[]>({
  combine: values => values[0],
});

export interface EditorSettings {
  tabSize: number;
  tabsToSpaces: boolean;
  tabStops: string;
  showLineNumbers: boolean;
  highlightSpecialChars: boolean;
  highlightWhitespace: boolean;
  highlightTrailingWhitespace: boolean;
  closeBrackets: boolean;
  debugHighlightTags: boolean;
}

const SETTINGS_KEY = "8bitworkshop/editorSettings";

const defaultSettings: EditorSettings = {
  tabSize: DEFAULT_TAB_SIZE,
  tabsToSpaces: true,
  tabStops: DEFAULT_TAB_STOPS,
  showLineNumbers: !isMobileDevice,
  highlightSpecialChars: true,
  highlightWhitespace: false,
  highlightTrailingWhitespace: false,
  closeBrackets: false,
  debugHighlightTags: false,
};

export function loadSettings(): EditorSettings {
  try {
    var stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      return { ...defaultSettings, ...JSON.parse(stored) };
    }
  } catch (e) { }
  return defaultSettings;
}

export function saveSettings(settings: EditorSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

const compartmentValues: [Compartment, (s: EditorSettings) => Extension][] = [
  [tabCompartment, s => [
    EditorState.tabSize.of(s.tabSize),
    indentUnit.of(s.tabsToSpaces ? " ".repeat(s.tabSize) : "\t"),
    keymap.of([
      { key: "Tab", run: insertTab /* insertTab uses indentMore when something is selected */ },
      { key: "Shift-Tab", run: indentLess }
    ]),
    tabStopsFacet.of(s.tabsToSpaces ? parseTabStops(s.tabStops) : uniformTabStops(s.tabSize)),
  ]],
  [showLineNumbersCompartment, s => s.showLineNumbers ? lineNumbers() : []],
  [highlightSpecialCharsCompartment, s => s.highlightSpecialChars ? highlightSpecialChars() : []],
  [highlightWhitespaceCompartment, s => s.highlightWhitespace ? highlightWhitespace() : []],
  [highlightTrailingWhitespaceCompartment, s => s.highlightTrailingWhitespace ? highlightTrailingWhitespace() : []],
  [closeBracketsCompartment, s => s.closeBrackets ? [closeBrackets(), keymap.of([{ key: "Backspace", run: deleteBracketPair }])] : []],
  [debugHighlightTagsCompartment, s => s.debugHighlightTags ? debugHighlightTagsTooltip : []],
];

export function settingsExtensions(settings: EditorSettings): Extension[] {
  return compartmentValues.map(([c, fn]) => c.of(fn(settings)));
}

export function applySettings(settings: EditorSettings) {
  var effects = compartmentValues.map(([c, fn]) => c.reconfigure(fn(settings)));
  for (var editor of editors) {
    editor.dispatch({ effects });
  }
}

export function openSettings() {
  var settings = loadSettings();
  var dialog = bootbox.dialog({
    onEscape: true,
    title: "Settings",
    message: `<form id="settingsForm" onsubmit="return false">
       <h5>Editor preferences</h5>
       <div class="checkbox"><label>Tab size: <input type="number" id="setting_tabSize" min="${MIN_TAB_SIZE}" max="${MAX_TAB_SIZE}" value="${settings.tabSize}" style="width:4em"></label></div>
       <div class="radio"><label><input type="radio" name="tabMode" id="setting_tabInsertsTabs" ${!settings.tabsToSpaces ? 'checked' : ''}> Tab key inserts tabs</label></div>
       <div class="radio"><label><input type="radio" name="tabMode" id="setting_tabInsertsSpaces" ${settings.tabsToSpaces ? 'checked' : ''}> Tab key inserts spaces<span id="setting_tabStopsGroup" style="${!settings.tabsToSpaces ? 'opacity:0.5' : ''}">,
        use tab stops <input type="text" id="setting_tabStops" value="${settings.tabStops}" style="width:16em" placeholder="${DEFAULT_TAB_STOPS}" ${!settings.tabsToSpaces ? 'disabled' : ''}></span></label></div>
       <div class="checkbox"><label><input type="checkbox" id="setting_showLineNumbers" ${settings.showLineNumbers ? 'checked' : ''}> Show line numbers</label></div>
       <div class="checkbox"><label><input type="checkbox" id="setting_highlightSpecialChars" ${settings.highlightSpecialChars ? 'checked' : ''}> Highlight special characters</label></div>
       <div class="checkbox"><label><input type="checkbox" id="setting_highlightWhitespace" ${settings.highlightWhitespace ? 'checked' : ''}> Highlight all whitespace</label></div>
       <div class="checkbox"><label><input type="checkbox" id="setting_highlightTrailingWhitespace" ${settings.highlightTrailingWhitespace ? 'checked' : ''}> Highlight trailing whitespace</label></div>
       <div class="checkbox"><label><input type="checkbox" id="setting_closeBrackets" ${settings.closeBrackets ? 'checked' : ''}> Automatically add and remove closing brackets</label></div>
       <hr>
       <h5>8bitworkshop IDE internal settings</h5>
       <div class="checkbox"><label><input type="checkbox" id="setting_debugHighlightTags" ${settings.debugHighlightTags ? 'checked' : ''}> Debug parser and syntax highlighting</label></div>
      </form>`,
    buttons: {
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
          settings.tabStops = ($('#setting_tabStops').val() as string).trim();
          settings.showLineNumbers = $('#setting_showLineNumbers').is(':checked');
          settings.highlightSpecialChars = $('#setting_highlightSpecialChars').is(':checked');
          settings.highlightWhitespace = $('#setting_highlightWhitespace').is(':checked');
          settings.highlightTrailingWhitespace = $('#setting_highlightTrailingWhitespace').is(':checked');
          settings.closeBrackets = $('#setting_closeBrackets').is(':checked');
          settings.debugHighlightTags = $('#setting_debugHighlightTags').is(':checked');
          saveSettings(settings);
          applySettings(settings);
        }
      }
    }
  });
  dialog.on('shown.bs.modal', () => {
    $('#setting_tabSize').focus().select();
    $('input[name="tabMode"]').on('change', () => {
      var spacesSelected = $('#setting_tabInsertsSpaces').is(':checked');
      $('#setting_tabStops').prop('disabled', !spacesSelected);
      $('#setting_tabStopsGroup').css('opacity', spacesSelected ? '' : '0.5');
    });
  });
  dialog.on('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      dialog.find('.btn-primary').trigger('click');
    }
  });
}
