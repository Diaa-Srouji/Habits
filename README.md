# Habit tracker with sync

Files: `index.html`, `style.css`, `app.js`, `firebase-config.js`. Keep them in the same folder.

## One-time setup (about 10 minutes, free)

1. Go to https://console.firebase.google.com and click **Add project** (Google Analytics is not needed).
2. **Build > Authentication > Get started > Email/Password**: enable it and save.
3. **Build > Firestore Database > Create database**: choose production mode and a region near you (for example `eur3` for Europe).
4. In Firestore, open the **Rules** tab, replace everything with the rules below, and click **Publish**. They let each person read and write only their own data.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

5. **Project settings (gear icon) > Your apps > Web (</>)**: register an app and copy the config values into `firebase-config.js`. These values are meant to be public. The rules above are what protect your data.
6. **Authentication > Settings > Authorized domains**: add `YOUR-USERNAME.github.io`.
7. Upload the four files to a public GitHub repository, then **Settings > Pages > Deploy from branch > main / root**. Your site appears at `https://YOUR-USERNAME.github.io/REPO-NAME`.

## Notes

- Opening `index.html` by double-clicking will not work, because browsers block ES modules on `file://`. Use GitHub Pages, or run `python3 -m http.server` in the folder and open http://localhost:8000.
- Anyone can create an account on a public site, but the rules keep each account's data separate. After you have made yours, you can turn off new sign-ups in Authentication > Settings.
- If you edit the same habit on two devices at the same moment, the last save wins.
