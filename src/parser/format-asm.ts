import { EditorState } from "@codemirror/state";
import { indentUnit } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tabStopsFacet } from "../ide/settings";
import { columnAt } from "../ide/views/tabs";

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

function splitFirst(text: string): [string, string] {
    const i = text.search(/\s/);
    if (i < 0) return [text, ''];
    return [text.substring(0, i), text.substring(i).trim()];
}

function formatLine(raw: string, lineNum: number, indentUnit: string, tabSize: number, stops: number[]): string {
    const text = raw.trimEnd();
    if (text === '') return '';

    const firstNonSpace = text.search(/\S/);
    if (text[firstNonSpace] === ';') return text;

    const indented = firstNonSpace > 0;
    const commentIdx = findCommentIndex(text);
    const comment = text.substring(commentIdx);
    const content = text.substring(indented ? firstNonSpace : 0, commentIdx).trimEnd();

    let label = '';
    let opcode = '';
    let operand = '';

    if (!indented) {
        [label, opcode] = splitFirst(content);
        if (opcode) [opcode, operand] = splitFirst(opcode);
    } else {
        [opcode, operand] = splitFirst(content);
    }

    const newText = buildFormattedLine(indented, label, opcode, operand, comment, indentUnit, tabSize, stops);
    if (newText.replace(/\s/g, '') !== text.replace(/\s/g, '')) {
        console.warn(`format-asm: skipping line ${lineNum}, mangles non-whitespace characters\n- before: ${JSON.stringify(text)}\n- after:  ${JSON.stringify(newText)}`);
        return text;
    }
    return newText;
}

export function findCommentIndex(text: string): number {
    let quote = '';
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (quote) {
            if (ch === quote) quote = '';
        } else if (ch === '"' || ch === "'") {
            quote = ch;
        } else if (ch === ';') {
            return i;
        }
    }
    return text.length;
}

function padToColumn(s: string, targetCol: number, indentUnit: string, tabSize: number): string {
    const col = columnAt(s, s.length, tabSize);
    if (col >= targetCol) return s + ' ';
    if (indentUnit === '\t') {
        const nextTabCol = col + tabSize - (col % tabSize);
        if (nextTabCol === targetCol) return s + '\t';
    }
    return s + ' '.repeat(targetCol - col);
}

function buildFormattedLine(indented: boolean, label: string, opcode: string, operand: string, comment: string, indentUnit: string, tabSize: number, stops: number[]): string {
    // 3+ stops:  opcode @ stop[0], operand @ stop[1], comment @ stop[2]
    // 2  stops:  opcode @ stop[0], operand @ stop[1]
    // 1  stop :  opcode @ stop[0], rest unmodified
    // 0  stops:  no formatting
    const opcodeStop = stops[0];
    const operandStop = stops.length >= 2 ? stops[1] : undefined;
    const commentStop = stops.length >= 3 ? stops[2] : undefined;

    let result = '';

    if (label) {
        result = label;
    }

    if (opcode) {
        if (label || indented) {
            result = padToColumn(result, opcodeStop, indentUnit, tabSize);
        }
        result += opcode;
        if (operand) {
            if (operandStop !== undefined) {
                result = padToColumn(result, operandStop, indentUnit, tabSize);
            } else {
                result += ' ';
            }
            result += operand;
        }
    }

    if (comment) {
        if (result) {
            if (commentStop !== undefined) {
                result = padToColumn(result, commentStop, indentUnit, tabSize);
            } else {
                result += ' ';
            }
        }
        result += comment;
    }

    return result;
}
