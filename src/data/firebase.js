// Firebase-backed boards. The SDK is a pinned copy served from this site
// (vendor/firebase), so no code is loaded from anywhere else at runtime.
import { DAY } from "../core/time.js";
import { randomId } from "../core/ids.js";
import { oftenKey } from "../core/groceries.js";
import { SetupError, INVITE_DAYS, LEGACY_DAYS, DONE_WINDOW, OFTEN_MAX } from "./service.js";

// Fixed paths only: nothing outside this list can ever be loaded as code
const SDK = new Map([
  ["app", () => import("../../vendor/firebase/13.1.0/firebase-app.js")],
  ["firestore", () => import("../../vendor/firebase/13.1.0/firebase-firestore.js")],
  ["auth", () => import("../../vendor/firebase/13.1.0/firebase-auth.js")],
  ["app-check", () => import("../../vendor/firebase/13.1.0/firebase-app-check.js")],
]);
const sdk = (name) => SDK.get(name)();

const toMs = (v) => (v == null ? null : typeof v === "number" ? v : v.toMillis ? v.toMillis() : null);
const denied = (e) => e?.code === "permission-denied";

async function connect(config) {
  const [{ initializeApp }, fs, au] = await Promise.all([sdk("app"), sdk("firestore"), sdk("auth")]);
  const app = initializeApp(config);
  // Optional: App Check proves requests come from this app (see README)
  if (config.appCheckSiteKey) {
    const ac = await sdk("app-check");
    ac.initializeAppCheck(app, {
      provider: new ac.ReCaptchaV3Provider(config.appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  }
  let db;
  try {
    db = fs.initializeFirestore(app, {
      localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
    });
  } catch {
    db = fs.getFirestore(app); // persistence unavailable (e.g. private browsing)
  }
  // initializeAuth instead of getAuth: no pop-up/redirect support (only needed for
  // "Sign in with Google"), so no Google iframe or script is ever loaded
  const auth = au.initializeAuth(app, {
    persistence: [au.indexedDBLocalPersistence, au.browserLocalPersistence, au.inMemoryPersistence],
  });
  // Automated tests point the app at local Firebase emulators; real configs never set this
  if (config.emulator) {
    const { host, firestore, auth: authPort } = config.emulator;
    fs.connectFirestoreEmulator(db, host, firestore);
    au.connectAuthEmulator(auth, `http://${host}:${authPort}`, { disableWarnings: true });
  }
  // Each device gets a private, invisible account the first time it opens the app
  let user = await new Promise((resolve) => {
    const off = au.onAuthStateChanged(auth, (u) => { off(); resolve(u); });
  });
  if (!user) {
    try {
      user = (await au.signInAnonymously(auth)).user;
    } catch (e) {
      if (/admin-restricted|operation-not-allowed/.test(e.code || "")) throw new SetupError("auth-disabled");
      throw e;
    }
  }
  return { fs, db, uid: user.uid };
}

export async function firebaseService(config) {
  const { fs, db, uid } = await connect(config);
  const boardRef = (code) => fs.doc(db, "families", code);

  // A board made by an older version: claim it, keep the old link working for
  // LEGACY_DAYS, and give old ticked items a finish time so they can be tidied.
  async function upgradeLegacy(code) {
    const snap = await fs.getDoc(boardRef(code));
    const d = snap.data() || {};
    if (d.ownerId) return;
    const done = await fs.getDocs(fs.query(fs.collection(boardRef(code), "items"), fs.where("done", "==", true)));
    const batch = fs.writeBatch(db);
    done.docs.slice(0, 450).forEach((x) => {
      if (x.data().doneAt == null) batch.update(x.ref, { doneAt: toMs(x.data().createdAt) ?? Date.now() });
    });
    batch.update(boardRef(code), {
      ownerId: uid, schema: 2, name: d.name || "Our Home",
      legacyUntil: fs.Timestamp.fromMillis(Date.now() + LEGACY_DAYS * DAY),
    });
    await batch.commit();
  }

  return {
    uid,
    demo: false,

    async createBoard(code, name, userName) {
      const batch = fs.writeBatch(db);
      batch.set(boardRef(code), { name, ownerId: uid, createdAt: fs.serverTimestamp(), schema: 2 });
      batch.set(fs.doc(boardRef(code), "members", uid), { name: userName, joinedAt: fs.serverTimestamp() });
      await batch.commit();
    },

    // Make sure this device is a member. Joins with an invite token, or with an
    // old-style link while the board's grace period lasts.
    async ensureMember(code, { invite, userName }) {
      const me = fs.doc(boardRef(code), "members", uid);
      try {
        if ((await fs.getDoc(me)).exists()) return "member";
      } catch (e) {
        if (!denied(e)) return "offline"; // can't check right now; the cache keeps working
      }
      const data = { name: userName, joinedAt: fs.serverTimestamp() };
      if (invite) data.invite = invite;
      try {
        await fs.setDoc(me, data);
      } catch (e) {
        if (denied(e)) throw new SetupError(invite ? "invite-invalid" : "locked");
        throw e;
      }
      if (!invite) await upgradeLegacy(code).catch(() => { /* someone else already upgraded it */ });
      return "joined";
    },

    board(code) {
      const ref = boardRef(code);
      const items = fs.collection(ref, "items");
      const photo = (id) => fs.doc(ref, "photos", id);
      const often = fs.doc(ref, "meta", "groceries");
      const toItem = (d) => {
        const x = d.data({ serverTimestamps: "estimate" });
        return { ...x, id: d.id, createdAt: toMs(x.createdAt) ?? Date.now(), doneAt: toMs(x.doneAt) };
      };
      const api = {
        subscribeBoard(cb, onDenied) {
          return fs.onSnapshot(ref, (s) => {
            const d = s.data() || {};
            cb({ name: d.name || "", ownerId: d.ownerId || null, legacyUntil: toMs(d.legacyUntil) || 0, keepDays: d.keepDays ?? 30 });
          }, (e) => { if (denied(e)) onDenied(); });
        },
        subscribeMembers(cb, onDenied) {
          return fs.onSnapshot(fs.collection(ref, "members"), (s) => {
            cb(s.docs.map((x) => ({ uid: x.id, name: x.data().name || "Someone", joinedAt: toMs(x.data().joinedAt) || 0 })));
          }, (e) => { if (denied(e)) onDenied(); });
        },
        // Two light queries instead of the whole history: everything still to do,
        // plus the most recently ticked items.
        subscribeItems(cb, onStatus, onDenied) {
          const open = new Map();
          const done = new Map();
          const seen = new Set();
          const emit = () => {
            const merged = new Map(done);
            for (const [id, x] of open) merged.set(id, x); // "open" wins if both briefly hold an item
            cb([...merged.values()]);
          };
          const listen = (q, map, key) => fs.onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
            onStatus(!snap.metadata.fromCache);
            if (seen.has(key) && snap.docChanges().length === 0) return; // metadata only
            seen.add(key);
            map.clear();
            snap.docs.forEach((d) => { const x = toItem(d); if (key === "open" || x.done) map.set(d.id, x); });
            if (seen.has("open")) emit();
          }, (e) => { onStatus(false); if (denied(e)) onDenied(); });
          const a = listen(fs.query(items, fs.where("done", "==", false)), open, "open");
          const b = listen(fs.query(items, fs.orderBy("doneAt", "desc"), fs.limit(DONE_WINDOW)), done, "done");
          return () => { a(); b(); };
        },
        subscribeOften(cb) {
          return fs.onSnapshot(often, (s) => cb(s.data()?.counts || {}), () => { /* optional extra */ });
        },
        add(item) {
          const r = fs.doc(items);
          const saved = fs.setDoc(r, { ...item, by: uid, createdAt: fs.serverTimestamp() });
          return { id: r.id, saved };
        },
        update: (id, patch) => fs.updateDoc(fs.doc(items, id), patch),
        async remove(item) {
          await fs.deleteDoc(fs.doc(items, item.id));
          if (item.hasPhoto) await fs.deleteDoc(photo(item.id)).catch(() => { /* already gone */ });
        },
        rename: (name) => fs.updateDoc(ref, { name }),
        setKeepDays: (keepDays) => fs.updateDoc(ref, { keepDays }),
        setMyName: (name) => fs.updateDoc(fs.doc(ref, "members", uid), { name }),
        leave: () => fs.deleteDoc(fs.doc(ref, "members", uid)),
        removeMember: (memberUid) => fs.deleteDoc(fs.doc(ref, "members", memberUid)),
        async createInvite() {
          const token = randomId(24);
          await fs.setDoc(fs.doc(ref, "invites", token), {
            by: uid, createdAt: fs.serverTimestamp(),
            expiresAt: fs.Timestamp.fromMillis(Date.now() + INVITE_DAYS * DAY),
          });
          return token;
        },
        async cancelInvites() {
          const all = await fs.getDocs(fs.collection(ref, "invites"));
          await Promise.all(all.docs.map((d) => fs.deleteDoc(d.ref)));
          return all.size;
        },
        savePhoto: (id, data) => fs.setDoc(photo(id), { data, by: uid }),
        async loadPhoto(id) { return (await fs.getDoc(photo(id))).data()?.data || null; },
        deletePhoto: (id) => fs.deleteDoc(photo(id)),
        bumpOften(texts, current) {
          const known = new Set(Object.keys(current));
          const counts = new Map();
          for (const t of texts) {
            const key = oftenKey(t);
            if (!key || (!known.has(key) && known.size >= OFTEN_MAX)) continue;
            counts.set(key, fs.increment(1));
          }
          if (counts.size) fs.setDoc(often, { counts: Object.fromEntries(counts) }, { merge: true }).catch(() => { /* best effort */ });
        },
        // Remove ticked items older than the board's limit (a few at a time)
        async cleanup(keepDays) {
          if (!keepDays) return 0;
          const old = await fs.getDocs(fs.query(items, fs.where("doneAt", "<", Date.now() - keepDays * DAY), fs.limit(200)));
          await Promise.all(old.docs.map((d) => api.remove({ id: d.id, hasPhoto: d.data().hasPhoto })));
          return old.size;
        },
        async exportAll() {
          const all = await fs.getDocs(items);
          return all.docs.map(toItem);
        },
      };
      return api;
    },
  };
}
