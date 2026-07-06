# Connecting Fitbit

The app can pull your **steps, weight, sleep, and resting heart rate** straight
from Fitbit so your weekly check-in fills itself instead of being typed by hand.

It uses the official **Fitbit Web API** with OAuth 2.0 + PKCE — the secure,
secret-less flow for a browser app. No server required.

---

## One-time setup (about 5 minutes)

### 1. Register a free Fitbit app
1. Go to **https://dev.fitbit.com/apps/new** and sign in with your Fitbit account.
2. Fill in the form. The values that matter:
   - **OAuth 2.0 Application Type:** `Client`
   - **Callback / Redirect URL:** the exact HTTPS URL where you host this app,
     e.g. `https://yourname.github.io/personal-trainer/app/index.html`
   - **Default Access Type:** `Read-Only` is enough.
3. Save. Copy the **OAuth 2.0 Client ID** it gives you.

### 2. Add your Client ID
Open [`js/fitbit-config.js`](js/fitbit-config.js) and paste it in:
```js
window.FITBIT_CONFIG = {
  clientId: 'ABC123',                       // ← your Client ID
  redirectUri: 'https://yourname.github.io/personal-trainer/app/index.html',
};
```
`redirectUri` **must exactly match** what you registered on Fitbit (protocol,
path, trailing slash — all of it).

### 3. Host over HTTPS
Fitbit will not redirect back to a `file://` or plain `http://` page. Any free
static host works:
- **GitHub Pages** — push this repo, enable Pages, use the Pages URL.
- **Netlify / Vercel** — drag-and-drop or connect the repo.

Then open the hosted page and click **Connect Fitbit** in the *Track* tab.

---

## What it reads (and doesn't)

| Metric | Fitbit endpoint | Used for |
|--------|-----------------|----------|
| Steps | `/1/user/-/activities/date/{date}.json` | Daily step target |
| Resting HR | `/1/user/-/activities/heart/date/{date}/1d.json` | Recovery biofeedback |
| Sleep | `/1.2/user/-/sleep/date/{date}.json` | Recovery biofeedback |
| Weight | `/1/user/-/body/log/weight/date/{date}.json` | Weekly weight trend |

- **Read-only.** The app never writes to your Fitbit account.
- Your access token is stored **only in your browser** (`localStorage`) — it is
  never sent anywhere except Fitbit's own API.
- **Units:** Fitbit returns weight in the unit set on your Fitbit profile
  (kg or lb). Set your Fitbit profile to match the units you use here.
- **Rate limit:** 150 requests/hour per user — far more than this app needs.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Clicking Connect shows setup instructions | `clientId` is still the placeholder — add yours in `fitbit-config.js`. |
| Fitbit shows "redirect_uri mismatch" | The `redirectUri` in config doesn't exactly match the one registered on dev.fitbit.com. |
| "session expired — reconnect" | Fitbit access tokens expire (8 h). Just click Connect again. |
| Nothing happens locally | You're on `file://`/`http://`. Host over HTTPS. |

> Token **refresh** (silent re-auth after 8 h) isn't implemented in this static
> build because it requires storing a refresh token safely. For a personal app,
> reconnecting when prompted is fine. For a multi-user product, add a small
> backend to hold the refresh token.
