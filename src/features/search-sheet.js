// Search across everything loaded on this board.
import { TYPES } from "../core/constants.js";
import { fmtDue } from "../core/time.js";
import { qs, h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { openSheet, closeSheet } from "../ui/sheets.js";
import { state } from "../app/state.js";
import { nameOf } from "../app/people.js";
import { go } from "../app/actions.js";
import { hooks } from "../app/hooks.js";

const input = () => qs("#search-input");

// Highlight the match by splitting text nodes; nothing is ever parsed as HTML
function marked(text, query) {
  const at = text.toLowerCase().indexOf(query);
  if (at < 0) return [text];
  return [text.slice(0, at), h("mark", {}, text.slice(at, at + query.length)), text.slice(at + query.length)];
}

function hitRow(item, type, query) {
  const detail = [item.done ? "Done" : "To do", item.due && fmtDue(item.due), nameOf(item.by)].filter(Boolean).join(" · ");
  return h("button", {
    type: "button", class: `search-hit${item.done ? " is-done" : ""}`, role: "listitem",
    onclick: () => {
      closeSheet(qs("#search"));
      if (state.view !== item.type) go(item.type);
      setTimeout(() => hooks.openEdit(item), 220);
    },
  },
    h("span", { class: "search-icon" }, icon(TYPES.get(type).icon)),
    h("span", { class: "search-text" }, h("span", {}, marked(item.text, query)), h("small", {}, detail)));
}

function runSearch() {
  const raw = input().value.trim();
  const query = raw.toLowerCase();
  const out = qs("#search-results");
  if (!query) {
    out.replaceChildren(h("p", { class: "group-footer" }, "Searches everything still to do and recently ticked items on this board."));
    return;
  }
  const hits = state.items
    .filter((i) => !state.pending.has(i.id) && i.text.toLowerCase().includes(query))
    .sort((a, b) => (a.done - b.done) || (b.createdAt - a.createdAt))
    .slice(0, 60);
  if (!hits.length) {
    out.replaceChildren(h("div", { class: "empty compact" }, `Nothing matches “${raw}”.`));
    return;
  }
  out.replaceChildren(...[...TYPES].flatMap(([type, info]) => {
    const list = hits.filter((x) => x.type === type);
    if (!list.length) return [];
    return [h("p", { class: "group-header" }, info.title), h("div", { class: "group", role: "list" }, list.map((x) => hitRow(x, type, query)))];
  }));
}

export function initSearch() {
  qs("#open-search").addEventListener("click", () => {
    input().value = "";
    runSearch();
    openSheet(qs("#search"));
    setTimeout(() => input().focus(), 60);
  });
  input().addEventListener("input", runSearch);
  qs("#search-form").addEventListener("submit", (e) => { e.preventDefault(); input().blur(); });
}
