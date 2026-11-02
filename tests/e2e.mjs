// End-to-end: the real app in several browsers against the Firestore + Auth emulators.
// Serve the app first (from the repo root): python3 -m http.server 8765
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, Timestamp } from 'firebase/firestore';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const APP = 'http://localhost:8765/';
const CONFIG = `export const firebaseConfig = { apiKey: "test-key", authDomain: "localhost", projectId: "fb-rules-test", appId: "1:1:web:1", emulator: { host: "127.0.0.1", firestore: 8181, auth: 9099 } };`;
const env = await initializeTestEnvironment({ projectId: 'fb-rules-test', firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8181 } });
// The test rewrites the page (see phone()), which Chromium treats as a public origin;
// let it reach the emulators on 127.0.0.1
const browser = await chromium.launch({ args: ['--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights'] });
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ` — ${  extra}` : ''}`); };

async function phone(label, device = devices['Pixel 7'], storage) {
  const ctx = await browser.newContext({ ...device, serviceWorkers: 'block' });
  await ctx.route('**/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: CONFIG }));
  // The page's Content Security Policy only allows Firebase's real servers; let it
  // reach the local emulators too (tests only)
  await ctx.route((url) => url.origin === new URL(APP).origin && (url.pathname === '/' || url.pathname.endsWith('/index.html')), async (r) => {
    const res = await r.fetch();
    const body = (await res.text())
      .replace("connect-src 'self'", "connect-src 'self' http://127.0.0.1:8181 http://127.0.0.1:9099 ws://127.0.0.1:8181")
      .replace('; upgrade-insecure-requests', '');
    await r.fulfill({ response: res, body });
  });
  await ctx.addInitScript((seed) => {
    Object.defineProperty(navigator, 'share', { value: async (d) => { window.__shared = d; }, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: () => false, configurable: true });
    if (seed && !sessionStorage.__seeded) { for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v); sessionStorage.__seeded = 1; }
  }, storage);
  const p = await ctx.newPage();
  p.errors = [];
  p.on('pageerror', (e) => p.errors.push(e.message));
  // Anything the Content Security Policy blocks counts as a failure
  p.on('console', (m) => { if (m.type() === 'error' && /Content Security Policy/.test(m.text())) p.errors.push(m.text()); });
  p.label = label;
  return p;
}
const text = (p, sel) => p.textContent(sel).catch(() => '');
// eslint-disable-next-line security/detect-non-literal-regexp -- patterns come from this test file
const waitText = async (p, sel, re, ms = 8000) => { try { await p.waitForFunction(([s, r]) => new RegExp(r).test(document.querySelector(s)?.textContent || ''), [sel, re.source], { timeout: ms }); return true; } catch { return false; } };
const setup = async (p, name, link) => { await p.goto(link || APP); await p.fill('#setup-name', name); await p.click('#setup-submit'); await p.waitForSelector('.stats', { timeout: 15000 }); };
const addOnTab = async (p, view, value) => { await p.click(`#tabbar [data-view=${view}]`); await p.waitForTimeout(400); await p.fill('.composer input, .composer textarea', value); await p.click('.composer .add-btn'); await p.waitForTimeout(500); };
const inviteLink = async (p) => { await p.click('#open-settings'); await p.waitForTimeout(400); await p.click('#share-invite'); await p.waitForFunction(() => window.__shared, null, { timeout: 8000 }); const u = await p.evaluate(() => window.__shared.url); await p.evaluate(() => { window.__shared = null; }); await p.click('#settings [data-close]'); await p.waitForTimeout(300); return u; };

console.log('-- create & invite');
const V = await phone('Vikram');
await setup(V, 'Vikram');
ok('Vikram creates a board', (await text(V, '#view-title')) === 'Our Home');
await addOnTab(V, 'grocery', '2 milk, eggs, Coriander');
ok('"2 milk" becomes Milk ×2', await waitText(V, '#content', /×2\s*Milk/));
const link = await inviteLink(V);
ok('invite link has board + token', /\?join=.+&t=[a-z0-9]{24}/.test(link), link.replace(APP, ''));

console.log('-- joining');
const P = await phone('Priya');
await P.goto(link);
ok('invited person sees "You\'re invited"', /invited/i.test(await text(P, '#setup-title')));
await P.fill('#setup-name', 'Priya'); await P.click('#setup-submit'); await P.waitForSelector('.stats', { timeout: 15000 });
ok('Priya joins and sees the board', (await text(P, '#view-title')) === 'Our Home');
await P.click('#tabbar [data-view=grocery]');
ok('Priya sees Vikram\'s groceries live', await waitText(P, '#content', /Milk/));
ok('address bar no longer shows the token', !(await P.evaluate(() => location.search)).includes('t='));

