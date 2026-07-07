/*
 * store.js — Local data layer (no server, no subscription)
 * --------------------------------------------------------
 * Everything you log — food, workouts, bodyweight — lives in this browser via
 * localStorage. Free forever, private to your device. This is what replaces the
 * paid "premium" tiers of MyFitnessPal, Strong, and the rest.
 *
 * Pure CRUD + a couple of derived helpers (weekly average, today's totals).
 * No UI here.
 */

(function (global) {
  'use strict';

  const KEY = 'ptrainer_data_v1';

  const emptyDB = () => ({
    weight: [],   // [{ date: 'YYYY-MM-DD', kg: Number }]
    food: {},     // { 'YYYY-MM-DD': [{ name, kcal, protein }] }
    workout: {},  // { 'YYYY-MM-DD': { title, sets: { exerciseName: { w, r } } } }
    // exerciseName -> last logged { date, w, r } for quick "beat last time"
    lastLift: {},
  });

  function load() {
    try {
      return Object.assign(emptyDB(), JSON.parse(global.localStorage.getItem(KEY) || '{}'));
    } catch {
      return emptyDB();
    }
  }

  function save(db) {
    global.localStorage.setItem(KEY, JSON.stringify(db));
    return db;
  }

  const todayISO = () => new Date().toISOString().slice(0, 10);

  /* ----------------------------- Weight ----------------------------- */

  function logWeight(kg, date = todayISO()) {
    const db = load();
    const existing = db.weight.find((w) => w.date === date);
    if (existing) existing.kg = kg;
    else db.weight.push({ date, kg });
    db.weight.sort((a, b) => (a.date < b.date ? -1 : 1));
    return save(db).weight;
  }

  function getWeightSeries() {
    return load().weight;
  }

  /** Trailing 7-day average of the most recent entries (smooths daily noise). */
  function weeklyAvg(series = getWeightSeries()) {
    if (!series.length) return null;
    const last7 = series.slice(-7);
    return last7.reduce((s, w) => s + w.kg, 0) / last7.length;
  }

  /** Change between the two most recent 7-day windows (kg). Null if not enough data. */
  function weeklyTrend() {
    const s = getWeightSeries();
    if (s.length < 8) return null;
    const recent = s.slice(-7);
    const prior = s.slice(-14, -7);
    if (!prior.length) return null;
    const avg = (arr) => arr.reduce((a, w) => a + w.kg, 0) / arr.length;
    return avg(recent) - avg(prior);
  }

  /* ------------------------------ Food ------------------------------ */

  function addFood(entry, date = todayISO()) {
    const db = load();
    (db.food[date] = db.food[date] || []).push({
      name: String(entry.name || 'Food'),
      kcal: Number(entry.kcal) || 0,
      protein: Number(entry.protein) || 0,
    });
    return save(db).food[date];
  }

  function removeFood(index, date = todayISO()) {
    const db = load();
    if (db.food[date]) db.food[date].splice(index, 1);
    return save(db).food[date] || [];
  }

  function getFood(date = todayISO()) {
    return load().food[date] || [];
  }

  function foodTotals(date = todayISO()) {
    return getFood(date).reduce(
      (t, f) => ({ kcal: t.kcal + f.kcal, protein: t.protein + f.protein }),
      { kcal: 0, protein: 0 }
    );
  }

  /* ---------------------------- Workouts ---------------------------- */

  /** Save a top-set for an exercise on a date, and remember it as "last lift". */
  function logLift(exercise, weight, reps, date = todayISO()) {
    const db = load();
    const day = (db.workout[date] = db.workout[date] || { title: '', sets: {} });
    day.sets[exercise] = { w: Number(weight) || 0, r: Number(reps) || 0 };
    db.lastLift[exercise] = { date, w: Number(weight) || 0, r: Number(reps) || 0 };
    return save(db).lastLift[exercise];
  }

  function getLastLift(exercise) {
    return load().lastLift[exercise] || null;
  }

  function getWorkout(date = todayISO()) {
    return load().workout[date] || { title: '', sets: {} };
  }

  /* --------------------------- Utilities ---------------------------- */

  function exportJSON() {
    return JSON.stringify(load(), null, 2);
  }

  function importJSON(text) {
    const parsed = JSON.parse(text);
    return save(Object.assign(emptyDB(), parsed));
  }

  function clearAll() {
    global.localStorage.removeItem(KEY);
  }

  const Store = {
    todayISO,
    logWeight, getWeightSeries, weeklyAvg, weeklyTrend,
    addFood, removeFood, getFood, foodTotals,
    logLift, getLastLift, getWorkout,
    exportJSON, importJSON, clearAll,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Store;
  else global.Store = Store;
})(typeof window !== 'undefined' ? window : globalThis);
