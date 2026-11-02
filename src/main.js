// Start-up: connect the pieces, then open the right screen.
import { isView } from "./core/constants.js";
import { store } from "./core/store.js";
import { isIOS, isStandalone } from "./core/platform.js";
import { qsa } from "./ui/dom.js";
import { setupSheet } from "./ui/sheets.js";
import { isConfigured } from "./data/service.js";
import { localBoards } from "./data/local-boards.js";
import { state, demo } from "./app/state.js";
import { hooks } from "./app/hooks.js";
import { render, scheduleRender, setAfterBuild, setLockedActions } from "./app/render.js";
import { go } from "./app/actions.js";
import { openBoard, removeBoardHere } from "./app/session.js";
import { showSetup } from "./app/setup.js";
import { urlInvite } from "./features/invites.js";
import { openEdit, initEditSheet } from "./features/edit-sheet.js";
import { initSearch } from "./features/search-sheet.js";
import { initBoardsSheet } from "./features/boards-sheet.js";
import { initSettingsSheet } from "./features/settings-sheet.js";
import { initInstall } from "./features/install.js";
import { initLifecycle } from "./features/lifecycle.js";

Object.assign(hooks, { render, scheduleRender, openEdit, showSetup, setAfterBuild });
setLockedActions({
  onRetry: () => openBoard(state.code),
  onRemove: () => removeBoardHere(state.code),
});

for (const dlg of qsa("dialog.sheet, dialog.viewer")) setupSheet(dlg);
for (const tab of qsa("#tabbar button")) tab.addEventListener("click", () => go(tab.dataset.view));
initEditSheet();
initSearch();
initBoardsSheet();
initSettingsSheet();
initInstall();
initLifecycle();

// Home screen shortcuts (Android long-press, see manifest) open straight to a list
const shortcut = new URLSearchParams(location.search).get("view");
if (isView(shortcut)) { state.view = shortcut; store.set("fb.view", shortcut); }

(function boot() {
  const knownInvite = urlInvite && localBoards.get(urlInvite.code);
  const newInvite = urlInvite && !knownInvite;
  // iPhone Safari: install first, so the Home Screen app is the one that joins or creates
  // (it keeps separate storage from Safari). Android shares storage, so no need there.
  if (isIOS && !isStandalone() && !store.get("fb.safari") && (newInvite || !localBoards.list().length) && (isConfigured || demo)) {
    showSetup({ installFirst: true });
    return;
  }
  if (!state.name || (!newInvite && !state.code)) { showSetup(); return; }
  if (newInvite) { openBoard(urlInvite.code, { invite: urlInvite.token }); return; }
  // A link to a board we already have opens it, except when the installed app starts
  // up with the link it was installed from: then it reopens the board used last.
  if (knownInvite && !isStandalone()) { openBoard(urlInvite.code); return; }
  openBoard(state.code);
})();
