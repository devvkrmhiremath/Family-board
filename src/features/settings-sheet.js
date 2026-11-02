// Board settings: name, people (the owner can remove them), invite links, how
// long ticked items are kept, your name, backup, and leaving the board.
import { KEEP_DAY_OPTIONS, LIMITS } from "../core/constants.js";
import { store } from "../core/store.js";
import { fmtDate } from "../core/time.js";
import { reduceMotion } from "../core/platform.js";
import { qs, h } from "../ui/dom.js";
import { toast } from "../ui/toast.js";
import { segmented } from "../ui/controls.js";
import { openSheet, closeSheet } from "../ui/sheets.js";
import { localBoards } from "../data/local-boards.js";
import { state } from "../app/state.js";
import { amOwner } from "../app/people.js";
import { flushDeletes } from "../app/actions.js";
import { maybeCleanup, leaveToNextBoard } from "../app/session.js";
import { hooks } from "../app/hooks.js";
import { shareInvite } from "./invites.js";
import { initBackup } from "./backup.js";

const sheet = () => qs("#settings");

// Destructive actions ask inside the sheet, like an iOS action sheet
let confirmAction = null;
function askConfirm(text, yesLabel, action) {
  qs("#confirm-text").textContent = text;
  qs("#confirm-yes").textContent = yesLabel;
  confirmAction = action;
  qs("#confirm-leave").hidden = false;
  qs("#confirm-leave").scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth", block: "nearest" });
}

function memberRow(m) {
  const me = m.uid === state.uid;
  return h("div", { class: "member-row", role: "listitem" },
    h("span", { class: `avatar${me ? " me" : ""}`, "aria-hidden": "true" }, (m.name || "?").charAt(0).toUpperCase()),
    h("span", { class: "member-name" }, m.name, me ? h("span", { class: "muted" }, " (you)") : null),
    m.uid === state.ownerId && h("span", { class: "owner-tag" }, "Owner"),
    amOwner() && !me && h("button", {
      type: "button", class: "link-btn remove-member",
      onclick: () => askConfirm(`Remove ${m.name} from “${state.boardName}”? They'll lose access straight away.`, "Remove", () => {
        state.api.removeMember(m.uid)
          .then(() => toast(`Removed ${m.name}`))
          .catch(() => toast("Couldn't remove. Check your connection."));
      }),
    }, "Remove"));
}

function renderMembers() {
  const people = [...state.members].sort((a, b) => (b.uid === state.uid) - (a.uid === state.uid) || (a.joinedAt - b.joinedAt));
  qs("#settings-members").replaceChildren(...(people.length ? people : [{ uid: state.uid, name: state.name }]).map(memberRow));
  let note = "";
  if (state.legacyUntil > Date.now()) {
    note = `Links from the older version of the app still let people join until ${fmtDate(state.legacyUntil)}. After that, use Invite People.`;
  } else if (amOwner()) {
    note = "As the owner, you can remove people.";
  }
  qs("#settings-members-note").textContent = note;
}

function renderKeep() {
  const label = (days) => (days ? `${days} days` : "Forever");
  qs("#settings-keep").replaceChildren(segmented("Keep ticked items",
    KEEP_DAY_OPTIONS.map((days) => ({ value: days, label: label(days) })),
    state.keepDays, (days) => {
      state.keepDays = days;
      state.api?.setKeepDays(days)
        .then(() => maybeCleanup({ force: true }))
        .catch(() => toast("Couldn't save. Check your connection."));
      renderKeep();
    }));
}

function open() {
  qs("#settings-name").value = state.name;
  qs("#settings-board-name").value = state.boardName;
  qs("#confirm-leave").hidden = true;
  const ready = !!state.api;
  for (const id of ["#share-invite", "#cancel-invites", "#export-board", "#import-board"]) qs(id).disabled = !ready;
  renderMembers();
  renderKeep();
  openSheet(sheet());
}

function save(e) {
  e.preventDefault();
  const name = qs("#settings-name").value.trim().slice(0, LIMITS.name);
  const boardName = qs("#settings-board-name").value.trim().slice(0, LIMITS.boardName);
  const changes = [];
  if (name && name !== state.name) {
    state.name = name;
    store.set("fb.name", name);
    // Your name lives on each board you're on
    if (state.service) {
      for (const b of localBoards.list()) state.service.board(b.code).setMyName(name).catch(() => { /* not a member any more */ });
    }
    changes.push("name");
  }
  if (boardName && boardName !== state.boardName && state.api) {
    state.boardName = boardName;
    localBoards.upsert(state.code, { name: boardName });
    state.api.rename(boardName).catch(() => toast("Couldn't rename the board. Check your connection."));
    changes.push("board name");
  }
  if (changes.length) {
    hooks.render({ full: true });
    toast(changes.length === 2 ? "Saved" : `Updated ${changes[0]}`);
  }
  closeSheet(sheet());
}

async function leave() {
  const code = state.code;
  const name = state.boardName;
  flushDeletes();
  try { await state.api?.leave(); } catch { toast("Couldn't leave. Check your connection."); return; }
  closeSheet(sheet());
  localBoards.remove(code);
  leaveToNextBoard(`Left ${name}`);
}

export function initSettingsSheet() {
  qs("#open-settings").addEventListener("click", open);
  qs("#share-invite").addEventListener("click", shareInvite);
  qs("#cancel-invites").addEventListener("click", () => askConfirm("Stop every unused invite link for this board? People already on it stay.", "Stop Links", async () => {
    try {
      const n = await state.api.cancelInvites();
      toast(n ? `Stopped ${n} invite link${n > 1 ? "s" : ""}` : "No unused invite links");
    } catch {
      toast("Couldn't stop the links. Check your connection.");
    }
  }));
  qs("#confirm-no").addEventListener("click", () => { qs("#confirm-leave").hidden = true; confirmAction = null; });
  qs("#confirm-yes").addEventListener("click", () => {
    const action = confirmAction;
    confirmAction = null;
    qs("#confirm-leave").hidden = true;
    action?.();
  });
  qs("#leave-board").addEventListener("click", () => askConfirm(`Leave “${state.boardName}”?`, "Leave", leave));
  qs("#settings-form").addEventListener("submit", save);
  initBackup({ onDone: () => closeSheet(sheet()) });
}
