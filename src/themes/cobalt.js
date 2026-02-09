import {EditorView} from "@codemirror/view"
import {HighlightStyle, syntaxHighlighting} from "@codemirror/language"
import {tags as t} from "@lezer/highlight"

// 1. Editor UI Styles (The "Chrome")
const cobaltTheme = EditorView.theme({
  "&": {
    color: "white",
    backgroundColor: "#002240"
  },
  ".cm-content": {
    caretColor: "white"
  },
  "&.cm-focused .cm-cursor": {
    borderLeftColor: "white"
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "#b36539 !important"
  },
  ".cm-gutters": {
    backgroundColor: "#002240",
    color: "#d0d0d0",
    borderRight: "1px solid #aaa"
  },
  ".cm-activeLine": {
    backgroundColor: "#002D57"
  },
  ".cm-activeLineGutter": {
    backgroundColor: "#002D57",
    color: "#ffee80"
  },
}, {dark: true});

// 2. Syntax Highlighting Styles
const cobaltHighlightStyle = HighlightStyle.define([
  {tag: [t.atom, t.bool, t.special(t.variableName)], color: "#845dc4"},
  {tag: [t.color, t.constant(t.name), t.standard(t.name)], color: "#845dc4"},
  {tag: [t.definition(t.name), t.separator], color: "white"},
  {tag: [t.meta, t.comment], color: "#08f"},
  {tag: [t.name, t.deleted, t.character, t.propertyName, t.macroName], color: "white"},
  {tag: [t.operator, t.operatorKeyword, t.url, t.escape, t.regexp, t.link, t.special(t.string)], color: "#ff9e59"},
  {tag: [t.processingInstruction, t.string, t.inserted], color: "#3ad900"},
  {tag: [t.typeName, t.className, t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: "#ff80e1"},
  {tag: [t.variableName, t.labelName], color: "#9effff"},
  {tag: t.emphasis, fontStyle: "italic"},
  {tag: t.heading, fontWeight: "bold", color: "#ffee80"},
  {tag: t.invalid, color: "#9d1e15"},
  {tag: t.keyword, color: "#ffee80"},
  {tag: t.link, color: "#845dc4", textDecoration: "underline"},
  {tag: t.strikethrough, textDecoration: "line-through"},
  {tag: t.strong, fontWeight: "bold"},
]);

// 3. Combined Extension
export const cobalt = [
  cobaltTheme,
  syntaxHighlighting(cobaltHighlightStyle),
];