// Back button support. On Android (and in desktop browsers) the system Back
// button should close the sheet on top, or step back to Home, instead of leaving
// the app. Each open layer (a sheet, or a tab other than Home) gets a history
// entry; Back pops the newest layer.
const layers = [];
let ignoreNextPop = 0;

export function pushLayer(close) {
  layers.push(close);
  history.pushState({ fbLayer: layers.length }, "");
}

// Called when a layer is closed from the app itself: drop its history entry too
export function popLayer() {
  if (!layers.length) return;
  layers.pop();
  ignoreNextPop++;
  history.back();
}

export const layerCount = () => layers.length;

addEventListener("popstate", () => {
  if (ignoreNextPop > 0) { ignoreNextPop--; return; }
  const close = layers.pop();
  close?.();
});
