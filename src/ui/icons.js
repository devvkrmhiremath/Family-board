// SVG icons (Lucide-style, one consistent stroke set), built with DOM calls from
// shape data rather than HTML strings. Each icon is built once, then cloned.
const SVG_NS = "http://www.w3.org/2000/svg";
const path = (d, extra = {}) => ["path", { d, ...extra }];
const circle = (cx, cy, r) => ["circle", { cx, cy, r }];
const rect = (x, y, width, height, rx) => ["rect", { x, y, width, height, rx }];

const SHAPES = new Map([
  ["task", [path("m9 11 3 3 8-8"), path("M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9")]],
  ["bell", [path("M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"), path("M13.7 21a2 2 0 0 1-3.4 0")]],
  ["cart", [circle(9, 20, 1.5), circle(18, 20, 1.5), path("M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L22 7H6")]],
  ["note", [path("M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"), path("M14 3v6h6M8 13h8M8 17h5")]],
  ["plus", [path("M12 5v14M5 12h14")]],
  ["x", [path("M18 6 6 18M6 6l12 12")]],
  ["clock", [circle(12, 12, 9), path("M12 7v5l3 2")]],
  ["calendar", [rect(3, 4, 18, 17, 2), path("M16 2v4M8 2v4M3 10h18")]],
  ["share", [path("M12 3v13M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6")]],
  ["sparkle", [path("M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8")]],
  ["check", [path("M5 12.5 10 17 19 7")]],
  ["repeat", [path("m17 2 4 4-4 4"), path("M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4"), path("M21 13v1a4 4 0 0 1-4 4H3")]],
  ["grip", [path("M8 6h.01M8 12h.01M8 18h.01M16 6h.01M16 12h.01M16 18h.01", { "stroke-width": 3 })]],
  ["camera", [path("M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"), circle(12, 13, 3.5)]],
  ["lock", [rect(5, 11, 14, 10, 2), path("M8 11V7a4 4 0 0 1 8 0v4")]],
  ["download", [path("M12 3v12M7 10l5 5 5-5M5 19h14")]],
  ["menu", [circle(12, 5, 1), circle(12, 12, 1), circle(12, 19, 1)]],
]);

const cache = new Map();

function build(name, cls) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", cls);
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  for (const [tag, attrs] of SHAPES.get(name) ?? []) {
    const shape = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) shape.setAttribute(k, String(v));
    svg.append(shape);
  }
  return svg;
}

export function icon(name, cls = "i") {
  const key = `${name}|${cls}`;
  if (!cache.has(key)) cache.set(key, build(name, cls));
  return cache.get(key).cloneNode(true);
}
