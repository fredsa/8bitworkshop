import { indentRange, indentUnit } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { formatLine } from "../common/format-asm";
import { tabStopsFacet } from "./settings";

export function formatDocument(view: EditorView, isAsm: boolean) {
    if (isAsm) {
        // Format using custom tab stops.
        formatAsm(view);
    } else {
        // Use CodeMirror's built-in indentation for non-asm languages (e.g. cpp)
        view.dispatch({ changes: indentRange(view.state, 0, view.state.doc.length) });
    }
}

export function formatAsm(view: EditorView) {
    const doc = view.state.doc;
    const indent = view.state.facet(indentUnit);
    const tabSize = view.state.facet(EditorState.tabSize);
    const stops = view.state.facet(tabStopsFacet);

    if (stops.length === 0) return;

    const changes: { from: number, to: number, insert: string }[] = [];
    for (let i = 1; i <= doc.lines; i++) {
        const line = doc.line(i);
        const formatted = formatLine(line.text, i, indent, tabSize, stops);
        if (formatted !== line.text) {
            changes.push({ from: line.from, to: line.to, insert: formatted });
        }
    }

    if (changes.length > 0) {
        view.dispatch({ changes, scrollIntoView: false });
    }
}
