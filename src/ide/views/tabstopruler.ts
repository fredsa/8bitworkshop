import { indentUnit } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView, Panel, showPanel } from "@codemirror/view";
import { openSettings, tabStopsFacet } from "../settings";
import { AsmTabStops } from "./tabs";

const MAX_COLS = 300;

function buildContent(asmTabStops: AsmTabStops, tabSize: number, indent: string): string {
  const chars = new Array(MAX_COLS);
  chars.fill(indent === '\t' ? " " : "<span class='cm-highlightSpace'> </span>");
  if (indent === '\t' || (!asmTabStops.opcodes && !asmTabStops.operands && !asmTabStops.comments)) {
    for (let col = tabSize; col < MAX_COLS; col += tabSize) {
      chars[col] = "▾";
    }
  } else {
    for (const col of [asmTabStops.opcodes, asmTabStops.operands, asmTabStops.comments]) {
      if (col > 0 && col < MAX_COLS) {
        chars[col] = "▾";
      }
    }
  }
  return chars.join("");
}

function rulerPanel(view: EditorView): Panel {
  const dom = document.createElement("div");
  dom.className = "tab-stop-ruler";
  dom.setAttribute("aria-hidden", "true");
  let currentAsmTabStops: AsmTabStops = {};
  let currentTabSize = 0;
  let currentIndent = "";

  function rebuild() {
    const asmTapStops = view.state.facet(tabStopsFacet);
    const tabSize = view.state.facet(EditorState.tabSize);
    const indent = view.state.facet(indentUnit);
    if (asmTapStops === currentAsmTabStops && tabSize === currentTabSize && indent === currentIndent) return;
    currentAsmTabStops = asmTapStops;
    currentTabSize = tabSize;
    currentIndent = indent;
    dom.innerHTML = buildContent(asmTapStops, tabSize, indent);
  }

  function sync() {
    const contentStyle = getComputedStyle(view.contentDOM);
    dom.style.font = contentStyle.font;
    const left = view.contentDOM.getBoundingClientRect().left - view.dom.getBoundingClientRect().left;
    dom.style.marginLeft = left + "px";
    const line = view.contentDOM.querySelector(".cm-line");
    if (line) dom.style.paddingLeft = getComputedStyle(line).paddingLeft;
  }

  rebuild();
  dom.addEventListener("click", openSettings);
  sync();

  return {
    dom,
    top: true,
    update(update) {
      rebuild();
      sync();
    }
  };
}

export const tabStopRuler = showPanel.of(rulerPanel);
