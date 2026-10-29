// Performance test: node tools/perf.js [label]   (serve the app first: python3 -m http.server 8765)
// Loads ~300 items in demo mode with a 4x CPU slowdown (roughly a phone) and reports fps,
// stutters, paint/layout/style/script time and long tasks for common interactions.
const { chromium, devices } = require('playwright');
const OUT = process.argv[2] || 'run';
(async () => {
  const b = await chromium.launch({ args: ['--enable-gpu-rasterization'] });
  const ctx = await b.newContext({ ...devices['iPhone 13'] });
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  const errs = []; p.on('pageerror', e => errs.push(e.message));

  // Seed a realistic board in demo mode
  await p.goto('http://localhost:8765/?demo');
  await p.evaluate(() => {
    localStorage.clear();
    const code = 'perf-perf-perf-perf-perf';
    const t = Date.now(), items = [];
    const groceries = ['Onions','Tomatoes','Milk','Paneer','Bread','Rice','Atta','Dal','Coriander','Ginger','Garlic','Eggs','Curd','Butter','Apples','Bananas','Tea','Coffee','Soap','Detergent'];
    for (let i = 0; i < 150; i++) items.push({ id: 'g' + i, type: 'grocery', text: groceries[i % 20] + (i >= 20 ? ' ' + i : ''), by: i % 2 ? 'Priya' : 'Vikram', done: i % 3 === 0, createdAt: t - i * 6e4 });
    for (let i = 0; i < 80; i++) items.push({ id: 't' + i, type: 'task', text: 'Task number ' + i + ' with a slightly longer description', by: i % 2 ? 'Priya' : 'Vikram', for: i % 3 ? 'Vikram' : undefined, done: i % 4 === 0, createdAt: t - i * 9e4 });
    for (let i = 0; i < 50; i++) items.push({ id: 'r' + i, type: 'reminder', text: 'Reminder ' + i, by: 'Priya', due: t + (i - 10) * 36e5, done: i % 5 === 0, createdAt: t - i * 1e5 });
    for (let i = 0; i < 20; i++) items.push({ id: 'n' + i, type: 'note', text: 'Note ' + i + '\nSecond line of the note', by: 'Vikram', done: false, createdAt: t - i * 2e5 });
    localStorage['fb.name'] = 'Vikram'; localStorage['fb.family'] = code; localStorage['fb.demo'] = '1';
    localStorage['fb.boards'] = JSON.stringify([{ code, name: 'Our Home', members: ['Vikram', 'Priya'] }]);
    localStorage['fb.hint.install'] = '0';
    localStorage['fb.demo.' + code] = JSON.stringify({ name: 'Our Home', members: ['Vikram', 'Priya'], items });
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  // Cold-ish load: time until the Home tiles have their real numbers
  const t0 = Date.now();
  await p.goto('http://localhost:8765/');
  await p.waitForSelector('.stats');
  const loadMs = Date.now() - t0;
  const paintTimings = await p.evaluate(() => Object.fromEntries(performance.getEntriesByType('paint').map(e => [e.name, Math.round(e.startTime)])));
  await p.waitForTimeout(800);

  // Frame recorder + trace for a scenario
  async function measure(name, action, ms = 2500) {
    await p.evaluate(() => {
      window.__f = []; window.__long = 0; window.__run = true;
      try { new PerformanceObserver((l) => l.getEntries().forEach(e => window.__long += e.duration)).observe({ type: 'longtask' }); } catch {}
      let last = performance.now();
      const loop = (t) => { window.__f.push(t - last); last = t; if (window.__run) requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    });
    const events = [];
    cdp.on('Tracing.dataCollected', (d) => events.push(...d.value));
    await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline', transferMode: 'ReportEvents' });
    const start = Date.now();
    await action();
    const rest = ms - (Date.now() - start);
    if (rest > 0) await p.waitForTimeout(rest);
    const done = new Promise((r) => cdp.once('Tracing.tracingComplete', r));
    await cdp.send('Tracing.end'); await done;
    cdp.removeAllListeners('Tracing.dataCollected');
    const f = await p.evaluate(() => { window.__run = false; return { f: window.__f.slice(1), long: window.__long }; });
    const sum = (n) => events.filter(e => e.name === n && e.ph === 'X').reduce((a, e) => a + (e.dur || 0), 0) / 1000;
    const count = (n) => events.filter(e => e.name === n).length;
    const frames = f.f, secs = frames.reduce((a, b) => a + b, 0) / 1000;
    return {
      scenario: name,
      fps: +(frames.length / secs).toFixed(1),
      'janky(>25ms)': frames.filter(x => x > 25).length,
      'worst ms': Math.round(Math.max(...frames)),
      'paint ms': Math.round(sum('Paint')),
      paints: count('Paint'),
      'layout ms': Math.round(sum('Layout')),
      'style ms': Math.round(sum('UpdateLayoutTree')),
      'script ms': Math.round(sum('FunctionCall') + sum('EvaluateScript')),
      'long tasks ms': Math.round(f.long),
    };
  }

  const rows = [];
  rows.push(await measure('idle on Home (3s)', async () => {}, 3000));
  rows.push(await measure('switch 4 tabs', async () => {
    for (const v of ['task', 'reminder', 'grocery', 'note']) { await p.click(`[data-view=${v}]`); await p.waitForTimeout(550); }
  }, 2600));
  await p.click('[data-view=grocery]'); await p.waitForTimeout(600);
  rows.push(await measure('scroll groceries', async () => {
    for (let i = 0; i < 12; i++) { await p.mouse.wheel(0, 260); await p.waitForTimeout(90); }
  }, 2200));
  await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(400);
  rows.push(await measure('tick 3 items', async () => {
    for (let i = 0; i < 3; i++) { await p.click('#content .swipe .check >> nth=0'); await p.waitForTimeout(700); }
  }, 2600));
  rows.push(await measure('type in add box', async () => {
    await p.click('.composer input'); await p.keyboard.type('Cardamom pods', { delay: 60 });
  }, 1800));

  console.log(`\n=== ${OUT} === load to content: ${loadMs} ms, paints: ${JSON.stringify(paintTimings)}, DOM nodes: ${await p.evaluate(() => document.getElementsByTagName('*').length)}`);
  console.table(rows);
  if (errs.length) console.log('errors', errs);

  await b.close();
})();
