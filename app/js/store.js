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
    workout: {},  // { 'YYYY-MM-DD': { title, sets: { exerciseName: [{ w, r }, ...] } } }
    swaps: {},    // { defaultExerciseName: chosenAlternativeName }
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
  // A day's sets for an exercise are an ARRAY: [{ w, r }, ...] — one entry per
  // working set. Old data stored a single {w,r} object; normalizeSets() upgrades
  // it transparently on read so nobody loses history.

  function normalizeSets(v) {
    if (!v) return [];
    return Array.isArray(v) ? v : [v]; // migrate legacy single-set objects
  }

  /** Append one working set for an exercise on a date. Returns the day's sets. */
  function logSet(exercise, weight, reps, date = todayISO()) {
    const db = load();
    const day = (db.workout[date] = db.workout[date] || { title: '', sets: {} });
    const sets = normalizeSets(day.sets[exercise]);
    sets.push({ w: Number(weight) || 0, r: Number(reps) || 0 });
    day.sets[exercise] = sets;
    return save(db).workout[date].sets[exercise];
  }

  function removeSet(exercise, index, date = todayISO()) {
    const db = load();
    const day = db.workout[date];
    if (day && day.sets[exercise]) {
      const sets = normalizeSets(day.sets[exercise]);
      sets.splice(index, 1);
      day.sets[exercise] = sets;
      save(db);
      return sets;
    }
    return [];
  }

  function getSets(exercise, date = todayISO()) {
    return normalizeSets(getWorkout(date).sets[exercise]);
  }

  function getWorkout(date = todayISO()) {
    return load().workout[date] || { title: '', sets: {} };
  }

  /** Full history for an exercise: [{ date, sets }] newest-first, days with data only. */
  function getExerciseHistory(exercise) {
    const w = load().workout;
    return Object.keys(w)
      .filter((date) => normalizeSets(w[date].sets[exercise]).length)
      .sort((a, b) => (a < b ? 1 : -1))
      .map((date) => ({ date, sets: normalizeSets(w[date].sets[exercise]) }));
  }

  /** The most recent PRIOR session's sets for an exercise (to show "last time"). */
  function getLastSession(exercise, beforeDate = todayISO()) {
    const hist = getExerciseHistory(exercise).filter((h) => h.date < beforeDate);
    return hist.length ? hist[0] : null;
  }

  /* ----------------------- Exercise swaps --------------------------- */

  function setSwap(defaultExercise, chosen) {
    const db = load();
    if (!chosen || chosen === defaultExercise) delete db.swaps[defaultExercise];
    else db.swaps[defaultExercise] = chosen;
    return save(db).swaps;
  }

  function getSwap(defaultExercise) {
    return load().swaps[defaultExercise] || null;
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
    logSet, removeSet, getSets, getWorkout, getExerciseHistory, getLastSession,
    setSwap, getSwap,
    exportJSON, importJSON, clearAll,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Store;
  else global.Store = Store;
})(typeof window !== 'undefined' ? window : globalThis);
