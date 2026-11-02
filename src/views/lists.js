// The Tasks, Reminders, Groceries and Notes screens.
import { dayDiff } from "../core/time.js";
import { AISLES, aisleOf, capitalise } from "../core/groceries.js";
import { h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { toast } from "../ui/toast.js";
import { haptic } from "../ui/motion.js";
import { state, itemsOf, prevCounts } from "../app/state.js";
import { addGroceries, removeWithUndo } from "../app/actions.js";
import { itemRow, noteCard, emptyState } from "./rows.js";

const rowsList = (items, draggable) => h("div", { class: "list" }, items.map((i) => itemRow(i, { draggable })));
const sectionTitle = (label, extraClass = "") => h("div", { class: `section-title${extraClass}` }, h("span", {}, label));

function doneSection(done) {
  const newestFirst = [...done].sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)).slice(0, 30);
  return [
    h("div", { class: "section-title" },
      h("span", {}, `Done · ${done.length}`),
      h("button", { class: "link-btn", onclick: () => removeWithUndo(done, `Cleared ${done.length} done`) }, "Clear all")),
    rowsList(newestFirst, false),
  ];
}

function basketProgress(total, got) {
  const pct = total ? Math.round((got / total) * 100) : 0;
  const bar = h("div", { class: "progress-fill" });
  const box = h("div", { class: "basket", role: "progressbar", "aria-valuemin": 0, "aria-valuemax": total, "aria-valuenow": got, "aria-label": "Items in the basket" },
    h("div", { class: "basket-text" },
      h("strong", {}, got === total ? "Everything's in the basket" : `${total - got} left to buy`),
      h("span", {}, `${got} of ${total} done`)),
    h("div", { class: "progress" }, bar));
  // Grow from the previous width to the new one
  bar.style.width = `${prevCounts.get("basket") ?? 0}%`;
  requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = `${pct}%`; }));
  prevCounts.set("basket", pct);
  return box;
}

// "Often bought": one tap puts a regular back on the list
function oftenBought(open) {
  const onList = new Set(open.map((g) => g.text.toLowerCase()));
  const picks = Object.entries(state.often)
    .filter(([name, count]) => count > 1 && !onList.has(name))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([name]) => capitalise(name));
  if (!picks.length) return [];
  return [
    sectionTitle("Often bought"),
    h("div", { class: "chips scroll often" }, picks.map((p) => h("button", {
      type: "button", class: "chip-btn", "aria-label": `Add ${p}`,
      onclick: (e) => { haptic(); e.currentTarget.classList.add("picked"); toast(addGroceries([p])); },
    }, icon("plus"), p))),
  ];
}

function reminderGroups(open) {
  // Grouped by time so the next thing is always at the top
  const groups = [
    ["Overdue", (r) => r.due && r.due < Date.now()],
    ["Today", (r) => r.due && dayDiff(r.due) === 0],
    ["Next 7 days", (r) => r.due && dayDiff(r.due) < 7],
    ["Later", () => true],
  ];
  const out = [];
  let rest = open;
  for (const [label, test] of groups) {
    const these = rest.filter(test);
    rest = rest.filter((r) => !these.includes(r));
    if (!these.length) continue;
    out.push(sectionTitle(label, label === "Overdue" ? " danger" : ""), rowsList(these, false));
  }
  return out;
}

function groceryAisles(open) {
  const byAisle = new Map(AISLES.map((name) => [name, []]));
  for (const g of open) byAisle.get(aisleOf(g.text)).push(g);
  const used = [...byAisle].filter(([, list]) => list.length);
  // Sections only help once the list is long enough to need them
  if (open.length >= 4 && used.length > 1) return used.flatMap(([name, list]) => [sectionTitle(name), rowsList(list, true)]);
  return open.length ? [rowsList(open, true)] : [];
}

export function listContent(type) {
  const items = itemsOf(type);
  if (!items.length && !(type === "grocery" && Object.keys(state.often).length)) return [emptyState(type)];
  if (type === "note") return [h("div", { class: "notes" }, items.map(noteCard))];
  const open = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);
  const out = [];
  if (type === "reminder") out.push(...reminderGroups(open));
  else if (type === "grocery") {
    if (items.length) out.push(basketProgress(items.length, done.length));
    out.push(...oftenBought(open), ...groceryAisles(open));
  } else if (open.length) out.push(rowsList(open, true));
  if (!open.length && items.length) {
    out.push(h("div", { class: "empty" }, h("div", { class: "empty-icon" }, icon("check")), h("h3", {}, "All Done"), h("p", {}, "Everything on this list is ticked off.")));
  }
  if (done.length) out.push(...doneSection(done));
  return out;
}
