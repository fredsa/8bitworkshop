import { EditorState } from "@codemirror/state";
import { EditorView, Panel, showPanel } from "@codemirror/view";
import { openSettings, tabStopsFacet } from "../settings";

const MAX_COLS = 300;

function buildContent(stops: number[], tabSize: number): string {
  const chars = new Array(MAX_COLS);
  if (stops.length > 0) {
    chars.fill(" ");
    for (const s of stops) {
      if (s > 0 && s < MAX_COLS) chars[s] = "▾";
    }
  } else {
    chars.fill("<span class='cm-highlightSpace'> </span>");
    for (let col = tabSize; col < MAX_COLS; col += tabSize) {
      chars[col] = "▾";
    }
  }
  return chars.join("");
}

function rulerPanel(view: EditorView): Panel {
  const dom = document.createElement("div");
  dom.className = "tab-stop-ruler";
  dom.setAttribute("aria-hidden", "true");
  let currentStops: number[] = [];
  let currentTabSize = 0;

  function rebuild() {
    const stops = view.state.facet(tabStopsFacet);
    const tabSize = view.state.facet(EditorState.tabSize);
    if (stops === currentStops && tabSize === currentTabSize) return;
    currentStops = stops;
    currentTabSize = tabSize;
    dom.innerHTML = buildContent(stops, tabSize);
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
