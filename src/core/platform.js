// What device and mode the app is running in.
const ua = navigator.userAgent;

// iPadOS reports itself as a Mac; touch support gives it away
export const isIOS = /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
export const isAndroid = /android/i.test(ua);

// Opened from the Home Screen (iOS) or installed as an app (Android, desktop)
export const isStandalone = () =>
  navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;

export const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
