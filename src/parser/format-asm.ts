import { indentUnit } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tabStopsFacet } from "../ide/settings";
import { formatLine } from "./format-asm-core";

export function formatAsm(view: EditorView): boolean {
    const doc = view.state.doc;
    const indent = view.state.facet(indentUnit);
    const tabSize = view.state.facet(EditorState.tabSize);
    const stops = view.state.facet(tabStopsFacet);

    if (stops.length === 0) return true;

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
    return true;
}
