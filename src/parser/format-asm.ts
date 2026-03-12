// Format assembly source using tab stop positions from settings.
//
// Labels always start at column 0.
// Tab stops control field alignment:
//
//   3+ stops:  opcode @ stop[0], operand @ stop[1], comment @ stop[2]
//   2  stops:  opcode @ stop[0], operand follows opcode with a space, comment @ stop[1]
//   1  stop:   opcode @ stop[0], rest unmodified
//   0  stops:  no formatting

import { EditorState, Text } from "@codemirror/state";
import { indentUnit, syntaxTree } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import type { SyntaxNode, Tree } from "@lezer/common";
import { tabStopsFacet } from "../ide/settings";

export function formatAsm(view: EditorView): boolean {
    const tree = syntaxTree(view.state);
    const doc = view.state.doc;
    const indent = view.state.facet(indentUnit);
    const tabSize = view.state.facet(EditorState.tabSize);
    const stops = view.state.facet(tabStopsFacet);

    if (stops.length === 0) return true;

    const changes: { from: number, to: number, insert: string }[] = [];
    for (let i = 1; i <= doc.lines; i++) {
        const line = doc.line(i);
        const formatted = formatLine(line, tree, doc, i, indent, tabSize, stops);
        if (formatted !== line.text) {
            changes.push({ from: line.from, to: line.to, insert: formatted });
        }
    }

    if (changes.length > 0) {
        view.dispatch({ changes, scrollIntoView: false });
    }
    return true;
}

function formatLine(line: { from: number, text: string }, tree: Tree, doc: Text, lineNum: number, indentUnit: string, tabSize: number, stops: number[]): string {
    if (line.text.trim() === '') return '';

    const firstNonSpace = line.text.search(/\S/);
    let lineNode = tree.resolveInner(line.from + firstNonSpace, 1);
    while (lineNode && lineNode.name !== 'Line' && lineNode.name !== 'Program') {
        lineNode = lineNode.parent;
    }
    if (lineNode?.name !== 'Line') return normalizeLeadingWhitespace(line.text.trimEnd(), indentUnit, tabSize, stops);

    const labelNode = lineNode.getChild('Label');
    const stmtNode = lineNode.getChild('Statement');
    if (!labelNode && !stmtNode) return normalizeLeadingWhitespace(line.text.trimEnd(), indentUnit, tabSize, stops);

    // Don't change whether a line is indented or not
    const indented = firstNonSpace > 0;
    const label = (labelNode && !indented) ? doc.sliceString(labelNode.from, labelNode.to).trim() : '';

    const commentIdx = findCommentIndex(line.text);
    const comment = line.text.substring(commentIdx);
    const contentEnd = line.from + commentIdx;

    let opcode = '';
    let operand = '';

    if (labelNode && indented) {
        opcode = doc.sliceString(labelNode.from, labelNode.to).trim();
    }

    if (stmtNode) {
        const result = extractOpcodeEnd(stmtNode, doc);
        if (opcode) {
            operand = doc.sliceString(result.opcodeEnd, contentEnd).trim();
            if (result.opcode) {
                operand = operand ? result.opcode + ' ' + operand : result.opcode;
            }
        } else {
            opcode = result.opcode;
            operand = doc.sliceString(result.opcodeEnd, contentEnd).trim();
        }
    } else {
        const afterLabel = labelNode ? labelNode.to : line.from + firstNonSpace;
        const equalsNode = findNode(tree, afterLabel, afterLabel + 3, 'Equals');
        if (equalsNode) {
            opcode = '=';
            operand = doc.sliceString(equalsNode.to, contentEnd).trim();
        } else {
            const remaining = doc.sliceString(afterLabel, contentEnd).trim();
            if (remaining) {
                if (opcode) {
                    operand = remaining;
                } else {
                    const spaceIdx = remaining.search(/\s/);
                    if (spaceIdx > 0) {
                        opcode = remaining.substring(0, spaceIdx);
                        operand = remaining.substring(spaceIdx).trim();
                    } else {
                        opcode = remaining;
                    }
                }
            }
        }
    }

    const newText = buildFormattedLine(indented, label, opcode, operand, comment, indentUnit, tabSize, stops);

    const trimmed = line.text.trimEnd();
    const oldChars = trimmed.replace(/\s/g, '');
    const newChars = newText.replace(/\s/g, '');
    if (newChars !== oldChars) {
        console.warn(`format-asm: skipping line ${lineNum}, mangles non-whitespace characters\n- before: ${JSON.stringify(trimmed)}\n- after:  ${JSON.stringify(newText)}`);
        return trimmed;
    }
    return newText;
}

function normalizeLeadingWhitespace(text: string, indentUnit: string, tabSize: number, stops: number[]): string {
    const firstNonSpace = text.search(/\S/);
    if (firstNonSpace <= 0) return text;
    return padToColumn('', stops[0], indentUnit, tabSize) + text.substring(firstNonSpace);
}

function findNode(tree: Tree, from: number, to: number, name: string): SyntaxNode | null {
    let result: SyntaxNode | null = null;
    tree.iterate({ from, to, enter(node) {
        if (node.name === name) { result = node.node; return false; }
    }});
    return result;
}

const STMT_OPCODE_CHILDREN: [string, string][] = [
    ['Instruction', 'Opcode'],
    ['Directive', 'PseudoOp'],
    ['Directive', 'Equals'],
    ['HexDirective', 'HexOp'],
    ['MacroDef', 'Mac'],
];

function extractOpcodeEnd(stmtNode, doc: Text): { opcode: string, opcodeEnd: number } {
    for (const [parentName, childName] of STMT_OPCODE_CHILDREN) {
        const parent = stmtNode.getChild(parentName);
        if (!parent) continue;
        const child = parent.getChild(childName);
        if (!child) continue;
        return {
            opcode: doc.sliceString(child.from, child.to),
            opcodeEnd: child.to
        };
    }

    for (const name of ['MacEnd', 'ControlOp', 'ErrorOp'] as const) {
        const node = stmtNode.getChild(name);
        if (node) {
            return {
                opcode: doc.sliceString(node.from, node.to),
                opcodeEnd: node.to
            };
        }
    }

    return { opcode: '', opcodeEnd: stmtNode.from };
}

function findCommentIndex(text: string): number {
    let inString = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inString) {
            if (ch === '\\') { i++; continue; }
            if (ch === '"') inString = false;
        } else if (ch === '"') {
            inString = true;
        } else if (ch === ';') {
            return i;
        }
    }
    return text.length;
}

function visualWidth(s: string, tabSize: number): number {
    let col = 0;
    for (const ch of s) {
        if (ch === '\t') {
            col = col + tabSize - (col % tabSize);
        } else {
            col++;
        }
    }
    return col;
}

function padToColumn(s: string, targetCol: number, indentUnit: string, tabSize: number): string {
    const col = visualWidth(s, tabSize);
    if (col >= targetCol) return s + ' ';
    if (indentUnit === '\t') {
        const nextTabCol = col + tabSize - (col % tabSize);
        if (nextTabCol === targetCol) return s + '\t';
    }
    return s + ' '.repeat(targetCol - col);
}

function buildFormattedLine(indented: boolean, label: string, opcode: string, operand: string, comment: string, indentUnit: string, tabSize: number, stops: number[]): string {
    const opcodeStop = stops[0];
    const operandStop = stops.length >= 3 ? stops[1] : undefined;
    const commentStop = stops.length >= 3 ? stops[2] : stops.length >= 2 ? stops[1] : undefined;

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
