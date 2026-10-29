import { firebaseConfig } from "./config.js";

const SDK = "https://www.gstatic.com/firebasejs/10.12.2";
const TYPES = {
  task: {
    title: "Tasks", short: "Task", one: "task", placeholder: "Add a task", icon: "task",
    empty: ["No tasks yet", "Add one above and choose who's doing it."],
  },
  reminder: {
    title: "Reminders", short: "Reminder", one: "reminder", placeholder: "Remind us to…", icon: "bell",
    empty: ["No reminders", "Add one above and tap a time."],
  },
  grocery: {
    title: "Groceries", short: "Grocery", one: "item", placeholder: "Add items (milk, eggs, bread)", icon: "cart",
    empty: ["Your list is empty", "Tip: add several at once, separated by commas."],
  },
  note: {
    title: "Notes", short: "Note", one: "note", placeholder: "Write a note…", icon: "note",
    empty: ["No notes yet", "Handy for wifi passwords, gift ideas and recipes."],
  },
};

// ---------- icons (Lucide-style SVG, one consistent stroke set) ----------
const ICONS = {
  task: '<path d="m9 11 3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L22 7H6"/>',
  note: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  calendar: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  share: '<path d="M12 3v13M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>',
  heart: '<path d="M19.5 12.6 12 20l-7.5-7.4A5 5 0 1 1 12 6a5 5 0 1 1 7.5 6.6z"/>',
};
function icon(name, cls = "i") {
  const span = document.createElement("span");
  span.innerHTML = `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
  return span.firstChild;
}

// ---------- motion & feel ----------
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
const seen = new Set();   // item ids already shown, so only genuinely new ones animate in
const prevCounts = {};    // last shown numbers, for count-ups and badge bumps
const motion = { stagger: false, i: 0 };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// iOS 18+ plays a haptic tick when a switch control toggles; borrow it for key taps.
const hapticEl = (() => {
  const label = document.createElement("label");
  label.setAttribute("aria-hidden", "true");
  label.style.cssText = "position:fixed;width:0;height:0;overflow:hidden;opacity:0;pointer-events:none";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", "");
  input.tabIndex = -1;
  label.append(input);
  document.body.append(label);
  return label;
})();
function haptic() { try { hapticEl.click(); } catch {} }

const CONFETTI = ["#ec4899", "#f59e0b", "#6366f1", "#10b981", "#38bdf8", "#f43f5e"];
function burst(x, y, count = 12, power = 1) {
  if (reduceMotion.matches) return;
  for (let k = 0; k < count; k++) {
    const p = document.createElement("i");
    p.className = "confetti";
    p.style.cssText = `left:${x}px;top:${y}px;background:${CONFETTI[k % CONFETTI.length]}`;
    if (k % 3 === 0) p.style.borderRadius = "50%";
    document.body.append(p);
    const angle = Math.random() * Math.PI * 2, dist = (30 + Math.random() * 50) * power;
    p.animate([
      { transform: "translate(-50%, -50%) rotate(0deg) scale(1)", opacity: 1 },
      { transform: `translate(calc(-50% + ${Math.cos(angle) * dist}px), calc(-50% + ${Math.sin(angle) * dist + 30 * power}px)) rotate(${Math.random() * 600}deg) scale(.5)`, opacity: 0 },
    ], { duration: 650 + Math.random() * 450, easing: "cubic-bezier(.15,.8,.3,1)" }).onfinish = () => p.remove();
  }
}
const celebrate = () => burst(innerWidth / 2, innerHeight * 0.4, 70, 3.2);

// Shrink a row away before it leaves the list
function collapse(el) {
  if (reduceMotion.matches || !el.isConnected) return Promise.resolve();
  return el.animate(
    [{ height: `${el.offsetHeight}px`, opacity: 1 }, { height: "0px", opacity: 0 }],
    { duration: 240, easing: "cubic-bezier(.4,0,.2,1)", fill: "forwards" },
  ).finished;
}

// Numbers on Home roll up to their new value
function rollNumbers() {
  document.querySelectorAll("[data-count]").forEach((el) => {
    const to = +el.dataset.count, key = el.dataset.key, from = prevCounts[key] ?? 0;
    prevCounts[key] = to;
    if (from === to || reduceMotion.matches) { el.textContent = to; return; }
    const t0 = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - t0) / 550);
      el.textContent = Math.round(from + (to - from) * (1 - (1 - p) ** 3));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

// ---------- small helpers ----------
const $ = (sel) => document.querySelector(sel);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c);
  return el;
}
function toast(msg, action) {
  const t = $("#toast");
  t.replaceChildren(h("span", {}, msg));
  if (action) {
    t.append(h("button", { type: "button", onclick: () => { t.classList.remove("show"); action.run(); } }, action.label));
  }
  t.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("show"), action ? 5000 : 3000);
}
function newCode() {
  const abc = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return [...bytes].map((b) => abc[b % abc.length]).join("").match(/.{4}/g).join("-");
}
function ago(ms) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
const dayDiff = (ms) => Math.round((startOfDay(new Date(ms)) - startOfDay(new Date())) / 86400000);
function fmtDue(ms) {
  const d = new Date(ms), diff = dayDiff(ms);
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (diff === 0) return `Today, ${time}`;
  if (diff === 1) return `Tomorrow, ${time}`;
  if (diff === -1) return `Yesterday, ${time}`;
  if (diff > 1 && diff < 7) return `${d.toLocaleDateString(undefined, { weekday: "long" })}, ${time}`;
  return `${d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}, ${time}`;
}
// <input type="datetime-local"> works in local time without a zone suffix
function toLocalInput(ms) {
  if (!ms) return "";
  return new Date(ms - new Date(ms).getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
const fromLocalInput = (v) => (v ? new Date(v).getTime() : null);

const roundUp5 = (ms) => Math.ceil(ms / 300e3) * 300e3;

// One-tap times for reminders, so nobody has to fight the date picker.
function timePresets() {
  const now = new Date();
  const at = (days, hour) => { const d = new Date(now); d.setDate(d.getDate() + days); d.setHours(hour, 0, 0, 0); return d.getTime(); };
  const out = [{ id: "hour", label: "In 1 hour", ms: roundUp5(Date.now() + 3600e3) }];
  if (now.getHours() < 17) out.push({ id: "evening", label: "This evening", ms: at(0, 18) });
  out.push({ id: "tomorrow", label: "Tomorrow 9 AM", ms: at(1, 9) });
  const toSat = (6 - now.getDay() + 7) % 7 || 7;
  if (toSat > 1) out.push({ id: "weekend", label: "Saturday 10 AM", ms: at(toSat, 10) });
  return out;
}

// ---------- data backends ----------
// Both backends expose the same tiny API.
async function firebaseBackend(code) {
  const [{ initializeApp }, fs] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-firestore.js`),
  ]);
  const app = initializeApp(firebaseConfig);
  let db;
  try {
    db = fs.initializeFirestore(app, {
      localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
    });
  } catch {
    db = fs.getFirestore(app);
  }
  const familyRef = fs.doc(db, "families", code);
  const itemsRef = fs.collection(familyRef, "items");
  return {
    subscribeItems(cb, onStatus) {
      fs.onSnapshot(itemsRef, { includeMetadataChanges: true }, (snap) => {
        onStatus(!snap.metadata.fromCache);
        cb(snap.docs.map((d) => {
          const x = d.data({ serverTimestamps: "estimate" });
          return { ...x, id: d.id, createdAt: x.createdAt?.toMillis?.() ?? Date.now() };
        }));
      }, (err) => { console.error(err); onStatus(false); toast("Can't sync. Check the Firestore rules."); });
    },
    subscribeMembers(cb) {
      fs.onSnapshot(familyRef, (snap) => cb(snap.data()?.members ?? []), () => {});
    },
    add: (item) => fs.addDoc(itemsRef, { ...item, createdAt: fs.serverTimestamp() }),
    restore: ({ id, createdAt, ...rest }) => fs.setDoc(fs.doc(itemsRef, id), { ...rest, createdAt: fs.Timestamp.fromMillis(createdAt) }),
    update: (id, patch) => fs.updateDoc(fs.doc(itemsRef, id), patch),
    remove: (id) => fs.deleteDoc(fs.doc(itemsRef, id)),
    join: (name) => fs.setDoc(familyRef, { members: fs.arrayUnion(name) }, { merge: true }),
  };
}

