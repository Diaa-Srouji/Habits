# Habit tracker v16 (Vite)

Installable, offline-capable, syncs through Firebase. Hosted on Firebase Hosting.

## First-time setup
1. Install Node 18 or newer.
2. Copy your existing `firebase-config.js` into `src/` (same `export const firebaseConfig = {...}`).
3. `npm install`

## Everyday commands
- `npm run dev`      start a local dev server (http://localhost:5173), auto-reloads
- `npm run build`    create the `dist/` folder
- `npm run preview`  open the built site locally
- `npm test`         unit tests + the sync simulation (no install needed beyond Node)
- `npm run deploy`   test, build and publish to Firebase Hosting (see Deploy)

## Firestore (one document per habit)
Cloud layout, per user:
- `users/{uid}`                  the OLD single document. Read once to move your data, never written again (your backup).
- `users/{uid}/habits/{habitId}` one document per habit.
- `users/{uid}/meta/categories`  the categories. Its existence means "the move is done".

**Before the first run of this version**, publish the rules in `firestore.rules`
(Firebase Console > Firestore Database > Rules > paste > Publish). Without them the app shows
"update the Firestore rules" and keeps working on the device; your old data is not touched.

First sign-in after the update: the app copies the old document into per-habit documents
(status line: "Moving your data to the new format…"), then shows "Synced ✓". The old document stays as it was.
Open the new version on ONE device first and wait for "Synced ✓" before opening it on the others.

How edits merge: only the fields you changed are sent (a setting, or one date of one habit), so two devices that
change different habits, or different days of the same habit, never overwrite each other. If both change the very
same field, the later save wins. Edits made offline are kept on the device and sent when the connection is back.

Check the merging yourself (no Firebase needed, runs the real `src/sync.js` on simulated devices against a fake Firestore):
`npm run check:sync`

## Tests
`npm test` runs two things, both with plain Node (nothing extra to install):
- `tests/scoring.test.mjs`    streak, best, levelOf, dayScore, stop habits, skipped days, setAmt/norm
- `tests/sw-precache.test.mjs` the build step that writes the offline file list, and the manifest's icons
- `npm run check:sync`        the sync simulation described above
Dates in the tests are relative to today, so they never go out of date.

## Deploy (Firebase Hosting)
One-time setup:
1. `npx firebase-tools login`
2. Copy `.firebaserc.example` to `.firebaserc` and put your Firebase project id in it
   (or run `npx firebase-tools use --add`).
3. Publish the Firestore rules once: `npm run deploy:rules` (or paste `firestore.rules` into the console as before).

Every release: `npm run deploy` (runs the tests, builds, uploads `dist/`).
Your site is then at `https://<project-id>.web.app`. If you use a custom domain, add it under
Firebase Console > Authentication > Settings > Authorized domains. (`*.web.app`, `*.firebaseapp.com` and `localhost` are already allowed.)

`firebase.json` makes `sw.js`, `index.html` and `manifest.json` always revalidate, and caches the hashed files in `assets/` for a year,
so a new release shows up on the next visit while repeat visits stay fast.

## Installable app and offline
- `npm run build` writes the exact list of built files into `dist/sw.js` and names the cache after a hash of them
  (`tools/sw-precache.mjs`). Every build therefore gets a fresh cache and old ones are deleted. Nothing to edit by hand.
- The app is saved for offline use on the first visit. Edits made offline are sent when the connection is back.
- Install: Chrome / Edge / Android: menu > Install app. iPhone / iPad: Safari > Share > Add to Home Screen.
- Icons: `public/icon-*.png` and `apple-touch-icon.png` are drawn by `python3 tools/make-icons.py` (needs `pip install pillow`).
  Only re-run it if you change the artwork.

## Structure
src/util.js       date + text helpers
src/state.js      the shared state object
src/scoring.js    streaks, levels, scores, colours, import cleaning (no DOM)
src/categories.js defaults, cleaning and merging of categories
src/docs.js       per-habit document logic: field-level diff / merge, migration plan (no Firebase, no DOM)
src/sync.js       Firebase sign-in, per-habit cloud documents, one-time move, offline protection
src/router.js     hash routes: #/ (Home), #/c/<id> (category), #/h/<id> (habit)
src/heatmap.js    the reusable heatmap (large / medium / small), popover, keyboard access
src/home.js       the Home page: main heatmap + category buttons
src/render.js     picks the page from the address; habit detail view
src/events.js     clicks, forms, theme, sign-in, backup
src/main.js       starts everything
tools/sync-sim/   the simulation behind `npm run check:sync`
tools/sw-precache.mjs  Vite plugin: stamps the offline file list into dist/sw.js
tools/make-icons.py    draws the PNG icons
tests/            unit tests (`npm test`)
firebase.json     Hosting settings (what to upload, cache headers) and the rules file
firestore.rules   the security rules to paste into the Firebase console
public/           manifest.json, sw.js, icon.svg (copied as-is)
