import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, setDoc, getDoc, getDocs, collection, updateDoc, deleteDoc, writeBatch, Timestamp, serverTimestamp, query, where, orderBy, limit, increment } from 'firebase/firestore';

const env = await initializeTestEnvironment({ projectId: 'fb-rules-test', firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8181 } });
const B = 'board-aaaa-bbbb-cccc-dddd', LEG = 'legacy-aaaa-bbbb-cccc-dd';
const db = (uid) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore();
const later = (d) => Timestamp.fromMillis(Date.now() + d * 864e5);
let pass = 0, fail = 0;
async function t(name, p) { try { await p; pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '-', e.message.split('\n')[0]); } }
const item = (by, extra = {}) => ({ type: 'task', text: 'Buy milk', by, done: false, createdAt: serverTimestamp(), ...extra });

// Owner creates a board and themselves as member, in one batch
const own = db('owner');
const batch = writeBatch(own);
batch.set(doc(own, 'families', B), { name: 'Our Home', ownerId: 'owner', createdAt: serverTimestamp(), schema: 2 });
batch.set(doc(own, 'families', B, 'members', 'owner'), { name: 'Vikram', joinedAt: serverTimestamp() });
await t('owner creates board + membership', assertSucceeds(batch.commit()));
await t('cannot create a board owned by someone else', assertFails(setDoc(doc(db('mallory'), 'families', 'other-aaaa-bbbb-cccc-dd'), { name: 'x', ownerId: 'owner' })));
await t('cannot create a board with a short guessable id', assertFails(setDoc(doc(db('mallory'), 'families', 'short'), { name: 'x', ownerId: 'mallory' })));

console.log('-- strangers');
await t('signed-out user cannot read board', assertFails(getDoc(doc(db(null), 'families', B))));
await t('stranger cannot read board', assertFails(getDoc(doc(db('mallory'), 'families', B))));
await t('stranger cannot list items', assertFails(getDocs(collection(db('mallory'), 'families', B, 'items'))));
await t('stranger cannot list members', assertFails(getDocs(collection(db('mallory'), 'families', B, 'members'))));
await t('stranger cannot add an item', assertFails(setDoc(doc(db('mallory'), 'families', B, 'items', 'x'), item('mallory'))));
await t('stranger cannot join without an invite', assertFails(setDoc(doc(db('mallory'), 'families', B, 'members', 'mallory'), { name: 'M' })));
await t('stranger cannot join with a made-up invite', assertFails(setDoc(doc(db('mallory'), 'families', B, 'members', 'mallory'), { name: 'M', invite: 'fake-token-123456789' })));
await t('stranger cannot create an invite', assertFails(setDoc(doc(db('mallory'), 'families', B, 'invites', 'tok-mallory-1234567'), { by: 'mallory', expiresAt: later(7) })));

console.log('-- invites');
const TOK = 'tok-aaaa-bbbb-cccc-dddd';
await t('member creates a 7-day invite', assertSucceeds(setDoc(doc(own, 'families', B, 'invites', TOK), { by: 'owner', createdAt: serverTimestamp(), expiresAt: later(7) })));
await t('invite cannot last 30 days', assertFails(setDoc(doc(own, 'families', B, 'invites', 'tok-long-aaaa-bbbb-cc'), { by: 'owner', expiresAt: later(30) })));
await t('friend joins with valid invite', assertSucceeds(setDoc(doc(db('priya'), 'families', B, 'members', 'priya'), { name: 'Priya', invite: TOK, joinedAt: serverTimestamp() })));
await t('cannot add someone else as member', assertFails(setDoc(doc(db('priya'), 'families', B, 'members', 'other'), { name: 'X', invite: TOK })));
await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), 'families', B, 'invites', 'tok-expired-aaaa-bbbb'), { by: 'owner', expiresAt: later(-1) }));
await t('expired invite is refused', assertFails(setDoc(doc(db('late'), 'families', B, 'members', 'late'), { name: 'Late', invite: 'tok-expired-aaaa-bbbb' })));
await t('member can cancel invites', assertSucceeds(deleteDoc(doc(db('priya'), 'families', B, 'invites', TOK))));
await t('cancelled invite no longer works', assertFails(setDoc(doc(db('late2'), 'families', B, 'members', 'late2'), { name: 'L', invite: TOK })));

