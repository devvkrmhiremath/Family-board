import { firebaseConfig } from "./config.js";

const SDK = "https://www.gstatic.com/firebasejs/10.12.2";
const TYPES = {
  task: { title: "Tasks", placeholder: "Add a task…", empty: "No tasks. Enjoy the calm." },
  reminder: { title: "Reminders", placeholder: "Remind us to…", empty: "No reminders yet." },
  grocery: { title: "Groceries", placeholder: "Milk, eggs, bread…", empty: "The list is empty." },
  note: { title: "Notes", placeholder: "Write a note…", empty: "No notes yet." },
};

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
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("show"), 2200);
}
function newCode() {
  const abc = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  const s = [...bytes].map((b) => abc[b % abc.length]).join("");
  return s.match(/.{4}/g).join("-"); // 24 chars, e.g. k3f9-...
}
function ago(ms) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function fmtDue(ms) {
  const d = new Date(ms), now = new Date();
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((day(d) - day(now)) / 86400000);
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (diffDays === 0) return `Today ${time}`;
  if (diffDays === 1) return `Tomorrow ${time}`;
  if (diffDays === -1) return `Yesterday ${time}`;
  if (diffDays > 1 && diffDays < 7) return `${d.toLocaleDateString(undefined, { weekday: "short" })} ${time}`;
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${time}`;
}
// <input type="datetime-local"> works in local time without a zone suffix
function toLocalInput(ms) {
  if (!ms) return "";
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}
const fromLocalInput = (v) => (v ? new Date(v).getTime() : null);

// ---------- data backends ----------
// Both backends expose the same tiny API: subscribe, add, update, remove, join.
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
      return fs.onSnapshot(itemsRef, { includeMetadataChanges: true }, (snap) => {
        onStatus(!snap.metadata.fromCache && !snap.metadata.hasPendingWrites);
        cb(snap.docs.map((d) => {
          const x = d.data({ serverTimestamps: "estimate" });
          return { ...x, id: d.id, createdAt: x.createdAt?.toMillis?.() ?? Date.now() };
        }));
      }, (err) => { console.error(err); onStatus(false); toast("Sync error — check Firestore rules"); });
    },
    subscribeMembers(cb) {
      return fs.onSnapshot(familyRef, (snap) => cb(snap.data()?.members ?? []), () => {});
    },
    add: (item) => fs.addDoc(itemsRef, { ...item, createdAt: fs.serverTimestamp() }),
    update: (id, patch) => fs.updateDoc(fs.doc(itemsRef, id), patch),
    remove: (id) => fs.deleteDoc(fs.doc(itemsRef, id)),
    join: (name) => fs.setDoc(familyRef, { members: fs.arrayUnion(name) }, { merge: true }),
  };
}

// Demo mode: stores everything on this device only (used before Firebase is set up).
function demoBackend(code) {
  const key = `fb.demo.${code}`;
  const load = () => { try { return JSON.parse(store.get(key)) || { items: [], members: [] }; } catch { return { items: [], members: [] }; } };
  let data = load();
  const subs = new Set(), memberSubs = new Set();
  const emit = () => {
    store.set(key, JSON.stringify(data));
    subs.forEach((cb) => cb(structuredClone(data.items)));
    memberSubs.forEach((cb) => cb([...data.members]));
  };
  return {
    subscribeItems(cb, onStatus) { subs.add(cb); onStatus(true); cb(structuredClone(data.items)); },
    subscribeMembers(cb) { memberSubs.add(cb); cb([...data.members]); },
    async add(item) { data.items.push({ ...item, id: crypto.randomUUID(), createdAt: Date.now() }); emit(); },
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
  api: null,
};
const configured = !String(firebaseConfig.apiKey || "").startsWith("PASTE");
const isMe = (name) => name && name === state.name;
const partnerName = () => state.members.find((m) => m !== state.name);

// Pick up an invite link (?family=CODE). The code stays in the URL on purpose:
// on iPhone, "Add to Home Screen" saves the current URL, so the home-screen app
// knows which board to open even though it has its own separate storage.
const urlCode = new URLSearchParams(location.search).get("family");
const demo = new URLSearchParams(location.search).has("demo") || store.get("fb.demo") === "1";
if (urlCode && urlCode !== state.code) {
  state.code = urlCode;
  store.set("fb.family", urlCode);
}

// ---------- setup ----------
function showSetup() {
  $("#setup").hidden = false;
  $("#app").hidden = true;
  if (!configured && !demo) {
    $("#setup-noconfig").hidden = false;
    $("#setup-noconfig").append(
      h("p", { class: "small muted" }, "Or ", h("a", { href: "?demo" }, "try a demo"), " that saves on this device only.")
    );
    return;
  }
  $("#setup-form").hidden = false;
  $("#setup-name").value = state.name;
  if (state.code) { $("#setup-join").hidden = false; $("#setup-choose").hidden = true; }
  $("#setup-form").onsubmit = (e) => {
    e.preventDefault();
    state.name = $("#setup-name").value.trim();
    const typed = $("#setup-code").value.trim();
    if (!state.code) state.code = typed ? extractCode(typed) : newCode();
    if (state.code.length < 20) { toast("That board code looks too short"); state.code = ""; return; }
    store.set("fb.name", state.name);
    store.set("fb.family", state.code);
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

  try {
    state.api = configured && !demo ? await firebaseBackend(state.code) : demoBackend(state.code);
  } catch (err) {
    console.error(err);
    toast("Couldn't load — check your connection");
    return;
  }
  state.api.join(state.name).catch(() => {});
  state.api.subscribeMembers((m) => { state.members = m; render(); });
  state.api.subscribeItems(
    (items) => { state.items = items; render(); },
    (ok) => { $("#sync").classList.toggle("ok", ok); $("#sync").title = ok ? "Synced" : "Offline / syncing"; }
  );
  render();
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

function render() {
  if (!state.api) return;
  const hour = new Date().getHours();
  $("#greeting").textContent = `${hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"}, ${state.name}`;
  $("#view-title").textContent = state.view === "home" ? "Our Home" : TYPES[state.view].title;
  document.querySelectorAll("#tabbar button").forEach((b) => b.classList.toggle("active", b.dataset.view === state.view));
  document.querySelectorAll("[data-badge]").forEach((b) => {
    const n = openCount(b.dataset.badge);
    b.textContent = n ? (n > 99 ? "99+" : n) : "";
  });

  // Keep the add-bar text and focus if a change syncs in while typing.
  if (state.view !== "home" && document.activeElement?.closest?.(".addbar")) return renderLists();
  $("#main").replaceChildren(state.view === "home" ? homeView() : listView(state.view));
}
// Re-render only the list part so an in-progress add-bar keeps focus.
function renderLists() {
  const holder = $("#list-holder");
  if (holder) holder.replaceChildren(...listContent(state.view));
}

function byChip(name) {
  return h("span", { class: `chip ${isMe(name) ? "me" : "partner"}` }, isMe(name) ? "You" : name || "?");
}

function itemRow(item) {
  const meta = [];
  if (item.type === "reminder" && item.due) {
    const left = item.due - Date.now();
    const cls = item.done ? "" : left < 0 ? "overdue" : left < 86400000 ? "soon" : "";
    meta.push(h("span", { class: `due ${cls}` }, "⏰ ", fmtDue(item.due)));
  }
  if (item.type === "task" && item.for) meta.push(h("span", {}, "for "), byChip(item.for));
  meta.push(h("span", {}, item.type === "task" && item.for ? "· by" : "by"), byChip(item.by), h("span", {}, "· " + ago(item.createdAt)));
  if (item.done && item.doneBy) meta.push(h("span", {}, `· ✓ ${isMe(item.doneBy) ? "you" : item.doneBy}`));

  return h("div", { class: `item${item.done ? " is-done" : ""}` },
    h("button", {
      class: `check${item.done ? " done" : ""}`,
      "aria-label": item.done ? "Mark not done" : "Mark done",
      onclick: () => toggle(item),
    }),
    h("button", { class: "item-body", onclick: () => openEdit(item) },
      h("div", { class: "item-text" }, item.text),
      h("div", { class: "meta" }, meta),
    ),
  );
}

function noteCard(item) {
  return h("button", { class: "note", onclick: () => openEdit(item) },
    h("div", { class: "item-text" }, item.text),
    h("div", { class: "meta" }, byChip(item.by), h("span", {}, ago(item.createdAt))),
  );
}

function addBar(type) {
  const form = h("form", { class: "addbar" });
  const text = type === "note"
    ? h("textarea", { name: "text", rows: 2, placeholder: TYPES[type].placeholder, maxlength: 2000 })
    : h("input", { name: "text", placeholder: TYPES[type].placeholder, autocomplete: "off", maxlength: 2000, enterkeyhint: "done" });
  form.append(text);
  let due, who;
  if (type === "reminder") {
    // Default: tomorrow 9am
    const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0);
    due = h("input", { type: "datetime-local", value: toLocalInput(d.getTime()), "aria-label": "When" });
  }
  if (type === "task") who = whoSelect("");
  form.append(h("button", { class: "btn primary add-btn", type: "submit", "aria-label": "Add" }, "+"));
  if (due || who) form.append(h("div", { class: "extra" }, due || who));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const value = text.value.trim();
    if (!value) return text.focus();
    // Groceries: "milk, eggs, bread" adds three items at once
    const texts = type === "grocery" ? value.split(/[,\n]/).map((s) => s.trim()).filter(Boolean) : [value];
    text.value = "";
    text.focus();
    for (const t of texts) {
      const item = { type, text: t, by: state.name, done: false };
      if (due) item.due = fromLocalInput(due.value);
      if (who && who.value) item.for = who.value;
      state.api.add(item).catch(() => toast("Couldn't save — will retry when online"));
    }
  });
  return form;
}

