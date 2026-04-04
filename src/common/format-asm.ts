// Pure formatting logic — no browser or CodeMirror dependencies.

import { TabStopSettings } from "../ide/views/tabs";
import { columnAt } from "./tabdetect";

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

function splitFirst(text: string): [string, string] {
    const i = text.search(/\s/);
    if (i < 0) return [text, ''];
    return [text.substring(0, i), text.substring(i).trim()];
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

function buildFormattedLine(indented: boolean, label: string, opcode: string, operand: string, comment: string, indentUnit: string, tabSize: number, stops: TabStopSettings): string {
    let result = '';

    if (label) {
        result = label;
    }

    if (opcode) {
        if (label || indented) {
            result = padToColumn(result, stops.opcodes, indentUnit, tabSize);
        }
        result += opcode;
        if (operand) {
            if (stops.operands !== undefined) {
                result = padToColumn(result, stops.operands, indentUnit, tabSize);
            } else {
                result += ' ';
            }
            result += operand;
        }
    }

    if (comment) {
        if (result) {
            if (stops.comments !== undefined) {
                result = padToColumn(result, stops.comments, indentUnit, tabSize);
            } else {
                result += ' ';
            }
        }
        result += comment;
    }

    return result;
}

export function formatAsmLine(raw: string, lineNum: number, indentUnit: string, tabSize: number, stops: TabStopSettings): string {
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
        console.warn(`format: skipping line ${lineNum}, mangles non-whitespace characters\n- before: ${JSON.stringify(text)}\n- after:  ${JSON.stringify(newText)}`);
        return text;
    }
    return newText;
}

export function formatText(text: string, tabSize: number, stops: TabStopSettings): string {
    if (!stops) return text;
    const indent = ' '.repeat(tabSize);
    const lines = text.split('\n');
    const formatted = lines.map((line, i) => formatAsmLine(line, i + 1, indent, tabSize, stops));
    return formatted.join('\n');
}
