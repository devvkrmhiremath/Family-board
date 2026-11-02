// Demo boards that live only on this device (used before Firebase is set up,
// and by the performance test). Same API as data/firebase.js.
import { DAY } from "../core/time.js";
import { randomId } from "../core/ids.js";
import { oftenKey } from "../core/groceries.js";
import { store } from "../core/store.js";
import { INVITE_DAYS, DONE_WINDOW } from "./service.js";

const EMPTY_BOARD = () => ({ items: [], members: {}, invites: {}, photos: {}, often: {}, name: "", ownerId: null, keepDays: 30 });

export function demoService() {
  let uid = store.get("fb.demo.uid");
  if (!uid) { uid = `demo-${randomId(12)}`; store.set("fb.demo.uid", uid); }
  const key = (code) => `fb.demo.${code}`;
  const load = (code) => {
    const d = store.getJSON(key(code), null);
    if (!d) return null;
    // Older demo boards stored member names in an array
    if (Array.isArray(d.members)) d.members = Object.fromEntries(d.members.map((n, i) => [i === 0 ? uid : `demo-old-${i}`, n]));
    return { ...EMPTY_BOARD(), ...d };
  };
  const listeners = new Map(); // code -> Set(fn)
  const save = (code, d) => {
    store.setJSON(key(code), d);
    listeners.get(code)?.forEach((fn) => fn(d));
  };
  const watch = (code, fn) => {
    if (!listeners.has(code)) listeners.set(code, new Set());
    listeners.get(code).add(fn);
    const d = load(code);
    if (d) fn(d);
    return () => listeners.get(code)?.delete(fn);
  };
  const edit = (code, change) => { const d = load(code); if (!d) return; change(d); save(code, d); };
  // Members, photos and invites are keyed by ids we created; Maps keep lookups safe
  const asMap = (obj) => new Map(Object.entries(obj));

  const service = {
    uid,
    demo: true,
    async createBoard(code, name, userName) {
      save(code, { ...EMPTY_BOARD(), name, ownerId: uid, members: { [uid]: userName } });
    },
    async ensureMember(code, { userName }) {
      const d = load(code);
      if (!d) { await service.createBoard(code, "Our Home", userName); return "joined"; }
      const members = asMap(d.members);
      if (members.has(uid)) return "member";
      members.set(uid, userName);
      d.members = Object.fromEntries(members);
      if (!d.ownerId) d.ownerId = uid;
      save(code, d);
      return "joined";
    },
    board(code) {
      const setMember = (id, name) => edit(code, (d) => {
        const m = asMap(d.members);
        if (name == null) m.delete(id); else m.set(id, name);
        d.members = Object.fromEntries(m);
      });
      const setPhoto = (id, data) => edit(code, (d) => {
        const p = asMap(d.photos);
        if (data == null) p.delete(id); else p.set(id, data);
        d.photos = Object.fromEntries(p);
      });
      return {
        subscribeBoard: (cb) => watch(code, (d) => cb({ name: d.name, ownerId: d.ownerId, legacyUntil: 0, keepDays: d.keepDays })),
        subscribeMembers: (cb) => watch(code, (d) => cb([...asMap(d.members)].map(([id, name]) => ({ uid: id, name, joinedAt: 0 })))),
        subscribeItems(cb, onStatus) {
          onStatus(true);
          return watch(code, (d) => {
            const done = d.items.filter((i) => i.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)).slice(0, DONE_WINDOW);
            cb(structuredClone([...d.items.filter((i) => !i.done), ...done]));
          });
        },
        subscribeOften: (cb) => watch(code, (d) => cb({ ...d.often })),
        add(item) {
          const id = randomId(20);
          edit(code, (d) => d.items.push({ ...item, id, by: uid, createdAt: Date.now() }));
          return { id, saved: Promise.resolve() };
        },
        async update(id, patch) { edit(code, (d) => Object.assign(d.items.find((i) => i.id === id) ?? {}, patch)); },
        async remove(item) {
          edit(code, (d) => { d.items = d.items.filter((i) => i.id !== item.id); });
          setPhoto(item.id, null);
        },
        async rename(name) { edit(code, (d) => { d.name = name; }); },
        async setKeepDays(n) { edit(code, (d) => { d.keepDays = n; }); },
        async setMyName(name) { setMember(uid, name); },
        async leave() { setMember(uid, null); },
        async removeMember(id) { setMember(id, null); },
        async createInvite() {
          const token = randomId(24);
          edit(code, (d) => { d.invites = { ...d.invites, [token]: Date.now() + INVITE_DAYS * DAY }; });
          return token;
        },
        async cancelInvites() {
          let n = 0;
          edit(code, (d) => { n = Object.keys(d.invites).length; d.invites = {}; });
          return n;
        },
        async savePhoto(id, data) { setPhoto(id, data); },
        async loadPhoto(id) { return asMap(load(code)?.photos ?? {}).get(id) ?? null; },
        async deletePhoto(id) { setPhoto(id, null); },
        bumpOften(texts) {
          edit(code, (d) => {
            const counts = asMap(d.often);
            for (const t of texts) { const k = oftenKey(t); if (k) counts.set(k, (counts.get(k) || 0) + 1); }
            d.often = Object.fromEntries(counts);
          });
        },
        async cleanup(keepDays) {
          if (!keepDays) return 0;
          let n = 0;
          edit(code, (d) => {
            const cut = Date.now() - keepDays * DAY;
            const keep = d.items.filter((i) => !(i.done && i.doneAt && i.doneAt < cut));
            n = d.items.length - keep.length;
            d.items = keep;
          });
          return n;
        },
        async exportAll() { return structuredClone(load(code)?.items || []); },
      };
    },
  };
  return service;
}
