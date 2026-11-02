// One row per item: tick circle, text, details, swipe to complete or delete, and
// an optional drag handle. Rows are cached and only rebuilt when something they
// show changes, so a live update touches one row instead of hundreds.
import { REPEATS, typeInfo } from "../core/constants.js";
import { ago, fmtDue } from "../core/time.js";
import { isSafeImageData } from "../core/photo.js";
import { h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { haptic, wait } from "../ui/motion.js";
import { state, seen, motionState, orderOf } from "../app/state.js";
import { nameOf, isMe, byChip } from "../app/people.js";
import { toggle, removeWithUndo, moveItem, setRowForgetter } from "../app/actions.js";
import { hooks } from "../app/hooks.js";

const rowCache = new Map(); // id -> { sig, el }
setRowForgetter((id) => rowCache.delete(id));
export const clearRowCache = () => rowCache.clear();
export function pruneRowCache() {
  const live = new Set(state.items.map((i) => i.id));
  for (const id of rowCache.keys()) if (!live.has(id)) rowCache.delete(id);
}

export function dueClass(item) {
  if (!item.due || item.done) return "";
  const left = item.due - Date.now();
  if (left < 0) return "overdue";
  return left < 864e5 ? "soon" : "";
}

// How a row arrives: staggered on first paint, sliding in when new, still otherwise
function arrival(item) {
  if (seen.has(item.id)) return { cls: "", style: null };
  if (motionState.stagger) return { cls: " stagger", style: `--i:${Math.min(motionState.i++, 12)}` };
  return { cls: isMe(item.by) ? " enter" : " enter fresh", style: null };
}
// Once the arrival animation has played, drop it so re-attaching the row doesn't replay it
function settleArrival(el, cls) {
  if (!cls) return;
  el.addEventListener("animationend", (e) => {
    if (e.target === el) el.classList.remove("enter", "stagger");
    if (e.animationName === "glow") el.classList.remove("fresh");
  });
}

function signature(item, draggable) {
  return [item.text, item.done, item.due, dueClass(item), item.due && fmtDue(item.due), item.repeat, item.qty,
    nameOf(item.for), nameOf(item.by), nameOf(item.doneBy), ago(item.createdAt), state.uid, draggable].join("\u0001");
}

export function itemRow(item, { draggable = false } = {}) {
  const sig = signature(item, draggable);
  const hit = rowCache.get(item.id);
  if (hit && hit.sig === sig && seen.has(item.id)) return hit.el;
  const el = buildRow(item, draggable);
  rowCache.set(item.id, { sig, el });
  return el;
}

function details(item) {
  const meta = [];
  if (item.due && (item.type === "reminder" || item.type === "task")) {
    const cls = dueClass(item);
    meta.push(h("span", { class: `due ${cls}` }, icon("clock"), (cls === "overdue" ? "Overdue · " : "") + fmtDue(item.due)));
  }
  if (item.repeat) meta.push(h("span", { class: "repeat-tag" }, icon("repeat"), REPEATS.get(item.repeat) ?? "Repeats"));
  if (item.type === "task" && item.for) meta.push(h("span", {}, "For"), byChip(item.for));
  else meta.push(byChip(item.by));
  meta.push(h("span", {}, ago(item.createdAt)));
  if (item.done && item.doneBy) meta.push(h("span", {}, `· done by ${isMe(item.doneBy) ? "you" : nameOf(item.doneBy)}`));
  return meta;
}

function buildRow(item, draggable) {
  const { cls, style } = arrival(item);
  const qty = item.type === "grocery" && item.qty > 1 ? h("span", { class: "qty" }, `×${item.qty}`) : null;
  const row = h("div", { class: `item${item.done ? " is-done" : ""}` },
    h("button", {
      class: "check",
      "aria-pressed": String(!!item.done),
      "aria-label": `${item.done ? "Mark not done" : "Mark done"}: ${item.text}`,
      onclick: (e) => toggle(item, e.currentTarget),
    }, h("span", { class: "ring" })),
    h("button", { class: "item-body", "aria-label": `Edit: ${item.text}`, onclick: () => hooks.openEdit(item) },
      h("div", { class: "item-text" }, qty, item.text),
      h("div", { class: "meta" }, details(item)),
    ),
    draggable && h("button", { class: "grip", type: "button", "aria-label": `Drag to reorder ${item.text}`, "data-grip": "" }, icon("grip")),
  );
  // Swipe right to complete, left to delete (the circle and the edit sheet do the same)
  const wrap = h("div", { class: `swipe${cls}`, style, "data-id": item.id },
    h("div", { class: "swipe-under done-side", "aria-hidden": "true" }, icon("task"), item.done ? "Not done" : "Done"),
    h("div", { class: "swipe-under delete-side", "aria-hidden": "true" }, "Delete", icon("x")),
    row);
  attachSwipe(wrap, row, item);
  if (draggable) attachDrag(row.querySelector("[data-grip]"), wrap, item);
  settleArrival(wrap, cls);
  return wrap;
}

function attachSwipe(wrap, row, item) {
  const LIMIT = 90;
  let x0 = 0;
  let y0 = 0;
  let dx = 0;
  let mode = null; // null until we know if it's a sideways swipe or a scroll
  wrap.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1 || e.target.closest("[data-grip]")) { mode = "none"; return; }
    x0 = e.touches[0].clientX;
    y0 = e.touches[0].clientY;
    dx = 0;
    mode = null;
  }, { passive: true });
  wrap.addEventListener("touchmove", (e) => {
    if (mode === "none" || state.dragging) return;
    const mx = e.touches[0].clientX - x0;
    const my = e.touches[0].clientY - y0;
    if (!mode) {
      if (Math.abs(mx) > 12 && Math.abs(mx) > Math.abs(my) * 1.5) { mode = "x"; row.style.transition = "none"; }
      else if (Math.abs(my) > 10) mode = "y";
    }
    if (mode !== "x") return;
    e.preventDefault();
    dx = mx;
    const shown = Math.abs(dx) > LIMIT ? Math.sign(dx) * (LIMIT + (Math.abs(dx) - LIMIT) * 0.3) : dx;
    row.style.transform = `translateX(${shown}px)`;
    wrap.dataset.dir = dx > 0 ? "right" : "left";
    const armed = Math.abs(dx) > LIMIT;
    if (armed !== (wrap.dataset.armed === "1")) {
      wrap.dataset.armed = armed ? "1" : "";
      if (armed) haptic();
    }
  }, { passive: false });
  const end = async () => {
    if (mode !== "x") return;
    mode = null;
    row.style.transition = "";
    wrap.dataset.armed = "";
    if (dx > LIMIT) {
      row.style.transform = "";
      toggle(item, row.querySelector(".check"));
    } else if (dx < -LIMIT) {
      row.style.transform = "translateX(-105%)";
      haptic();
      await wait(180);
      removeWithUndo([item], "Deleted");
    } else {
      row.style.transform = "";
    }
  };
  wrap.addEventListener("touchend", end);
  wrap.addEventListener("touchcancel", end);
}

