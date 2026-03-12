import { EditorState, Text } from "@codemirror/state";
import { indentUnit, syntaxTree } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import type { Tree } from "@lezer/common";

export function formatAsm(view: EditorView): boolean {
    const tree = syntaxTree(view.state);
    const doc = view.state.doc;
    const indent = view.state.facet(indentUnit);
    const tabSize = view.state.facet(EditorState.tabSize);

    const changes: { from: number, to: number, insert: string }[] = [];
    for (let i = 1; i <= doc.lines; i++) {
        const line = doc.line(i);
        const formatted = formatLine(line, tree, doc, i, indent, tabSize);
        if (formatted !== line.text) {
            changes.push({ from: line.from, to: line.to, insert: formatted });
        }
    }

    if (changes.length > 0) {
        view.dispatch({ changes, scrollIntoView: false });
    }
    return true;
}

function formatLine(line: { from: number, text: string }, tree: Tree, doc: Text, lineNum: number, indentUnit: string, tabSize: number): string {
    if (line.text.trim() === '') return '';

    const firstNonSpace = line.text.search(/\S/);
    let lineNode = tree.resolveInner(line.from + firstNonSpace, 1);
    while (lineNode && lineNode.name !== 'Line' && lineNode.name !== 'Program') {
        lineNode = lineNode.parent;
    }
    if (lineNode?.name !== 'Line') return line.text.trimEnd();

    const labelNode = lineNode.getChild('Label');
    const stmtNode = lineNode.getChild('Statement');
    if (!labelNode && !stmtNode) return line.text.trimEnd();

    // Handle parser ambiguity between labels and opcodes
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
            // Label was re-interpreted as opcode; statement text becomes operand
            operand = doc.sliceString(result.opcodeEnd, contentEnd).trim();
            if (result.opcode) {
                operand = operand ? result.opcode + ' ' + operand : result.opcode;
            }
        } else {
            opcode = result.opcode;
            operand = doc.sliceString(result.opcodeEnd, contentEnd).trim();
        }
    } else {
        // No Statement node — fall back to raw text splitting
        // (e.g. dotted forms like .mac/.if, or `=` assignments).
        const afterPos = labelNode ? labelNode.to : line.from + firstNonSpace;
        const remaining = doc.sliceString(afterPos, contentEnd).trim();
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

    const leadingWs = indented ? line.text.substring(0, firstNonSpace) : '';
    const newText = buildFormattedLine(leadingWs, label, opcode, operand, comment, indentUnit, tabSize);

    const trimmed = line.text.trimEnd();
    const oldChars = trimmed.replace(/\s/g, '');
    const newChars = newText.replace(/\s/g, '');
    if (newChars !== oldChars) {
        console.warn(`format-asm: skipping line ${lineNum}, mangles non-whitespace characters\n- before: ${JSON.stringify(trimmed)}\n- after:  ${JSON.stringify(newText)}`);
        return trimmed;
    }
    return newText;
}

const STMT_OPCODE_CHILDREN: [string, string][] = [
    ['Instruction', 'Opcode'],
    ['Directive', 'PseudoOp'],
    ['HexDirective', 'HexOp'],
    ['MacroDef', 'Mac'],
];

function extractOpcodeEnd(stmtNode, doc: Text): { opcode: string, opcodeEnd: number } {
    for (const [parentName, childName] of STMT_OPCODE_CHILDREN) {
        const parent = stmtNode.getChild(parentName);
        if (parent) {
            const child = parent.getChild(childName);
            return {
                opcode: child ? doc.sliceString(child.from, child.to) : '',
                opcodeEnd: child ? child.to : parent.from
            };
        }
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

// Skip semicolons inside strings.
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

// Compute the visual column width of a string, accounting for tab stops.
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

function padToNextTabStop(s: string, indentUnit: string, tabSize: number): string {
    if (indentUnit === '\t') return s + '\t';
    const col = visualWidth(s, tabSize);
    return s + ' '.repeat(tabSize - (col % tabSize));
}

function padToColumn(s: string, targetCol: number, indentUnit: string, tabSize: number): string {
    let col = visualWidth(s, tabSize);
    if (col >= targetCol) {
        return padToNextTabStop(s, indentUnit, tabSize);
    }
    if (indentUnit === '\t') {
        while (col < targetCol) {
            s += '\t';
            col = col + tabSize - (col % tabSize);
        }
    } else {
        s += ' '.repeat(targetCol - col);
    }
    return s;
}

function buildFormattedLine(leadingWs: string, label: string, opcode: string, operand: string, comment: string, indentUnit: string, tabSize: number): string {
    let result = label || (opcode ? leadingWs : '');
    if (opcode) {
        if (label) result = padToNextTabStop(result, indentUnit, tabSize);
        result += operand ? opcode + ' ' + operand : opcode;
    }
    if (comment) {
        if (result) {
            result = padToColumn(result, tabSize * 3, indentUnit, tabSize);
        }
        result += comment;
    }
    return result;
}
