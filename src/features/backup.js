// Export a board to a JSON file, and import one back. Imported files are treated
// as untrusted: only known fields with valid values are kept.
import { isType, REPEATS, LIMITS } from "../core/constants.js";
import { qs, h } from "../ui/dom.js";
import { toast } from "../ui/toast.js";
import { state } from "../app/state.js";
import { nameOf } from "../app/people.js";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "board";
const isTime = (v) => Number.isFinite(v) && v > 0 && v < 8.64e15;

function toBackupItem(x) {
  return {
    type: x.type, text: x.text, done: !!x.done, doneAt: x.doneAt || null, due: x.due || null,
    repeat: x.repeat || null, qty: x.qty || null, createdAt: x.createdAt,
    addedBy: nameOf(x.by), for: x.for ? nameOf(x.for) : null, hadPhoto: !!x.hasPhoto,
  };
}

// Only fields the app understands, each checked; everything else is dropped
export function fromBackupItem(x) {
  if (!x || typeof x !== "object" || !isType(x.type) || typeof x.text !== "string" || !x.text.trim()) return null;
  const item = { type: x.type, text: x.text.trim().slice(0, LIMITS.text), done: x.done === true };
  if (item.done) item.doneAt = isTime(x.doneAt) ? x.doneAt : Date.now();
  if (isTime(x.due)) item.due = x.due;
  if (REPEATS.has(x.repeat)) item.repeat = x.repeat;
  if (Number.isInteger(x.qty) && x.qty > 1 && x.qty <= LIMITS.qty) item.qty = x.qty;
  return item;
}

async function exportBoard() {
  if (!state.api) return;
  try {
    const items = await state.api.exportAll();
    const data = {
      app: "family-board", version: 2, board: state.boardName, exportedAt: new Date().toISOString(),
      items: items.map(toBackupItem),
    };
    const name = `family-board-${slug(state.boardName)}-${new Date().toISOString().slice(0, 10)}.json`;
    const file = new File([JSON.stringify(data, null, 1)], name, { type: "application/json" });
    // Phones: the share sheet offers "Save to Files" / "Save to Drive"; elsewhere, a download
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: `${state.boardName} backup` });
    } else {
      const link = h("a", { href: URL.createObjectURL(file), download: name });
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 2000);
    }
    toast(`Exported ${data.items.length} items`);
  } catch (e) {
    if (e?.name !== "AbortError") toast("Couldn't export. Check your connection.");
  }
}

async function importBoard(file) {
  if (!file || !state.api) return 0;
  if (file.size > MAX_FILE_BYTES) { toast("That file is too big to be a Family Board backup"); return 0; }
  let data;
  try { data = JSON.parse(await file.text()); } catch { data = null; }
  if (data?.app !== "family-board" || !Array.isArray(data.items)) { toast("That file isn't a Family Board backup"); return 0; }
  let n = 0;
  for (const raw of data.items.slice(0, LIMITS.importItems)) {
    const item = fromBackupItem(raw);
    if (!item) continue;
    state.api.add(item);
    n++;
  }
  toast(n ? `Imported ${n} items into ${state.boardName}` : "Nothing to import in that file");
  return n;
}

export function initBackup({ onDone }) {
  qs("#export-board").addEventListener("click", exportBoard);
  qs("#import-board").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (await importBoard(file)) onDone();
  });
}