function whoSelect(current) {
  const names = [...new Set([state.name, ...state.members])];
  return h("select", { "aria-label": "For" },
    h("option", { value: "" }, "For either of us"),
    names.map((n) => h("option", { value: n, selected: n === current }, isMe(n) ? `For me (${n})` : `For ${n}`)),
  );
}

function listContent(type) {
  const items = itemsOf(type);
  if (!items.length) return [h("div", { class: "empty" }, TYPES[type].empty)];
  if (type === "note") return [h("div", { class: "notes" }, items.map(noteCard))];
  const open = items.filter((i) => !i.done), done = items.filter((i) => i.done);
  const out = [];
  if (open.length) out.push(h("div", { class: "list" }, open.map(itemRow)));
  else out.push(h("div", { class: "empty" }, "All done! 🎉"));
  if (done.length) {
    out.push(h("div", { class: "section-title" },
      h("span", {}, `Done (${done.length})`),
      h("button", { onclick: () => clearDone(type, done) }, "Clear"),
    ));
    out.push(h("div", { class: "list" }, done.slice(-30).reverse().map(itemRow)));
  }
  return out;
}

function listView(type) {
  return h("div", {}, addBar(type), h("div", { id: "list-holder" }, listContent(type)));
}

function homeView() {
  const now = Date.now();
  const reminders = itemsOf("reminder").filter((r) => !r.done && r.due && r.due - now < 3 * 86400000);
  const myTasks = itemsOf("task").filter((t) => !t.done && (!t.for || isMe(t.for)));
  const recent = [...state.items].sort((a, b) => b.createdAt - a.createdAt).slice(0, 8);
  const partner = partnerName();

  const stat = (type, label) => h("button", { class: "stat", onclick: () => go(type) }, h("b", {}, openCount(type)), h("span", {}, label));
  return h("div", {},
    h("div", { class: "stats" }, stat("task", "open tasks"), stat("reminder", "reminders"), stat("grocery", "to buy")),

    !partner && h("div", { class: "section-title" }, h("span", {}, "Invite your partner")),
    !partner && h("div", { class: "list" }, h("div", { class: "item" },
      h("div", { class: "item-body" },
        h("div", {}, "Share the board so you both see the same lists."),
        h("button", { class: "btn primary", style: "margin-top:10px", onclick: shareInvite }, "Share invite link"),
      ))),

    h("div", { class: "section-title" }, h("span", {}, "Coming up")),
    reminders.length ? h("div", { class: "list" }, reminders.map(itemRow)) : h("div", { class: "empty" }, "Nothing in the next 3 days."),

    h("div", { class: "section-title" }, h("span", {}, "Your tasks"), h("button", { onclick: () => go("task") }, "See all")),
    myTasks.length ? h("div", { class: "list" }, myTasks.slice(0, 5).map(itemRow)) : h("div", { class: "empty" }, "Nothing on your plate."),

    h("div", { class: "section-title" }, h("span", {}, "Recent activity")),
    recent.length
      ? h("div", { class: "list activity" }, recent.map((i) => h("div", { class: "item" },
          h("span", { class: `avatar${isMe(i.by) ? " me" : ""}` }, (i.by || "?")[0].toUpperCase()),
          h("button", { class: "item-body", onclick: () => openEdit(i) },
            h("div", {}, h("strong", {}, isMe(i.by) ? "You" : i.by), ` added ${i.type === "grocery" ? "to groceries" : `a ${i.type}`}`),
            h("div", { class: "meta" }, h("span", {}, `“${i.text.length > 60 ? i.text.slice(0, 60) + "…" : i.text}” · ${ago(i.createdAt)}`)),
          ))))
      : h("div", { class: "empty" }, "Add something to get started."),
  );
}

