import { indentLess, indentMore } from "@codemirror/commands";
import { indentUnit } from "@codemirror/language";
import { EditorSelection, EditorState, Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { columnAt } from "../../common/tabdetect";
import { tabStopsFacet } from "../settings";

export interface TabStopSettings {
  opcodes?: number;
  operands?: number;
  comments?: number;
}

export interface TabSettings {
  tabSize: number;
  tabsToSpaces: boolean;
  tabStopsSettings: TabStopSettings;
  tabStops: number[];
}

function tabStopsToColumns(tabStops: TabStopSettings): number[] {
  return [tabStops.opcodes, tabStops.operands, tabStops.comments].filter(n => n > 0).sort((a, b) => a - b);
}

function nextTabStop(col: number, stops: TabStopSettings, tabSize: number): number {
  const columns = tabStopsToColumns(stops);
  for (const stop of columns) {
    if (stop > col) return stop;
  }
  return col + tabSize - (col % tabSize);
}

function insertToNextTabStop(view: EditorView): boolean {
  if (view.state.selection.ranges.some(r => !r.empty)) {
    return indentMore(view);
  }
  const useTabs = view.state.facet(indentUnit) === '\t';
  const stops = view.state.facet(tabStopsFacet);
  const tabSize = view.state.facet(EditorState.tabSize);
  view.dispatch(view.state.changeByRange(range => {
    const insert = useTabs ? '\t' : (() => {
      const line = view.state.doc.lineAt(range.head);
      const col = columnAt(line.text, range.head - line.from, tabSize);
      return ' '.repeat(nextTabStop(col, stops, tabSize) - col);
    })();
    return {
      changes: { from: range.head, insert },
      range: EditorSelection.cursor(range.head + insert.length)
    };
  }));
  return true;
}

export function tabExtension(s: TabSettings): Extension {
  return [
    EditorState.tabSize.of(s.tabSize),
    indentUnit.of(s.tabsToSpaces ? " ".repeat(s.tabSize) : "\t"),
    keymap.of([
      { key: "Tab", run: insertToNextTabStop },
      { key: "Shift-Tab", run: indentLess }
    ]),
    tabStopsFacet.of(s.tabStopsSettings),
  ];
}