// Demo mode: stores everything on this device only (used before Firebase is set up).
function demoBackend(code) {
  const key = `fb.demo.${code}`;
  let data;
  try { data = JSON.parse(store.get(key)) || { items: [], members: [] }; } catch { data = { items: [], members: [] }; }
  let itemsCb = () => {}, membersCb = () => {};
  const emit = () => {
    store.set(key, JSON.stringify(data));
    itemsCb(structuredClone(data.items));
    membersCb([...data.members]);
  };
  return {
    subscribeItems(cb, onStatus) { itemsCb = cb; onStatus(true); cb(structuredClone(data.items)); },
    subscribeMembers(cb) { membersCb = cb; cb([...data.members]); },
    async add(item) { data.items.push({ ...item, id: crypto.randomUUID(), createdAt: Date.now() }); emit(); },
    async restore(item) { data.items.push(item); emit(); },
    async update(id, patch) { Object.assign(data.items.find((i) => i.id === id) ?? {}, patch); emit(); },
    async remove(id) { data.items = data.items.filter((i) => i.id !== id); emit(); },
    async join(name) { if (!data.members.includes(name)) data.members.push(name); emit(); },
  };
}

// ---------- state ----------
const state = {
  name: store.get("fb.name") || "",
  code: store.get("fb.family") || "",
  view: store.get("fb.view") || "home",
  items: [],
  members: [],
  loaded: false,
  api: null,
  // composer state survives live re-renders
  quickType: "task",
  drafts: {},
  when: "tomorrow",
  customDue: "",
  who: "",
};
const configured = !String(firebaseConfig.apiKey || "").startsWith("PASTE");
const isMe = (name) => !!name && name === state.name;
const partnerName = () => state.members.find((m) => m !== state.name);
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const standalone = navigator.standalone || matchMedia("(display-mode: standalone)").matches;

// Pick up an invite link (?family=CODE). The code stays in the URL on purpose:
// on iPhone, "Add to Home Screen" saves the current URL, so the home-screen app
// knows which board to open even though it has its own separate storage.
const params = new URLSearchParams(location.search);
const urlCode = params.get("family");
const demo = params.has("demo") || store.get("fb.demo") === "1";
if (urlCode && urlCode !== state.code) {
  state.code = urlCode;
  store.set("fb.family", urlCode);
}