// ---------- actions ----------
function go(view) {
  state.view = view;
  store.set("fb.view", view);
  render();
  window.scrollTo(0, 0);
}
function toggle(item) {
  const done = !item.done;
  state.api.update(item.id, { done, doneBy: done ? state.name : null }).catch(() => toast("Couldn't update"));
}
function clearDone(type, done) {
  if (!confirm(`Remove ${done.length} completed ${TYPES[type].title.toLowerCase()}?`)) return;
  done.forEach((i) => state.api.remove(i.id));
}

let editing = null;
function openEdit(item) {
  editing = item;
  $("#edit-title").textContent = `Edit ${item.type === "grocery" ? "item" : item.type}`;
  $("#edit-text").value = item.text;
  $("#edit-due-wrap").hidden = item.type !== "reminder";
  $("#edit-due").value = toLocalInput(item.due);
  $("#edit-who-wrap").hidden = item.type !== "task";
  $("#edit-who").replaceChildren(...whoSelect(item.for || "").children);
  $("#edit-meta").textContent = `Added by ${isMe(item.by) ? "you" : item.by} · ${ago(item.createdAt)}`;
  $("#edit").showModal();
}
$("#edit-form").addEventListener("submit", (e) => {
  const text = $("#edit-text").value.trim();
  if (!editing || !text) return;
  const patch = { text };
  if (editing.type === "reminder") patch.due = fromLocalInput($("#edit-due").value);
  if (editing.type === "task") patch.for = $("#edit-who").value || null;
  state.api.update(editing.id, patch).catch(() => toast("Couldn't save"));
});
$("#edit-cancel").onclick = () => $("#edit").close();
$("#edit-delete").onclick = () => {
  if (!editing) return;
  state.api.remove(editing.id);
  $("#edit").close();
  toast("Deleted");
};

