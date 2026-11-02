// Placeholder and problem states: loading rows, and a board this device can't open.
import { h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { state } from "../app/state.js";

export const skeleton = () => [h("div", { class: "skeleton" }), h("div", { class: "skeleton" }), h("div", { class: "skeleton" })];

const REASONS = new Map([
  ["invite-invalid", ["This invite link has expired", "Invite links work for 7 days, and can be stopped by the people on the board. Ask someone on it to send you a new one."]],
  ["locked", ["You need a new invite", "This board is private. Ask someone on it to open Settings, tap Invite People and send you the link."]],
  ["offline", ["Can't reach the board", "Check your internet connection, then try again."]],
]);

// onRetry: try connecting again; onRemove: forget this board on this device
export function lockedContent({ onRetry, onRemove }) {
  const [title, text] = REASONS.get(state.locked) ?? ["Can't open this board", "Ask someone on it to send you a new invite link."];
  const offline = state.locked === "offline";
  return [h("div", { class: "empty locked" },
    h("div", { class: "empty-icon" }, icon(offline ? "clock" : "lock")),
    h("h3", {}, title), h("p", {}, text),
    h("div", { class: "locked-actions" },
      offline
        ? h("button", { class: "btn primary", onclick: onRetry }, "Try Again")
        : h("button", { class: "btn", onclick: onRemove }, "Remove from This Device")))];
}
