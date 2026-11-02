// Load test: 100 people on 30 boards, everyone writing at once, all through the security rules.
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, setDoc, getDocs, collection, updateDoc, writeBatch, serverTimestamp, Timestamp, query, where } from 'firebase/firestore';

const env = await initializeTestEnvironment({ projectId: 'fb-load-test', firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8181 } });
const BOARDS = 30, USERS = 100, ITEMS_EACH = 10;
const boardId = (b) => `load-${String(b).padStart(3, '0')}-aaaa-bbbb-cccc`;
const users = Array.from({ length: USERS }, (_, i) => ({ uid: `user-${i}`, board: i % BOARDS }));
const t0 = Date.now();

// The first person on each board creates it; everyone else joins with an invite
await Promise.all(Array.from({ length: BOARDS }, async (_, b) => {
  const owner = users.find((u) => u.board === b);
  const db = env.authenticatedContext(owner.uid).firestore();
  const batch = writeBatch(db);
  batch.set(doc(db, 'families', boardId(b)), { name: `Board ${b}`, ownerId: owner.uid, createdAt: serverTimestamp(), schema: 2 });
  batch.set(doc(db, 'families', boardId(b), 'members', owner.uid), { name: owner.uid, joinedAt: serverTimestamp() });
  await batch.commit();
  await setDoc(doc(db, 'families', boardId(b), 'invites', `invite-token-${b}-xxxxxxxx`), { by: owner.uid, expiresAt: Timestamp.fromMillis(Date.now() + 6 * 864e5) });
}));
await Promise.all(users.filter((u, i) => i >= BOARDS).map((u) =>
  setDoc(doc(env.authenticatedContext(u.uid).firestore(), 'families', boardId(u.board), 'members', u.uid), { name: u.uid, invite: `invite-token-${u.board}-xxxxxxxx` })));
const tJoin = Date.now();

// Everyone adds 10 items and ticks half of them, all at the same time
let writes = 0, denied = 0;
await Promise.all(users.map(async (u) => {
  const db = env.authenticatedContext(u.uid).firestore();
  for (let k = 0; k < ITEMS_EACH; k++) {
    const id = `${u.uid}-item-${k}`;
    const ref = doc(db, 'families', boardId(u.board), 'items', id);
    try {
      await setDoc(ref, { type: k % 2 ? 'grocery' : 'task', text: `Item ${k} from ${u.uid}`, by: u.uid, done: false, createdAt: serverTimestamp(), order: Date.now() + k });
      writes++;
      if (k % 2 === 0) { await updateDoc(ref, { done: true, doneBy: u.uid, doneAt: Date.now() }); writes++; }
    } catch { denied++; }
  }
}));
const tWrite = Date.now();

// Every person reads their board's open list; nobody can read another board
let reads = 0, leaks = 0, wrong = 0;
await Promise.all(users.map(async (u) => {
  const db = env.authenticatedContext(u.uid).firestore();
  const open = await getDocs(query(collection(db, 'families', boardId(u.board), 'items'), where('done', '==', false)));
  reads += open.size;
  const expected = users.filter((x) => x.board === u.board).length * ITEMS_EACH / 2;
  if (open.size !== expected) wrong++;
  try { await getDocs(collection(db, 'families', boardId((u.board + 1) % BOARDS), 'items')); leaks++; } catch { /* refused, as it should be */ }
}));
const tRead = Date.now();
console.log(`${USERS} people, ${BOARDS} boards`);
console.log(`joined: ${tJoin - t0} ms | ${writes} writes in ${tWrite - tJoin} ms (${Math.round(writes / ((tWrite - tJoin) / 1000))}/s) | denied: ${denied}`);
console.log(`reads: ${reads} docs in ${tRead - tWrite} ms | wrong counts: ${wrong} | cross-board leaks: ${leaks}`);
await env.cleanup();
process.exit(denied || wrong || leaks ? 1 : 0);