function inviteLink() {
  return `${location.origin}${location.pathname}?family=${encodeURIComponent(state.code)}`;
}
async function shareInvite() {
  const url = inviteLink();
  try {
    if (navigator.share) await navigator.share({ title: "Family Board", text: "Join our Family Board 💕", url });
    else { await navigator.clipboard.writeText(url); toast("Invite link copied"); }
  } catch {}
}

$("#open-settings").onclick = () => {
  $("#settings-name").value = state.name;
  $("#settings-code").textContent = state.code;
  $("#settings").showModal();
};
$("#share-invite").onclick = shareInvite;
$("#settings-save").onclick = () => {
  const name = $("#settings-name").value.trim();
  if (name && name !== state.name) {
    state.name = name;
    store.set("fb.name", name);
    state.api.join(name).catch(() => {});
    render();
  }
};
$("#leave-board").onclick = () => {
  if (!confirm("Leave this board on this phone? The lists stay saved for your partner.")) return;
  store.del("fb.family"); store.del("fb.demo");
  location.href = location.pathname;
};
document.querySelectorAll("#tabbar button").forEach((b) => (b.onclick = () => go(b.dataset.view)));
// Refresh relative times ("5m ago", overdue colors) every minute
setInterval(render, 60000);

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

if (state.name && state.code) start();
else showSetup();
