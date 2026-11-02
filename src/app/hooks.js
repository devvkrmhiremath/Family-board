// Late-bound hooks. Lower layers (views, actions, sheets) can ask for things that
// live higher up (re-render the screen, open the edit sheet, show the setup
// screen) without importing those modules, which keeps the import graph acyclic.
// main.js fills these in at start-up.
const notReady = () => { throw new Error("app hooks used before start-up"); };

export const hooks = {
  render: notReady,         // (options?) => void
  scheduleRender: notReady, // () => void
  openEdit: notReady,       // (item) => void
  showSetup: notReady,      // (options?) => void
  setAfterBuild: notReady,  // (fn) => void
};
