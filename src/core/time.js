// Dates and times: friendly labels, quick-pick presets and repeat schedules.
export const DAY = 864e5;

export function ago(ms) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
export const dayDiff = (ms) => Math.round((startOfDay(new Date(ms)) - startOfDay(new Date())) / DAY);

export function fmtDue(ms) {
  const d = new Date(ms);
  const diff = dayDiff(ms);
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (diff === 0) return `Today, ${time}`;
  if (diff === 1) return `Tomorrow, ${time}`;
  if (diff === -1) return `Yesterday, ${time}`;
  const day = diff > 1 && diff < 7
    ? d.toLocaleDateString(undefined, { weekday: "long" })
    : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return `${day}, ${time}`;
}

export const fmtDate = (ms) => new Date(ms).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

// <input type="datetime-local"> works in local time without a zone suffix
export function toLocalInput(ms) {
  if (!ms) return "";
  return new Date(ms - new Date(ms).getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
export const fromLocalInput = (value) => (value ? new Date(value).getTime() : null);

export const roundUp5 = (ms) => Math.ceil(ms / 300e3) * 300e3;

export function greeting(hour = new Date().getHours()) {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}

// A time `days` from today at `hour` o'clock
export function atHour(days, hour) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}

// One-tap dates, so nobody has to fight the date picker
export function timePresets({ allowNone = false } = {}) {
  const now = new Date();
  const out = [];
  if (allowNone) out.push({ id: "none", label: "No date", ms: null });
  out.push({ id: "hour", label: "In 1 hour", ms: roundUp5(Date.now() + 3600e3) });
  if (now.getHours() < 17) out.push({ id: "evening", label: "This evening", ms: atHour(0, 18) });
  out.push({ id: "tomorrow", label: "Tomorrow 9 AM", ms: atHour(1, 9) });
  const toSaturday = (6 - now.getDay() + 7) % 7 || 7;
  if (toSaturday > 1) out.push({ id: "weekend", label: "Saturday 10 AM", ms: atHour(toSaturday, 10) });
  return out;
}

const STEPS = new Map([
  ["daily", (d) => d.setDate(d.getDate() + 1)],
  ["weekdays", (d) => { do d.setDate(d.getDate() + 1); while (d.getDay() === 0 || d.getDay() === 6); }],
  ["weekly", (d) => d.setDate(d.getDate() + 7)],
  ["monthly", (d) => {
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + 1);
    d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  }],
  ["yearly", (d) => d.setFullYear(d.getFullYear() + 1)],
]);

// The next date for a repeating item, never in the past
export function nextDue(from, repeat) {
  const step = STEPS.get(repeat) ?? STEPS.get("daily");
  const d = new Date(from);
  step(d);
  for (let guard = 0; d.getTime() <= Date.now() && guard < 4000; guard++) step(d);
  return d.getTime();
}
