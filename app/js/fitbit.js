/*
 * fitbit.js — Fitbit Web API integration (browser, OAuth 2.0 + PKCE)
 * -----------------------------------------------------------------
 * Pulls the exact metrics the weekly check-in needs — steps, weight, sleep,
 * and resting heart rate — straight from the user's Fitbit account, so the
 * tracking section fills itself instead of being typed by hand.
 *
 * Security model: this is a *public* client (no server, no secret). We use the
 * Authorization Code flow with PKCE, which is the correct, secret-less pattern
 * for a static single-page app. The access token lives in localStorage.
 *
 * SETUP (see app/FITBIT.md):
 *   1. Register a free app at https://dev.fitbit.com/apps/new
 *        - OAuth 2.0 Application Type: "Client"
 *        - Redirect URL: the HTTPS URL where you host this app (e.g.
 *          https://you.github.io/personal-trainer/app/index.html)
 *   2. Put your Client ID + that same Redirect URL in app/js/fitbit-config.js
 *   3. Host the app over HTTPS (Fitbit rejects file:// and http:// redirects)
 */

(function (global) {
  'use strict';

  const AUTHORIZE_URL = 'https://www.fitbit.com/oauth2/authorize';
  const TOKEN_URL = 'https://api.fitbit.com/oauth2/token';
  const API = 'https://api.fitbit.com';
  const SCOPES = ['activity', 'heartrate', 'sleep', 'weight', 'profile'];

  const LS_TOKEN = 'fb_token';
  const LS_VERIFIER = 'fb_pkce_verifier';

  /* --------------------------- PKCE helpers ---------------------------- */

  function base64UrlEncode(bytes) {
    let str = '';
    bytes.forEach((b) => (str += String.fromCharCode(b)));
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function randomVerifier(length = 64) {
    const arr = new Uint8Array(length);
    global.crypto.getRandomValues(arr);
    // RFC 7636: verifier is 43-128 chars of the unreserved set. base64url is fine.
    return base64UrlEncode(arr).slice(0, length);
  }

  async function challengeFromVerifier(verifier) {
    const data = new TextEncoder().encode(verifier);
    const digest = await global.crypto.subtle.digest('SHA-256', data);
    return base64UrlEncode(new Uint8Array(digest));
  }

  /* ------------------------- Config & validation ----------------------- */

  function getConfig() {
    const cfg = global.FITBIT_CONFIG || {};
    return {
      clientId: cfg.clientId || '',
      redirectUri: cfg.redirectUri || (global.location ? global.location.href.split('?')[0] : ''),
    };
  }

  function isConfigured() {
    const { clientId } = getConfig();
    return Boolean(clientId && clientId !== 'YOUR_FITBIT_CLIENT_ID');
  }

  /* --------------------------- Auth flow ------------------------------- */

  /** Build the authorize URL (also returned for unit testing). */
  async function buildAuthUrl() {
    const { clientId, redirectUri } = getConfig();
    const verifier = randomVerifier();
    global.localStorage.setItem(LS_VERIFIER, verifier);
    const challenge = await challengeFromVerifier(verifier);
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      scope: SCOPES.join(' '),
      redirect_uri: redirectUri,
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  /** Kick off login: redirect the browser to Fitbit's consent screen. */
  async function connect() {
    if (!isConfigured()) {
      throw new Error('Fitbit is not configured. Add your Client ID in app/js/fitbit-config.js.');
    }
    global.location.href = await buildAuthUrl();
  }

  /** Exchange the ?code=... returned by Fitbit for an access token. */
  async function exchangeCode(code) {
    const { clientId, redirectUri } = getConfig();
    const verifier = global.localStorage.getItem(LS_VERIFIER);
    const body = new URLSearchParams({
      client_id: clientId,
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier || '',
      redirect_uri: redirectUri,
    });
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) throw new Error('Fitbit token exchange failed (' + res.status + ')');
    const token = await res.json();
    token.obtained_at = Date.now ? undefined : undefined; // timestamp set by caller if needed
    global.localStorage.setItem(LS_TOKEN, JSON.stringify(token));
    global.localStorage.removeItem(LS_VERIFIER);
    return token;
  }

  function getToken() {
    try {
      return JSON.parse(global.localStorage.getItem(LS_TOKEN) || 'null');
    } catch {
      return null;
    }
  }

  function isConnected() {
    return Boolean(getToken() && getToken().access_token);
  }

  function disconnect() {
    global.localStorage.removeItem(LS_TOKEN);
  }

  /**
   * If the page was loaded via Fitbit's redirect (?code=...), complete the
   * exchange and clean the URL. Returns true if a login was just completed.
   */
  async function handleRedirect() {
    if (!global.location) return false;
    const params = new URLSearchParams(global.location.search);
    const code = params.get('code');
    if (!code) return false;
    await exchangeCode(code);
    // Strip the query string so a refresh doesn't re-trigger the exchange.
    if (global.history && global.history.replaceState) {
      global.history.replaceState({}, document.title, getConfig().redirectUri);
    }
    return true;
  }

  /* ----------------------------- Data fetch ---------------------------- */

  async function apiGet(path) {
    const token = getToken();
    if (!token) throw new Error('Not connected to Fitbit.');
    const res = await fetch(API + path, {
      headers: { Authorization: 'Bearer ' + token.access_token },
    });
    if (res.status === 401) {
      disconnect();
      throw new Error('Fitbit session expired — please reconnect.');
    }
    if (!res.ok) throw new Error('Fitbit API error (' + res.status + ') on ' + path);
    return res.json();
  }

  /* ---- Response parsers (pure — unit-tested against sample payloads) --- */

  const parse = {
    steps: (json) => (json && json.summary ? json.summary.steps ?? null : null),
    restingHr: (json) => {
      const a = json && json['activities-heart'];
      return a && a[0] && a[0].value ? a[0].value.restingHeartRate ?? null : null;
    },
    sleepMinutes: (json) => (json && json.summary ? json.summary.totalMinutesAsleep ?? null : null),
    weightKg: (json) => {
      const w = json && json.weight;
      if (!w || !w.length) return null;
      const latest = w[w.length - 1];
      return latest.weight ?? null; // Fitbit returns in the user's unit; see note in FITBIT.md
    },
  };

  /**
   * Pull the latest snapshot for a given ISO date (YYYY-MM-DD).
   * Date must be passed in — this module never calls Date.now() itself so it
   * stays deterministic and testable.
   */
  async function fetchSnapshot(isoDate) {
    const [activity, heart, sleep, weight] = await Promise.all([
      apiGet(`/1/user/-/activities/date/${isoDate}.json`).catch(() => null),
      apiGet(`/1/user/-/activities/heart/date/${isoDate}/1d.json`).catch(() => null),
      apiGet(`/1.2/user/-/sleep/date/${isoDate}.json`).catch(() => null),
      apiGet(`/1/user/-/body/log/weight/date/${isoDate}.json`).catch(() => null),
    ]);
    return {
      date: isoDate,
      steps: activity ? parse.steps(activity) : null,
      restingHr: heart ? parse.restingHr(heart) : null,
      sleepMinutes: sleep ? parse.sleepMinutes(sleep) : null,
      weight: weight ? parse.weightKg(weight) : null,
    };
  }

  /* ------------------------------- Export ------------------------------ */

  const Fitbit = {
    isConfigured,
    isConnected,
    connect,
    disconnect,
    handleRedirect,
    exchangeCode,
    fetchSnapshot,
    buildAuthUrl,
    getToken,
    // exposed for tests:
    _parse: parse,
    _randomVerifier: randomVerifier,
    _challengeFromVerifier: challengeFromVerifier,
    _base64UrlEncode: base64UrlEncode,
    SCOPES,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Fitbit;
  } else {
    global.Fitbit = Fitbit;
  }
})(typeof window !== 'undefined' ? window : globalThis);
