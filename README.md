# Family Board

Shared **tasks, reminders, groceries and notes** for families and friends. Everyone on a board sees changes live.
It's a web app that installs on iPhone and Android home screens like a native app. There's no app store and no build step.

## Features
- **Boards for every group**: "Our Home" with your partner, "Parents", "Goa Trip". Each has its own lists and its own people.
- **Live sync** between everyone's phones, and it **works offline** (changes sync when you're back online).
- **Tasks** with due dates, repeats, and "who's doing it"
- **Reminders** with one-tap times, snooze, and repeats (daily, weekdays, weekly, monthly, yearly)
- **Groceries** sorted by store aisle, with quantities (`2 milk`, `eggs x3`), "often bought" suggestions and a basket progress bar
- **Notes** with photos (shrunk on the phone; location data removed)
- **Search** across the board, **drag to reorder**, **swipe** to complete or delete, **Undo** for everything
- **Backup**: export a board to a file and import it again
- Follows Apple's design guidelines, with light and dark mode, Dynamic Type, 44 pt tap targets and WCAG AA contrast
- **iPhone, Android, iPad, Galaxy Fold, laptop and desktop**: tested from 280 px to 1920 px wide, in portrait and landscape

## Security model
- Every device signs in anonymously (no email or password) and gets a hidden id.
- A board can only be read or changed by its **members**, enforced on the server by [`firestore.rules`](firestore.rules).
- You join with an **invite link that expires after 7 days** (and can be stopped). The board owner sees everyone and can remove people.
- All data is checked by the server rules: field types, sizes, JPEG-only photos, no unknown fields.
- No code is loaded from other sites: the Firebase SDK is a pinned copy in [`vendor/`](vendor), and a strict Content Security Policy enforces this.

More detail is in [SECURITY.md](SECURITY.md).

## One-time setup

### 1. Firebase (free)
1. Create a project at <https://console.firebase.google.com> (Google Analytics isn't needed).
2. **Build → Firestore Database → Create database** (production mode, a location near you).
3. **Build → Authentication → Get started → Sign-in method → Anonymous → Enable → Save.**
4. **Firestore → Rules**: replace everything with [`firestore.rules`](firestore.rules) and **Publish**.
   (Or, with Node installed: `npm ci && npx firebase login && npm run deploy:rules`.)
5. **Project settings → Your apps → Web (`</>`)**: copy the `firebaseConfig` values into [`config.js`](config.js).

### 2. Lock the API key to your site (recommended)
The key in `config.js` is meant to be public, but you can stop anyone using it from another website:
1. Open <https://console.cloud.google.com/apis/credentials> and pick your Firebase project.
2. Open the key named **Browser key (auto created by Firebase)**.
3. **Application restrictions → Websites**: add `https://YOUR-NAME.github.io/*` (and `http://localhost:8765/*` if you test locally).
4. **API restrictions → Restrict key**: tick *Identity Toolkit API*, *Token Service API*, *Cloud Firestore API* and *Firebase Installations API*. Then **Save**.

### 3. Optional: App Check
App Check makes Firebase refuse requests that don't come from your app:
1. Create a reCAPTCHA v3 key at <https://www.google.com/recaptcha/admin> for your site's domain.
2. In Firebase: **App Check → Apps → your web app → reCAPTCHA v3**, and paste the secret key.
3. Put the site key in `config.js` as `appCheckSiteKey: "…"`.
4. Watch **App Check → APIs** for a day. When almost all requests show as verified, click **Enforce** for Cloud Firestore.

### 4. Publish (GitHub Pages)
**Settings → Pages → Deploy from a branch → `main` / `(root)`**. The app appears at `https://YOUR-NAME.github.io/Family-board/`.

### 5. Install on phones
- **iPhone**: open the link in Safari → **Share → Add to Home Screen**, then open Family Board from the Home Screen.
  (Do this first: the Home Screen app keeps its own storage, so it should be the one that joins.)
- **Android**: open the link in Chrome → tap **Install** (or **⋮ → Install app**). Long-press the icon for shortcuts to Groceries, Tasks and Reminders.
- To invite someone: open the person button on a board → **Invite People**.

## Upgrading from the earlier version
The first time the new version opens an old board, it upgrades it. Links from the old version keep working for **14 days** so everyone gets moved over. After that, use **Invite People**.

## Scale and cost
The free Firebase tier (50,000 reads and 20,000 writes a day) comfortably covers dozens of families. Each board only loads open items plus the 40 most recently ticked ones, and ticked items are cleared after 30 days (adjustable per board). Around 100 active people may sometimes go over the free reads. If that happens, switch to the pay-as-you-go plan with a $1 budget alert; typical cost at that size is cents per month.

## Development

```
npm ci                 # dev tools only; the app itself has no build step
npm run serve          # http://localhost:8765/?demo (demo mode saves on this device only)
npm run lint           # ESLint + security plugins
npm run check:sw       # offline file list and module preloads are complete
npm test               # lint + offline check + security rule tests (needs Java 21)
npm run test:e2e       # several browsers against the Firebase emulators (serve first)
npm run test:load      # 100 people on 30 boards writing at once
npm run test:perf      # frame rates on a 4× slowed CPU (serve first)
node tools/responsive.mjs  # every screen at 11 sizes, light and dark (serve first)
```

After changing any app file, bump `VERSION` in [`sw.js`](sw.js). Installed apps update themselves within seconds of being opened.

### Project layout
| Path | What it does |
| --- | --- |
| `index.html`, `styles.css` | Page structure, Content Security Policy and styles |
| `config.js` | Your Firebase settings |
| `src/main.js` | Start-up: wires the pieces together and opens the right screen |
| `src/core/` | Pure helpers: dates, groceries, photos, secure ids, storage, platform |
| `src/data/` | Data layer: Firebase, the on-device demo, the device's board list |
| `src/ui/` | Building blocks: DOM, icons, toasts, sheets, controls, motion, Back button |
| `src/views/` | What's drawn: rows, the add box, lists, Home, status screens |
| `src/features/` | One module per screen or feature: edit, search, boards, settings, invites, backup, install, lifecycle |
| `src/app/` | App state, people, actions, sessions, setup, rendering |
| `vendor/firebase/` | Pinned Firebase SDK (13.1.0, Apache-2.0) |
| `firestore.rules` | Server-side security rules |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline support and installation |
| `tests/`, `tools/` | Rule, end-to-end, load, performance and responsive tests |
| `.github/` | CI, CodeQL code scanning and Dependabot |
