// localStorage that never throws: private browsing, full storage or blocked site
// data just mean nothing is remembered on this device.
export const store = {
  get(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(key, value); } catch { /* storage unavailable: keep going */ }
  },
  del(key) {
    try { localStorage.removeItem(key); } catch { /* storage unavailable: keep going */ }
  },
  getJSON(key, fallback) {
    try { return JSON.parse(this.get(key)) ?? fallback; } catch { return fallback; }
  },
  setJSON(key, value) {
    this.set(key, JSON.stringify(value));
  },
};