console.log('-- live updates & people');
await P.click('#tabbar [data-view=task]'); await P.waitForTimeout(400);
await P.fill('.composer input', 'Renew passport');
await P.click('.composer-extra .segmented button:has-text("Vikram")'); await P.waitForTimeout(250);
await P.click('.composer .add-btn');
await V.click('#tabbar [data-view=home]');
ok('task Priya assigned shows in Vikram\'s "Your tasks"', await waitText(V, '#content', /Renew passport/));
ok('Vikram is told Priya added it', await waitText(V, '#toast', /Priya added/));
await V.click('#open-settings'); await V.waitForTimeout(500);
const members = await V.$$eval('#settings-members .member-row', (r) => r.map((x) => x.textContent));
ok('people list shows both, owner marked', members.length === 2 && members.some((m) => /Vikram.*you.*Owner/.test(m)) && members.some((m) => /Priya.*Remove/.test(m)), JSON.stringify(members));
await V.click('#settings [data-close]'); await V.waitForTimeout(300);

console.log('-- strangers & expired links');
const code = new URL(link).searchParams.get('join');
const M = await phone('Mallory');
await M.goto(`${APP}?join=${code}`); await M.fill('#setup-name', 'Mallory'); await M.click('#setup-submit');
ok('board id without a token is refused', await waitText(M, '#content', /need a new invite/i));
ok('stranger sees none of the lists', !(await text(M, '#content')).includes('Milk'));
await V.click('#open-settings'); await V.waitForTimeout(400); await V.click('#cancel-invites'); await V.click('#confirm-yes');
ok('owner stops unused invite links', await waitText(V, '#toast', /Stopped 1 invite link/));
await V.click('#settings [data-close]'); await V.waitForTimeout(300);
const L = await phone('Late');
await L.goto(link); await L.fill('#setup-name', 'Late'); await L.click('#setup-submit');
ok('stopped invite link no longer works', await waitText(L, '#content', /invite link has expired/i));

console.log('-- repeat, search, quantities');
await V.click('#tabbar [data-view=reminder]'); await V.waitForTimeout(400);
await V.fill('.composer input', 'Water plants');
await V.selectOption('.composer .chip-select select', 'weekly'); await V.waitForTimeout(300);
await V.click('.composer .add-btn'); await V.waitForTimeout(700);
await V.click('#content .swipe .check >> nth=0'); await V.waitForTimeout(1500);
ok('ticking a weekly reminder schedules the next one', await waitText(V, '#toast', /Next one/));
const repeats = await V.$$eval('#content .swipe', (r) => r.filter((x) => /Water plants/.test(x.textContent)).length);
ok('…and it appears in the list', repeats >= 2, `${repeats} rows`);
await addOnTab(V, 'grocery', 'milk');
ok('adding something already on the list raises its quantity', await waitText(V, '#content', /×3\s*Milk/));
await V.click('#open-search'); await V.waitForTimeout(300); await V.fill('#search-input', 'passp');
ok('search finds the task', await waitText(V, '#search-results', /Renew passport/));
await V.click('#search [data-close]'); await V.waitForTimeout(300);

console.log('-- drag to reorder');
await V.click('#tabbar [data-view=grocery]'); await V.waitForTimeout(500);
const before = await V.$$eval('#content .swipe .item-text', (r) => r.map((x) => x.textContent));
const grips = await V.$$('#content .swipe [data-grip]');
const b0 = await grips[0].boundingBox(), b2 = await grips[grips.length - 1].boundingBox();
await V.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2); await V.mouse.down();
for (let i = 1; i <= 8; i++) await V.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2 - ((b2.y - b0.y + 20) * i) / 8);
await V.mouse.up(); await V.waitForTimeout(1200);
const after = await V.$$eval('#content .swipe .item-text', (r) => r.map((x) => x.textContent));
ok('dragged item moves to the top', after[0] === before[before.length - 1], `${before} → ${after}`);
await P.click('#tabbar [data-view=grocery]'); await P.waitForTimeout(1000);
const pOrder = await P.$$eval('#content .swipe .item-text', (r) => r.map((x) => x.textContent));
ok('new order syncs to Priya', pOrder[0] === after[0], String(pOrder));

