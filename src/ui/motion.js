// Motion and feel: haptics, rows sliding into place, count-ups and the tab
// slide. Kept quiet and purposeful, as in Apple's own apps. Everything animates transform/opacity only (GPU work) and switches
// off with the device's Reduce Motion setting.
import { qs, qsa } from "./dom.js";
import { reduceMotion, isAndroid } from "../core/platform.js";

export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Android: the Vibration API. iOS 18+: toggling a hidden switch control plays a tick.
let hapticSwitch;
export function haptic() {
  if (isAndroid && navigator.vibrate) { navigator.vibrate(8); return; }
  if (!hapticSwitch) {
    const label = document.createElement("label");
    label.setAttribute("aria-hidden", "true");
    label.className = "haptic";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("switch", "");
    input.tabIndex = -1;
    label.append(input);
    document.body.append(label);
    hapticSwitch = label;
  }
  try { hapticSwitch.click(); } catch { /* no haptics on this device */ }
}

// Rows slide to their new place when the list changes (FLIP: record where each row
// was, re-render, then animate from the old spot). Only rows in sections on or near
// the screen are measured, so off-screen sections the browser skips stay skipped.
function visibleRows() {
  const vh = innerHeight;
  const rows = [];
  for (const section of qsa("#content > .list, #content > .notes")) {
    const r = section.getBoundingClientRect();
    if (r.bottom < -vh * 0.5 || r.top > vh * 1.5) continue;
    rows.push(...qsa("[data-id]", section));
  }
  return rows;
}
export function rowPositions() {
  const map = new Map();
  if (reduceMotion.matches) return map;
  for (const el of visibleRows()) map.set(el.dataset.id, el.getBoundingClientRect().top);
  return map;
}
export function slideRows(before) {
  if (!before.size) return;
  const vh = innerHeight;
  const moves = [];
  for (const el of visibleRows()) {
    const old = before.get(el.dataset.id);
    if (old === undefined) continue;
    const now = el.getBoundingClientRect().top;
    const dy = old - now;
    if (Math.abs(dy) < 1 || (old > vh && now > vh) || (old < -80 && now < -80)) continue;
    moves.push([el, dy]);
  }
  // All reads above, all writes below: one layout, no thrashing
  for (const [el, dy] of moves) {
    el.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }],
      { duration: 420, easing: "cubic-bezier(.25,1.15,.4,1)" });
  }
}

// Numbers roll up to their new value. `prev` remembers what each one showed.
export function rollNumbers(prev) {
  for (const el of qsa("[data-count]")) {
    const to = Number(el.dataset.count);
    const key = el.dataset.key;
    const from = prev.get(key) ?? 0;
    prev.set(key, to);
    if (from === to || reduceMotion.matches) { el.textContent = to; continue; }
    const start = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - start) / 550);
      el.textContent = Math.round(from + (to - from) * (1 - (1 - p) ** 3));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}

// The new screen slides in from the side of the tab you tapped
export function slideIn(forward) {
  if (reduceMotion.matches) return;
  const dx = forward ? 16 : -16;
  const easing = "cubic-bezier(.2,.9,.25,1)";
  qs("#main").animate([{ transform: `translateX(${dx}px)`, opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 260, easing });
  qs(".large-title").animate([{ transform: `translateX(${dx * 0.6}px)`, opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 240, easing });
}

export function bump(el) {
  if (reduceMotion.matches) return;
  el.animate([{ transform: "scale(1)" }, { transform: "scale(1.25)" }, { transform: "scale(1)" }],
    { duration: 360, easing: "cubic-bezier(.3,1.3,.5,1)" });
}
