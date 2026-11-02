// App lifecycle: keep times fresh, finish pending deletes when the app is left,
// and install updates (service worker) without anyone closing the app twice.
import { qs } from "../ui/dom.js";
import { flushDeletes } from "../app/actions.js";
import { hooks } from "../app/hooks.js";
import { clearRowCache } from "../views/rows.js";

function refreshOnReturn() {
  if (document.hidden) { flushDeletes(); return; }
  if (!qs("#app").hidden) hooks.render();
  // Phones rarely check for app updates on their own; ask whenever the app comes back
  navigator.serviceWorker?.getRegistration().then((r) => r?.update()).catch(() => { /* offline */ });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register("sw.js").catch(() => { /* the app still works online */ });
  // A new version took over: reload into it now, or, if you're typing or have a
  // sheet open, the next time you leave the app
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController) return;
    const busy = document.activeElement?.matches?.("input, textarea") || document.querySelector("dialog[open]");
    if (busy) document.addEventListener("visibilitychange", () => location.reload(), { once: true });
    else location.reload();
  });
}

export function initLifecycle() {
  // Refresh the greeting, "5m ago" times and overdue colours every minute
  setInterval(() => {
    if (qs("#app").hidden) return;
    clearRowCache();
    hooks.render();
  }, 60000);
  // iOS freezes a Home Screen app in the background and shows the frozen screen on
  // return; visibilitychange alone doesn't always fire there, so listen to all of these
  document.addEventListener("visibilitychange", refreshOnReturn);
  addEventListener("pageshow", refreshOnReturn);
  addEventListener("focus", refreshOnReturn);
  document.addEventListener("resume", refreshOnReturn);
  addEventListener("pagehide", flushDeletes);
  registerServiceWorker();
}
