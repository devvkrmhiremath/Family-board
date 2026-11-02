// Fails if sw.js's SHELL list misses a file the app needs offline, or lists one that doesn't exist.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const walk = (dir) => readdirSync(join(root, dir)).flatMap((f) => {
  const p = join(dir, f);
  return statSync(join(root, p)).isDirectory() ? walk(p) : [p];
});
const sw = readFileSync(join(root, "sw.js"), "utf8");
const shell = JSON.parse(`[${sw.match(/const SHELL = \[([\s\S]*?)\];/)[1].replace(/,\s*$/, "")}]`);
const needed = [...walk("src"), ...walk("vendor")].filter((f) => f.endsWith(".js"));
const missing = needed.filter((f) => !shell.includes(f));
const stale = shell.filter((f) => f !== "./" && !existsSync(join(root, f)));
if (missing.length || stale.length) {
  console.error("sw.js SHELL is out of date.", missing.length ? `\n  Missing: ${missing.join(", ")}` : "", stale.length ? `\n  Not found: ${stale.join(", ")}` : "");
  process.exit(1);
}
console.log(`sw.js SHELL OK (${shell.length} files)`);

// index.html should preload every app module (so they download in parallel)
const html = readFileSync(join(root, "index.html"), "utf8");
const unpreloaded = walk("src").filter((f) => f.endsWith(".js") && f !== "src/main.js" && !html.includes(`href="${f}"`));
if (unpreloaded.length) {
  console.error(`index.html needs a modulepreload link for: ${unpreloaded.join(", ")}`);
  process.exit(1);
}
console.log("index.html preloads OK");
