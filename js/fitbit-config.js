/*
 * fitbit-config.js — YOUR Fitbit app settings.
 * --------------------------------------------
 * Fill these in after registering a free app at https://dev.fitbit.com/apps/new
 * See app/FITBIT.md for the full walkthrough.
 *
 * Until clientId is set, the app runs normally and the "Connect Fitbit" button
 * simply shows setup instructions instead of trying to log in.
 */
window.FITBIT_CONFIG = {
  // Paste the "OAuth 2.0 Client ID" from your Fitbit app dashboard:
  clientId: 'YOUR_FITBIT_CLIENT_ID',

  // Must EXACTLY match the "Redirect URL" you registered on dev.fitbit.com,
  // e.g. 'https://yourname.github.io/personal-trainer/app/index.html'.
  // Leave blank to auto-use the current page URL (handy while developing).
  redirectUri: '',
};
