// Entry point to the data layer. The app only ever sees one small API (sign in,
// create or join boards, live board data), whether it's backed by Firebase or by
// the on-device demo. Security is enforced by firestore.rules, not by this code.
import { firebaseConfig } from "../../config.js";

export const INVITE_DAYS = 7;
export const LEGACY_DAYS = 14;
export const DONE_WINDOW = 40; // recently ticked items kept loaded per board
export const OFTEN_MAX = 250;  // "often bought" names stored per board

// Problems the app explains on a screen rather than in a toast
export class SetupError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = "SetupError";
    this.code = code;
  }
}

export const isConfigured = !String(firebaseConfig.apiKey || "").startsWith("PASTE");

let servicePromise;
export function getService({ demo }) {
  if (!servicePromise) {
    // Firebase is only downloaded when it's actually used
    servicePromise = demo || !isConfigured
      ? import("./demo.js").then((m) => m.demoService())
      : import("./firebase.js").then((m) => m.firebaseService(firebaseConfig));
    servicePromise.catch(() => { servicePromise = null; }); // allow a retry after going online
  }
  return servicePromise;
}
