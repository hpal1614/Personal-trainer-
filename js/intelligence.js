/*
 * intelligence.js — The Coach Brain (Layer 2, Feature 001)
 * --------------------------------------------------------
 * Turns stored fitness data into structured CoachSignals. Pure, no DOM. The UI
 * never calculates — it will only render what getSignals()/getTopFocus() return.
 *
 * The Coach Brain's three responsibilities:
 *   Raw data  →  UNDERSTAND (providers emit signals)
 *             →  PRIORITIZE (rank by impact)
 *             →  RECOMMEND  (surface the single top focus — Principle 6)
 * Exposed as global `CoachBrain` (alias `Intelligence`).
 *
 * Architecture: docs/INTELLIGENCE-ENGINE.md
 * This foundation is deterministic (Tier 1). Providers can later be upgraded to
 * on-device ML / cloud behind the SAME CoachSignal contract without UI changes.
 *
 * A provider is a pure function (ctx) -> CoachSignal[]. Add a feature by adding a
 * provider; never by branching in the UI.
 */

(function (global) {
  'use strict';

  /* ----------------------------- helpers ------------------------------- */

  const est1RM = (w, r) => w * (1 + r / 30); // Epley

  function bestSet(sets) {
    return (sets || []).reduce((b, s) => {
      const e = est1RM(s.w, s.r);
      return !b || e > b.e ? { w: s.w, r: s.r, e } : b;
    }, null);
  }

  // Priority = severity weight × confidence. Used by getTopFocus (Principle 6).
  const SEV_BASE = { alert: 100, watch: 72, good: 58, info: 34 };
  const rank = (sev, conf) => Math.round((SEV_BASE[sev] || 30) * conf);

  /* -------------------------- Context builder -------------------------- */
  /**
   * Assemble a read-only snapshot for providers. The engine (not the UI) is the
   * only thing that touches raw data. store/coach are injectable for testing.
   */
  function buildContext(opts = {}) {
    const S = opts.store || global.Store;
    const C = opts.coach || global.Coach;
    let input = opts.input;
    if (input === undefined && global.localStorage) {
      try { input = JSON.parse(global.localStorage.getItem('lastPlanInput') || 'null'); } catch { input = null; }
    }
    const today = opts.today || (S && S.todayISO ? S.todayISO() : null);
    const plan = opts.plan || (input && C && C.buildPlan ? C.buildPlan(input) : null);
    return { today, profile: input || null, plan: plan || null, store: S || null, coach: C || null };
  }

  /* ----------------------------- providers ----------------------------- */

  /** Lift stall: no new estimated-1RM high across the last 3 sessions. */
  function liftStallProvider(ctx) {
    const S = ctx.store;
    if (!S || !S.loggedExercises) return [];
    const out = [];
    S.loggedExercises().forEach((ex) => {
      const hist = S.getExerciseHistory(ex); // newest-first
      if (hist.length < 3) return;
      const chrono = [...hist].reverse();
      const e = chrono.map((h) => { const b = bestSet(h.sets); return b ? b.e : 0; });
      const window = e.slice(-3);
      const baseline = e.length > 3 ? Math.max(...e.slice(0, -3)) : e[0];
      const recentMax = Math.max(...window);
      if (recentMax <= baseline + 1e-6) {
        const conf = Math.min(0.9, 0.55 + 0.1 * (hist.length - 3));
        out.push({
          id: `lift_stall:${ex}`, type: 'lift_stall', subject: ex,
          severity: 'watch', confidence: Number(conf.toFixed(2)), priority: rank('watch', conf),
          title: `${ex} has stalled`,
          explanation: `You've completed 3 ${ex} sessions without increasing estimated strength (~${Math.round(recentMax)} 1RM).`,
          recommendation: `Repeat your current weight next session and aim for one extra rep before adding load.`,
          data: { sessions: hist.length, e1rm: Math.round(recentMax) },
        });
      }
    });
    return out;
  }

  /** PR: the most recent session set a new all-time estimated-1RM high. */
  function prProvider(ctx) {
    const S = ctx.store;
    if (!S || !S.loggedExercises) return [];
    const out = [];
    S.loggedExercises().forEach((ex) => {
      const hist = S.getExerciseHistory(ex);
      if (hist.length < 2) return;
      const chrono = [...hist].reverse();
      const e = chrono.map((h) => { const b = bestSet(h.sets); return b ? b.e : 0; });
      const newest = e[e.length - 1];
      const prevMax = Math.max(...e.slice(0, -1));
      if (newest > prevMax + 1e-6) {
        const last = chrono[chrono.length - 1];
        const b = bestSet(last.sets);
        const conf = 0.9;
        out.push({
          id: `pr:${ex}:${last.date}`, type: 'pr', subject: ex,
          severity: 'good', confidence: conf, priority: rank('good', conf) + 5,
          title: `New ${ex} PR!`,
          explanation: `${b.w}×${b.r} — your best estimated 1RM yet (~${Math.round(newest)}).`,
          recommendation: `Great work. Next session, aim to match or beat it.`,
          data: { w: b.w, r: b.r, e1rm: Math.round(newest), date: last.date },
        });
      }
    });
    return out;
  }

  /** Weight trend: wraps the coach's weekly recommendation as a signal. */
  function weightTrendProvider(ctx) {
    const S = ctx.store, C = ctx.coach;
    if (!ctx.plan || !S || !C || !C.weeklyRecommendation) return [];
    const series = S.getWeightSeries();
    const bodyweight = series.length ? series[series.length - 1].kg : null;
    const rc = S.recentCalories(7);
    const rec = C.weeklyRecommendation({
      direction: ctx.plan.phase.direction,
      weeklyKg: S.weeklyTrend(),
      bodyweight,
      avgCalories: rc.avg,
      loggedDays: rc.loggedDays,
      calorieTarget: ctx.plan.energy.target,
    });
    const sevMap = { 'on-track': 'good', 'adjust-down': 'watch', 'adjust-up': 'alert', adherence: 'watch', 'need-data': 'info' };
    const severity = sevMap[rec.status] || 'info';
    const conf = rec.status === 'need-data' ? 0.5 : 0.85;
    const sig = {
      id: `weight_trend:${rec.status}`, type: 'weight_trend',
      severity, confidence: conf, priority: rank(severity, conf) + (rec.deltaKcal ? 8 : 0),
      title: rec.title, explanation: rec.detail, recommendation: rec.title,
      data: { status: rec.status, deltaKcal: rec.deltaKcal },
    };
    if (rec.deltaKcal) sig.action = { kind: 'adjust_calories', payload: { delta: rec.deltaKcal }, reversible: true };
    return [sig];
  }

  /** Protein gap: today's protein vs the plan target. */
  function proteinGapProvider(ctx) {
    const S = ctx.store;
    if (!ctx.plan || !S || !S.foodTotals) return [];
    const target = ctx.plan.macros.protein;
    const totals = S.foodTotals(ctx.today);
    const remaining = Math.round(target - totals.protein);
    if (remaining <= 15) return [];
    const big = remaining > target * 0.5;
    const severity = big ? 'watch' : 'info';
    const conf = 0.9;
    return [{
      id: 'protein_gap', type: 'protein_gap',
      severity, confidence: conf, priority: rank(severity, conf) - 4,
      title: `${remaining} g protein to go`,
      explanation: `You've logged ${totals.protein} g of your ${target} g target today.`,
      recommendation: `Two easy options: ~200 g chicken breast (~46 g) or ~250 g Greek yogurt (~25 g).`,
      data: { remaining, target, logged: totals.protein },
    }];
  }

  const PROVIDERS = [weightTrendProvider, liftStallProvider, prProvider, proteinGapProvider];

  /* ----------------------------- engine API ---------------------------- */

  /** All signals from every provider. Providers are isolated: one throwing
   *  never blocks the others. */
  function getSignals(ctx) {
    if (!ctx || !ctx.store) return [];
    const out = [];
    for (const p of PROVIDERS) {
      try { const r = p(ctx); if (r && r.length) out.push(...r); }
      catch (e) { if (global.console) console.warn('provider failed:', p.name, e && e.message); }
    }
    return out;
  }

  /** The single highest-priority signal for today (Principle 6). */
  function getTopFocus(ctx) {
    const signals = getSignals(ctx);
    if (!signals.length) return null;
    return signals.slice().sort((a, b) => b.priority - a.priority)[0];
  }

  /** Dev-tools helper: `Intelligence.debug()` in the console. */
  function debug(opts) {
    const ctx = buildContext(opts || {});
    const signals = getSignals(ctx);
    const top = getTopFocus(ctx);
    if (global.console) {
      console.log('%cCoach Brain', 'font-weight:bold;color:#ff6a2b', '| today:', ctx.today, '| plan:', !!ctx.plan, '| signals:', signals.length);
      if (console.table) console.table(signals.map((s) => ({ type: s.type, subject: s.subject || '', severity: s.severity, conf: s.confidence, priority: s.priority, title: s.title })));
      console.log('TOP FOCUS →', top ? `[${top.type}] ${top.title}` : '(none)');
    }
    return { context: ctx, signals, top };
  }

  const Intelligence = {
    buildContext, getSignals, getTopFocus, debug,
    providers: { weightTrend: weightTrendProvider, liftStall: liftStallProvider, pr: prProvider, proteinGap: proteinGapProvider },
    _est1RM: est1RM, _bestSet: bestSet, _rank: rank,
  };

  // Internal product name is "Coach Brain"; "Intelligence" kept as an alias.
  if (typeof module !== 'undefined' && module.exports) module.exports = Intelligence;
  else { global.CoachBrain = Intelligence; global.Intelligence = Intelligence; }
})(typeof window !== 'undefined' ? window : globalThis);
