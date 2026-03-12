import { syntaxTree } from "@codemirror/language"
import { EditorView } from "@codemirror/view"

// Indentation string used to align opcodes/directives under labels.
// TODO replace with setting https://github.com/sehugg/8bitworkshop/pull/234
const INDENT = '\t'

// Column-based formatter for 6502/Z80 assembly.
// Uses the Lezer parse tree to identify labels, opcodes, operands,
// and comments, then rebuilds each line with consistent alignment.
export function formatAsm(view: EditorView): boolean {
    const tree = syntaxTree(view.state)
    const doc = view.state.doc
    const changes: { from: number, to: number, insert: string }[] = []

    // Format all selections, or entire file if no selection.
    const hasSelection = view.state.selection.ranges.some(r => r.from !== r.to)
    const ranges = hasSelection
        ? view.state.selection.ranges.filter(r => r.from !== r.to)
        : [{ from: 0, to: doc.length }]

    for (const range of ranges) {
        for (let i = doc.lineAt(range.from).number; i <= doc.lineAt(range.to).number; i++) {
            const line = doc.line(i)
            if (line.text.trim() === '') continue

            const firstNonSpace = line.text.search(/\S/)
            let lineNode = tree.resolveInner(line.from + firstNonSpace, 1)
            while (lineNode && lineNode.name !== 'Line' && lineNode.name !== 'Program') {
                lineNode = lineNode.parent
            }
            if (lineNode?.name !== 'Line') continue

            const labelNode = lineNode.getChild('Label')
            const stmtNode = lineNode.getChild('Statement')
            if (!labelNode && !stmtNode) continue

            const label = labelNode ? doc.sliceString(labelNode.from, labelNode.to) : ''
            let opcode = ''
            let operand = ''

            if (stmtNode) {
                const result = extractStatement(stmtNode, doc)
                opcode = result.opcode
                operand = result.operand
            }

            const comment = extractComment(line.text)
            const newText = buildFormattedLine(label, opcode, operand, comment)

            if (newText !== line.text) {
                changes.push({ from: line.from, to: line.to, insert: newText })
            }
        }

    }

    if (changes.length > 0) {
        view.dispatch({ changes })
    }
    return true
}

// Extract opcode and operand text from a Statement node.
function extractStatement(stmtNode, doc): { opcode: string, operand: string } {
    // Statement children: Instruction | Directive | HexDirective |
    //                     MacroDef | MacEnd | ControlOp | ErrorOp
    const instr = stmtNode.getChild('Instruction')
    if (instr) {
        const opcodeNode = instr.getChild('Opcode')
        const operandNode = instr.getChild('Operand')
        return {
            opcode: opcodeNode ? doc.sliceString(opcodeNode.from, opcodeNode.to) : '',
            operand: operandNode ? doc.sliceString(operandNode.from, operandNode.to) : ''
        }
    }

    const directive = stmtNode.getChild('Directive')
    if (directive) {
        const pseudoNode = directive.getChild('PseudoOp')
        if (pseudoNode) {
            return {
                opcode: doc.sliceString(pseudoNode.from, pseudoNode.to),
                operand: doc.sliceString(pseudoNode.to, directive.to).trim()
            }
        }
    }

    const hexDir = stmtNode.getChild('HexDirective')
    if (hexDir) {
        const hexOpNode = hexDir.getChild('HexOp')
        if (hexOpNode) {
            return {
                opcode: doc.sliceString(hexOpNode.from, hexOpNode.to),
                operand: doc.sliceString(hexOpNode.to, hexDir.to).trim()
            }
        }
    }

    const macroDef = stmtNode.getChild('MacroDef')
    if (macroDef) {
        const macNode = macroDef.getChild('Mac')
        const idNode = macroDef.getChild('Identifier')
        return {
            opcode: macNode ? doc.sliceString(macNode.from, macNode.to) : '',
            operand: idNode ? doc.sliceString(idNode.from, idNode.to) : ''
        }
    }

    // MacEnd, ControlOp, ErrorOp — keyword only, no operand
    const keyword = stmtNode.getChild('MacEnd')
        || stmtNode.getChild('ControlOp')
        || stmtNode.getChild('ErrorOp')
    if (keyword) {
        return {
            opcode: doc.sliceString(keyword.from, keyword.to),
            operand: ''
        }
    }

    return { opcode: '', operand: '' }
}

// Find the comment (;...) in a line, skipping semicolons inside strings.
function extractComment(text: string): string {
    let inString = false
    for (let i = 0; i < text.length; i++) {
        const ch = text[i]
        if (inString) {
            if (ch === '\\') { i++; continue }
            if (ch === '"') inString = false
        } else if (ch === '"') {
            inString = true
        } else if (ch === ';') {
            return text.substring(i)
        }
    }
    return ''
}

// Rebuild a line with column-aligned formatting.
function buildFormattedLine(label: string, opcode: string, operand: string, comment: string): string {
    let result = ''

    if (label) {
        result = label
        if (opcode) result += INDENT
    } else if (opcode) {
        result = INDENT
    }

    if (opcode) {
        result += opcode
        if (operand) result += ' ' + operand
    }

    if (comment) {
        if (result) result += INDENT
        result += comment
    }

    return result
}
