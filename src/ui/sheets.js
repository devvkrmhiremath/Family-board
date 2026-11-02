// Bottom sheets (native <dialog>). They close by tapping the dim background,
// Esc, Cancel/Done, dragging down by the grabber, or the Android Back button.
import { qsa } from "./dom.js";
import { reduceMotion } from "../core/platform.js";
import { pushLayer, popLayer } from "./history.js";

const owned = new WeakSet(); // sheets that currently hold a history entry

function finishClose(dlg) {
  dlg.close();
  dlg.classList.remove("closing");
  dlg.style.transform = "";
  dlg.style.transition = "";
}

export function openSheet(dlg) {
  dlg.classList.remove("closing");
  if (dlg.open) return;
  dlg.showModal();
  owned.add(dlg);
  pushLayer(() => { owned.delete(dlg); animateClose(dlg); });
}

function animateClose(dlg) {
  if (!dlg.open || dlg.classList.contains("closing")) return;
  if (reduceMotion.matches) { finishClose(dlg); return; }
  dlg.classList.add("closing");
  setTimeout(() => finishClose(dlg), 170);
}

export function closeSheet(dlg) {
  if (owned.has(dlg)) { owned.delete(dlg); popLayer(); }
  animateClose(dlg);
}

export function setupSheet(dlg) {
  dlg.addEventListener("click", (e) => { if (e.target === dlg) closeSheet(dlg); });
  dlg.addEventListener("cancel", (e) => { e.preventDefault(); closeSheet(dlg); });
  for (const b of qsa("[data-close]", dlg)) b.addEventListener("click", () => closeSheet(dlg));
  // Drag down from the grabber or title bar to dismiss
  let startY = null;
  let dy = 0;
  dlg.addEventListener("touchstart", (e) => {
    if (!e.target.closest(".sheet-grab, .sheet-bar") || e.target.closest("button")) return;
    startY = e.touches[0].clientY;
    dlg.style.transition = "none";
  }, { passive: true });
  dlg.addEventListener("touchmove", (e) => {
    if (startY == null) return;
    dy = Math.max(0, e.touches[0].clientY - startY);
    dlg.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  dlg.addEventListener("touchend", () => {
    if (startY == null) return;
    dlg.style.transition = "transform 200ms var(--ease-out)";
    if (dy > 90) {
      dlg.style.transform = "translateY(100%)";
      if (owned.has(dlg)) { owned.delete(dlg); popLayer(); }
      setTimeout(() => finishClose(dlg), 200);
    } else {
      dlg.style.transform = "";
    }
    startY = null;
    dy = 0;
  });
}
