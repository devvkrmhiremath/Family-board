// The app's in-memory state and the read-only questions asked of it.
import { store } from "../core/store.js";
import { DEFAULT_BOARD_NAME, isView } from "../core/constants.js";

const params = new URLSearchParams(location.search);
export const demo = params.has("demo") || store.get("fb.demo") === "1";
if (demo) store.set("fb.demo", "1");

const savedView = store.get("fb.view");

export const state = {
  name: store.get("fb.name") || "",
  uid: null,
  code: store.get("fb.family") || "",
  boardName: "",
  ownerId: null,
  legacyUntil: 0,
  keepDays: 30,
  view: isView(savedView) ? savedView : "home",
  items: [],
  members: [],          // [{ uid, name, joinedAt }]
  often: {},            // grocery name -> times bought
  pending: new Map(),   // id -> { item, timer, api } for deletes that can still be undone
  loaded: false,
  locked: null,         // why this board can't be opened, if it can't
  service: null,
  api: null,
  unsubscribe: [],
  dragging: false,
  // Composer choices survive live re-renders
  quickType: "task",
  drafts: new Map(),
  when: new Map([["reminder", "tomorrow"], ["task", "none"]]),
  customDue: new Map(),
  repeat: new Map([["reminder", ""], ["task", ""]]),
  who: "",
  notePhoto: null,      // { full, thumb } waiting to be added with a new note
};

export const prevCounts = new Map(); // last numbers shown, for count-ups and badge bumps
export const seen = new Set();       // item ids already on screen; only new ones animate in
export const motionState = { stagger: false, i: 0, painted: false };

export const boardTitle = (b) => b?.name || DEFAULT_BOARD_NAME;

// Tasks and groceries follow the order they were dragged into
export const orderOf = (x) => x.order ?? x.createdAt;

export function itemsOf(type) {
  const list = state.items.filter((i) => i.type === type && !state.pending.has(i.id));
  if (type === "reminder") {
    return list.sort((a, b) => (a.done - b.done) || ((a.due ?? Infinity) - (b.due ?? Infinity)) || (a.createdAt - b.createdAt));
  }
  if (type === "note") return list.sort((a, b) => b.createdAt - a.createdAt);
  return list.sort((a, b) => (a.done - b.done) || (orderOf(a) - orderOf(b)));
}

export const openCount = (type) =>
  state.items.filter((i) => i.type === type && !i.done && !state.pending.has(i.id)).length;

export function resetBoardState(code, boardName) {
  Object.assign(state, {
    code, items: [], members: [], often: {}, loaded: false, api: null, locked: null,
    boardName, ownerId: null, legacyUntil: 0, keepDays: 30, who: "",
  });
  seen.clear();
  prevCounts.clear();
  motionState.painted = false;
}
