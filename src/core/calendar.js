// Calendar maths: where events fall, repeats, all-day spans and clashes.
// An event stores `due` (start) and optionally `end`. All-day events store local
// midnight of their first and last day; `end` is that last day (inclusive).
import { DAY, dayStart, addDays, stepRepeat } from "./time.js";

export const HOUR = 36e5;

// When an occurrence starting at `start` stops (exclusive)
function endOf(item, start) {
  const length = Math.max(0, (item.end ?? item.due) - item.due);
  if (item.allDay) return addDays(dayStart(start + length), 1);
  return item.end != null ? start + length : start + HOUR;
}

// Every occurrence of the board's events that touches [from, to), soonest first
export function occurrences(items, from, to) {
  const out = [];
  for (const item of items) {
    if (item.type !== "event" || !Number.isFinite(item.due)) continue;
    let start = item.due;
    for (let guard = 0; guard < 4000 && start < to; guard++) {
      const end = endOf(item, start);
      if (end > from) out.push({ item, start, end, key: `${item.id}@${start}` });
      if (!item.repeat) break;
      start = stepRepeat(start, item.repeat);
    }
  }
  return out.sort((a, b) => (b.item.allDay - a.item.allDay) || (a.start - b.start) || (a.end - b.end));
}

export const onDay = (occs, day) => occs.filter((o) => o.start < addDays(day, 1) && o.end > day);

// Who an event involves: [] means everyone on the board
export const peopleOf = (item) => (Array.isArray(item.people) ? item.people.filter((p) => typeof p === "string") : []);
const shares = (a, b) => {
  const pa = peopleOf(a);
  const pb = peopleOf(b);
  return !pa.length || !pb.length || pa.some((p) => pb.includes(p));
};

// Timed occurrences that overlap and involve the same people (busy blocks included)
export function clashes(occs) {
  const timed = occs.filter((o) => !o.item.allDay);
  const out = new Map(); // key -> [other occurrence]
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      const a = timed.at(i);
      const b = timed.at(j);
      if (a.item.id === b.item.id || !(a.start < b.end && b.start < a.end) || !shares(a.item, b.item)) continue;
      if (a.item.busy && b.item.busy) continue; // two people both busy is not a clash
      out.set(a.key, [...(out.get(a.key) ?? []), b]);
      out.set(b.key, [...(out.get(b.key) ?? []), a]);
    }
  }
  return out;
}

// Past one-off events, so they can be ticked off and tidied like other items
export function isPast(item, now = Date.now()) {
  return item.type === "event" && !item.repeat && !item.done && endOf(item, item.due) < now - DAY;
}
export const lastMoment = (item) => endOf(item, item.due);

// "YYYY-MM-DD" and "HH:MM" for native date and time inputs, in local time
const pad = (n) => String(n).padStart(2, "0");
export const dateValue = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const timeValue = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export function fromDateTime(date, time = "00:00") {
  const [y, m, d] = String(date).split("-").map(Number);
  const [hh, mm] = String(time).split(":").map(Number);
  if (!y || !m || !d) return null;
  const ms = new Date(y, m - 1, d, hh || 0, mm || 0).getTime();
  return Number.isFinite(ms) ? ms : null;
}

// First day of the week for the person's locale (1 = Monday, 7 = Sunday)
export function firstWeekday() {
  try {
    const loc = new Intl.Locale(navigator.language || "en");
    const info = loc.getWeekInfo?.() ?? loc.weekInfo;
    if (info?.firstDay) return info.firstDay;
  } catch { /* older browsers */ }
  return 1;
}
export function weekStartOf(ms) {
  const first = firstWeekday() % 7; // JS: 0 = Sunday
  const day = dayStart(ms);
  return addDays(day, -((new Date(day).getDay() - first + 7) % 7));
}
