# Family Board 🏠💕

A shared board for two people: **tasks, reminders, a grocery list and notes**. Both of you see each other's changes live.
It runs in the browser and installs on the iPhone home screen like an app. There's no App Store and nothing to compile.

- Live sync between phones (Firebase Firestore, free tier)
- Works offline, and changes sync when you're back online
- Every item shows who added it, and who checked it off
- Tasks can be assigned to either of you
- Reminders have a date and time, and turn orange when they're near and red when they're overdue
- Groceries: type `milk, eggs, bread` to add three items at once
- Light and dark mode
- **Quick add from Home**: pick Task, Reminder, Grocery or Note and type
- **One-tap reminder times**: In 1 hour, This evening, Tomorrow 9 AM, Saturday, or pick a date
- **Undo** after deleting, clearing or checking something off (no "are you sure?" pop-ups)
- Grocery box suggests things you've bought before
- Sheets close by swiping down, tapping outside, or tapping ✕
- **Swipe** a row right to complete it, left to delete it
- Groceries are **sorted by aisle** (Fruit & veg, Dairy, Spices…) with a basket progress bar
- A pop-up tells you when your partner adds something while the app is open
- **Snooze** reminders in one tap (+1 hour, Tonight, Tomorrow, Next week)
- Animations: confetti when you tick things off, a celebration when a list is finished, sliding tabs, count-up numbers. Light haptic taps on iOS 18+. All motion turns off with iPhone's Reduce Motion setting
- Follows the iPhone's text size setting, big tap targets (44pt+), WCAG AA colour contrast, and Reduce Motion

## Design
The app follows Apple's Human Interface Guidelines so it feels at home on iPhone:
iOS system colours with true-black dark mode, SF font and text styles that follow your Text Size setting, a large title that collapses into a glass navigation bar, inset grouped lists, a floating glass tab bar with red badges, segmented controls, Reminders-style tiles and check circles, swipe actions, and sheets with Cancel / Save. All text meets WCAG AA contrast and every control is at least 44 pt.

## One-time setup (~10 minutes)

### 1. Create the free database (Firebase)
1. Go to <https://console.firebase.google.com> → **Add project** (Google Analytics isn't needed).
2. In the left menu: **Build → Firestore Database → Create database**. Pick a location near you and start in **production mode**.
3. Open the **Rules** tab, replace everything with the contents of [`firestore.rules`](firestore.rules), and click **Publish**.
4. Go to **Project settings (⚙️) → General → Your apps → Web (`</>`)**. Register an app (no hosting needed) and copy the `firebaseConfig` values into [`config.js`](config.js).

### 2. Put it online (GitHub Pages, free)
1. Commit and push `config.js`.
2. On GitHub: **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)` → Save**.
3. About a minute later the app is live at `https://<your-username>.github.io/Family-board/`.

### 3. Install on both iPhones
1. **You:** open the link in **Safari**, enter your name and leave the board code empty. This creates your board.
2. Tap **⚙️ → Share invite link** and send it to your partner (iMessage/WhatsApp).
3. **Both of you:** open the link in Safari, then tap **Share → Add to Home Screen**.
   Do this *after* the board opens, because the board code is saved in the home-screen icon's link.

## Privacy note
The board is protected by its long random code, the same way an unlisted link works. Anyone who has your invite link can open the board, so share it only with each other. To start over with a new code, use **⚙️ → Leave board** on both phones and create a new board.

## Try it without Firebase
Open the site with `?demo` at the end of the URL. Demo mode saves only on that one device, so nothing is shared.

## Updating the app
After you change any file, bump `VERSION` in `sw.js` so the phones download the new version. You may need to close and reopen the app twice.

## Files
| File | What it does |
| --- | --- |
| `index.html`, `styles.css`, `app.js` | The app |
| `config.js` | Your Firebase settings |
| `firestore.rules` | Database security rules (paste them into the Firebase console) |
| `manifest.webmanifest`, `sw.js`, `icons/` | Make it installable and let it work offline |
