// The edit sheet: text, quantity, due date, repeat, who's doing it, photo, delete.
import { typeInfo, REPEATS, LIMITS } from "../core/constants.js";
import { ago, toLocalInput, fromLocalInput, roundUp5, atHour, nextDue, DAY } from "../core/time.js";
import { capitalise } from "../core/groceries.js";
import { preparePhoto, isSafeImageData } from "../core/photo.js";
import { qs, qsa, h } from "../ui/dom.js";
import { toast } from "../ui/toast.js";
import { haptic } from "../ui/motion.js";
import { openSheet, closeSheet } from "../ui/sheets.js";
import { state } from "../app/state.js";
import { nameOf, isMe, whoPicker, whoValue } from "../app/people.js";
import { removeWithUndo, forgetRow } from "../app/actions.js";

const sheet = () => qs("#edit");
let editing = null;
let editWho = "";
let editQty = 1;
let editPhoto; // undefined: unchanged, null: removed, { full, thumb }: new

function renderWho() {
  qs("#edit-who").replaceChildren(whoPicker(editWho, (v) => { editWho = v; renderWho(); }));
}

// One-tap dates. Fills the date field; Save keeps it.
function renderQuickDates(due) {
  const base = Math.max(Date.now(), due || 0);
  const options = [
    due && { label: "+1 hour", ms: roundUp5(base + 3600e3) },
    new Date().getHours() < 19 && { label: "Tonight 8 PM", ms: atHour(0, 20) },
    { label: "Tomorrow 9 AM", ms: atHour(1, 9) },
    { label: "Next week", ms: atHour(7, 9) },
  ].filter(Boolean);
  qs("#edit-snooze").replaceChildren(...options.map((o) => h("button", {
    type: "button", class: "chip-btn", "aria-pressed": "false",
    onclick: (e) => {
      qs("#edit-due").value = toLocalInput(o.ms);
      for (const b of qsa("#edit-snooze button")) b.setAttribute("aria-pressed", String(b === e.currentTarget));
      haptic();
    },
  }, o.label)));
}

function showPhoto(src) {
  const ok = isSafeImageData(src);
  qs("#edit-photo-view").hidden = !ok;
  qs("#edit-photo-remove").hidden = !ok;
  qs("#edit-photo-add-label").textContent = ok ? "Replace Photo" : "Add Photo";
  if (ok) qs("#edit-photo-img").src = src;
}

function setQty(n) {
  editQty = Math.min(LIMITS.qty, Math.max(1, n));
  qs("#edit-qty").textContent = editQty;
  qs("#qty-minus").disabled = editQty === 1;
}

export function openEdit(item) {
  editing = item;
  editPhoto = undefined;
  const noun = capitalise(typeInfo(item.type).one);
  const timed = item.type === "reminder" || item.type === "task";
  qs("#edit-title").textContent = `Edit ${noun}`;
  qs("#edit-delete").textContent = `Delete ${noun}`;
  qs("#edit-text").value = item.text;
  qs("#edit-text").rows = item.type === "note" ? 8 : 3;
  qs("#edit-qty-wrap").hidden = item.type !== "grocery";
  setQty(item.qty || 1);
  qs("#edit-due-wrap").hidden = !timed;
  qs("#edit-due-label").textContent = item.type === "task" ? "Due" : "Date & time";
  qs("#edit-due").value = toLocalInput(item.due);
  if (timed) renderQuickDates(item.due);
  qs("#edit-repeat-wrap").hidden = !timed;
  qs("#edit-repeat").value = REPEATS.has(item.repeat) ? item.repeat : "";
  qs("#edit-who-wrap").hidden = item.type !== "task";
  editWho = whoValue(item.for || "");
  renderWho();
  qs("#edit-photo-wrap").hidden = item.type !== "note";
  if (item.type === "note") {
    showPhoto(item.thumb || null);
    if (item.hasPhoto) {
      state.api?.loadPhoto(item.id)
        .then((src) => { if (editing === item && editPhoto === undefined && isSafeImageData(src)) qs("#edit-photo-img").src = src; })
        .catch(() => { /* the thumbnail stays */ });
    }
  }
  qs("#edit-meta").textContent = `Added by ${isMe(item.by) ? "you" : nameOf(item.by)}, ${ago(item.createdAt)}`;
  openSheet(sheet());
}

function save(e) {
  e.preventDefault();
  const item = editing;
  const text = qs("#edit-text").value.trim().slice(0, LIMITS.text);
  if (!item || !state.api) return;
  if (!text) { qs("#edit-text").focus(); toast("Text can't be empty. Use Delete to remove it."); return; }
  const patch = { text };
  if (item.type === "grocery") patch.qty = editQty > 1 ? editQty : null;
  if (item.type === "reminder" || item.type === "task") {
    const repeat = qs("#edit-repeat").value;
    patch.due = fromLocalInput(qs("#edit-due").value);
    patch.repeat = REPEATS.has(repeat) ? repeat : null;
    if (patch.repeat && !patch.due) patch.due = nextDue(Date.now() - DAY, patch.repeat);
  }
  if (item.type === "task") patch.for = editWho || null;
  if (item.type === "note" && editPhoto !== undefined) {
    if (editPhoto) {
      patch.thumb = editPhoto.thumb;
      patch.hasPhoto = true;
      state.api.savePhoto(item.id, editPhoto.full).catch(() => toast("Couldn't upload the photo"));
    } else {
      patch.thumb = null;
      patch.hasPhoto = false;
      state.api.deletePhoto(item.id).catch(() => { /* already gone */ });
    }
  }
  forgetRow(item.id);
  state.api.update(item.id, patch).catch(() => toast("Couldn't save. Check your connection."));
  closeSheet(sheet());
  toast("Saved");
}

function openViewer(src) {
  if (!isSafeImageData(src)) return;
  qs("#viewer-img").src = src;
  openSheet(qs("#viewer"));
}

export function initEditSheet() {
  qs("#qty-minus").addEventListener("click", () => { setQty(editQty - 1); haptic(); });
  qs("#qty-plus").addEventListener("click", () => { setQty(editQty + 1); haptic(); });
  qs("#edit-due-clear").addEventListener("click", () => { qs("#edit-due").value = ""; });
  qs("#edit-photo-input").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try { editPhoto = await preparePhoto(file); showPhoto(editPhoto.full); } catch { toast("Couldn't use that photo. Try a JPEG or PNG."); }
  });
  qs("#edit-photo-remove").addEventListener("click", () => { editPhoto = null; showPhoto(null); });
  qs("#edit-photo-view").addEventListener("click", () => openViewer(qs("#edit-photo-img").src));
  qs("#edit-form").addEventListener("submit", save);
  qs("#edit-delete").addEventListener("click", () => {
    if (!editing) return;
    closeSheet(sheet());
    removeWithUndo([editing], "Deleted");
  });
}