console.log('-- items');
const pr = db('priya');
await t('member reads board', assertSucceeds(getDoc(doc(pr, 'families', B))));
await t('member adds an item as themselves', assertSucceeds(setDoc(doc(pr, 'families', B, 'items', 'i1'), item('priya', { repeat: 'weekly', due: Date.now(), order: 1 }))));
await t('cannot add an item pretending to be someone else', assertFails(setDoc(doc(pr, 'families', B, 'items', 'i2'), item('owner'))));
await t('text over 2000 characters refused', assertFails(setDoc(doc(pr, 'families', B, 'items', 'i3'), item('priya', { text: 'x'.repeat(2001) }))));
await t('unknown fields refused', assertFails(setDoc(doc(pr, 'families', B, 'items', 'i4'), item('priya', { evil: true }))));
await t('bad repeat value refused', assertFails(setDoc(doc(pr, 'families', B, 'items', 'i5'), item('priya', { repeat: 'hourly' }))));
await t('quantity must be a sensible number', assertFails(setDoc(doc(pr, 'families', B, 'items', 'i6'), item('priya', { type: 'grocery', qty: 5000 }))));
await t('grocery with quantity 2 is fine', assertSucceeds(setDoc(doc(pr, 'families', B, 'items', 'i7'), item('priya', { type: 'grocery', qty: 2 }))));
await t('member runs the open-items query', assertSucceeds(getDocs(query(collection(pr, 'families', B, 'items'), where('done', '==', false)))));
await t('member runs the recent-done query', assertSucceeds(getDocs(query(collection(pr, 'families', B, 'items'), orderBy('doneAt', 'desc'), limit(60)))));
await t('stranger cannot run the open-items query', assertFails(getDocs(query(collection(db('mallory'), 'families', B, 'items'), where('done', '==', false)))));
await t('other member can tick it off', assertSucceeds(updateDoc(doc(own, 'families', B, 'items', 'i1'), { done: true, doneBy: 'owner', doneAt: Date.now() })));
await t('cannot change who added an item', assertFails(updateDoc(doc(own, 'families', B, 'items', 'i1'), { by: 'owner' })));
await t('member can delete', assertSucceeds(deleteDoc(doc(own, 'families', B, 'items', 'i7'))));

console.log('-- photos & meta');
const JPEG = 'data:image/jpeg;base64,';
await t('member stores a photo', assertSucceeds(setDoc(doc(pr, 'families', B, 'photos', 'i1'), { data: JPEG + 'A'.repeat(100000), by: 'priya' })));
await t('photo over ~900 KB refused', assertFails(setDoc(doc(pr, 'families', B, 'photos', 'i2'), { data: JPEG + 'A'.repeat(950000), by: 'priya' })));
await t('photo that is a link to another site refused', assertFails(setDoc(doc(pr, 'families', B, 'photos', 'i3'), { data: 'https://evil.example/track.png', by: 'priya' })));
await t('photo with HTML/SVG data refused', assertFails(setDoc(doc(pr, 'families', B, 'photos', 'i4'), { data: 'data:image/svg+xml;base64,PHN2Zz4=', by: 'priya' })));
await t('thumbnail must be JPEG data too', assertFails(setDoc(doc(pr, 'families', B, 'items', 'i8'), item('priya', { type: 'note', thumb: 'https://evil.example/t.png', hasPhoto: true }))));
await t('valid JPEG thumbnail accepted', assertSucceeds(setDoc(doc(pr, 'families', B, 'items', 'i9'), item('priya', { type: 'note', thumb: `${JPEG  }AAAA`, hasPhoto: true }))));
await t('due date must be a number', assertFails(setDoc(doc(pr, 'families', B, 'items', 'i10'), item('priya', { due: 'tomorrow' }))));
await t('order must be a number', assertFails(setDoc(doc(pr, 'families', B, 'items', 'i11'), item('priya', { order: { evil: 1 } }))));
await t('stranger cannot read photos', assertFails(getDoc(doc(db('mallory'), 'families', B, 'photos', 'i1'))));
await t('member updates often-bought counts', assertSucceeds(setDoc(doc(pr, 'families', B, 'meta', 'groceries'), { counts: { milk: 3 } })));
await t('often-bought increments merge', assertSucceeds(setDoc(doc(pr, 'families', B, 'meta', 'groceries'), { counts: { 'green chillies': increment(1) } }, { merge: true })));
await t('other meta docs refused', assertFails(setDoc(doc(pr, 'families', B, 'meta', 'evil'), { counts: {} })));

