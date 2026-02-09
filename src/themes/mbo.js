import {EditorView} from "@codemirror/view"
import {HighlightStyle, syntaxHighlighting} from "@codemirror/language"
import {tags as t} from "@lezer/highlight"

// 1. Editor UI Styles (The "Chrome")
export const mboTheme = EditorView.theme({
  "&": {
    backgroundColor: "#2c2c2c",
    color: "#ffffec"
  },
  ".cm-content": {
    caretColor: "#ffffec"
  },
  "&.cm-focused .cm-cursor": {
    borderLeftColor: "#ffffec"
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "rgba(113, 108, 98, .99)"
  },
  ".cm-gutters": {
    backgroundColor: "#4e4e4e",
    color: "#dadada",
    border: "none"
  },
  ".cm-activeLine": {
    backgroundColor: "#494b41"
  },
  ".cm-activeLineGutter": {
    backgroundColor: "#494b41"
  },
  ".cm-linenumber": {
    color: "#dadada"
  }
}, {dark: true});

// 2. Syntax Highlighting Styles
export const mboHighlightStyle = HighlightStyle.define([
  {tag: [t.atom, t.number, t.bool], color: "#00a8c6"},
  {tag: [t.keyword, t.operator], color: "#ffb928"},
  {tag: [t.variableName, t.definition(t.variableName)], color: "#ffffec"},
  {tag: t.attributeName, color: "#9ddfe9"},
  {tag: t.bracket, color: "#fffffc", fontWeight: "bold"},
  {tag: t.comment, color: "#95958a"},
  {tag: t.invalid, color: "#ffffec", borderBottom: "1px solid #636363"},
  {tag: t.link, color: "#f54b07"},
  {tag: t.propertyName, color: "#9ddfe9"},
  {tag: t.string, color: "#ffcf6c"},
  {tag: t.tagName, color: "#9ddfe9"},
]);

// 3. Combined Extension
export const mbo = [
  mboTheme,
  syntaxHighlighting(mboHighlightStyle),
];