// Drag the grip to reorder within a section. Rows make room as you move, and the
// new position is saved as a number between its neighbours.
function attachDrag(grip, wrap, item) {
  grip.addEventListener("pointerdown", (e) => {
    if (e.button > 0 || state.dragging) return;
    e.preventDefault();
    const rows = [...wrap.parentElement.children].filter((r) => r.dataset.id);
    const from = rows.indexOf(wrap);
    const rects = rows.map((r) => r.getBoundingClientRect());
    const height = rects.at(from).height;
    const y0 = e.clientY;
    let to = from;
    state.dragging = true;
    haptic();
    grip.setPointerCapture(e.pointerId);
    wrap.classList.add("dragging");
    for (const r of rows) if (r !== wrap) r.classList.add("make-room");

    const move = (ev) => {
      const top = rects.at(0).top - rects.at(from).top;
      const bottom = rects.at(-1).bottom - rects.at(from).bottom;
      const dy = Math.max(top, Math.min(bottom, ev.clientY - y0));
      wrap.style.transform = `translateY(${dy}px) scale(1.02)`;
      const centre = rects.at(from).top + height / 2 + dy;
      const next = rects.reduce((n, r, i) => (i !== from && r.top + r.height / 2 < centre ? n + 1 : n), 0);
      if (next === to) return;
      to = next;
      haptic();
      rows.forEach((r, i) => {
        if (i === from) return;
        let shift = 0;
        if (from < to && i > from && i <= to) shift = -height;
        else if (to < from && i >= to && i < from) shift = height;
        r.style.transform = shift ? `translateY(${shift}px)` : "";
      });
    };
    const reset = () => rows.forEach((r) => { r.classList.remove("dragging", "make-room"); r.style.transform = ""; });
    const up = () => {
      grip.removeEventListener("pointermove", move);
      grip.removeEventListener("pointerup", up);
      grip.removeEventListener("pointercancel", up);
      state.dragging = false;
      if (to === from) { reset(); return; }
      const ids = rows.map((r) => r.dataset.id);
      ids.splice(to, 0, ids.splice(from, 1)[0]);
      const byId = (id) => state.items.find((x) => x.id === id);
      const prev = to > 0 ? byId(ids.at(to - 1)) : null;
      const next = to < ids.length - 1 ? byId(ids.at(to + 1)) : null;
      let value;
      if (prev && next) value = (orderOf(prev) + orderOf(next)) / 2;
      else if (prev) value = orderOf(prev) + 60000;
      else value = orderOf(next) - 60000;
      // Clear the drag styles after the re-render has measured where rows were,
      // so they glide from where you let go to their final place
      hooks.setAfterBuild(reset);
      moveItem(item, value);
      hooks.render();
    };
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", up);
    grip.addEventListener("pointercancel", up);
  });
}

export function noteCard(item) {
  const { cls, style } = arrival(item);
  const thumb = isSafeImageData(item.thumb) ? item.thumb : null;
  const card = h("button", {
    class: `note${cls}${thumb ? " has-photo" : ""}`, style, "data-id": item.id,
    "aria-label": `Edit note: ${item.text.slice(0, 60)}`, onclick: () => hooks.openEdit(item),
  },
    thumb && h("img", { class: "note-thumb", src: thumb, alt: "", loading: "lazy" }),
    h("div", { class: "item-text" }, item.text),
    h("div", { class: "meta" }, byChip(item.by), h("span", {}, ago(item.createdAt))),
  );
  settleArrival(card, cls);
  return card;
}

export function emptyState(type) {
  const [title, hint] = typeInfo(type).empty;
  return h("div", { class: "empty" },
    h("div", { class: "empty-icon" }, icon(typeInfo(type).icon)),
    h("h3", {}, title), h("p", {}, hint));
}
