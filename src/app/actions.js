// Things people do to items, and moving between tabs.
import { typeInfo, VIEW_ORDER, LIMITS } from "../core/constants.js";
import { store } from "../core/store.js";
import { fmtDue, nextDue, DAY } from "../core/time.js";
import { parseQty, capitalise } from "../core/groceries.js";
import { reduceMotion } from "../core/platform.js";
import { qs } from "../ui/dom.js";
import { toast } from "../ui/toast.js";
import { haptic, wait, slideIn } from "../ui/motion.js";
import { pushLayer, popLayer } from "../ui/history.js";
import { state, openCount, itemsOf, orderOf } from "./state.js";
import { hooks } from "./hooks.js";

// ---------- tabs ----------
// Home is the start screen. Opening another tab adds a Back step, so Android's
// Back button returns to Home instead of closing the app.
let tabLayer = false;
export function go(view, { viaBack = false } = {}) {
  if (view === state.view) { scrollTo({ top: 0, behavior: reduceMotion.matches ? "auto" : "smooth" }); return; }
  haptic();
  const forward = VIEW_ORDER.indexOf(view) > VIEW_ORDER.indexOf(state.view);
  if (view !== "home" && !tabLayer) {
    tabLayer = true;
    pushLayer(() => { tabLayer = false; go("home", { viaBack: true }); });
  } else if (view === "home" && tabLayer && !viaBack) {
    tabLayer = false;
    popLayer();
  }
  state.view = view;
  store.set("fb.view", view);
  hooks.render({ full: true });
  scrollTo(0, 0);
  slideIn(forward);
}
// Switching boards always lands on Home; forget any tab Back step
export function resetTabLayer() {
  if (tabLayer) { tabLayer = false; popLayer(); }
}

// ---------- ticking ----------
const busy = new Set(); // items mid-animation, so a double tap can't toggle twice

export async function toggle(item, checkBtn) {
  if (busy.has(item.id) || !state.api) return;
  const done = !item.done;
  const wrap = checkBtn?.closest(".swipe");
  const lastOne = done && openCount(item.type) === 1 && !item.repeat;
  haptic();
  if (done && wrap && !reduceMotion.matches) {
    busy.add(item.id);
    // Fill the circle and strike the text; then the row slides down into Done
    // while the rows below glide up
    checkBtn.setAttribute("aria-pressed", "true");
    wrap.classList.add("completing");
    await wait(380);
    busy.delete(item.id);
  }
  forgetRow(item.id);
  state.api.update(item.id, { done, doneBy: done ? state.uid : null, doneAt: done ? Date.now() : null })
    .catch(() => { toast("Couldn't update. Check your connection."); hooks.render({ full: true }); });
  // A repeating item puts its next one on the list straight away
  let nextId = null;
  let nextDueAt = null;
  if (done && item.repeat) {
    nextDueAt = nextDue(item.due || Date.now(), item.repeat);
    const copy = { type: item.type, text: item.text, done: false, repeat: item.repeat, due: nextDueAt };
    if (item.for != null) copy.for = item.for;
    if (item.qty != null) copy.qty = item.qty;
    if (item.order != null) copy.order = item.order;
    nextId = state.api.add(copy).id;
  }
  const undo = {
    label: "Undo",
    run: () => {
      state.api.update(item.id, { done: false, doneBy: null, doneAt: null });
      if (nextId) state.api.remove({ id: nextId });
    },
  };
  if (lastOne) {
    toast(item.type === "grocery" ? "Shopping done! Everything's in the basket." : "All done. Nice teamwork!");
  } else if (nextId) {
    toast(`Done. Next one: ${fmtDue(nextDueAt)}`, undo);
  } else if (done) {
    toast("Marked done", undo);
  }
}

