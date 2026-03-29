import { EditorView, Panel, showPanel } from "@codemirror/view";
import { loadSettings, openSettings, tabStopsFacet } from "../settings";

const MAX_COLS = 300;

function buildContent(stops: number[], showDots: boolean): string {
  const chars = new Array(MAX_COLS).fill(showDots ? '<span class="cm-highlightSpace"> </span>' : " ");
  for (const s of stops) {
    if (s > 0 && s < MAX_COLS) chars[s] = "▾";
  }
  return chars.join("");
}

function rulerPanel(view: EditorView): Panel {
  const dom = document.createElement("div");
  dom.className = "tab-stop-ruler";
  dom.setAttribute("aria-hidden", "true");
  let currentStops: number[] = [];
  let currentShowDots = false;

  function rebuild() {
    const stops = view.state.facet(tabStopsFacet);
    const showDots = loadSettings().highlightWhitespace;
    if (stops === currentStops && showDots === currentShowDots) return;
    currentStops = stops;
    currentShowDots = showDots;
    dom.innerHTML = buildContent(stops, showDots);
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
