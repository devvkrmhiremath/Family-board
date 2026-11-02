// "Put it on your Home Screen" tip. Android (Chrome, Edge, Samsung Internet)
// can offer a real install button; iPhone needs Share → Add to Home Screen.
import { store } from "../core/store.js";
import { isIOS, isAndroid, isStandalone } from "../core/platform.js";
import { h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { toast } from "../ui/toast.js";
import { hooks } from "../app/hooks.js";

let installPrompt = null;

export function initInstall() {
  addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // show our own button instead of the browser's mini bar
    installPrompt = e;
    hooks.scheduleRender();
  });
  addEventListener("appinstalled", () => {
    installPrompt = null;
    store.set("fb.hint.install", "0");
    toast("Installed. Open Family Board from your home screen.");
    hooks.scheduleRender();
  });
}

async function install() {
  if (!installPrompt) return;
  const prompt = installPrompt;
  installPrompt = null;
  await prompt.prompt();
  hooks.scheduleRender();
}

export function installHint() {
  if (isStandalone() || store.get("fb.hint.install") === "0") return null;
  if (!isIOS && !isAndroid && !installPrompt) return null;
  const dismiss = h("button", {
    class: "icon-btn", "aria-label": "Dismiss tip",
    onclick: () => { store.set("fb.hint.install", "0"); box.remove(); },
  }, icon("x"));
  let body;
  if (installPrompt) {
    body = h("p", {}, h("strong", {}, "Install Family Board. "), "It opens like an app and works offline.",
      h("button", { class: "btn primary install-btn", onclick: install }, icon("download"), "Install"));
  } else if (isIOS) {
    body = h("p", {}, h("strong", {}, "Put it on your Home Screen. "), "Tap ", icon("share", "i inline"), " Share at the bottom of Safari, then choose ", h("strong", {}, "Add to Home Screen"), ".");
  } else {
    body = h("p", {}, h("strong", {}, "Install it as an app. "), "Tap ", icon("menu", "i inline"), " in your browser, then ", h("strong", {}, "Install app"), " or ", h("strong", {}, "Add to Home screen"), ".");
  }
  const box = h("div", { class: "install-hint", role: "note" }, body, dismiss);
  return box;
}