// ---------- deleting ----------
// Deleting waits a few seconds before it really happens, so Undo just cancels it.
// (Nobody can re-create an item someone else added, so this is also the safest way.)
export function removeWithUndo(items, message) {
  for (const item of items) {
    clearTimeout(state.pending.get(item.id)?.timer);
    const timer = setTimeout(() => commitDelete(item), 5200);
    state.pending.set(item.id, { item, timer, api: state.api });
  }
  hooks.render();
  toast(message, {
    label: "Undo",
    run: () => {
      for (const item of items) {
        clearTimeout(state.pending.get(item.id)?.timer);
        state.pending.delete(item.id);
        forgetRow(item.id);
      }
      hooks.render();
    },
  });
}
function commitDelete(item) {
  const pending = state.pending.get(item.id);
  if (!pending) return;
  state.pending.delete(item.id);
  pending.api?.remove(item).catch(() => toast("Couldn't delete. Check your connection."));
}
// Leaving the app (or the board) makes pending deletes happen now
export function flushDeletes() {
  for (const { item, timer } of [...state.pending.values()]) {
    clearTimeout(timer);
    commitDelete(item);
  }
}

// ---------- adding ----------
const offlineNote = () => toast("Saved on this device. It will sync when you're back online.");

// Add groceries, merging with what's already on the list. Returns a short message.
export function addGroceries(entries) {
  const open = itemsOf("grocery").filter((g) => !g.done);
  const added = [];
  let bumped = 0;
  let nextOrder = Math.max(Date.now(), ...open.map(orderOf)) + 1;
  for (const entry of entries) {
    const { text, qty } = parseQty(entry);
    if (!text) continue;
    const existing = open.find((g) => g.text.toLowerCase() === text.toLowerCase());
    if (existing) {
      bumped++;
      forgetRow(existing.id);
      state.api.update(existing.id, { qty: Math.min(LIMITS.qty, (existing.qty || 1) + qty) }).catch(() => { /* retried by the SDK */ });
    } else {
      const item = { type: "grocery", text: capitalise(text).slice(0, LIMITS.text), done: false, order: nextOrder++ };
      if (qty > 1) item.qty = Math.min(LIMITS.qty, qty);
      state.api.add(item).saved.catch(offlineNote);
      added.push(text);
    }
  }
  state.api.bumpOften(entries.map((e) => parseQty(e).text), state.often);
  if (added.length && bumped) return `Added ${added.length}, updated ${bumped}`;
  if (bumped) return bumped === 1 ? "Already on the list, quantity updated" : `Updated ${bumped} items`;
  return added.length > 1 ? `Added ${added.length} items` : "Added";
}

// Add a task, reminder or note
export function addItem(type, text, { due = null, repeat = "", who = "", photo = null } = {}) {
  const item = { type, text: text.slice(0, LIMITS.text), done: false };
  if (type === "reminder" || type === "task") {
    let when = due;
    if (repeat) { item.repeat = repeat; if (!when) when = nextDue(Date.now() - DAY, repeat); }
    if (when) item.due = when;
  }
  if (type === "task") {
    item.order = Date.now();
    if (who) item.for = who;
  }
  if (photo) { item.thumb = photo.thumb; item.hasPhoto = true; }
  const { id, saved } = state.api.add(item);
  saved.catch(offlineNote);
  if (photo) state.api.savePhoto(id, photo.full).catch(() => toast("Couldn't upload the photo"));
  return id;
}

// Save a dragged item's new position
export function moveItem(item, order) {
  item.order = order; // show it straight away; the sync confirms it
  forgetRow(item.id);
  state.api.update(item.id, { order }).catch(() => toast("Couldn't save the new order"));
}

// Rows are cached by views/rows.js; actions only ask for one to be rebuilt
let forget = () => {};
export const setRowForgetter = (fn) => { forget = fn; };
export const forgetRow = (id) => forget(id);

export const addPulse = (form) => {
  if (reduceMotion.matches) return;
  qs(".add-btn svg", form)?.animate(
    [{ transform: "scale(1)" }, { transform: "scale(.82)" }, { transform: "scale(1)" }],
    { duration: 260, easing: "cubic-bezier(.3,1.2,.5,1)" });
};

export const typeTitle = (type) => typeInfo(type)?.title ?? "";
