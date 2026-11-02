// Tiny DOM helpers. Text always goes in as text nodes, never as HTML, so nothing
// a person types (or a synced item contains) can turn into markup or script.
export const qs = (selector, root = document) => root.querySelector(selector);
export const qsa = (selector, root = document) => [...root.querySelectorAll(selector)];

// h("button", { class: "btn", onclick: fn, "aria-label": "Add" }, "text", child, [more])
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (name.startsWith("on")) el.addEventListener(name.slice(2), value);
    else if (name === "class") el.className = value;
    else if (name === "style") el.style.cssText = value; // CSSOM: allowed by the Content Security Policy
    else el.setAttribute(name, value === true ? "" : value);
  }
  for (const child of children.flat()) {
    if (child != null && child !== false) el.append(child);
  }
  return el;
}

// Text with a line break, e.g. a two-line heading
export const lines = (...parts) => parts.flatMap((p, i) => (i ? [h("br"), p] : [p]));