console.log('-- people');
await t('member renames the board', assertSucceeds(updateDoc(doc(pr, 'families', B), { name: 'Home Sweet Home' })));
await t('member sets keep-ticked-items to 30 days', assertSucceeds(updateDoc(doc(pr, 'families', B), { keepDays: 30 })));
await t('keep-days must be one of 0/7/30/90', assertFails(updateDoc(doc(pr, 'families', B), { keepDays: 12345 })));
await t('cannot add random fields to the board', assertFails(updateDoc(doc(pr, 'families', B), { evil: 1 })));
await t('member cannot take over ownership', assertFails(updateDoc(doc(pr, 'families', B), { ownerId: 'priya' })));
await t('member changes own name', assertSucceeds(updateDoc(doc(pr, 'families', B, 'members', 'priya'), { name: 'Priya H' })));
await t("member cannot change someone else's name", assertFails(updateDoc(doc(pr, 'families', B, 'members', 'owner'), { name: 'Hacked' })));
await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), 'families', B, 'members', 'friend'), { name: 'Friend' }));
await t('non-owner cannot remove others', assertFails(deleteDoc(doc(pr, 'families', B, 'members', 'friend'))));
await t('owner removes a member', assertSucceeds(deleteDoc(doc(own, 'families', B, 'members', 'friend'))));
await t('removed member loses access', assertFails(getDocs(collection(db('friend'), 'families', B, 'items'))));
await t('member can leave', assertSucceeds(deleteDoc(doc(pr, 'families', B, 'members', 'priya'))));
await t('after leaving, no access', assertFails(getDoc(doc(pr, 'families', B))));

console.log('-- boards from older versions');
await env.withSecurityRulesDisabled(async (c) => {
  const f = c.firestore();
  await setDoc(doc(f, 'families', LEG), { members: ['Vikram', 'Priya'] });
  await setDoc(doc(f, 'families', LEG, 'items', 'old'), { type: 'grocery', text: 'Milk', by: 'Vikram', done: false, createdAt: Timestamp.now() });
});
const v = db('vikram-new');
await t('old-link holder joins an un-upgraded board', assertSucceeds(setDoc(doc(v, 'families', LEG, 'members', 'vikram-new'), { name: 'Vikram', joinedAt: serverTimestamp() })));
await t('…and claims it with a 14-day window', assertSucceeds(updateDoc(doc(v, 'families', LEG), { ownerId: 'vikram-new', legacyUntil: later(14), schema: 2, name: 'Our Home' })));
await t('window cannot be longer than 15 days', assertFails(updateDoc(doc(db('vikram-new'), 'families', LEG), { legacyUntil: later(60) })));
await t('can still edit old items (by stays a name)', assertSucceeds(updateDoc(doc(v, 'families', LEG, 'items', 'old'), { done: true, doneBy: 'vikram-new', doneAt: Date.now() })));
await t('partner with old link joins inside the window', assertSucceeds(setDoc(doc(db('priya-new'), 'families', LEG, 'members', 'priya-new'), { name: 'Priya' })));
await env.withSecurityRulesDisabled(async (c) => updateDoc(doc(c.firestore(), 'families', LEG), { legacyUntil: later(-1) }));
await t('after the window, old link no longer lets anyone in', assertFails(setDoc(doc(db('stranger'), 'families', LEG, 'members', 'stranger'), { name: 'S' })));

console.log(`\n${pass} passed, ${fail} failed`);
await env.cleanup();
process.exit(fail ? 1 : 0);
