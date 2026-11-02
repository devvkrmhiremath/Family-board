// The Boards sheet: switch boards, create one, or join with an invite link.
import { LIMITS } from "../core/constants.js";
import { newBoardCode } from "../core/ids.js";
import { qs, h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { openSheet, closeSheet } from "../ui/sheets.js";
import { getService } from "../data/service.js";
import { localBoards } from "../data/local-boards.js";
import { state, demo, boardTitle } from "../app/state.js";
import { switchBoard } from "../app/session.js";
import { parseInvite } from "./invites.js";

const sheet = () => qs("#boards");
const BOARD_COLORS = ["#d30f45", "#3634a3", "#1e7b34", "#c93400", "#0a6ebd", "#8944ab", "#636366"];

function boardColor(code) {
  let n = 0;
  for (const c of code) n = (n * 31 + c.charCodeAt(0)) >>> 0;
  return BOARD_COLORS.at(n % BOARD_COLORS.length);
}

function renderList() {
  qs("#board-list").replaceChildren(...localBoards.list().map((b) => {
    const current = b.code === state.code;
    const people = Array.isArray(b.people) ? b.people.filter((p) => typeof p === "string") : [];
    return h("button", {
      type: "button", class: "board-row", role: "listitem", "aria-current": current ? "true" : null,
      onclick: () => { closeSheet(sheet()); switchBoard(b.code); },
    },
      h("span", { class: "board-mono", style: `background-color:${boardColor(b.code)}`, "aria-hidden": "true" }, boardTitle(b).charAt(0).toUpperCase()),
      h("span", { class: "board-row-text" },
        h("strong", {}, boardTitle(b)),
        h("span", {}, people.length > 1 ? people.join(", ") : "Just you so far")),
      current ? icon("check", "i board-check") : null);
  }));
}

function resetForms() {
  for (const kind of ["new", "join"]) {
    qs(`#${kind}-board-row`).hidden = true;
    qs(`#${kind}-board-btn`).setAttribute("aria-expanded", "false");
  }
  qs("#new-board-name").value = "";
  qs("#join-board-code").value = "";
  qs("#boards-error").textContent = "";
}

function toggleForm(kind) {
  const row = qs(`#${kind}-board-row`);
  const open = row.hidden;
  resetForms();
  row.hidden = !open;
  qs(`#${kind}-board-btn`).setAttribute("aria-expanded", String(open));
  if (open) qs("input", row).focus();
}

async function createBoard() {
  const name = qs("#new-board-name").value.trim().slice(0, LIMITS.boardName);
  if (!name) { qs("#boards-error").textContent = "Give the new board a name, like Parents or Goa Trip."; qs("#new-board-name").focus(); return; }
  const button = qs("#new-board-create");
  button.disabled = true;
  try {
    const service = await getService({ demo });
    const code = newBoardCode();
    await service.createBoard(code, name, state.name);
    localBoards.upsert(code, { name, people: ["You"] });
    closeSheet(sheet());
    switchBoard(code, { message: `Created ${name}. Invite people from the person button.` });
  } catch {
    qs("#boards-error").textContent = "Couldn't create the board. Check your connection and try again.";
  } finally {
    button.disabled = false;
  }
}

function joinBoard() {
  const invite = parseInvite(qs("#join-board-code").value.trim());
  if (!invite) { qs("#boards-error").textContent = "That doesn't look like an invite link. Paste the whole link you were sent."; qs("#join-board-code").focus(); return; }
  closeSheet(sheet());
  if (invite.code === state.code && !state.locked) return;
  switchBoard(invite.code, { invite: invite.token, message: "Joining…" });
}

const onEnter = (fn) => (e) => { if (e.key === "Enter") { e.preventDefault(); fn(); } };

export function initBoardsSheet() {
  qs("#open-boards").addEventListener("click", () => { resetForms(); renderList(); openSheet(sheet()); });
  qs("#new-board-btn").addEventListener("click", () => toggleForm("new"));
  qs("#join-board-btn").addEventListener("click", () => toggleForm("join"));
  qs("#new-board-create").addEventListener("click", createBoard);
  qs("#join-board-go").addEventListener("click", joinBoard);
  qs("#new-board-name").addEventListener("keydown", onEnter(createBoard));
  qs("#join-board-code").addEventListener("keydown", onEnter(joinBoard));
  qs("#boards-form").addEventListener("submit", (e) => e.preventDefault());
}
