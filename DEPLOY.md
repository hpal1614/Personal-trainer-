# 🚀 Deploy & install on your iPhone

The app is a static PWA. A `gh-pages` branch is already pushed with the app at
its root, so hosting it on **GitHub Pages** is free and takes one toggle.

## 1. Turn on GitHub Pages (one time, ~10 seconds)
1. Go to your repo → **Settings** → **Pages** (left sidebar).
2. Under **Build and deployment → Source**, choose **Deploy from a branch**.
3. **Branch:** `gh-pages`  ·  **Folder:** `/ (root)`  → **Save**.
4. Wait ~1 minute. The page will show your live URL:

   **https://hpal1614.github.io/Personal-trainer-/**

That's it — it's live and public. Every time we update the app, re-running the
`gh-pages` push republishes it.

## 2. Install it on your iPhone
1. Open **https://hpal1614.github.io/Personal-trainer-/** in **Safari**.
2. Tap the **Share** button → **Add to Home Screen** → **Add**.
3. You now have a full-screen orange **Coach** app icon. It works offline.

## 3. (Optional) Enable Fitbit later
Once you know your live URL, follow [`app/FITBIT.md`](app/FITBIT.md): register a
free Fitbit app with that URL as the redirect, paste your Client ID into
`app/js/fitbit-config.js`, and re-push.

---

### Alternative: Vercel (also free)
If you prefer Vercel: go to **vercel.com → New Project → Import** this GitHub
repo. The included [`vercel.json`](vercel.json) already points the site root at
`app/`, so it deploys with no configuration. You'll get a `*.vercel.app` URL.

### Updating the live site (GitHub Pages)
From the repo root, re-publish the latest `app/` to `gh-pages`:
```bash
git subtree split --prefix app -b _ghp && git push -f origin _ghp:gh-pages && git branch -D _ghp
```
