// People on the board. Everyone is stored by a hidden id; items from before ids
// existed hold a name instead, which is still shown and matched.
import { h } from "../ui/dom.js";
import { segmented, chipGroup } from "../ui/controls.js";
import { state } from "./state.js";

export const memberById = (id) => state.members.find((m) => m.uid === id);
const looksLikeId = (s) => typeof s === "string" && s.length >= 20 && !/\s/.test(s);

export function nameOf(id) {
  if (!id) return "Someone";
  if (id === state.uid) return state.name || "You";
  return memberById(id)?.name || (looksLikeId(id) ? "Former member" : id);
}
export const isMe = (id) =>
  !!id && (id === state.uid || (!memberById(id) && !looksLikeId(id) && id === state.name));
export const others = () => state.members.filter((m) => m.uid !== state.uid);
export const amOwner = () => !!state.uid && state.ownerId === state.uid;

export const byChip = (id) =>
  h("span", { class: `chip ${isMe(id) ? "me" : "partner"}` }, isMe(id) ? "You" : nameOf(id));

// Everyone on the board can be picked. Two people fit a segmented control;
// bigger boards (parents, flatmates) switch to wrapping capsule buttons.
function whoOptions() {
  return [
    { value: "", label: others().length > 1 ? "Anyone" : "Either" },
    { value: state.uid || "", label: "Me" },
    ...others().map((m) => ({ value: m.uid, label: m.name })),
  ];
}

// Tasks from before hidden ids were assigned by name; find that person now
export function whoValue(v) {
  if (!v || memberById(v) || v === state.uid) return v;
  if (v === state.name) return state.uid;
  return others().find((m) => m.name === v)?.uid || "";
}

// Calendar: who's going (any number of people; none picked = everyone)
export function peoplePicker(current, onChange) {
  const picked = new Set(current);
  const toggle = (id) => {
    if (picked.has(id)) picked.delete(id); else picked.add(id);
    onChange([...picked]);
  };
  const chip = (label, pressed, run) => h("button", { type: "button", class: "chip-btn", "aria-pressed": String(pressed), onclick: run }, label);
  return h("div", { class: "chips", role: "group", "aria-label": "Who's going" },
    chip("Everyone", !picked.size, () => onChange([])),
    state.uid && chip("Me", picked.has(state.uid), () => toggle(state.uid)),
    others().map((m) => chip(m.name, picked.has(m.uid), () => toggle(m.uid))));
}
// Calendar: whose busy time this is (one person)
export function busyPicker(current, onPick) {
  const options = [{ value: state.uid || "", label: "Me" }, ...others().map((m) => ({ value: m.uid, label: m.name }))];
  return options.length <= 4 ? segmented("Who's busy", options, current, onPick) : chipGroup("Who's busy", options, current, onPick);
}
// "Everyone", "You and Priya", "Priya"
export function peopleLabel(ids) {
  if (!ids.length) return "Everyone";
  const names = ids.map((id) => (isMe(id) ? "You" : nameOf(id)));
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0];
}

export function whoPicker(current, onPick) {
  const options = whoOptions();
  return options.length <= 4
    ? segmented("Who's doing it", options, current, onPick)
    : chipGroup("Who's doing it", options, current, onPick);
}
