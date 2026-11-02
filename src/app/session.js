// Connecting to boards: open, switch, notice being removed, tidy old items.
import { DEFAULT_BOARD_NAME } from "../core/constants.js";
import { store } from "../core/store.js";
import { DAY } from "../core/time.js";
import { qs } from "../ui/dom.js";
import { toast } from "../ui/toast.js";
import { haptic, slideIn } from "../ui/motion.js";
import { getService, SetupError } from "../data/service.js";
import { localBoards } from "../data/local-boards.js";
import { state, demo, boardTitle, resetBoardState } from "./state.js";
import { nameOf, isMe } from "./people.js";
import { flushDeletes, resetTabLayer, go } from "./actions.js";
import { hooks } from "./hooks.js";
import { clearRowCache } from "../views/rows.js";

let shellReady = false;
function setupShell() {
  if (shellReady) return;
  shellReady = true;
  // Large title collapses into the navigation bar as you scroll, like iOS
  new IntersectionObserver(([e]) => qs("#navbar").classList.toggle("scrolled", !e.isIntersecting), {
    rootMargin: `-${qs("#navbar").offsetHeight}px 0px 0px 0px`,
  }).observe(qs("#view-title"));
}

function stopListening() {
  for (const off of state.unsubscribe) {
    try { off(); } catch { /* already stopped */ }
  }
  state.unsubscribe = [];
}

// Connect to one board: drop the previous board's live updates, reset what's on
// screen, make sure we're a member, then subscribe.
export async function openBoard(code, { invite = "" } = {}) {
  flushDeletes();
  stopListening();
  resetBoardState(code, boardTitle(localBoards.get(code)));
  clearRowCache();
  store.set("fb.family", code);
  // The invite has done its job; keep the address bar clean
  if (location.search && !location.search.includes("demo")) history.replaceState(history.state, "", location.pathname);

  qs("#setup").hidden = true;
  qs("#app").hidden = false;
  setupShell();
  hooks.render({ full: true });

  let service;
  try {
    service = state.service = await getService({ demo });
  } catch (e) {
    if (e instanceof SetupError) { hooks.showSetup({ problem: e }); return; }
    state.locked = "offline";
    hooks.render({ full: true });
    return;
  }
  state.uid = service.uid;
  try {
    await service.ensureMember(code, { invite, userName: state.name });
  } catch (e) {
    if (state.code !== code) return;
    state.locked = e instanceof SetupError ? e.code : "offline";
    hooks.render({ full: true });
    return;
  }
  if (state.code !== code) return; // switched again while connecting
  localBoards.upsert(code);
  subscribe(code, service.board(code));
}

function subscribe(code, api) {
  state.api = api;
  const removed = () => handleRemoved(code);
  let cleaned = false;
  state.unsubscribe.push(api.subscribeBoard((board) => {
    state.boardName = board.name || DEFAULT_BOARD_NAME;
    Object.assign(state, { ownerId: board.ownerId, legacyUntil: board.legacyUntil, keepDays: board.keepDays });
    localBoards.upsert(code, { name: state.boardName });
    if (!cleaned) { cleaned = true; maybeCleanup(); }
    hooks.scheduleRender();
  }, removed));
  state.unsubscribe.push(api.subscribeMembers((members) => {
    state.members = members;
    localBoards.upsert(code, { people: members.map((m) => (m.uid === state.uid ? "You" : m.name)) });
    hooks.scheduleRender();
  }, removed));
  state.unsubscribe.push(api.subscribeOften((counts) => {
    state.often = counts;
    if (state.view === "grocery") hooks.scheduleRender();
  }));
  let offlineTimer;
  state.unsubscribe.push(api.subscribeItems(
    (items) => {
      if (state.loaded) announceOthersAdds(items);
      state.items = items;
      state.loaded = true;
      hooks.scheduleRender();
    },
    (online) => {
      // Brief cache reads at startup are normal, so wait before calling it "offline"
      clearTimeout(offlineTimer);
      if (online) qs("#offline").hidden = true;
      else offlineTimer = setTimeout(() => { qs("#offline").hidden = false; }, 2500);
    },
    removed,
  ));
}

// Tidy ticked items past the board's limit, at most once a day per device
export function maybeCleanup({ force = false } = {}) {
  const key = `fb.cleanup.${state.code}`;
  if (!state.keepDays || (!force && Date.now() - (Number(store.get(key)) || 0) < DAY)) return;
  store.set(key, String(Date.now()));
  state.api?.cleanup(state.keepDays).catch(() => { /* try again tomorrow */ });
}

// When someone else adds something while the app is open, say so
function announceOthersAdds(items) {
  const known = new Set(state.items.map((i) => i.id));
  const fresh = items.filter((i) => !known.has(i.id) && i.by && !isMe(i.by));
  if (!fresh.length) return;
  const first = fresh[0];
  const what = fresh.length === 1
    ? `“${first.text.length > 28 ? `${first.text.slice(0, 28)}…` : first.text}”`
    : `${fresh.length} things`;
  haptic();
  toast(`${nameOf(first.by)} added ${what}`, state.view === first.type ? null : { label: "View", run: () => go(first.type) });
}

export function switchBoard(code, { invite = "", message } = {}) {
  if (code === state.code && !invite && !state.locked) return;
  haptic();
  resetTabLayer();
  state.view = "home";
  store.set("fb.view", "home");
  openBoard(code, { invite });
  scrollTo(0, 0);
  slideIn(true);
  if (message !== "") toast(message || `Opened ${boardTitle(localBoards.get(code))}`);
}

// Go to another board on this device, or back to the welcome screen if none is left
export function leaveToNextBoard(message) {
  const next = localBoards.list()[0];
  if (next) { switchBoard(next.code, { message }); return; }
  stopListening();
  state.code = "";
  store.del("fb.family");
  hooks.showSetup();
  if (message) toast(message);
}

// The board stopped letting us in: we left on another device, or the owner removed us
function handleRemoved(code) {
  if (state.code !== code) return;
  const name = state.boardName;
  localBoards.remove(code);
  leaveToNextBoard(`You're no longer on “${name}”`);
}

export function removeBoardHere(code) {
  localBoards.remove(code);
  leaveToNextBoard("");
}