console.log('-- photos');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAEAAAAAwCAIAAAAuKetIAAAAQklEQVR4nO3PMQ0AIBDAQMC/58cCW3PZm1N3Zk4+VL2BuAEBASIAAQEBIgABAQEiAAEBASIAAQEBIgABAQEiAAEBN1AbAa0G0iA+AAAAAElFTkSuQmCC', 'base64');
await P.click('#tabbar [data-view=note]'); await P.waitForTimeout(400);
await P.fill('.composer textarea', 'Fridge receipt');
await P.setInputFiles('.composer .photo-pick input', { name: 'receipt.png', mimeType: 'image/png', buffer: png });
await P.waitForSelector('.composer .attached', { timeout: 5000 });
await P.click('.composer .add-btn'); await P.waitForTimeout(800);
await V.click('#tabbar [data-view=note]');
ok('Vikram sees the note with its photo', await V.waitForSelector('.note .note-thumb', { timeout: 8000 }).then(() => true).catch(() => false));
await V.click('.note'); await V.waitForTimeout(800);
const full = await V.$eval('#edit-photo-img', (i) => i.src.length);
ok('full photo loads in the note', full > 200, `${full} chars`);
await V.click('#edit [data-close]'); await V.waitForTimeout(300);

console.log('-- backup');
await V.click('#open-settings'); await V.waitForTimeout(400);
const [dl] = await Promise.all([V.waitForEvent('download', { timeout: 8000 }), V.click('#export-board')]);
const backup = JSON.parse(readFileSync(await dl.path(), 'utf8'));
ok('export contains every item', backup.app === 'family-board' && backup.items.length >= 6, `${backup.items.length} items`);
ok('export uses names, not hidden ids', backup.items.some((x) => x.addedBy === 'Priya'));
await V.click('#settings [data-close]'); await V.waitForTimeout(300);

console.log('-- removing people');
await V.click('#open-settings'); await V.waitForTimeout(400);
await V.click('#settings-members .remove-member'); await V.click('#confirm-yes');
ok('owner removes Priya', await waitText(V, '#toast', /Removed Priya/));
ok('Priya is told and loses the board', await waitText(P, '#toast', /no longer on/i, 10000) || await P.isVisible('#setup'));
await V.click('#settings [data-close]').catch(() => {});

console.log('-- upgrading a board from the old version');
const OLD = 'oldb-aaaa-bbbb-cccc-dddd';
await env.withSecurityRulesDisabled(async (c) => {
  const f = c.firestore();
  await setDoc(doc(f, 'families', OLD), { members: ['Vikram', 'Priya'] });
  await setDoc(doc(f, 'families', OLD, 'items', 'a'), { type: 'grocery', text: 'Old milk', by: 'Priya', done: false, createdAt: Timestamp.now() });
  await setDoc(doc(f, 'families', OLD, 'items', 'b'), { type: 'task', text: 'Old done task', by: 'Vikram', done: true, doneBy: 'Vikram', createdAt: Timestamp.now() });
});
const OV = await phone('Vikram (old app)', devices['Pixel 7'], { 'fb.name': 'Vikram', 'fb.family': OLD, 'fb.boards': JSON.stringify([{ code: OLD, name: '', members: ['Vikram', 'Priya'] }]) });
await OV.goto(`${APP}?family=${OLD}`); await OV.waitForSelector('.stats', { timeout: 15000 });
await OV.click('#tabbar [data-view=grocery]');
ok('old board opens with its items', await waitText(OV, '#content', /Old milk/));
ok('old items still show who added them', await waitText(OV, '#content', /Priya/));
let claimed;
await env.withSecurityRulesDisabled(async (c) => { claimed = (await getDoc(doc(c.firestore(), 'families', OLD))).data(); });
ok('board upgraded with a 14-day window', !!claimed.ownerId && claimed.legacyUntil.toMillis() > Date.now() + 13 * 864e5);
await OV.click('#tabbar [data-view=task]');
ok('old ticked items were given a finish time (visible in Done)', await waitText(OV, '#content', /Old done task/));

console.log('-- iPhone install-first');
const IP = await phone('iPhone Safari', devices['iPhone 13']);
await IP.goto(link);
ok('iPhone Safari asks to add to Home Screen first', await IP.isVisible('#setup-install'));

for (const p of [V, OV]) {
  for (const v of ['home', 'task', 'reminder', 'grocery', 'note']) {
    await p.click(`#tabbar [data-view=${v}]`).catch(() => {}); await p.waitForTimeout(350);
    const wide = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (wide > 0) { fail++; console.log(`  FAIL ${p.label} ${v} page is ${wide}px wider than the screen`); }
  }
}
ok('no screen scrolls sideways', true);
for (const p of [V, P, M, L, OV, IP]) if (p.errors.length) { fail++; console.log(`  FAIL page errors on ${p.label}:`, p.errors); }
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close(); await env.cleanup();
process.exit(fail ? 1 : 0);
