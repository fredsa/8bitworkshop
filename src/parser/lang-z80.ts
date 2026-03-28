import { LRLanguage, LanguageSupport, indentNodeProp } from "@codemirror/language"
import { styleTags, tags as t } from "@lezer/highlight"
import { parser } from "../../gen/parser/lang-z80.grammar.js"

export const LezerZ80: LRLanguage = LRLanguage.define({
    parser: parser.configure({
        props: [
            indentNodeProp.add({
                Program: cx => {
                    let lineNode = cx.node.resolveInner(cx.pos, 1);
                    while (lineNode && lineNode.name !== 'Line' && lineNode.name !== 'Program') {
                        lineNode = lineNode.parent;
                    }
                    if (lineNode?.name === 'Line') {
                        if (lineNode.getChild('Label')) return cx.simulatedBreak != null ? cx.unit : 0;
                        if (lineNode.getChild('Statement')) return cx.unit;
                    }
                    let line = cx.state.doc.lineAt(cx.pos);
                    return cx.countColumn(line.text, line.text.search(/\S|$/));
                }
            }),
            styleTags({
                Identifier: t.variableName,
                PseudoOp: t.keyword,
                Opcode: t.standard(t.keyword),
                Register: t.standard(t.modifier),
                Condition: t.constant(t.modifier),
                Label: t.labelName,
                String: t.string,
                Char: t.character,
                Number: t.number,
                Comment: t.comment,
                ArithOp: t.arithmeticOperator,
                Plus: t.arithmeticOperator,
                Minus: t.arithmeticOperator,
                Percent: t.arithmeticOperator,
                BitOp: t.bitwiseOperator,
                Tilde: t.bitwiseOperator,
                LogicOp: t.logicOperator,
                Not: t.logicOperator,
                CompareOp: t.compareOperator,
                BinaryLt: t.compareOperator,
                BinaryGt: t.compareOperator,
                UnaryLt: t.arithmeticOperator,
                UnaryGt: t.arithmeticOperator,
                Mac: t.definitionKeyword,
                MacEnd: t.definitionKeyword,
                "MacroDef/Identifier": t.macroName,
                ControlOp: t.controlKeyword,
                Comma: t.separator,
                Colon: t.separator,
                "( )": t.paren
            })
        ]
    }),
    languageData: {
        commentTokens: { line: ";" }
    }
})

export function asmZ80(): LanguageSupport {
    return new LanguageSupport(LezerZ80)
}
