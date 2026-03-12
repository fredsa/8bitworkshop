import { indentLess, indentMore } from "@codemirror/commands";
import { indentUnit } from "@codemirror/language";
import { EditorSelection, EditorState, Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { opcodes as opcodes6502 } from "../../parser/tokens-6502";
import { opcodes as opcodesZ80 } from "../../parser/tokens-z80";
import { findCommentIndex } from "../../parser/format-asm";
import { tabStopsFacet } from "../settings";

export type AsmDialect = '6502' | 'z80';

export function columnAt(text: string, offset: number, tabSize: number): number {
  let col = 0;
  for (let i = 0; i < offset; i++) {
    if (text[i] === '\t') col = col + tabSize - (col % tabSize);
    else col++;
  }
  return col;
}

function nextTabStop(col: number, stops: number[], tabSize: number): number {
  for (const stop of stops) {
    if (stop > col) return stop;
  }
  return col + tabSize - (col % tabSize);
}

function insertToNextTabStop(view: EditorView): boolean {
  if (view.state.selection.ranges.some(r => !r.empty)) {
    return indentMore(view);
  }
  const useTabs = view.state.facet(indentUnit) === '\t';
  const stops = view.state.facet(tabStopsFacet);
  const tabSize = view.state.facet(EditorState.tabSize);
  view.dispatch(view.state.changeByRange(range => {
    const insert = useTabs ? '\t' : (() => {
      const line = view.state.doc.lineAt(range.head);
      const col = columnAt(line.text, range.head - line.from, tabSize);
      return ' '.repeat(nextTabStop(col, stops, tabSize) - col);
    })();
    return {
      changes: { from: range.head, insert },
      range: EditorSelection.cursor(range.head + insert.length)
    };
  }));
  return true;
}

export interface TabSettings {
  tabSize: number;
  tabsToSpaces: boolean;
}

const MNEMONICS_6502 = new Set([...opcodes6502].map(s => s.toLowerCase()));
const MNEMONICS_Z80 = new Set([...opcodesZ80].map(s => s.toLowerCase()));

function mostCommon(counts: Map<number, number>): number | undefined {
  let best: number | undefined;
  let bestCount = 0;
  counts.forEach((count, val) => {
    if (count > bestCount) { best = val; bestCount = count; }
  });
  return best;
}

function tally(map: Map<number, number>, key: number) {
  map.set(key, (map.get(key) || 0) + 1);
}

export function detectTabStopsFromAsm(text: string, dialect: AsmDialect, tabSize: number): number[] {
  const mnemonics = dialect === '6502' ? MNEMONICS_6502 : MNEMONICS_Z80;
  const lines = text.split('\n');

  // Pass 1: find most common opcode column
  const opcodeCols = new Map<number, number>();
  const lineInfos: [number, number?, number?][] = []; // [opcodeCol, operandCol?, commentCol?]

  for (const line of lines) {
    const commentIdx = findCommentIndex(line);
    const code = line.substring(0, commentIdx);
    const indented = /^\s/.test(code);

    const opcodeMatch = indented ? code.match(/^\s+(\S+)/) : code.match(/^\S+\s+(\S+)/);
    if (!opcodeMatch) continue;
    const token = opcodeMatch[1];
    if (!mnemonics.has(token.toLowerCase())) continue;

    const col = columnAt(line, opcodeMatch[0].length - token.length, tabSize);
    tally(opcodeCols, col);
    const afterOpcode = opcodeMatch[0].length;
    const operandMatch = code.substring(afterOpcode).match(/^\s+\S/);
    const operandCol = operandMatch ? columnAt(line, afterOpcode + operandMatch[0].length - 1, tabSize) : undefined;
    const commentCol = commentIdx < line.length ? columnAt(line, commentIdx, tabSize) : undefined;
    lineInfos.push([col, operandCol, commentCol]);
  }

  const opcodeCol = mostCommon(opcodeCols);
  if (opcodeCol === undefined) return [];

  // Pass 2: from lines with opcode at winning column, find operand and comment columns
  const operandCols = new Map<number, number>();
  const commentCols = new Map<number, number>();
  for (const [oc, operandCol, commentCol] of lineInfos) {
    if (oc !== opcodeCol) continue;
    if (operandCol !== undefined) tally(operandCols, operandCol);
    if (commentCol !== undefined) tally(commentCols, commentCol);
  }

  const stops: number[] = [opcodeCol];
  const operandCol = mostCommon(operandCols);
  if (operandCol !== undefined) stops.push(operandCol);
  const commentCol = mostCommon(commentCols);
  if (commentCol !== undefined) stops.push(commentCol);

  return stops;
}

export function tabExtension(s: TabSettings, stops: number[]): Extension {
  return [
    EditorState.tabSize.of(s.tabSize),
    indentUnit.of(s.tabsToSpaces ? " ".repeat(s.tabSize) : "\t"),
    keymap.of([
      { key: "Tab", run: insertToNextTabStop },
      { key: "Shift-Tab", run: indentLess }
    ]),
    tabStopsFacet.of(stops),
  ];
}
