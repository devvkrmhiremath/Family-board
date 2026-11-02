// The boards this device has joined: [{ code, name, people }]. Names are cached
// from each board so the Boards list shows them instantly, even offline.
import { store } from "../core/store.js";

const KEY = "fb.boards";
const isBoardCode = (code) => typeof code === "string" && /^[a-z0-9-]{20,64}$/.test(code);

export const localBoards = {
  list() {
    const list = store.getJSON(KEY, []);
    return Array.isArray(list) ? list.filter((b) => isBoardCode(b?.code)) : [];
  },
  save(list) { store.setJSON(KEY, list); },
  get(code) { return this.list().find((b) => b.code === code); },
  upsert(code, patch = {}) {
    if (!isBoardCode(code)) return;
    const list = this.list();
    const i = list.findIndex((b) => b.code === code);
    if (i === -1) list.push({ code, name: "", people: [], ...patch });
    else list.splice(i, 1, { ...list.at(i), ...patch });
    this.save(list);
  },
  remove(code) { this.save(this.list().filter((b) => b.code !== code)); },
};

// Older versions remembered a single board; carry it over
if (!store.get(KEY) && store.get("fb.family")) localBoards.upsert(store.get("fb.family"));

export { isBoardCode };
