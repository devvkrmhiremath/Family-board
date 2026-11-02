// Draws the current screen. Called through hooks.render / hooks.scheduleRender.
import { typeInfo } from "../core/constants.js";
import { greeting } from "../core/time.js";
import { qs, qsa, h } from "../ui/dom.js";
import { rowPositions, slideRows, rollNumbers, setAurora, bump } from "../ui/motion.js";
import { state, seen, prevCounts, motionState, openCount } from "./state.js";
import { composer } from "../views/composer.js";
import { listContent } from "../views/lists.js";
import { homeContent } from "../views/home.js";
import { skeleton, lockedContent } from "../views/status.js";
import { pruneRowCache } from "../views/rows.js";
import { installHint } from "../features/install.js";

let renderedView = null;
let afterBuild = null; // drag-and-drop clears its temporary styles at the right moment
let locked = { onRetry: () => {}, onRemove: () => {} };

export const setAfterBuild = (fn) => { afterBuild = fn; };
export const setLockedActions = (actions) => { locked = actions; };

function updateChrome() {
  const title = state.view === "home" ? state.boardName : typeInfo(state.view).title;
  qs("#greeting").textContent = `${greeting()}, ${state.name}`;
  qs("#board-btn-name").textContent = state.boardName;
  qs("#view-title").textContent = title;
  qs("#nav-title").textContent = title;
  document.documentElement.dataset.view = state.view; // drives the section colours
  setAurora(state.view);
  for (const tab of qsa("#tabbar button")) {
    const view = tab.dataset.view;
    if (view === state.view) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
    const n = view === "home" || view === "note" ? 0 : openCount(view);
    const badge = qs(".badge", tab);
    if (badge) {
      badge.textContent = n ? (n > 99 ? "99+" : n) : "";
      const key = `badge-${view}`;
      if (prevCounts.has(key) && n > prevCounts.get(key)) bump(badge);
      prevCounts.set(key, n);
    }
    const label = qs("span", tab).textContent;
    tab.setAttribute("aria-label", n ? `${label}, ${n} open` : label);
  }
}

function viewContent() {
  if (state.locked) return lockedContent(locked);
  if (!state.loaded) return skeleton();
  return state.view === "home" ? homeContent() : listContent(state.view);
}

export function render({ full = false } = {}) {
  if (state.dragging) return;
  updateChrome();
  // The very first paint staggers rows in; after that only new rows animate
  motionState.stagger = state.loaded && !motionState.painted;
  motionState.i = 0;
  const before = renderedView === state.view ? rowPositions() : new Map();
  const content = qs("#content");
  // While someone is typing, only refresh what's below the add box so their
  // text, keyboard and cursor are never disturbed by a sync
  if (!full && content && document.activeElement?.closest?.(".composer")) {
    content.replaceChildren(...viewContent().filter(Boolean));
  } else {
    qs("#main").replaceChildren(...[
      state.view === "home" && installHint(),
      !state.locked && composer(state.view === "home" ? state.quickType : state.view, state.view === "home"),
      h("div", { id: "content" }, viewContent()),
    ].filter(Boolean));
  }
  if (afterBuild) { afterBuild(); afterBuild = null; }
  if (state.loaded) {
    for (const i of state.items) seen.add(i.id);
    motionState.painted = true;
    pruneRowCache();
  }
  renderedView = state.view;
  slideRows(before);
  rollNumbers(prevCounts);
}

// Live updates often arrive in bursts (a local write, then the server's
// confirmation, then the member list). Draw once per frame, not once per message.
let queued = false;
export function scheduleRender() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; render(); });
}
