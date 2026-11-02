// Reusable iOS-style controls: capsule choice buttons, the segmented control and
// a "Repeat" pop-up button.
import { h } from "./dom.js";
import { icon } from "./icons.js";
import { haptic } from "./motion.js";
import { reduceMotion } from "../core/platform.js";
import { REPEATS } from "../core/constants.js";

export function chipGroup(label, options, current, onPick, extraClass = "") {
  return h("div", { class: `chips ${extraClass}`, role: "group", "aria-label": label },
    options.map((o) => h("button", {
      type: "button", class: "chip-btn", "aria-pressed": String(o.value === current),
      onclick: () => onPick(o.value),
    }, o.icon ? icon(o.icon) : null, o.label)));
}

// A sliding thumb behind 2–5 equal segments
export function segmented(label, options, current, onPick) {
  const index = Math.max(0, options.findIndex((o) => o.value === current));
  return h("div", { class: "segmented", role: "group", "aria-label": label, style: `--count:${options.length};--index:${index}` },
    h("span", { class: "thumb", "aria-hidden": "true" }),
    options.map((o, i) => h("button", {
      type: "button", "aria-pressed": String(i === index),
      onclick: (e) => {
        if (i === index) return;
        haptic();
        // Slide the thumb first, then let the caller re-render
        e.currentTarget.parentElement.style.setProperty("--index", i);
        setTimeout(() => onPick(o.value), reduceMotion.matches ? 0 : 160);
      },
    }, o.icon ? icon(o.icon) : null, o.label)));
}

// Built on a native <select>, so iPhone shows its wheel picker and Android its list
export function repeatPicker(value, onChange, label = "Repeat") {
  const select = h("select", { "aria-label": label, onchange: (e) => onChange(e.target.value) },
    h("option", { value: "" }, "Doesn't repeat"),
    [...REPEATS].map(([v, text]) => h("option", { value: v, selected: v === value }, text)));
  return h("label", { class: `chip-select${value ? " on" : ""}` }, icon("repeat"), select);
}
