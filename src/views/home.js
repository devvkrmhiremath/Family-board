// The Home screen: summary tiles, what's coming up, your tasks, the shopping list
// and recent activity. Two columns on iPad and wide screens.
import { typeInfo } from "../core/constants.js";
import { ago, dayStart, addDays } from "../core/time.js";
import { occurrences } from "../core/calendar.js";
import { h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { state, itemsOf, openCount, prevCounts } from "../app/state.js";
import { nameOf, isMe, others } from "../app/people.js";
import { go } from "../app/actions.js";
import { hooks } from "../app/hooks.js";
import { shareInvite } from "../features/invites.js";
import { itemRow } from "./rows.js";
import { eventRow } from "./calendar.js";

// Smart-list tiles, as in the Reminders app: coloured icon, count, name
function stat(type, label, count = openCount(type)) {
  return h("button", { class: "stat", "data-type": type, "aria-label": `${label}: ${count}`, onclick: () => go(type) },
    h("span", { class: "stat-icon" }, icon(typeInfo(type).icon)),
    h("b", { "data-count": count, "data-key": `stat-${type}`, "aria-hidden": "true" }, String(prevCounts.get(`stat-${type}`) ?? 0)),
    h("span", { class: "stat-label", "aria-hidden": "true" }, label));
}
const section = (title, action) => h("div", { class: "section-title" }, h("span", {}, title),
  action && h("button", { class: "link-btn", onclick: action.run }, action.label));
const quiet = (text) => h("div", { class: "empty compact" }, text);
const short = (text, n) => (text.length > n ? `${text.slice(0, n)}…` : text);

function activityRow(item) {
  const who = isMe(item.by) ? "You" : nameOf(item.by);
  const what = item.type === "grocery" ? "to groceries" : `a ${item.type}`;
  return h("div", { class: "item" },
    h("span", { class: `avatar${isMe(item.by) ? " me" : ""}`, "aria-hidden": "true" }, (nameOf(item.by) || "?").charAt(0).toUpperCase()),
    h("button", { class: "item-body", onclick: () => hooks.openEdit(item) },
      h("div", {}, h("strong", {}, who), ` added ${what}`),
      h("div", { class: "preview-line" }, `${short(item.text, 70)} · ${ago(item.createdAt)}`)));
}

export function homeContent() {
  const now = Date.now();
  const live = state.items.filter((i) => !state.pending.has(i.id) && !i.done);
  const week = occurrences(live, dayStart(now), addDays(dayStart(now), 7)).filter((o) => o.end > now);
  const comingUp = [
    ...[...itemsOf("reminder"), ...itemsOf("task")].filter((r) => !r.done && r.due && r.due - now < 3 * 864e5).map((i) => ({ at: i.due, el: () => itemRow(i) })),
    ...week.filter((o) => o.start - now < 3 * 864e5).map((o) => ({ at: Math.max(o.start, dayStart(now)), el: () => eventRow(o, { withDay: true }) })),
  ].sort((a, b) => a.at - b.at);
  const myTasks = itemsOf("task").filter((t) => !t.done && (!t.for || isMe(t.for)));
  const toBuy = itemsOf("grocery").filter((g) => !g.done);
  const recent = state.items.filter((i) => !state.pending.has(i.id)).sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);
  const alone = others().length === 0;
  const shopping = toBuy.slice(0, 8).map((g) => (g.qty > 1 ? `${g.text} ×${g.qty}` : g.text)).join(", ") + (toBuy.length > 8 ? "…" : "");

  return [
    h("div", { class: "home-grid" },
      h("div", { class: "home-col" },
        h("div", { class: "stats" }, stat("task", "Tasks"), stat("event", "This Week", week.length), stat("grocery", "To Buy"), stat("note", "Notes")),
        alone && section("Invite people"),
        alone && h("div", { class: "empty compact" },
          h("p", { class: "invite-blurb" }, `Share “${state.boardName}” so everyone on it sees the same lists.`),
          h("button", { class: "btn primary block", onclick: shareInvite }, icon("share"), "Send Invite Link")),
        section("Coming up", { label: "Calendar", run: () => go("event") }),
        comingUp.length ? h("div", { class: "list" }, comingUp.slice(0, 6).map((x) => x.el())) : quiet("Nothing in the next 3 days."),
        section("Your tasks", { label: "See all", run: () => go("task") }),
        myTasks.length ? h("div", { class: "list" }, myTasks.slice(0, 5).map((i) => itemRow(i))) : quiet("Nothing on your plate."),
      ),
      h("div", { class: "home-col" },
        section("Shopping list", { label: "Open", run: () => go("grocery") }),
        toBuy.length
          ? h("button", { class: "empty compact shop-preview", onclick: () => go("grocery") },
              h("strong", {}, `${toBuy.length} to buy`), h("div", { class: "preview-line" }, shopping))
          : quiet("Nothing to buy right now."),
        recent.length > 0 && section("Recent activity"),
        recent.length > 0 && h("div", { class: "list activity" }, recent.map(activityRow)),
      ),
    ),
  ];
}
