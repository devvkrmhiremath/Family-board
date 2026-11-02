// "Add to my calendar": builds a standard .ics file (RFC 5545) on the phone, so
// iPhone, Android and desktop calendars can import events. Nothing leaves the
// device except the file the person chooses to open.
import { h } from "../ui/dom.js";
import { peopleOf } from "../core/calendar.js";

const RRULES = new Map([
  ["daily", "FREQ=DAILY"],
  ["weekdays", "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"],
  ["weekly", "FREQ=WEEKLY"],
  ["monthly", "FREQ=MONTHLY"],
  ["yearly", "FREQ=YEARLY"],
]);
const pad = (n) => String(n).padStart(2, "0");
const utc = (ms) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const utcDate = (ms) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, "");
const localDate = (ms) => { const d = new Date(ms); return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`; };
const localTime = (ms) => { const d = new Date(ms); return `${localDate(ms)}T${pad(d.getHours())}${pad(d.getMinutes())}00`; };
// Text values: escape \ ; , and line breaks; drop other control characters
const esc = (s) => String(s)
  .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "") // eslint-disable-line no-control-regex
  .replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
// Lines longer than 75 octets are folded (approximated by characters)
const fold = (line) => line.match(/.{1,73}/gu)?.join("\r\n ") ?? line;

function vevent(item, { nameOf, boardName }) {
  const people = peopleOf(item).map(nameOf);
  const title = item.busy ? `${people[0] || "Someone"}: ${item.text === "Busy" ? "Busy" : `Busy (${item.text})`}` : item.text;
  const lines = ["BEGIN:VEVENT", `UID:${item.id}@family-board`, `DTSTAMP:${utc(Date.now())}`, `SUMMARY:${esc(title)}`];
  if (item.allDay) {
    // All-day dates are stored as UTC midnight; DTEND is the day after the last day
    lines.push(`DTSTART;VALUE=DATE:${utcDate(item.due)}`, `DTEND;VALUE=DATE:${utcDate((item.end ?? item.due) + 864e5)}`);
  } else if (item.repeat) {
    // Floating local time keeps "every Monday 9:00" at 9:00 through clock changes
    lines.push(`DTSTART:${localTime(item.due)}`, `DTEND:${localTime(item.end ?? item.due + 36e5)}`);
  } else {
    lines.push(`DTSTART:${utc(item.due)}`, `DTEND:${utc(item.end ?? item.due + 36e5)}`);
  }
  if (RRULES.has(item.repeat)) lines.push(`RRULE:${RRULES.get(item.repeat)}`);
  const who = people.length ? `With ${people.join(", ")}. ` : "";
  lines.push(`DESCRIPTION:${esc(`${who}From ${boardName} on Family Board.`)}`);
  lines.push("TRANSP:OPAQUE", "END:VEVENT");
  return lines;
}

export function buildIcs(items, opts) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Family Board//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(opts.boardName)}`, ...items.flatMap((i) => vevent(i, opts)), "END:VCALENDAR"];
  return `${lines.map(fold).join("\r\n")}\r\n`;
}

// A download, not the share sheet: iPhone opens .ics files straight into an
// "Add to Calendar" preview, and Android hands them to the calendar app
export function downloadIcs(items, filename, opts) {
  const file = new File([buildIcs(items, opts)], filename, { type: "text/calendar" });
  const link = h("a", { href: URL.createObjectURL(file), download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 4000);
}
