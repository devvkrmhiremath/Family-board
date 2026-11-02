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

export function whoPicker(current, onPick) {
  const options = whoOptions();
  return options.length <= 4
    ? segmented("Who's doing it", options, current, onPick)
    : chipGroup("Who's doing it", options, current, onPick);
}