// ---------- setup ----------
function showSetup() {
  $("#setup").hidden = false;
  $("#app").hidden = true;
  if (!configured && !demo) { $("#setup-noconfig").hidden = false; return; }
  $("#setup-form").hidden = false;
  $("#setup-name").value = state.name;
  if (state.code) { $("#setup-join").hidden = false; $("#setup-choose").hidden = true; }
  $("#setup-form").onsubmit = (e) => {
    e.preventDefault();
    const err = $("#setup-error");
    const name = $("#setup-name").value.trim();
    if (!name) { err.textContent = "Please type your name so your partner knows who added what."; $("#setup-name").focus(); return; }
    let code = state.code;
    if (!code) {
      const typed = $("#setup-code").value.trim();
      code = typed ? extractCode(typed) : newCode();
      if (code.length < 20) { err.textContent = "That code looks too short. Paste the whole invite link from your partner."; $("#setup-code").focus(); return; }
    }
    state.name = name;
    state.code = code;
    store.set("fb.name", name);
    store.set("fb.family", code);
    start();
  };
}
// Accept either a bare code or a full invite link pasted into the field.
function extractCode(text) {
  try { return new URL(text).searchParams.get("family") || text; } catch { return text; }
}

async function start() {
  $("#setup").hidden = true;
  $("#app").hidden = false;
  if (demo) store.set("fb.demo", "1");
  const url = new URL(location.href);
  url.searchParams.set("family", state.code);
  history.replaceState(null, "", url);

  // Large title collapses into the navigation bar as you scroll, like iOS
  new IntersectionObserver(([e]) => $("#navbar").classList.toggle("scrolled", !e.isIntersecting), {
    rootMargin: `-${$("#navbar").offsetHeight}px 0px 0px 0px`,
  }).observe($("#view-title"));
  render();

  try {
    state.api = configured && !demo ? await firebaseBackend(state.code) : demoBackend(state.code);
  } catch (err) {
    console.error(err);
    toast("Couldn't connect. Check your internet and reopen the app.");
    return;
  }
  state.api.join(state.name).catch(() => {});
  state.api.subscribeMembers((m) => { state.members = m; render(); });
  let offlineTimer;
  state.api.subscribeItems(
    (items) => {
      if (state.loaded) announcePartnerAdds(items);
      state.items = items;
      state.loaded = true;
      render();
    },
    (online) => {
      // Brief cache reads at startup are normal, so wait before calling it "offline"
      clearTimeout(offlineTimer);
      if (online) $("#offline").hidden = true;
      else offlineTimer = setTimeout(() => ($("#offline").hidden = false), 2500);
    }
  );
}

// When your partner adds something while the app is open, say so.
function announcePartnerAdds(items) {
  const known = new Set(state.items.map((i) => i.id));
  const fresh = items.filter((i) => !known.has(i.id) && i.by && !isMe(i.by));
  if (!fresh.length) return;
  const first = fresh[0];
  const what = fresh.length === 1
    ? `“${first.text.length > 28 ? first.text.slice(0, 28) + "…" : first.text}”`
    : `${fresh.length} things`;
  haptic();
  toast(`${first.by} added ${what}`, state.view === first.type ? null : { label: "View", run: () => go(first.type) });
}

// ---------- rendering ----------
function itemsOf(type) {
  const list = state.items.filter((i) => i.type === type);
  if (type === "reminder") {
    return list.sort((a, b) => (a.done - b.done) || ((a.due ?? Infinity) - (b.due ?? Infinity)) || (a.createdAt - b.createdAt));
  }
  if (type === "note") return list.sort((a, b) => b.createdAt - a.createdAt);
  return list.sort((a, b) => (a.done - b.done) || (a.createdAt - b.createdAt));
}
const openCount = (type) => state.items.filter((i) => i.type === type && !i.done).length;

function render({ full = false } = {}) {
  const hour = new Date().getHours();
  $("#greeting").textContent = `${hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"}, ${state.name}`;
  const title = state.view === "home" ? "Our Home" : TYPES[state.view].title;
  $("#view-title").textContent = title;
  $("#nav-title").textContent = title;
  document.querySelectorAll("#tabbar button").forEach((b) => {
    const v = b.dataset.view;
    if (v === state.view) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
    const n = v === "home" || v === "note" ? 0 : openCount(v);
    const badge = b.querySelector(".badge");
    if (badge) {
      badge.textContent = n ? (n > 99 ? "99+" : n) : "";
      const key = `badge-${v}`;
      if (prevCounts[key] !== undefined && n > prevCounts[key] && !reduceMotion.matches) {
        badge.animate([{ transform: "scale(1)" }, { transform: "scale(1.45)" }, { transform: "scale(1)" }],
          { duration: 420, easing: "cubic-bezier(.3,1.6,.5,1)" });
      }
      prevCounts[key] = n;
    }
    const label = b.querySelector("span").textContent;
    b.setAttribute("aria-label", n ? `${label}, ${n} open` : label);
  });

  // While someone is typing, only refresh the content below the composer
  // so their text, keyboard and cursor are never disturbed by a sync.
  // The very first paint staggers rows in; after that only new rows animate.
  motion.stagger = state.loaded && !motion.painted;
  motion.i = 0;
  const content = $("#content");
  if (!full && content && document.activeElement?.closest?.(".composer")) {
    content.replaceChildren(...viewContent().filter(Boolean));
  } else {
    $("#main").replaceChildren(...[
      state.view === "home" && installHint(),
      composer(state.view === "home" ? state.quickType : state.view, state.view === "home"),
      h("div", { id: "content" }, viewContent()),
    ].filter(Boolean));
  }
  if (state.loaded) {
    state.items.forEach((i) => seen.add(i.id));
    motion.painted = true;
  }
  rollNumbers();
}
// How a row should arrive: staggered on first paint, sliding in when new, still otherwise.
function arrival(item) {
  if (seen.has(item.id)) return { cls: "", style: null };
  if (motion.stagger) return { cls: " stagger", style: `--i:${Math.min(motion.i++, 12)}` };
  return { cls: isMe(item.by) ? " enter" : " enter fresh", style: null };
}
const viewContent = () => (!state.loaded ? skeleton() : state.view === "home" ? homeContent() : listContent(state.view));
const skeleton = () => [h("div", { class: "skeleton" }), h("div", { class: "skeleton" }), h("div", { class: "skeleton" })];

