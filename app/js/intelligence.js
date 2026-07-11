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

  const fmtSets = (sets) => (sets || []).map((s) => `${s.w}×${s.r}`).join(', ');
  const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

  // Priority = severity weight × confidence(0–100). Used by getTopFocus (Principle 6).
  const SEV_BASE = { alert: 100, watch: 72, good: 58, info: 34 };
  const rank = (sev, conf100) => Math.round((SEV_BASE[sev] || 30) * (conf100 / 100));

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

  /** Set of exercises whose newest session beat their previous best (progressing). */
  function progressingExercises(S) {
    const set = new Set();
    S.loggedExercises().forEach((ex) => {
      const hist = S.getExerciseHistory(ex);
      if (hist.length < 2) return;
      const chrono = [...hist].reverse();
      const e = chrono.map((h) => { const b = bestSet(h.sets); return b ? b.e : 0; });
      if (e[e.length - 1] > Math.max(...e.slice(0, -1)) + 1e-6) set.add(ex);
    });
    return set;
  }

  /** Lift stall: no new estimated-1RM high across the last 3 sessions. */
  function liftStallProvider(ctx) {
    const S = ctx.store;
    if (!S || !S.loggedExercises) return [];
    const out = [];
    const progressing = progressingExercises(S);
    S.loggedExercises().forEach((ex) => {
      const hist = S.getExerciseHistory(ex); // newest-first
      if (hist.length < 3) return;
      const chrono = [...hist].reverse();
      const e = chrono.map((h) => { const b = bestSet(h.sets); return b ? b.e : 0; });
      const window = chrono.slice(-3);
      const eWin = e.slice(-3);
      const baseline = e.length > 3 ? Math.max(...e.slice(0, -3)) : e[0];
      const recentMax = Math.max(...eWin);
      if (recentMax <= baseline + 1e-6) {
        const span = daysBetween(window[0].date, window[window.length - 1].date);
        const othersProgressing = [...progressing].some((x) => x !== ex);
        // More sessions + a clear plateau span + exercise-specific = higher confidence.
        let confidence = Math.min(96, 70 + 6 * (hist.length - 3) + (span >= 14 ? 8 : 0) + (othersProgressing ? 8 : 0));
        out.push({
          id: `lift_stall:${ex}`, type: 'lift_stall', subject: ex,
          severity: 'watch', confidence, priority: rank('watch', confidence),
          title: `${ex} has stalled`,
          explanation: `Estimated strength on ${ex} hasn't improved for 3 sessions.`,
          reasoning: othersProgressing
            ? `Progress has plateaued for 3 sessions while your other lifts keep improving — this looks exercise-specific, not systemic fatigue or under-recovery.`
            : `Progress has plateaued for 3 sessions. A small overload nudge is the usual fix before adding weight.`,
          evidence: [
            `Last 3 sessions: ${window.map((h) => fmtSets(h.sets)).join('  ·  ')}`,
            `Estimated 1RM unchanged (~${Math.round(recentMax)}) across ${span} days.`,
          ],
          recommendation: `Repeat your current weight next session and aim for one extra rep before adding load.`,
          data: { sessions: hist.length, e1rm: Math.round(recentMax), spanDays: span, othersProgressing },
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
        const confidence = 92; // a new measured high is a hard fact
        out.push({
          id: `pr:${ex}:${last.date}`, type: 'pr', subject: ex,
          severity: 'good', confidence, priority: rank('good', confidence) + 5,
          title: `New ${ex} PR!`,
          explanation: `${b.w}×${b.r} is your best estimated 1RM yet (~${Math.round(newest)}).`,
          reasoning: `You just set a new high — momentum is on your side. Consolidate it before pushing further so the gain sticks.`,
          evidence: [
            `Today: ${fmtSets(last.sets)} (~${Math.round(newest)} est. 1RM).`,
            `Previous best: ~${Math.round(prevMax)} est. 1RM.`,
          ],
          recommendation: `Great work. Next session, aim to match or beat it.`,
          data: { w: b.w, r: b.r, e1rm: Math.round(newest), prev: Math.round(prevMax), date: last.date },
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
    const confidence = rec.status === 'need-data' ? 45 : 85;
    const weeklyKg = S.weeklyTrend();
    const evidence = [];
    if (weeklyKg != null) evidence.push(`7-day weight trend: ${weeklyKg < 0 ? '−' : '+'}${Math.abs(weeklyKg).toFixed(2)} ${'kg'}/week.`);
    if (rc.avg != null) evidence.push(`Logged food ${rc.loggedDays}/7 days, averaging ${rc.avg} kcal vs a ${ctx.plan.energy.target} target.`);
    // Separate the INSIGHT headline from the RECOMMENDATION so the card never
    // restates itself (weeklyRecommendation.title bundles both).
    const statusTitle = {
      'on-track': 'On track — hold steady',
      'adjust-down': 'Fat loss has stalled',
      'adjust-up': 'Losing weight too fast',
      adherence: 'Hit your calorie target first',
      'need-data': 'Keep logging your weight',
    };
    const sig = {
      id: `weight_trend:${rec.status}`, type: 'weight_trend',
      severity, confidence, priority: rank(severity, confidence) + (rec.deltaKcal ? 8 : 0),
      title: statusTitle[rec.status] || rec.title,
      explanation: `Your weight trend vs your ${ctx.plan.phase.name} target.`,
      reasoning: rec.detail,
      evidence,
      recommendation: rec.title,
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
    // Lower/variable confidence: early in the day a "gap" is expected. The more
    // that's already logged and still short, the more real the miss is.
    const confidence = Math.max(35, Math.min(80, Math.round(40 + (totals.protein / target) * 50)));
    return [{
      id: 'protein_gap', type: 'protein_gap',
      severity, confidence, priority: rank(severity, confidence) - 4,
      title: `${remaining} g protein to go`,
      explanation: `You're ${remaining} g short of today's protein target.`,
      reasoning: `Protein is the muscle-protective macro on a cut. Hitting it daily matters more than any other food choice, so it's worth closing this gap before the day ends.`,
      evidence: [`Logged ${totals.protein} g of a ${target} g target so far today.`],
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

  /**
   * Workout-complete summary (Feature 005) — calm closure, computed here so the
   * UI never calculates. `names` = today's exercise names (current/swapped).
   */
  function workoutSummary(ctx, names) {
    const S = ctx.store, today = ctx.today;
    let totalSets = 0, doneCount = 0;
    const improvements = [];
    (names || []).forEach((ex) => {
      const todaySets = S.getSets(ex, today);
      if (todaySets.length) doneCount++;
      totalSets += todaySets.length;
      const last = S.getLastSession(ex, today);
      if (todaySets.length && last && last.sets.length) {
        const tb = bestSet(todaySets), lb = bestSet(last.sets);
        if (tb && lb) {
          const e1rmDelta = Math.round((tb.e - lb.e) * 10) / 10;
          const repDelta = tb.r - lb.r;
          if (e1rmDelta > 0.1) improvements.push({ exercise: ex, e1rmDelta, repDelta });
        }
      }
    });
    const allDone = (names || []).length > 0 && doneCount === names.length;
    const proteinRemaining = ctx.plan ? Math.max(0, Math.round(ctx.plan.macros.protein - S.foodTotals(today).protein)) : 0;
    const checkInMissing = !S.getWeightSeries().some((w) => w.date === today);

    let note;
    if (improvements.length) note = 'Your strength is moving in the right direction. Stay with this progression next session.';
    else if (totalSets) note = 'Solid session — you held your numbers. Aim for one more rep next time.';
    else note = 'Log your working sets to see today\'s progress.';

    let nextAction;
    if (proteinRemaining > 15) nextAction = { label: 'Log your post-workout meal', goto: 'nutrition' };
    else if (checkInMissing) nextAction = { label: "Record today's weight", goto: 'more' };
    else nextAction = { label: "You're finished for today", goto: null };

    return { allDone, totalSets, improvements, proteinRemaining, checkInMissing, note, nextAction };
  }

  /** Dev-tools helper: `Intelligence.debug()` in the console. */
  function debug(opts) {
    const ctx = buildContext(opts || {});
    const signals = getSignals(ctx);
    const top = getTopFocus(ctx);
    if (global.console) {
      console.log('%cCoach Brain', 'font-weight:bold;color:#ff6a2b', '| today:', ctx.today, '| plan:', !!ctx.plan, '| signals:', signals.length);
      if (console.table) console.table(signals.map((s) => ({ type: s.type, subject: s.subject || '', severity: s.severity, 'conf%': s.confidence, priority: s.priority, title: s.title })));
      console.log('TOP FOCUS →', top ? `[${top.type}] ${top.title}` : '(none)');
    }
    return { context: ctx, signals, top };
  }

  const Intelligence = {
    buildContext, getSignals, getTopFocus, workoutSummary, debug,
    providers: { weightTrend: weightTrendProvider, liftStall: liftStallProvider, pr: prProvider, proteinGap: proteinGapProvider },
    _est1RM: est1RM, _bestSet: bestSet, _rank: rank,
  };

  // Internal product name is "Coach Brain"; "Intelligence" kept as an alias.
  if (typeof module !== 'undefined' && module.exports) module.exports = Intelligence;
  else { global.CoachBrain = Intelligence; global.Intelligence = Intelligence; }
})(typeof window !== 'undefined' ? window : globalThis);
