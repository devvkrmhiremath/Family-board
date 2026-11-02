// A short message above the tab bar, optionally with one action (like Undo).
import { h, qs } from "./dom.js";

let timer;
export function toast(message, action) {
  const box = qs("#toast");
  box.replaceChildren(h("span", {}, message));
  if (action) {
    box.append(h("button", {
      type: "button",
      onclick: () => { box.classList.remove("show"); action.run(); },
    }, action.label));
  }
  box.classList.add("show");
  clearTimeout(timer);
  timer = setTimeout(() => box.classList.remove("show"), action ? 5000 : 3000);
}