function installHint() {
  if (!isIOS || standalone || store.get("fb.hint.install") === "0") return null;
  const box = h("div", { class: "install-hint", role: "note" },
    h("p", {}, h("strong", {}, "Put it on your Home Screen. "), "Tap ", icon("share", "i inline"), " Share at the bottom of Safari, then choose ", h("strong", {}, "Add to Home Screen"), "."),
    h("button", { class: "icon-btn", "aria-label": "Dismiss tip", onclick: () => { store.set("fb.hint.install", "0"); box.remove(); } }, icon("x")),
  );
  return box;
}

function byChip(name) {
  return h("span", { class: `chip ${isMe(name) ? "me" : "partner"}` }, isMe(name) ? "You" : name || "?");
}

function itemRow(item) {
  const meta = [];
  if (item.type === "reminder" && item.due) {
    const left = item.due - Date.now();
    const cls = item.done ? "" : left < 0 ? "overdue" : left < 86400000 ? "soon" : "";
    meta.push(h("span", { class: `due ${cls}` }, icon("clock"), (cls === "overdue" ? "Overdue · " : "") + fmtDue(item.due)));
  }
  if (item.type === "task" && item.for) meta.push(h("span", {}, "For"), byChip(item.for));
  else meta.push(byChip(item.by));
  meta.push(h("span", {}, ago(item.createdAt)));
  if (item.done && item.doneBy) meta.push(h("span", {}, `· done by ${isMe(item.doneBy) ? "you" : item.doneBy}`));

  const { cls, style } = arrival(item);
  const row = h("div", { class: `item${item.done ? " is-done" : ""}` },
    h("button", {
      class: "check",
      "aria-pressed": item.done ? "true" : "false",
      "aria-label": `${item.done ? "Mark not done" : "Mark done"}: ${item.text}`,
      onclick: (e) => toggle(item, e.currentTarget),
    }, h("span", { class: "ring" })),
    h("button", { class: "item-body", "aria-label": `Edit: ${item.text}`, onclick: () => openEdit(item) },
      h("div", { class: "item-text" }, item.text),
      h("div", { class: "meta" }, meta),
    ),
  );
  // Swipe right to complete, left to delete (the circle and the edit sheet do the same)
  const wrap = h("div", { class: `swipe${cls}`, style },
    h("div", { class: "swipe-under done-side", "aria-hidden": "true" }, icon("task"), item.done ? "Not done" : "Done"),
    h("div", { class: "swipe-under delete-side", "aria-hidden": "true" }, "Delete", icon("x")),
    row);
  attachSwipe(wrap, row, item);
  return wrap;
}

function attachSwipe(wrap, row, item) {
  const LIMIT = 90;
  let x0 = 0, y0 = 0, dx = 0, mode = null; // mode: null until we know if it's a sideways swipe or a scroll
  wrap.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) return;
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; mode = null;
  }, { passive: true });
  wrap.addEventListener("touchmove", (e) => {
    const mx = e.touches[0].clientX - x0, my = e.touches[0].clientY - y0;
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
      await wait(160);
      await collapse(wrap);
      removeWithUndo([item], "Deleted");
    } else {
      row.style.transform = "";
    }
  };
  wrap.addEventListener("touchend", end);
  wrap.addEventListener("touchcancel", end);
}

function noteCard(item) {
  const { cls, style } = arrival(item);
  return h("button", { class: `note${cls}`, style, "aria-label": `Edit note: ${item.text.slice(0, 60)}`, onclick: () => openEdit(item) },
    h("div", { class: "item-text" }, item.text),
    h("div", { class: "meta" }, byChip(item.by), h("span", {}, ago(item.createdAt))),
  );
}

function emptyState(type) {
  const [title, hint] = TYPES[type].empty;
  return h("div", { class: "empty" },
    h("div", { class: "empty-icon" }, icon(TYPES[type].icon)),
    h("h3", {}, title), h("p", {}, hint));
}

function chipGroup(label, options, current, onPick, extraClass = "") {
  return h("div", { class: `chips ${extraClass}`, role: "group", "aria-label": label },
    options.map((o) => h("button", {
      type: "button", class: "chip-btn", "aria-pressed": o.value === current ? "true" : "false",
      onclick: () => onPick(o.value),
    }, o.icon ? icon(o.icon) : null, o.label)));
}

// iOS segmented control: a sliding thumb behind 2–5 equal segments
function segmented(label, options, current, onPick) {
  const index = Math.max(0, options.findIndex((o) => o.value === current));
  return h("div", { class: "segmented", role: "group", "aria-label": label, style: `--count:${options.length};--index:${index}` },
    h("span", { class: "thumb", "aria-hidden": "true" }),
    options.map((o, i) => h("button", {
      type: "button", "aria-pressed": i === index ? "true" : "false",
      onclick: (e) => {
        if (i === index) return;
        haptic();
        // Slide the thumb first, then let the caller re-render
        e.currentTarget.parentElement.style.setProperty("--index", i);
        setTimeout(() => onPick(o.value), reduceMotion.matches ? 0 : 160);
      },
    }, o.icon ? icon(o.icon) : null, o.label)));
}

