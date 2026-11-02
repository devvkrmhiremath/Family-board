// The add box at the top of each list. On Home it has a type switch so anything
// can be added from one place.
import { TYPES, typeInfo, LIMITS } from "../core/constants.js";
import { timePresets, toLocalInput, fromLocalInput } from "../core/time.js";
import { capitalise } from "../core/groceries.js";
import { preparePhoto } from "../core/photo.js";
import { h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { toast } from "../ui/toast.js";
import { haptic } from "../ui/motion.js";
import { chipGroup, segmented, repeatPicker } from "../ui/controls.js";
import { state } from "../app/state.js";
import { whoPicker } from "../app/people.js";
import { addGroceries, addItem, addPulse } from "../app/actions.js";
import { hooks } from "../app/hooks.js";

function rerender() {
  const y = scrollY;
  hooks.render({ full: true });
  scrollTo(0, y);
}

function textField(type) {
  const info = typeInfo(type);
  const attrs = {
    name: "text", placeholder: info.placeholder, "aria-label": info.placeholder,
    maxlength: LIMITS.text, autocomplete: "off", autocapitalize: "sentences",
  };
  const field = type === "note"
    ? h("textarea", { ...attrs, rows: 2 })
    : h("input", { ...attrs, enterkeyhint: "done", list: type === "grocery" ? "grocery-history" : null });
  field.value = state.drafts.get(type) || "";
  field.addEventListener("input", () => state.drafts.set(type, field.value));
  return field;
}

function photoPicker() {
  return h("label", { class: "icon-btn tint photo-pick", "aria-label": "Attach a photo" },
    icon("camera"),
    h("input", {
      type: "file", accept: "image/*", class: "sr-only",
      onchange: async (e) => {
        const file = e.target.files[0];
        e.target.value = "";
        if (!file) return;
        try { state.notePhoto = await preparePhoto(file); rerender(); } catch { toast("Couldn't use that photo. Try a JPEG or PNG."); }
      },
    }));
}

// When it's due and whether it repeats (tasks and reminders)
function whenPicker(type, form) {
  const presets = timePresets({ allowNone: type === "task" });
  const fallback = type === "task" ? "none" : "tomorrow";
  const current = state.when.get(type);
  if (current !== "custom" && !presets.some((p) => p.id === current)) state.when.set(type, fallback);
  const options = [...presets.map((p) => ({ value: p.id, label: p.label })), { value: "custom", label: "Pick a date", icon: "calendar" }];
  const custom = h("input", {
    type: "datetime-local", class: "custom-when", "aria-label": "Date and time",
    value: state.customDue.get(type) || toLocalInput(presets.find((p) => p.id === "tomorrow").ms),
    onchange: (e) => state.customDue.set(type, e.target.value),
  });
  custom.hidden = state.when.get(type) !== "custom";
  form.dueValue = () => (state.when.get(type) === "custom"
    ? fromLocalInput(custom.value)
    : presets.find((p) => p.id === state.when.get(type))?.ms ?? null);
  const label = type === "task" ? "Due" : "When";
  return h("div", { class: "composer-extra" },
    h("p", { class: "label" }, label),
    h("div", { class: "when-row" },
      chipGroup(label, options, state.when.get(type), (v) => { state.when.set(type, v); rerender(); }, "scroll"),
      repeatPicker(state.repeat.get(type), (v) => { state.repeat.set(type, v); rerender(); })),
    custom);
}

export function composer(type, onHome) {
  const form = h("form", { class: "composer", novalidate: true });

  if (onHome) {
    form.append(segmented("What to add",
      [...TYPES].map(([value, t]) => ({ value, label: t.short })),
      type, (v) => { state.quickType = v; rerender(); }));
  }

  const field = textField(type);
  form.append(h("div", { class: "composer-row" }, field,
    type === "note" && photoPicker(),
    h("button", { class: "btn primary add-btn", type: "submit", "aria-label": `Add ${typeInfo(type).one}` }, icon("plus"))));

  if (type === "note" && state.notePhoto) {
    form.append(h("div", { class: "attached" },
      h("img", { src: state.notePhoto.thumb, alt: "Photo to attach" }),
      h("span", {}, "Photo attached"),
      h("button", { type: "button", class: "link-btn", onclick: () => { state.notePhoto = null; rerender(); } }, "Remove")));
  }
  // Groceries: suggest things you've bought before
  if (type === "grocery") {
    form.append(h("datalist", { id: "grocery-history" },
      Object.keys(state.often).slice(0, 300).map((n) => h("option", { value: capitalise(n) }))));
  }
  if (type === "reminder" || type === "task") form.append(whenPicker(type, form));
  if (type === "task") {
    form.append(h("div", { class: "composer-extra" },
      h("p", { class: "label" }, "Who's doing it"),
      whoPicker(state.who, (v) => { state.who = v; rerender(); })));
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    let value = field.value.trim();
    if (!value && type === "note" && state.notePhoto) value = "Photo";
    if (!value) { field.focus(); toast(`Type a ${typeInfo(type).one} first`); return; }
    if (!state.api) { toast("Still connecting, try again in a moment"); return; }
    let message;
    if (type === "grocery") {
      // "milk, 2 eggs, bread" adds three items; one already on the list gets its count raised
      message = addGroceries(value.split(/[,\n]/).map((s) => s.trim()).filter(Boolean));
    } else {
      const photo = type === "note" ? state.notePhoto : null;
      addItem(type, value, {
        due: form.dueValue?.() ?? null,
        repeat: state.repeat.get(type) || "",
        who: type === "task" ? state.who : "",
        photo,
      });
      if (photo) { state.notePhoto = null; rerender(); }
      message = onHome ? `Added to ${typeInfo(type).title}` : "Added";
    }
    field.value = "";
    state.drafts.set(type, "");
    field.focus();
    haptic();
    addPulse(form);
    toast(message);
  });
  return form;
}
