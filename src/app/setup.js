// The welcome screen: your name, and either a new board or an invite link.
import { DEFAULT_BOARD_NAME, LIMITS } from "../core/constants.js";
import { store } from "../core/store.js";
import { newBoardCode } from "../core/ids.js";
import { qs, lines } from "../ui/dom.js";
import { getService, isConfigured } from "../data/service.js";
import { localBoards } from "../data/local-boards.js";
import { parseInvite, urlInvite } from "../features/invites.js";
import { state, demo } from "./state.js";
import { openBoard } from "./session.js";

const PROBLEMS = new Map([
  ["auth-disabled", "Sign-in is switched off for this app's database. In the Firebase console, open Authentication → Sign-in method and turn on Anonymous. Then reopen the app."],
  ["offline", "Couldn't reach the internet. Check your connection and try again."],
]);

function showProblem(err) {
  const box = qs("#setup-problem");
  box.textContent = PROBLEMS.get(err?.code) ?? PROBLEMS.get("offline");
  box.hidden = false;
}

async function submit(e, joining) {
  e.preventDefault();
  const error = qs("#setup-error");
  error.textContent = "";
  const name = qs("#setup-name").value.trim().slice(0, LIMITS.name);
  if (!name) { error.textContent = "Please type your name so everyone knows who added what."; qs("#setup-name").focus(); return; }
  let invite = joining ? urlInvite : null;
  const typed = qs("#setup-code").value.trim();
  if (!invite && typed) {
    invite = parseInvite(typed);
    if (!invite) { error.textContent = "That doesn't look like an invite link. Paste the whole link you were sent."; qs("#setup-code").focus(); return; }
  }
  state.name = name;
  store.set("fb.name", name);
  const button = qs("#setup-submit");
  button.disabled = true;
  button.textContent = invite ? "Joining…" : "Setting up…";
  try {
    if (invite) {
      await openBoard(invite.code, { invite: invite.token });
    } else {
      const service = await getService({ demo });
      const code = newBoardCode();
      await service.createBoard(code, DEFAULT_BOARD_NAME, name);
      localBoards.upsert(code, { name: DEFAULT_BOARD_NAME, people: ["You"] });
      await openBoard(code);
    }
  } catch (err) {
    showSetup({ problem: err });
  } finally {
    button.disabled = false;
    button.textContent = "Continue";
  }
}

export function showSetup({ installFirst = false, problem } = {}) {
  qs("#setup").hidden = false;
  qs("#app").hidden = true;
  qs("#setup-problem").hidden = true;
  if (problem) showProblem(problem);
  if (!isConfigured && !demo) { qs("#setup-noconfig").hidden = false; return; }
  const joining = !!urlInvite && !localBoards.get(urlInvite.code);
  qs("#setup-title").replaceChildren(...(joining ? lines("You're invited to", "Family Board") : lines("Welcome to", "Family Board")));
  // On iPhone the Home Screen app keeps its own storage, so it should be the one that joins
  if (installFirst) {
    qs("#setup-install").hidden = false;
    qs("#setup-form").hidden = true;
    qs("#setup-skip-install").onclick = () => {
      store.set("fb.safari", "1");
      qs("#setup-install").hidden = true;
      showSetup();
    };
    return;
  }
  qs("#setup-install").hidden = true;
  qs("#setup-form").hidden = false;
  qs("#setup-name").value = state.name;
  qs("#setup-join").hidden = !joining;
  qs("#setup-choose").hidden = joining;
  qs("#setup-form").onsubmit = (e) => submit(e, joining);
}