function whoOptions() {
  const partner = partnerName();
  return [
    { value: "", label: "Either" },
    { value: state.name, label: "Me" },
    partner && { value: partner, label: partner },
  ].filter(Boolean);
}

// The add box. On Home it has a type switch so anything can be added from one place.
function composer(type, onHome) {
  const form = h("form", { class: "composer", novalidate: true });
  const rerender = () => { const y = scrollY; render({ full: true }); scrollTo(0, y); };

  if (onHome) {
    form.append(segmented("What to add",
      Object.entries(TYPES).map(([value, t]) => ({ value, label: t.short })),
      type, (v) => { state.quickType = v; rerender(); }));
  }

  const inputAttrs = {
    name: "text", placeholder: TYPES[type].placeholder, "aria-label": TYPES[type].placeholder,
    maxlength: 2000, autocomplete: "off", autocapitalize: "sentences",
  };
  const text = type === "note"
    ? h("textarea", { ...inputAttrs, rows: 2 })
    : h("input", { ...inputAttrs, enterkeyhint: "done", list: type === "grocery" ? "grocery-history" : null });
  text.value = state.drafts[type] || "";
  text.addEventListener("input", () => (state.drafts[type] = text.value));
  form.append(h("div", { class: "composer-row" }, text,
    h("button", { class: "btn primary add-btn", type: "submit", "aria-label": `Add ${TYPES[type].one}` }, icon("plus"))));

  // Groceries: suggest things you've bought before
  if (type === "grocery") {
    const names = [...new Set(itemsOf("grocery").map((i) => i.text))].slice(0, 200);
    form.append(h("datalist", { id: "grocery-history" }, names.map((n) => h("option", { value: n }))));
  }

  if (type === "reminder") {
    const presets = timePresets();
    if (state.when !== "custom" && !presets.some((p) => p.id === state.when)) state.when = "tomorrow";
    const opts = [...presets.map((p) => ({ value: p.id, label: p.label })), { value: "custom", label: "Pick a date", icon: "calendar" }];
    const custom = h("input", {
      type: "datetime-local", class: "custom-when", "aria-label": "Reminder date and time",
      value: state.customDue || toLocalInput(presets.find((p) => p.id === "tomorrow").ms),
      onchange: (e) => (state.customDue = e.target.value),
    });
    custom.hidden = state.when !== "custom";
    form.append(h("div", { class: "composer-extra" },
      h("p", { class: "label" }, "When"),
      chipGroup("When", opts, state.when, (v) => { state.when = v; rerender(); }, "scroll"),
      custom));
    form.dueValue = () => (state.when === "custom" ? fromLocalInput(custom.value) : presets.find((p) => p.id === state.when)?.ms);
  }

  if (type === "task") {
    form.append(h("div", { class: "composer-extra" },
      h("p", { class: "label" }, "Who's doing it"),
      segmented("Who's doing it", whoOptions(), state.who, (v) => { state.who = v; rerender(); })));
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const value = text.value.trim();
    if (!value) { text.focus(); toast(`Type a ${TYPES[type].one} first`); return; }
    if (!state.api) { toast("Still connecting, try again in a moment"); return; }
    // Groceries: "milk, eggs, bread" adds three items at once
    const texts = type === "grocery" ? value.split(/[,\n]/).map((s) => s.trim()).filter(Boolean) : [value];
    for (const t of texts) {
      const item = { type, text: t, by: state.name, done: false };
      if (type === "reminder") item.due = form.dueValue() ?? null;
      if (type === "task" && state.who) item.for = state.who;
      state.api.add(item).catch(() => toast("Saved on this phone. It will sync when you're back online."));
    }
    text.value = state.drafts[type] = "";
    text.focus();
    haptic();
    if (!reduceMotion.matches) {
      form.querySelector(".add-btn svg")?.animate(
        [{ transform: "rotate(0) scale(1)" }, { transform: "rotate(90deg) scale(1.25)" }, { transform: "rotate(180deg) scale(1)" }],
        { duration: 450, easing: "cubic-bezier(.3,1.4,.5,1)" });
    }
    const where = onHome ? ` to ${TYPES[type].title}` : "";
    toast(texts.length > 1 ? `Added ${texts.length} items${where}` : `Added${where}`);
  });
  return form;
}

function doneSection(type, done) {
  return [
    h("div", { class: "section-title" },
      h("span", {}, `Done · ${done.length}`),
      h("button", { class: "link-btn", onclick: () => removeWithUndo(done, `Cleared ${done.length} done`) }, "Clear all")),
    h("div", { class: "list" }, done.slice(-30).reverse().map(itemRow)),
  ];
}

