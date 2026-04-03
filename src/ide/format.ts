import { indentRange, indentUnit } from "@codemirror/language";
import { ChangeSet, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { formatAsmLine } from "../common/format-asm";
import { tabStopsFacet } from "./settings";

export function formatDocument(view: EditorView, isAsm: boolean) {
    let state = view.state;
    const changeSets: ChangeSet[] = [];

    function apply(cs: ChangeSet) {
        changeSets.push(cs);
        // Update state so subsequent passes have correct line positions.
        state = state.update({ changes: cs }).state;
    }

    if (isAsm) {
        // Format using custom tab stops.
        const tabSize = state.facet(EditorState.tabSize);
        const indent = state.facet(indentUnit);
        const stops = state.facet(tabStopsFacet);
        if (stops.length > 0) {
            const specs: { from: number, to: number, insert: string }[] = [];
            for (let i = 1; i <= state.doc.lines; i++) {
                const line = state.doc.line(i);
                const formatted = formatAsmLine(line.text, i, indent, tabSize, stops);
                if (formatted !== line.text) {
                    specs.push({ from: line.from, to: line.to, insert: formatted });
                }
            }
            if (specs.length > 0) {
                apply(state.changes(specs));
            }
        }
    } else {
        // Use CodeMirror's built-in indentation for non-asm languages (e.g. cpp)
        const indentChanges = indentRange(state, 0, state.doc.length);
        if (!indentChanges.empty) {
            apply(indentChanges);
        }
    }

    // Strip trailing whitespace from all lines.
    const trimSpecs: { from: number, to: number, insert: string }[] = [];
    for (let i = 1; i <= state.doc.lines; i++) {
        const line = state.doc.line(i);
        const trimmed = line.text.replace(/\s+$/, "");
        if (trimmed !== line.text) {
            trimSpecs.push({ from: line.from + trimmed.length, to: line.to, insert: "" });
        }
    }
    if (trimSpecs.length > 0) {
        apply(state.changes(trimSpecs));
    }

    // Compose and dispatch all changes; selections are mapped automatically.
    if (changeSets.length > 0) {
        view.dispatch({ changes: changeSets.reduce((a, b) => a.compose(b)) });
    }
}
