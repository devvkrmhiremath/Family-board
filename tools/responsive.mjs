// Responsive check: every screen and sheet at phone, foldable, tablet and desktop
// sizes, in light and dark. Fails on sideways scrolling, controls smaller than
// 44px, content hidden under the tab bar, or any page error.
// Serve the app first: npm run serve
import { chromium } from "playwright";

const APP = process.env.APP_URL || "http://localhost:8765/";
const SIZES = [
  ["Galaxy Fold (folded)", 280, 653, true, "Android"],
  ["iPhone SE (1st gen)", 320, 568, true, "iPhone"],
  ["Galaxy S", 360, 780, true, "Android"],
  ["iPhone 15", 393, 852, true, "iPhone"],
  ["Pixel 8 Pro", 412, 915, true, "Android"],
  ["iPhone landscape", 852, 393, true, "iPhone"],
  ["Galaxy Fold (open)", 673, 841, true, "Android"],
  ["iPad mini portrait", 768, 1024, true, "iPad"],
  ["iPad landscape", 1180, 820, true, "iPad"],
  ["Laptop", 1440, 900, false, "Desktop"],
  ["Desktop", 1920, 1080, false, "Desktop"],
];
const UA = new Map(Object.entries({
  iPhone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  iPad: "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  Android: "Mozilla/5.0 (Linux; Android 15; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  Desktop: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
}));

const seed = () => {
  localStorage.clear();
  const code = "resp-resp-resp-resp-resp", me = "demo-me", t = Date.now();
  const items = [];
  ["2 Milk", "Onions", "Paneer", "Bread", "Coriander leaves, fresh", "Basmati rice 5 kg bag"].forEach((x, i) => items.push({ id: `g${i}`, type: "grocery", text: x.replace(/^\d+ /, ""), qty: i === 0 ? 2 : undefined, by: i % 2 ? "priya" : me, done: i === 5, doneAt: i === 5 ? t : undefined, order: t + i, createdAt: t - 6e5 }));
  items.push({ id: "t1", type: "task", text: "Renew passport before the trip next month", by: "priya", for: me, due: t + 2 * 864e5, done: false, order: t, createdAt: t - 864e5 });
  items.push({ id: "t2", type: "task", text: "Pay rent", by: me, repeat: "monthly", due: t + 5 * 864e5, done: false, order: t + 1, createdAt: t - 9e5 });
  items.push({ id: "r1", type: "reminder", text: "Car service", by: "priya", due: t + 3 * 36e5, done: false, createdAt: t - 7e5 });
  items.push({ id: "n1", type: "note", text: "Wifi: sunshine42", by: "priya", done: false, createdAt: t - 5e5 });
  Object.assign(localStorage, {
    "fb.demo": "1", "fb.demo.uid": me, "fb.name": "Vikram", "fb.family": code, "fb.hint.install": "0", "fb.safari": "1",
    "fb.boards": JSON.stringify([{ code, name: "Our Home", people: ["You", "Priya"] }]),
    [`fb.demo.${code}`]: JSON.stringify({ name: "Our Home", ownerId: me, members: { [me]: "Vikram", priya: "Priya" }, items, often: { eggs: 6, curd: 5 }, keepDays: 30 }),
  });
};

const browser = await chromium.launch();
let problems = 0;
for (const [label, width, height, touch, kind] of SIZES) {
  for (const scheme of ["light", "dark"]) {
    const ctx = await browser.newContext({ viewport: { width, height }, isMobile: touch && kind !== "Desktop", hasTouch: touch, userAgent: UA.get(kind), colorScheme: scheme, serviceWorkers: "block" });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.goto(`${APP}?demo`);
    await page.evaluate(seed);
    await page.goto(APP);
    await page.waitForSelector(".stats");
    const issues = [];
    const check = async (where) => {
      const r = await page.evaluate(() => {
        const wide = document.documentElement.scrollWidth - innerWidth;
        const small = [...document.querySelectorAll("button, input, select, textarea, a[href]")]
          .filter((el) => el.offsetParent && !el.closest(".segmented, .haptic, .sr-only") && el.getClientRects().length)
          .filter((el) => { const b = el.getBoundingClientRect(); return b.width < 43.5 || b.height < 43.5; })
          .map((el) => `${el.className || el.tagName}(${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)})`);
        const bar = document.querySelector(".tabbar-inner")?.getBoundingClientRect();
        const main = document.querySelector("main");
        const padBottom = parseFloat(getComputedStyle(main).paddingBottom);
        const sidebar = document.querySelector(".tabbar").getBoundingClientRect().height > innerHeight * 0.9;
        const covered = bar && !sidebar && padBottom < (innerHeight - bar.top);
        return { wide, small: [...new Set(small)].slice(0, 4), covered };
      });
      if (r.wide > 0) issues.push(`${where}: ${r.wide}px sideways scroll`);
      if (r.small.length) issues.push(`${where}: small targets ${r.small.join(", ")}`);
      if (r.covered) issues.push(`${where}: last rows hidden under the tab bar`);
    };
    for (const view of ["home", "task", "reminder", "grocery", "note"]) {
      await page.click(`#tabbar [data-view=${view}]`);
      await page.waitForTimeout(450);
      await check(view);
    }
    await page.click("#tabbar [data-view=task]");
    await page.click("#content .item-body");
    await page.waitForTimeout(350);
    await check("edit sheet");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    await page.click("#open-settings");
    await page.waitForTimeout(350);
    await check("settings sheet");
    if (scheme === "light" && [280, 852, 1180].includes(width)) await page.screenshot({ path: `${process.env.SHOTS || "/tmp"}/resp-${width}x${height}.png` });
    await page.keyboard.press("Escape");
    if (errors.length) issues.push(`errors: ${errors.join(" | ")}`);
    console.log(`${issues.length ? "FAIL" : "ok  "} ${label} ${width}x${height} ${scheme}${issues.length ? `\n       ${issues.join("\n       ")}` : ""}`);
    problems += issues.length;
    await ctx.close();
  }
}
await browser.close();
console.log(problems ? `\n${problems} problems` : "\nAll sizes OK");
process.exit(problems ? 1 : 0);