// Aisles in the order you'd walk a typical shop. First match wins, so specific
// words (chilli powder) are checked before broad ones (chilli).
const AISLE_RULES = [
  ["Spices & masala", /\b(masala|turmeric|haldi|jeera|cumin|mustard seed|spice|cardamom|elaichi|clove|cinnamon|hing|powder|garam|saffron|oregano|bay lea)/],
  ["Dairy & eggs", /\b(milk|curd|yog|dahi|paneer|butter|ghee|cheese|cream|eggs?\b|buttermilk|lassi)/],
  ["Bakery", /\b(bread|buns?\b|pav|cake|croissant|bagel|tortilla|roti|naan|muffin)/],
  ["Meat & fish", /\b(chicken|mutton|fish|prawn|shrimp|meat|beef|pork|lamb|salmon|tuna|sausage|bacon)/],
  ["Grains & staples", /\b(rice|atta|flour|maida|dal|lentil|chana|rajma|oats|poha|rava|suji|sugar|salt|jaggery|oil|pasta|noodle|cereal|besan|quinoa|sooji|vermicelli)/],
  ["Fruit & veg", /\b(apple|banana|mango|orange|grape|lemon|lime|onion|tomato|potato|garlic|ginger|chil+i|coriander|cilantro|mint|spinach|palak|methi|carrot|cucumber|capsicum|pepper|beans|peas|cabbage|cauliflower|brinjal|eggplant|okra|bhindi|lettuce|avocado|berr|fruit|veg|curry lea|pumpkin|gourd|beet|radish|mushroom|corn|papaya|melon|pomegranate|guava|kiwi|pear|broccoli|zucchini|celery|herb)/],
  ["Snacks & drinks", /\b(chips|snack|namkeen|chocolate|juice|soda|coke|tea|coffee|water|beer|wine|ice ?cream|nuts?\b|almond|cashew|biscuit|cookie|crackers?|popcorn)/],
  ["Household", /\b(soap|detergent|shampoo|toothpaste|toothbrush|tissue|paper|cleaner|dish|bin bags?|garbage|sponge|diaper|wipes|batter(y|ies)|bulb|foil|cling|handwash|sanitizer|conditioner|lotion|razor)/],
];
const AISLES = [
  ["Fruit & veg"], ["Bakery"], ["Dairy & eggs"], ["Meat & fish"], ["Grains & staples"],
  ["Spices & masala"], ["Snacks & drinks"], ["Household"], ["Other"],
];
const aisleOf = (text) => AISLE_RULES.find(([, re]) => re.test(text.toLowerCase()))?.[0] ?? "Other";

function basketProgress(total, got) {
  const pct = total ? Math.round((got / total) * 100) : 0;
  const bar = h("div", { class: "progress-fill" });
  const box = h("div", { class: "basket", role: "progressbar", "aria-valuemin": 0, "aria-valuemax": total, "aria-valuenow": got, "aria-label": "Items in the basket" },
    h("div", { class: "basket-text" },
      h("strong", {}, got === total ? "Everything's in the basket" : `${total - got} left to buy`),
      h("span", {}, `${got} of ${total} done`)),
    h("div", { class: "progress" }, bar));
  // Grow from the previous width to the new one
  const key = "basket";
  bar.style.width = `${prevCounts[key] ?? 0}%`;
  requestAnimationFrame(() => requestAnimationFrame(() => (bar.style.width = `${pct}%`)));
  prevCounts[key] = pct;
  return box;
}

function listContent(type) {
  const items = itemsOf(type);
  if (!items.length) return [emptyState(type)];
  if (type === "note") return [h("div", { class: "notes" }, items.map(noteCard))];
  const open = items.filter((i) => !i.done), done = items.filter((i) => i.done);
  const out = [];

  if (type === "reminder") {
    // Group by time so the next thing is always at the top
    const groups = [
      ["Overdue", (r) => r.due && r.due < Date.now()],
      ["Today", (r) => r.due && dayDiff(r.due) === 0],
      ["Next 7 days", (r) => r.due && dayDiff(r.due) < 7],
      ["Later", () => true],
    ];
    let rest = open;
    for (const [label, test] of groups) {
      const these = rest.filter(test);
      rest = rest.filter((r) => !these.includes(r));
      if (!these.length) continue;
      out.push(h("div", { class: `section-title${label === "Overdue" ? " danger" : ""}` }, h("span", {}, label)));
      out.push(h("div", { class: "list" }, these.map(itemRow)));
    }
  } else if (type === "grocery") {
    out.push(basketProgress(items.length, done.length));
    // Sort the open items by store aisle once the list is long enough to need it
    const byAisle = new Map(AISLES.map(([name]) => [name, []]));
    open.forEach((g) => byAisle.get(aisleOf(g.text)).push(g));
    const used = [...byAisle].filter(([, list]) => list.length);
    if (open.length >= 4 && used.length > 1) {
      for (const [name, list] of used) {
        out.push(h("div", { class: "section-title" }, h("span", {}, name)));
        out.push(h("div", { class: "list" }, list.map(itemRow)));
      }
    } else if (open.length) {
      out.push(h("div", { class: "list" }, open.map(itemRow)));
    }
  } else if (open.length) {
    out.push(h("div", { class: "list" }, open.map(itemRow)));
  }
  if (!open.length) {
    out.push(h("div", { class: "empty" }, h("div", { class: "empty-icon" }, icon("sparkle")), h("h3", {}, "All done"), h("p", {}, "Nice teamwork.")));
  }
  if (done.length) out.push(...doneSection(type, done));
  return out;
}

