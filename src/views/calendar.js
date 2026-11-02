// The Calendar screen: a week strip, the chosen day's plans, what's coming up,
// and an add box for events or busy time. Clashes are flagged on both events.
import { REPEATS, LIMITS } from "../core/constants.js";
import { DAY, dayStart, addDays, dayDiff } from "../core/time.js";
import {
  HOUR, occurrences, onDay, clashes, peopleOf, weekStartOf, isPast, utcDay,
  dateValue, timeValue, fromDateTime,
} from "../core/calendar.js";
import { h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { toast } from "../ui/toast.js";
import { haptic } from "../ui/motion.js";
import { segmented, repeatPicker } from "../ui/controls.js";
import { state } from "../app/state.js";
import { nameOf, isMe, peoplePicker, busyPicker, peopleLabel } from "../app/people.js";
import { addEvent, addPulse } from "../app/actions.js";
import { hooks } from "../app/hooks.js";
import { downloadIcs } from "../features/ics.js";

const time = (ms) => new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const today = () => dayStart(Date.now());
const selectedDay = () => state.calDay ?? today();

function dayTitle(day) {
  const diff = dayDiff(day);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return new Date(day).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}
const shortDay = (day) => {
  const diff = dayDiff(day);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tmrw";
  return new Date(day).toLocaleDateString(undefined, diff > 1 && diff < 7 ? { weekday: "short" } : { day: "numeric", month: "short" });
};

function rerender() {
  const y = scrollY;
  hooks.render({ full: true });
  scrollTo(0, y);
}
function pickDay(day) {
  state.calDay = day === today() ? null : day;
  if (state.eventDraft) state.eventDraft.date = dateValue(day);
  haptic();
  rerender();
}

// ---------- rows ----------
function busyOwner(item) {
  const who = peopleOf(item)[0];
  if (!who) return "someone's busy time";
  return isMe(who) ? "your busy time" : `${nameOf(who)}'s busy time`;
}
export function busyTitle(item) {
  const who = peopleOf(item)[0];
  const name = who ? (isMe(who) ? "You" : nameOf(who)) : "Someone";
  return item.text && item.text !== "Busy" ? `${name} · Busy · ${item.text}` : `${name} · Busy`;
}

export function eventRow(occ, { day = null, clashWith = [], withDay = false } = {}) {
  const { item } = occ;
  let top;
  let bottom;
  if (item.allDay) { top = "All day"; bottom = ""; }
  else {
    top = day != null && occ.start < day ? "…" : time(occ.start);
    bottom = day != null && occ.end > addDays(day, 1) ? "…" : time(occ.end);
  }
  if (withDay) { bottom = item.allDay ? "All day" : top; top = shortDay(dayStart(occ.start)); }
  const meta = item.busy ? [] : [h("span", { class: "repeat-tag" }, icon("users"), peopleLabel(peopleOf(item)))];
  if (item.repeat) meta.push(h("span", { class: "repeat-tag" }, icon("repeat"), REPEATS.get(item.repeat) ?? "Repeats"));
  if (clashWith.length) {
    const other = clashWith[0].item;
    meta.push(h("span", { class: "clash" }, icon("alert"), `Clashes with ${other.busy ? busyOwner(other) : `“${other.text}”`}`));
  }
  const title = item.busy ? busyTitle(item) : item.text;
  return h("button", {
    type: "button", class: `event-row${item.busy ? " busy" : ""}${item.done ? " is-done" : ""}`, "data-id": occ.key,
    "aria-label": `${title}, ${item.allDay ? "all day" : `${time(occ.start)} to ${time(occ.end)}`}. Edit`,
    onclick: () => hooks.openEdit(item),
  },
    h("span", { class: "event-time", "aria-hidden": "true" }, h("strong", {}, top), bottom && h("span", {}, bottom)),
    h("span", { class: "event-bar", "aria-hidden": "true" }),
    h("span", { class: "event-body" }, h("span", { class: "event-title" }, title), h("span", { class: "meta" }, meta)));
}

// ---------- week strip ----------
function weekStrip(sel, occs) {
  const start = weekStartOf(sel);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const month = new Date(addDays(start, 3)).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const strip = h("div", { class: "cal-strip" },
    h("div", { class: "cal-head" },
      h("strong", { class: "cal-month", "aria-live": "polite" }, month),
      sel !== today() && h("button", { type: "button", class: "link-btn cal-today", onclick: () => pickDay(today()) }, "Today"),
      h("button", { type: "button", class: "icon-btn tint", "aria-label": "Previous week", onclick: () => pickDay(addDays(sel, -7)) }, icon("left")),
      h("button", { type: "button", class: "icon-btn tint", "aria-label": "Next week", onclick: () => pickDay(addDays(sel, 7)) }, icon("right"))),
    h("div", { class: "cal-days", role: "group", "aria-label": "Days of the week" }, days.map((d) => {
      const n = onDay(occs, d).length;
      const date = new Date(d);
      return h("button", {
        type: "button", class: `cal-day${d === today() ? " today" : ""}`, "aria-pressed": String(d === sel),
        "aria-label": `${date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}${n ? `, ${n} planned` : ""}`,
        onclick: () => pickDay(d),
      },
        h("span", { class: "cal-dow", "aria-hidden": "true" }, date.toLocaleDateString(undefined, { weekday: "narrow" })),
        h("span", { class: "cal-num", "aria-hidden": "true" }, String(date.getDate())),
        h("span", { class: `cal-dot${n ? " on" : ""}`, "aria-hidden": "true" }));
    })));
  // Swipe the strip sideways to change week
  let x0 = null;
  strip.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  strip.addEventListener("touchend", (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0;
    x0 = null;
    if (Math.abs(dx) > 50) pickDay(addDays(sel, dx < 0 ? 7 : -7));
  });
  return strip;
}

// ---------- screen ----------
// The week strip sits above the add box, like the top of Calendar on iPhone
export function calendarStrip() {
  const sel = selectedDay();
  const occs = occurrences(state.items.filter((i) => !state.pending.has(i.id)), weekStartOf(sel), addDays(weekStartOf(sel), 7));
  return weekStrip(sel, occs);
}
const section = (title, extra) => h("div", { class: "section-title" }, h("span", {}, title), extra);

export function calendarContent() {
  const sel = selectedDay();
  const from = sel;
  const occs = occurrences(state.items.filter((i) => !state.pending.has(i.id)), from, addDays(sel, 31));
  const clash = clashes(occs);
  const row = (o, opts) => eventRow(o, { ...opts, clashWith: clash.get(o.key) ?? [] });

  const todays = onDay(occs, sel);
  const upcoming = occs.filter((o) => o.start >= addDays(sel, 1)).slice(0, 40);
  const out = [section(dayTitle(sel))];
  out.push(todays.length
    ? h("div", { class: "list" }, todays.map((o) => row(o, { day: sel })))
    : h("div", { class: "empty compact" }, sel < today() ? "Nothing was planned." : "Nothing planned. Add something above, or block out time when you're busy."));

  if (upcoming.length) {
    out.push(section("Coming up"));
    let lastDay = null;
    const groups = [];
    for (const o of upcoming) {
      const d = dayStart(o.start);
      if (d !== lastDay) { groups.push({ day: d, rows: [] }); lastDay = d; }
      groups.at(-1).rows.push(o);
    }
    for (const g of groups) {
      out.push(h("p", { class: "cal-group" }, dayTitle(g.day)), h("div", { class: "list" }, g.rows.map((o) => row(o, { day: g.day }))));
    }
  }
  const exportable = state.items.filter((i) => i.type === "event" && !i.done && !isPast(i) && !state.pending.has(i.id));
  if (exportable.length) {
    out.push(h("div", { class: "group cal-export" },
      h("button", { type: "button", class: "cell-btn", onclick: () => exportEvents(exportable) }, icon("download"), "Add All to My Calendar")),
    h("p", { class: "group-footer" }, "Saves this board's upcoming events as a file your phone's Calendar app can add. Later changes here won't update it."));
  }
  return out;
}

export function exportEvents(items, filename) {
  const slug = state.boardName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "board";
  downloadIcs(items, filename || `${slug}-calendar.ics`, { boardName: state.boardName, nameOf: (id) => (isMe(id) ? state.name || "You" : nameOf(id)) });
  toast(items.length === 1 ? "Opening in Calendar…" : `Saved ${items.length} events for your calendar`);
}

// ---------- add box ----------
function freshDraft() {
  const day = selectedDay();
  const now = Date.now();
  let start = addDays(day, 0) + 9 * HOUR;
  if (day === today()) start = Math.min(Math.ceil(now / HOUR) * HOUR, day + 22 * HOUR);
  const startDate = new Date(day);
  startDate.setHours(new Date(start).getHours(), new Date(start).getMinutes());
  return {
    kind: "event", date: dateValue(day), endDate: "", allDay: false,
    start: timeValue(startDate.getTime()), end: timeValue(startDate.getTime() + HOUR),
    people: [], busyWho: state.uid || "", repeat: "",
  };
}

const timeInput = (label, value, onchange) => h("input", { type: "time", class: "cell-input", "aria-label": label, value, onchange });

export function eventComposer() {
  if (!state.eventDraft) state.eventDraft = freshDraft();
  const draft = state.eventDraft;
  const busy = draft.kind === "busy";
  const form = h("form", { class: `composer${busy ? " open" : ""}`, novalidate: true });
  form.append(segmented("What to add", [{ value: "event", label: "Event" }, { value: "busy", label: "Busy Time" }], draft.kind,
    (v) => { draft.kind = v; rerender(); }));

  const field = h("input", {
    name: "text", placeholder: busy ? "What's on? (optional)" : "Add an event", "aria-label": busy ? "What's on (optional)" : "Event name",
    maxlength: LIMITS.text, autocomplete: "off", autocapitalize: "sentences", enterkeyhint: "done",
  });
  field.value = state.drafts.get("event") || "";
  form.classList.toggle("has-text", !!field.value.trim());
  field.addEventListener("input", () => { state.drafts.set("event", field.value); form.classList.toggle("has-text", !!field.value.trim()); });
  form.append(h("div", { class: "composer-row" }, field,
    h("button", { class: "btn primary add-btn", type: "submit", "aria-label": busy ? "Add busy time" : "Add event" }, icon("plus"))));

  // Start time moves the end with it, keeping the length
  const endInput = timeInput("Ends", draft.end, (e) => { draft.end = e.target.value; });
  const startInput = timeInput("Starts", draft.start, (e) => {
    const before = fromDateTime(draft.date, draft.start);
    const length = (fromDateTime(draft.date, draft.end) ?? before) - before;
    draft.start = e.target.value;
    const now = fromDateTime(draft.date, draft.start);
    if (now != null && length > 0) { draft.end = timeValue(now + length); endInput.value = draft.end; }
  });
  const when = h("div", { class: "composer-extra" },
    h("p", { class: "label" }, "When"),
    h("div", { class: "event-when" },
      h("input", { type: "date", class: "cell-input", "aria-label": "Date", value: draft.date, onchange: (e) => { draft.date = e.target.value; } }),
      h("button", {
        type: "button", class: "chip-btn", "aria-pressed": String(draft.allDay),
        onclick: () => { draft.allDay = !draft.allDay; rerender(); },
      }, "All day"),
      repeatPicker(draft.repeat, (v) => { draft.repeat = v; rerender(); })),
    draft.allDay
      ? h("div", { class: "event-times" }, h("span", { class: "label" }, "Until"),
        h("input", { type: "date", class: "cell-input", "aria-label": "Last day (optional)", value: draft.endDate || draft.date, min: draft.date, onchange: (e) => { draft.endDate = e.target.value; } }))
      : h("div", { class: "event-times" }, startInput, h("span", { class: "label", "aria-hidden": "true" }, "to"), endInput));
  const who = h("div", { class: "composer-extra" },
    h("p", { class: "label" }, busy ? "Who's busy" : "Who's going"),
    busy
      ? busyPicker(draft.busyWho, (v) => { draft.busyWho = v; rerender(); })
      : peoplePicker(draft.people, (v) => { draft.people = v; rerender(); }));
  form.append(when, who);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    let text = field.value.trim();
    if (!text && busy) text = "Busy";
    if (!text) { field.focus(); toast("Give the event a name first"); return; }
    if (!state.api) { toast("Still connecting, try again in a moment"); return; }
    let start;
    let end;
    let shownOn;
    if (draft.allDay) {
      shownOn = fromDateTime(draft.date);
      const last = fromDateTime(draft.endDate || draft.date);
      start = shownOn == null ? null : utcDay(shownOn);
      end = last == null || last < shownOn ? start : utcDay(last);
    } else {
      start = fromDateTime(draft.date, draft.start);
      end = fromDateTime(draft.date, draft.end);
      if (end != null && start != null && end <= start) end += DAY; // runs past midnight
      shownOn = start;
    }
    if (start == null) { toast("Pick a date first"); return; }
    addEvent({
      text, start, end, allDay: draft.allDay, busy, repeat: draft.repeat,
      people: busy ? [draft.busyWho || state.uid].filter(Boolean) : draft.people,
    });
    field.value = "";
    state.drafts.set("event", "");
    form.classList.remove("has-text");
    haptic();
    addPulse(form);
    // Jump to the day it was added to, so you can see it
    const day = dayStart(shownOn);
    state.calDay = day === today() ? null : day;
    state.eventDraft = { ...freshDraft(), kind: draft.kind, people: draft.people, busyWho: draft.busyWho };
    toast(busy ? "Busy time added" : `Added for ${dayTitle(day).toLowerCase().replace(/^(today|tomorrow|yesterday)$/, (m) => m)}`);
    rerender();
  });
  return form;
}
