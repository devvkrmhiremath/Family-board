// App-wide constants. Lookups use Maps so a value from outside (a URL, a stored
// item, a backup file) can never reach an unexpected object property.

export const TYPES = new Map([
  ["task", {
    title: "Tasks", short: "Task", one: "task", placeholder: "Add a task", icon: "task",
    empty: ["No tasks yet", "Add one above, choose who's doing it and, if you like, a date."],
  }],
  ["reminder", {
    title: "Reminders", short: "Reminder", one: "reminder", placeholder: "Remind us to…", icon: "bell",
    empty: ["No reminders", "Add one above and tap a time."],
  }],
  ["grocery", {
    title: "Groceries", short: "Grocery", one: "item", placeholder: "Add items (2 milk, eggs, bread)", icon: "cart",
    empty: ["Your list is empty", "Tip: add several at once, separated by commas. Start with a number for more than one."],
  }],
  ["note", {
    title: "Notes", short: "Note", one: "note", placeholder: "Write a note…", icon: "note",
    empty: ["No notes yet", "Handy for wifi passwords, gift ideas, recipes and photos of receipts."],
  }],
]);
export const typeInfo = (type) => TYPES.get(type);
export const isType = (type) => TYPES.has(type);

export const REPEATS = new Map([
  ["daily", "Every day"],
  ["weekdays", "Weekdays"],
  ["weekly", "Every week"],
  ["monthly", "Every month"],
  ["yearly", "Every year"],
]);

export const VIEW_ORDER = ["home", "task", "reminder", "grocery", "note"];
export const isView = (view) => VIEW_ORDER.includes(view);

export const DEFAULT_BOARD_NAME = "Our Home";
export const KEEP_DAY_OPTIONS = [7, 30, 90, 0]; // 0 = keep forever

// Limits shared with firestore.rules (the server enforces them too)
export const LIMITS = Object.freeze({ text: 2000, name: 30, boardName: 40, qty: 999, importItems: 1000 });