function homeContent() {
  const now = Date.now();
  const reminders = itemsOf("reminder").filter((r) => !r.done && r.due && r.due - now < 3 * 86400000);
  const myTasks = itemsOf("task").filter((t) => !t.done && (!t.for || isMe(t.for)));
  const toBuy = itemsOf("grocery").filter((g) => !g.done);
  const recent = [...state.items].sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);
  const partner = partnerName();

  // Smart-list tiles, as in the Reminders app: coloured icon, count, name
  const stat = (type, label) => h("button", { class: "stat", "data-type": type, "aria-label": `${label}: ${openCount(type)}`, onclick: () => go(type) },
    h("span", { class: "stat-icon" }, icon(TYPES[type].icon)),
    h("b", { "data-count": openCount(type), "data-key": `stat-${type}`, "aria-hidden": "true" }, String(prevCounts[`stat-${type}`] ?? 0)),
    h("span", { class: "stat-label", "aria-hidden": "true" }, label));
  const section = (title, action) => h("div", { class: "section-title" }, h("span", {}, title),
    action && h("button", { class: "link-btn", onclick: action.run }, action.label));
  const quiet = (text) => h("div", { class: "empty compact" }, text);

  return [
    h("div", { class: "stats" }, stat("task", "Tasks"), stat("reminder", "Reminders"), stat("grocery", "To Buy"), stat("note", "Notes")),

    !partner && section("Invite your partner"),
    !partner && h("div", { class: "empty compact" },
      h("p", { style: "margin:0 0 12px" }, "Share the board so you both see the same lists."),
      h("button", { class: "btn primary block", onclick: shareInvite }, icon("heart"), "Send invite link")),

    section("Coming up", { label: "See all", run: () => go("reminder") }),
    reminders.length ? h("div", { class: "list" }, reminders.map(itemRow)) : quiet("Nothing in the next 3 days."),

    section("Your tasks", { label: "See all", run: () => go("task") }),
    myTasks.length ? h("div", { class: "list" }, myTasks.slice(0, 5).map(itemRow)) : quiet("Nothing on your plate."),

    section("Shopping list", { label: "Open", run: () => go("grocery") }),
    toBuy.length
      ? h("button", { class: "empty compact", style: "display:block;width:100%;text-align:left;border:0", onclick: () => go("grocery") },
          h("strong", {}, `${toBuy.length} to buy`),
          h("div", { class: "preview-line" }, toBuy.slice(0, 8).map((g) => g.text).join(", ") + (toBuy.length > 8 ? "…" : "")))
      : quiet("Nothing to buy right now."),

    recent.length > 0 && section("Recent activity"),
    recent.length > 0 && h("div", { class: "list activity" }, recent.map((i) => h("div", { class: "item" },
      h("span", { class: `avatar${isMe(i.by) ? " me" : ""}`, "aria-hidden": "true" }, (i.by || "?")[0].toUpperCase()),
      h("button", { class: "item-body", onclick: () => openEdit(i) },
        h("div", {}, h("strong", {}, isMe(i.by) ? "You" : i.by), ` added ${i.type === "grocery" ? "to groceries" : `a ${i.type}`}`),
        h("div", { class: "preview-line" }, `${i.text.length > 70 ? i.text.slice(0, 70) + "…" : i.text} · ${ago(i.createdAt)}`),
      )))),
  ];
}

// ---------- actions ----------
const VIEW_ORDER = ["home", "task", "reminder", "grocery", "note"];
function go(view) {
  if (view === state.view) { scrollTo({ top: 0, behavior: reduceMotion.matches ? "auto" : "smooth" }); return; }
  haptic();
  const swap = () => {
    state.view = view;
    store.set("fb.view", view);
    render({ full: true });
    scrollTo(0, 0);
  };
  // Slide between tabs in the direction of the tab bar (Safari 18+, Chrome); instant elsewhere
  if (document.startViewTransition && !reduceMotion.matches) {
    document.documentElement.dataset.nav = VIEW_ORDER.indexOf(view) > VIEW_ORDER.indexOf(state.view) ? "forward" : "back";
    document.startViewTransition(swap);
  } else {
    swap();
  }
}
const busy = new Set(); // items mid-animation, so a double tap can't toggle twice
async function toggle(item, checkBtn) {
  if (busy.has(item.id)) return;
  const done = !item.done;
  const wrap = checkBtn?.closest(".swipe");
  const lastOne = done && openCount(item.type) === 1;
  haptic();
  if (done && wrap && !reduceMotion.matches) {
    busy.add(item.id);
    // Fill the circle, pop a little confetti, strike the text, then fold the row away
    checkBtn.setAttribute("aria-pressed", "true");
    wrap.classList.add("completing");
    const r = checkBtn.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2, 10);
    await wait(420);
    await collapse(wrap);
    busy.delete(item.id);
  }
  state.api.update(item.id, { done, doneBy: done ? state.name : null })
    .catch(() => { toast("Couldn't update. Check your connection."); render({ full: true }); });
  if (lastOne) {
    celebrate();
    toast(item.type === "grocery" ? "Shopping done! Everything's in the basket." : "All done. Nice teamwork!");
  } else if (done) {
    toast("Marked done", { label: "Undo", run: () => state.api.update(item.id, { done: false, doneBy: null }) });
  }
}
// Deleting never needs a confirm dialog: an Undo button is faster and safer.
function removeWithUndo(items, msg) {
  items.forEach((i) => state.api.remove(i.id));
  toast(msg, { label: "Undo", run: () => items.forEach((i) => state.api.restore(i)) });
}

