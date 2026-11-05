# Zawmo for Android (Google Play)

The app is a **Trusted Web Activity** of https://zawmo.com: it opens the live site full screen
(no browser bar), so every `npm run deploy` reaches app users at once — no store update. A new
store release is needed only for the app shell itself: icon, name, splash, shortcuts, share
target, permissions, and Google's yearly target-SDK update.

What the site already does for the app (all in this repo):
- `src/app/manifest.ts` — icons, shortcuts (long press on the icon), `share_target` («شارك» → زاومو).
- `public/sw.js` + `src/app/AppShell.tsx` — offline screen (`public/offline.html`), gallery
  shares, notifications; `html[data-app]` hides the website footer inside the app.
- `src/app/.well-known/assetlinks.json/route.ts` — the site ↔ app link. Set `ANDROID_CERT_SHA256`
  in Vercel to the SHA-256 fingerprints (comma-separated) of **both** Play's app-signing key and
  the upload key (Play Console › Test and release › App integrity). Until then it serves `[]`
  and the app shows a small browser bar.

## Build (once the Play Console account exists)
1. `npm i -g @bubblewrap/cli` (it installs a JDK and the Android SDK on first run).
2. In this folder: `bubblewrap update` (reads `twa-manifest.json`, writes the Android project).
3. First time only: `bubblewrap build` creates `zawmo-upload.keystore` — keep it and its
   passwords safe and **out of git** (`.gitignore`); with Play App Signing a lost upload key
   can be reset by Google, but it takes days.
4. `bubblewrap build` → `app-release-bundle.aab`: upload it to the **closed testing** track.
5. Copy both fingerprints from App integrity into `ANDROID_CERT_SHA256`, redeploy, and check
   https://zawmo.com/.well-known/assetlinks.json.
6. A new shell release: raise `appVersionCode` (and `appVersionName`) here, `bubblewrap update`,
   then **copy `custom/` over `app/src/main/`** (step 7), `bubblewrap build`, upload.
7. `custom/` holds Zawmo's own changes to the generated project — `bubblewrap update` writes
   those files afresh, so copy them back after every update, before building:
   `cp -r custom/java custom/res app/src/main/`
   - `ZawmoShare.java` + the `LauncherActivity.java` hook + `res/xml/filepaths.xml`: photos shared
     from the gallery are copied into the app first and handed to Chrome from its own
     FileProvider (2026-11-05: a Tecno gallery's photo shares reached the site empty, videos fine).
     When a photo can't be copied, the share's text says why (`zawmo-share:…`) and the site
     reports it to Sentry as `share arrived empty (app:…)`.