// ---------- sheets ----------
function openSheet(dlg) {
  dlg.classList.remove("closing");
  dlg.showModal();
}
function closeSheet(dlg) {
  if (!dlg.open || dlg.classList.contains("closing")) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return dlg.close();
  dlg.classList.add("closing");
  setTimeout(() => { dlg.close(); dlg.classList.remove("closing"); }, 170);
}
// Close by tapping the dim background, pressing Esc, the X, or dragging the sheet down.
function setupSheet(dlg) {
  dlg.addEventListener("click", (e) => { if (e.target === dlg) closeSheet(dlg); });
  dlg.addEventListener("cancel", (e) => { e.preventDefault(); closeSheet(dlg); });
  dlg.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () => closeSheet(dlg)));
  let startY = null, dy = 0;
  dlg.addEventListener("touchstart", (e) => {
    if (!e.target.closest(".sheet-grab, .sheet-head") || e.target.closest("button")) return;
    startY = e.touches[0].clientY;
    dlg.style.transition = "none";
  }, { passive: true });
  dlg.addEventListener("touchmove", (e) => {
    if (startY == null) return;
    dy = Math.max(0, e.touches[0].clientY - startY);
    dlg.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  dlg.addEventListener("touchend", () => {
    if (startY == null) return;
    dlg.style.transition = "transform 200ms var(--ease-out)";
    if (dy > 90) { dlg.style.transform = "translateY(100%)"; setTimeout(() => { dlg.close(); dlg.style.transform = dlg.style.transition = ""; }, 200); }
    else dlg.style.transform = "";
    startY = null; dy = 0;
  });
}
setupSheet($("#edit"));
setupSheet($("#settings"));

let editing = null, editWho = "";
function renderEditWho() {
  $("#edit-who").replaceChildren(segmented("Who's doing it", whoOptions(), editWho, (v) => { editWho = v; renderEditWho(); }));
}
// One-tap "push it later" for reminders. Fills the date field; Save keeps it.
function renderSnooze(due) {
  const base = Math.max(Date.now(), due || 0);
  const at = (days, hour) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(hour, 0, 0, 0); return d.getTime(); };
  const opts = [
    { label: "+1 hour", ms: roundUp5(base + 3600e3) },
    new Date().getHours() < 19 && { label: "Tonight 8 PM", ms: at(0, 20) },
    { label: "Tomorrow 9 AM", ms: at(1, 9) },
    { label: "Next week", ms: at(7, 9) },
  ].filter(Boolean);
  $("#edit-snooze").replaceChildren(...opts.map((o) => h("button", {
    type: "button", class: "chip-btn", "aria-pressed": "false",
    onclick: (e) => {
      $("#edit-due").value = toLocalInput(o.ms);
      $("#edit-snooze").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === e.currentTarget)));
      haptic();
    },
  }, o.label)));
}

function openEdit(item) {
  editing = item;
  const noun = TYPES[item.type].one.replace(/^./, (c) => c.toUpperCase());
  $("#edit-title").textContent = `Edit ${noun}`;
  $("#edit-delete").textContent = `Delete ${noun}`;
  $("#edit-text").value = item.text;
  $("#edit-due-wrap").hidden = item.type !== "reminder";
  $("#edit-due").value = toLocalInput(item.due);
  if (item.type === "reminder") renderSnooze(item.due);
  $("#edit-who-wrap").hidden = item.type !== "task";
  editWho = item.for || "";
  renderEditWho();
  $("#edit-meta").textContent = `Added by ${isMe(item.by) ? "you" : item.by}, ${ago(item.createdAt)}`;
  $("#edit-text").rows = item.type === "note" ? 8 : 3;
  openSheet($("#edit"));
}
$("#edit-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = $("#edit-text").value.trim();
  if (!editing) return;
  if (!text) { $("#edit-text").focus(); toast("Text can't be empty. Use Delete to remove it."); return; }
  const patch = { text };
  if (editing.type === "reminder") patch.due = fromLocalInput($("#edit-due").value);
  if (editing.type === "task") patch.for = editWho || null;
  state.api.update(editing.id, patch).catch(() => toast("Couldn't save"));
  closeSheet($("#edit"));
  toast("Saved");
});
$("#edit-delete").onclick = () => {
  if (!editing) return;
  closeSheet($("#edit"));
  removeWithUndo([editing], "Deleted");
};

function inviteLink() {
  return `${location.origin}${location.pathname}?family=${encodeURIComponent(state.code)}`;
}
async function shareInvite() {
  const url = inviteLink();
  try {
    if (navigator.share) await navigator.share({ title: "Family Board", text: "Join our Family Board", url });
    else { await navigator.clipboard.writeText(url); toast("Invite link copied"); }
  } catch {}
}

$("#open-settings").onclick = () => {
  $("#settings-name").value = state.name;
  $("#settings-code").textContent = state.code;
  openSheet($("#settings"));
};
$("#share-invite").onclick = shareInvite;
$("#settings-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("#settings-name").value.trim();
  if (name && name !== state.name) {
    state.name = name;
    store.set("fb.name", name);
    state.api?.join(name).catch(() => {});
    render();
    toast("Name updated");
  }
  closeSheet($("#settings"));
});
$("#leave-board").onclick = () => {
  if (!confirm("Leave this board on this phone? Your lists stay saved for your partner, and you can rejoin with the invite link.")) return;
  store.del("fb.family"); store.del("fb.demo");
  location.href = location.pathname;
};
document.querySelectorAll("#tabbar button").forEach((b) => (b.onclick = () => go(b.dataset.view)));
// Refresh relative times ("5m ago", overdue colours) every minute
setInterval(render, 60000);
// Coming back to the app after a while: refresh times straight away
document.addEventListener("visibilitychange", () => { if (!document.hidden && state.api) render(); });

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

if (state.name && state.code) start();
else showSetup();
