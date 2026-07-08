/*
 * coach.js — The Coaching Logic Engine
 * ------------------------------------
 * Pure functions, no DOM. This is the brain of the app: give it the user's
 * answers (the same questions a coach would ask) and it returns a complete,
 * personalized plan — calories, macros, training split, cardio, and phasing.
 *
 * All formulas mirror coaching-plan/*.md so the app and the docs never drift.
 */

(function (global) {
  'use strict';

  /* ----------------------------- Unit helpers ----------------------------- */

  const lbToKg = (lb) => lb / 2.2046226218;
  const kgToLb = (kg) => kg * 2.2046226218;
  const inToCm = (inches) => inches * 2.54;
  const round = (n, step = 1) => Math.round(n / step) * step;

  /** Normalize raw form input into kg / cm regardless of the unit system. */
  function normalizeBody(input) {
    let weightKg, heightCm;
    if (input.units === 'imperial') {
      weightKg = lbToKg(Number(input.weight));
      heightCm = inToCm(Number(input.heightIn));
    } else {
      weightKg = Number(input.weight);
      heightCm = Number(input.heightCm);
    }
    return { weightKg, heightCm, weightLb: kgToLb(weightKg) };
  }

  /* ------------------------------- Energy -------------------------------- */

  /** Mifflin-St Jeor BMR — the most accurate of the common predictive equations. */
  function bmr({ weightKg, heightCm, age, sex }) {
    const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
    return sex === 'female' ? base - 161 : base + 5;
  }

  /**
   * Activity multiplier. Training frequency sets a floor, then the user's
   * lifestyle (NEAT) nudges it. A 5-6x/week lifter is at least "light".
   */
  const ACTIVITY_MULTIPLIERS = {
    sedentary: 1.2, // desk job, little movement outside training
    light: 1.375, // on feet some of the day
    moderate: 1.55, // active job or lots of steps
    high: 1.725, // physical job + training
  };

  function tdee({ bmrValue, activity }) {
    const mult = ACTIVITY_MULTIPLIERS[activity] || 1.4;
    return bmrValue * mult;
  }

  /* ----------------------------- Phase logic ----------------------------- */

  /**
   * Pick the lead phase and deficit/surplus from goal + leanness.
   * Advanced lifters can't gain & lose at full speed, so we run focused phases.
   */
  function determinePhase({ goal, bodyFat, sex }) {
    // Reasonable lean/high thresholds differ by sex.
    const lean = sex === 'female' ? 22 : 12;
    const high = sex === 'female' ? 30 : 18;
    // Treat blank / non-numeric body fat as "unknown" (null), not 0.
    const bf = (bodyFat == null || bodyFat === '' || isNaN(Number(bodyFat))) ? null : Number(bodyFat);

    if (goal === 'gain') {
      return {
        name: 'Lean Gain',
        direction: 'surplus',
        // Smaller surplus when already higher BF, to limit fat gain.
        adjustPct: bf != null && bf >= high ? 0.08 : 0.1,
        summary:
          'Build muscle in a small surplus while staying lean. Slow and deliberate.',
      };
    }

    if (goal === 'recomp') {
      return {
        name: 'Recomposition',
        direction: 'maintenance',
        adjustPct: 0,
        summary:
          'Eat at maintenance with high protein and hard training — slowly trade fat for muscle. Best when body fat is moderate.',
      };
    }

    // Default: fat loss (cut). Leaner => gentler deficit to protect muscle.
    let adjustPct = 0.2;
    let rate = '0.75–1.0% bodyweight/week';
    if (bf != null && bf < lean) {
      adjustPct = 0.15;
      rate = '0.4–0.5% bodyweight/week';
    } else if (bf != null && bf < high) {
      adjustPct = 0.18;
      rate = '0.5–0.75% bodyweight/week';
    }
    return {
      name: 'Cut / Fat Loss',
      direction: 'deficit',
      adjustPct,
      targetRate: rate,
      summary:
        'Lose body fat in a controlled deficit while holding every ounce of muscle with heavy training and high protein.',
    };
  }

  function targetCalories({ maintenance, phase }) {
    if (phase.direction === 'deficit') return maintenance * (1 - phase.adjustPct);
    if (phase.direction === 'surplus') return maintenance * (1 + phase.adjustPct);
    return maintenance;
  }

  /* ------------------------------- Macros -------------------------------- */

  /**
   * Macro split, set in coaching priority order: protein -> fat -> carbs fill.
   * Protein per lb of bodyweight; higher in a deficit (muscle-protective).
   */
  function macros({ calories, weightLb, phase }) {
    const proteinPerLb = phase.direction === 'deficit' ? 1.0 : 0.9;
    const fatPerLb = 0.35;

    const proteinG = round(weightLb * proteinPerLb, 5);
    const fatG = round(weightLb * fatPerLb, 5);

    const proteinKcal = proteinG * 4;
    const fatKcal = fatG * 9;
    const carbsKcal = Math.max(0, calories - proteinKcal - fatKcal);
    const carbsG = round(carbsKcal / 4, 5);

    const fiberG = Math.round((calories / 1000) * 14); // ~14 g per 1000 kcal

    return {
      protein: proteinG,
      fat: fatG,
      carbs: carbsG,
      fiber: fiberG,
      waterL: Math.max(3, Math.round(weightLb * 0.015 * 10) / 10), // ~0.5 oz per lb
      breakdown: {
        proteinKcal,
        fatKcal,
        carbsKcal: carbsG * 4,
      },
    };
  }

  /* ---------------------------- Training split --------------------------- */

  // Exercise pools keyed by equipment so the plan respects what the user has.
  const EXERCISES = require_inline_exercises();

  function pick(list, equipment) {
    // Prefer an exercise the user's equipment supports; fall back gracefully.
    const order = { full: ['full', 'home', 'min'], home: ['home', 'min', 'full'], min: ['min', 'home', 'full'] };
    for (const tier of order[equipment] || ['full']) {
      const hit = list.find((e) => e.equip.includes(tier));
      if (hit) return hit.name;
    }
    return list[0].name;
  }

  // Which equipment tiers a user can actually train with.
  const ACCESS_TIERS = { full: ['full', 'home', 'min'], home: ['home', 'min'], min: ['min'] };

  /** All exercise names for a movement slot that the user's equipment supports. */
  function alternativesFor(slot, equipment) {
    const tiers = ACCESS_TIERS[equipment] || ['full', 'home', 'min'];
    const names = slot.options
      .filter((o) => o.equip.some((t) => tiers.includes(t)))
      .map((o) => o.name);
    return [...new Set(names)]; // dedupe, preserve order
  }

  function buildSession(template, equipment) {
    return template.map((slot) => {
      const exercise = pick(slot.options, equipment);
      const alts = alternativesFor(slot, equipment);
      // Ensure the chosen exercise is first in the alternatives list.
      const alternatives = [exercise, ...alts.filter((n) => n !== exercise)];
      return {
        exercise,
        alternatives,
        sets: slot.sets,
        reps: slot.reps,
        rir: slot.rir,
        note: slot.note || '',
      };
    });
  }

  /**
   * Choose a split appropriate to weekly frequency, then resolve exercises
   * for the user's equipment.
   *   3 days -> Full Body
   *   4 days -> Upper / Lower
   *   5-6 days -> Push / Pull / Legs (x2)
   */
  function trainingSplit({ days, equipment }) {
    let plan;
    if (days <= 3) {
      plan = {
        name: 'Full Body (3-day)',
        frequency: 'Each muscle ~3x/week',
        days: [
          { title: 'Day A — Full Body', work: buildSession(EXERCISES.fullA, equipment) },
          { title: 'Day B — Full Body', work: buildSession(EXERCISES.fullB, equipment) },
          { title: 'Day C — Full Body', work: buildSession(EXERCISES.fullC, equipment) },
        ],
      };
    } else if (days === 4) {
      plan = {
        name: 'Upper / Lower (4-day)',
        frequency: 'Each muscle 2x/week',
        days: [
          { title: 'Day 1 — Upper', work: buildSession(EXERCISES.upperA, equipment) },
          { title: 'Day 2 — Lower', work: buildSession(EXERCISES.lowerA, equipment) },
          { title: 'Day 3 — Upper', work: buildSession(EXERCISES.upperB, equipment) },
          { title: 'Day 4 — Lower', work: buildSession(EXERCISES.lowerB, equipment) },
        ],
      };
    } else {
      plan = {
        name: 'Push / Pull / Legs' + (days >= 6 ? ' x2 (6-day)' : ' (5-day rolling)'),
        frequency: 'Each muscle ~2x/week',
        days: [
          { title: 'Push (chest/shoulders/triceps)', work: buildSession(EXERCISES.push, equipment) },
          { title: 'Pull (back/rear delts/biceps)', work: buildSession(EXERCISES.pull, equipment) },
          { title: 'Legs (quads/hams/glutes/calves)', work: buildSession(EXERCISES.legs, equipment) },
        ],
        rolling:
          days === 5
            ? 'Run on a rolling 5-day cycle: P / P / L / P / P — rest — L / P / P ... so each pattern still averages ~2x/week.'
            : 'Repeat the 3-day block twice (Push/Pull/Legs/Push/Pull/Legs), then 1 rest day.',
      };
    }
    return plan;
  }

  /* ------------------------------- Cardio -------------------------------- */

  function cardioPlan({ phase }) {
    if (phase.direction === 'surplus') {
      return {
        steps: '8,000–10,000 steps/day (general health)',
        sessions: 'Optional: 1–2 easy LISS sessions/week for heart health.',
        note: 'In a surplus, keep cardio light so it does not eat into recovery or growth.',
      };
    }
    if (phase.direction === 'maintenance') {
      return {
        steps: '8,000–10,000 steps/day',
        sessions: '2 LISS sessions (25–30 min)/week.',
        note: 'Enough to support recomposition without a big calorie burn.',
      };
    }
    return {
      steps: '8,000–12,000 steps/day (start ~10k) — your most underrated fat-loss tool.',
      sessions: 'Start with 2× LISS (30 min). Add a 3rd or bump steps if fat loss stalls.',
      note: 'Cardio widens the deficit — it does not replace diet. Keep some "cardio room" to use later when progress slows.',
    };
  }

  /* ---------------------------- Supplements ------------------------------ */

  function supplements({ phase, diet }) {
    const core = [
      { name: 'Creatine Monohydrate', dose: '3–5 g/day', why: 'Most-proven supplement; protects strength/fullness, especially on a cut.' },
      { name: 'Protein powder', dose: 'as needed', why: 'Convenient protein to hit your daily target.' },
      { name: 'Vitamin D3', dose: '1,000–2,000 IU/day', why: 'Most people are low; supports hormones & recovery.' },
      { name: 'Caffeine', dose: '100–250 mg pre-workout', why: 'Performance, focus, mild appetite blunting.' },
    ];
    if (phase.direction === 'deficit') {
      core.push({ name: 'Electrolytes (Na/K/Mg)', dose: 'as needed', why: 'Prevents flat workouts & cramps on a cut / with cardio.' });
    }
    if (diet === 'vegan' || diet === 'vegetarian') {
      core.push({ name: 'B12 + Omega-3 (algae)', dose: 'daily', why: 'Commonly low on plant-based diets.' });
    }
    return core;
  }

  /* --------------------------- Plan assembly ----------------------------- */

  function buildPlan(input) {
    const body = normalizeBody(input);
    const age = Number(input.age);
    const sex = input.sex;
    const days = Number(input.days);

    const bmrValue = bmr({ weightKg: body.weightKg, heightCm: body.heightCm, age, sex });
    const maintenance = tdee({ bmrValue, activity: input.activity });
    const phase = determinePhase({ goal: input.goal, bodyFat: input.bodyFat, sex });
    // Weekly check-ins can nudge the target up/down; carried on the input so a
    // rebuild stays consistent. Clamped so it can never invert the goal.
    const rawAdjust = Number(input.calorieAdjust) || 0;
    const baseTarget = targetCalories({ maintenance, phase });
    const calorieAdjust = Math.max(-Math.round(baseTarget * 0.25), Math.min(Math.round(baseTarget * 0.25), rawAdjust));
    const calories = baseTarget + calorieAdjust;
    const macro = macros({ calories, weightLb: body.weightLb, phase });
    const split = trainingSplit({ days, equipment: input.equipment });
    const cardio = cardioPlan({ phase });
    const supps = supplements({ phase, diet: input.diet });

    return {
      body: {
        weightKg: Math.round(body.weightKg * 10) / 10,
        weightLb: Math.round(body.weightLb),
        heightCm: Math.round(body.heightCm),
        age,
        sex,
        bodyFat: input.bodyFat == null || input.bodyFat === '' ? null : Number(input.bodyFat),
      },
      energy: {
        bmr: Math.round(bmrValue),
        maintenance: Math.round(maintenance),
        target: Math.round(calories),
        baseTarget: Math.round(baseTarget),
        calorieAdjust: Math.round(calorieAdjust),
        adjustPct: Math.round(phase.adjustPct * 100),
      },
      phase,
      macros: macro,
      training: split,
      cardio,
      supplements: supps,
      experience: input.experience,
      diet: input.diet,
      days,
    };
  }

  /* --------------------- Weekly check-in (smart adjust) ------------------ */
  /**
   * Turn the user's logged data into ONE concrete recommendation — the "ADJUST"
   * step of the coaching loop. Pure function so it's fully testable.
   *
   * @param {object} p
   * @param {string} p.direction    'deficit' | 'surplus' | 'maintenance'
   * @param {number|null} p.weeklyKg trailing weekly weight change (neg = losing)
   * @param {number|null} p.bodyweight latest logged weight (same unit as weeklyKg)
   * @param {number|null} p.avgCalories avg logged calories over last 7 days (or null)
   * @param {number} p.loggedDays days with food logged in the window
   * @param {number} p.calorieTarget current daily calorie target
   * @returns {{status,title,detail,deltaKcal}}
   */
  function weeklyRecommendation(p) {
    const { direction, weeklyKg, bodyweight, avgCalories, loggedDays, calorieTarget } = p;

    if (weeklyKg == null || !bodyweight) {
      return {
        status: 'need-data',
        title: 'Keep logging your weight',
        detail: 'Weigh in daily for about 2 weeks — once there are two weeks of data I can read your trend and tell you exactly what to change.',
        deltaKcal: 0,
      };
    }

    const pct = (weeklyKg / bodyweight) * 100; // % bodyweight/week (neg = losing)
    const rate = `${weeklyKg < 0 ? '−' : '+'}${Math.abs(weeklyKg).toFixed(2)}/wk (${Math.abs(pct).toFixed(2)}%)`;

    // Is food adherence trustworthy enough to base a change on?
    const overEating = avgCalories != null && loggedDays >= 3 && avgCalories > calorieTarget + 100;

    if (direction === 'deficit') {
      if (pct <= -0.5 && pct >= -1.25) {
        return { status: 'on-track', title: 'On track — hold everything', detail: `You're losing ${rate}. That's the sweet spot for fat loss with muscle retention. Don't change a thing.`, deltaKcal: 0 };
      }
      if (pct > -0.5) {
        if (overEating) {
          return { status: 'adherence', title: 'Hit your target first', detail: `Fat loss has stalled (${rate}), but you're averaging ${avgCalories} kcal vs your ${calorieTarget} target. Hit the target consistently for a week before we lower the number.`, deltaKcal: 0 };
        }
        return { status: 'adjust-down', title: 'Stalled — cut ~150 kcal', detail: `You're only at ${rate}. Drop your target by ~150 kcal (from carbs/fat) or add ~2,000 steps/day, then recheck in 1–2 weeks.`, deltaKcal: -150 };
      }
      return { status: 'adjust-up', title: 'Losing too fast — add ~150 kcal', detail: `You're dropping ${rate} — fast enough to risk muscle. Add ~150 kcal (protein/carbs) to protect your gains.`, deltaKcal: 150 };
    }

    if (direction === 'surplus') {
      if (pct >= 0.2 && pct <= 0.6) {
        return { status: 'on-track', title: 'On track — keep building', detail: `You're gaining ${rate} — a lean, controlled rate. Hold your calories.`, deltaKcal: 0 };
      }
      if (pct < 0.2) {
        return { status: 'adjust-up', title: 'Not growing — add ~150 kcal', detail: `You're only at ${rate}. Add ~150 kcal (mostly carbs) to drive muscle gain, then recheck.`, deltaKcal: 150 };
      }
      return { status: 'adjust-down', title: 'Gaining too fast — cut ~150 kcal', detail: `You're gaining ${rate} — that's more fat than you need. Trim ~150 kcal to stay lean.`, deltaKcal: -150 };
    }

    // maintenance / recomp
    if (Math.abs(pct) <= 0.3) {
      return { status: 'on-track', title: 'Holding steady — perfect for recomp', detail: `Weight is stable (${rate}). With hard training and high protein you're trading fat for muscle. Keep going.`, deltaKcal: 0 };
    }
    if (pct < 0) {
      return { status: 'adjust-up', title: 'Drifting down — add ~100 kcal', detail: `You're losing ${rate}. For a recomp we want stable weight — add ~100 kcal.`, deltaKcal: 100 };
    }
    return { status: 'adjust-down', title: 'Drifting up — cut ~100 kcal', detail: `You're gaining ${rate}. For a recomp we want stable weight — trim ~100 kcal.`, deltaKcal: -100 };
  }

  /* ------------------------- Exercise database --------------------------- */
  // Tagged by equipment: 'full' (commercial gym), 'home' (DBs/barbell/bench),
  // 'min' (bodyweight/bands). pick() resolves the best available option.

  function require_inline_exercises() {
    const E = (name, equip, ...rest) => ({ name, equip });
    const slot = (sets, reps, rir, options, note) => ({ sets, reps, rir, options, note });

    const bench = [{ name: 'Barbell Bench Press', equip: ['full', 'home'] }, { name: 'Dumbbell Bench Press', equip: ['home'] }, { name: 'Push-up (weighted/deficit)', equip: ['min'] }];
    const inclinePress = [{ name: 'Incline Dumbbell Press', equip: ['full', 'home'] }, { name: 'Incline Barbell Press', equip: ['full', 'home'] }, { name: 'Incline Push-up', equip: ['min'] }];
    const ohp = [{ name: 'Seated Dumbbell Shoulder Press', equip: ['full', 'home'] }, { name: 'Standing Barbell Overhead Press', equip: ['full', 'home'] }, { name: 'Pike Push-up', equip: ['min'] }];
    const latRaise = [{ name: 'Cable Lateral Raise', equip: ['full'] }, { name: 'Dumbbell Lateral Raise', equip: ['home'] }, { name: 'Band Lateral Raise', equip: ['min'] }];
    const tricepExt = [{ name: 'Overhead Cable Triceps Extension', equip: ['full'] }, { name: 'Dumbbell Overhead Extension', equip: ['home'] }, { name: 'Bench/Bodyweight Triceps Dip', equip: ['min'] }];
    const pushdown = [{ name: 'Triceps Rope Pushdown', equip: ['full'] }, { name: 'Dumbbell Kickback', equip: ['home'] }, { name: 'Band Pushdown', equip: ['min'] }];

    const pullup = [{ name: 'Weighted Pull-up / Lat Pulldown', equip: ['full'] }, { name: 'Pull-up', equip: ['home', 'min'] }, { name: 'Band-Assisted Pull-up', equip: ['min'] }];
    const row = [{ name: 'Barbell Row', equip: ['full', 'home'] }, { name: 'One-Arm Dumbbell Row', equip: ['home'] }, { name: 'Inverted Row', equip: ['min'] }];
    const csRow = [{ name: 'Chest-Supported Machine Row', equip: ['full'] }, { name: 'Chest-Supported Dumbbell Row', equip: ['home'] }, { name: 'Inverted Row', equip: ['min'] }];
    const facePull = [{ name: 'Cable Face Pull', equip: ['full'] }, { name: 'Band Face Pull', equip: ['home', 'min'] }];
    const curl = [{ name: 'Incline Dumbbell Curl', equip: ['full', 'home'] }, { name: 'Barbell Curl', equip: ['full', 'home'] }, { name: 'Band Curl', equip: ['min'] }];
    const hammer = [{ name: 'Hammer Curl', equip: ['full', 'home'] }, { name: 'Band Hammer Curl', equip: ['min'] }];

    const squat = [{ name: 'Back Squat', equip: ['full', 'home'] }, { name: 'Goblet Squat', equip: ['home'] }, { name: 'Bulgarian Split Squat (bodyweight)', equip: ['min'] }];
    const rdl = [{ name: 'Romanian Deadlift', equip: ['full', 'home'] }, { name: 'Dumbbell RDL', equip: ['home'] }, { name: 'Single-Leg RDL (bodyweight)', equip: ['min'] }];
    const legPress = [{ name: 'Leg Press', equip: ['full'] }, { name: 'Goblet Squat', equip: ['home'] }, { name: 'Walking Lunge', equip: ['min'] }];
    const legCurl = [{ name: 'Lying/Seated Leg Curl', equip: ['full'] }, { name: 'Nordic Curl', equip: ['home', 'min'] }, { name: 'Band Leg Curl', equip: ['min'] }];
    const lunge = [{ name: 'Walking Lunge', equip: ['full', 'home'] }, { name: 'Bulgarian Split Squat', equip: ['full', 'home'] }, { name: 'Reverse Lunge (bodyweight)', equip: ['min'] }];
    const legExt = [{ name: 'Leg Extension', equip: ['full'] }, { name: 'Sissy Squat', equip: ['home', 'min'] }];
    const calf = [{ name: 'Standing Calf Raise', equip: ['full', 'home'] }, { name: 'Single-Leg Calf Raise', equip: ['min'] }];

    return {
      // PPL (5-6 day)
      push: [
        slot('4', '5–8', '1–2', bench, 'Heavy strength anchor.'),
        slot('3', '8–10', '1–2', ohp, 'Primary delt builder.'),
        slot('3', '10–12', '1', inclinePress, 'Upper chest focus.'),
        slot('4', '12–15', '0–1', latRaise, 'Side delts — the capped-shoulder look.'),
        slot('3', '10–12', '0–1', tricepExt, 'Long head of triceps.'),
        slot('3', '12–15', '0–1', pushdown, 'Finisher, squeeze hard.'),
      ],
      pull: [
        slot('4', '6–10', '1–2', pullup, 'Build the V-taper.'),
        slot('4', '6–8', '1–2', row, 'Back thickness, flat spine.'),
        slot('3', '10–12', '1', csRow, 'Mid-back, low spinal fatigue.'),
        slot('3', '15–20', '0–1', facePull, 'Rear delts + shoulder health.'),
        slot('3', '10–12', '0–1', curl, 'Biceps on stretch.'),
        slot('3', '12–15', '0–1', hammer, 'Brachialis + forearm thickness.'),
      ],
      legs: [
        slot('4', '5–8', '1–2', squat, 'Squat-led day.'),
        slot('3', '10–12', '1', legPress, 'Quad volume, less spinal load.'),
        slot('4', '10–12', '0–1', legCurl, 'Hamstrings — most under-train these.'),
        slot('3', '10–12/leg', '1', lunge, 'Unilateral strength + glutes.'),
        slot('3', '12–15', '0–1', legExt, 'Quad isolation, control the negative.'),
        slot('4', '12–15', '0–1', calf, 'Full stretch + pause at the bottom.'),
      ],
      // Upper/Lower (4-day)
      upperA: [
        slot('4', '5–8', '1–2', bench, 'Heavy press.'),
        slot('4', '6–10', '1–2', pullup, 'Vertical pull.'),
        slot('3', '8–10', '1–2', ohp, 'Shoulders.'),
        slot('3', '8–10', '1', row, 'Horizontal pull.'),
        slot('3', '12–15', '0–1', latRaise, 'Side delts.'),
        slot('3', '10–12', '0–1', curl, 'Biceps.'),
        slot('3', '10–12', '0–1', pushdown, 'Triceps.'),
      ],
      upperB: [
        slot('4', '6–10', '1–2', inclinePress, 'Incline press.'),
        slot('4', '8–10', '1–2', csRow, 'Rows.'),
        slot('3', '10–12', '1', ohp, 'Shoulders.'),
        slot('3', '15–20', '0–1', facePull, 'Rear delts/health.'),
        slot('3', '12–15', '0–1', latRaise, 'Side delts.'),
        slot('3', '10–12', '0–1', hammer, 'Biceps.'),
        slot('3', '10–12', '0–1', tricepExt, 'Triceps.'),
      ],
      lowerA: [
        slot('4', '5–8', '1–2', squat, 'Squat.'),
        slot('3', '8–10', '1–2', rdl, 'Hinge.'),
        slot('3', '10–12', '1', legPress, 'Quads.'),
        slot('4', '10–12', '0–1', legCurl, 'Hamstrings.'),
        slot('4', '12–15', '0–1', calf, 'Calves.'),
      ],
      lowerB: [
        slot('4', '6–8', '1–2', rdl, 'Hinge-led.'),
        slot('3', '10–12', '1', lunge, 'Unilateral.'),
        slot('3', '12–15', '0–1', legExt, 'Quads.'),
        slot('4', '10–12', '0–1', legCurl, 'Hamstrings.'),
        slot('4', '15–20', '0–1', calf, 'Calves.'),
      ],
      // Full body (3-day)
      fullA: [
        slot('4', '5–8', '1–2', squat, 'Lower compound.'),
        slot('4', '5–8', '1–2', bench, 'Push compound.'),
        slot('4', '6–10', '1–2', row, 'Pull compound.'),
        slot('3', '12–15', '0–1', latRaise, 'Side delts.'),
        slot('3', '10–12', '0–1', curl, 'Biceps.'),
        slot('3', '15–20', '0–1', calf, 'Calves.'),
      ],
      fullB: [
        slot('4', '6–8', '1–2', rdl, 'Hinge.'),
        slot('3', '8–10', '1–2', ohp, 'Push.'),
        slot('4', '6–10', '1–2', pullup, 'Vertical pull.'),
        slot('3', '10–12', '1', legPress, 'Quads.'),
        slot('3', '10–12', '0–1', pushdown, 'Triceps.'),
        slot('3', '15–20', '0–1', facePull, 'Rear delts.'),
      ],
      fullC: [
        slot('4', '6–10', '1–2', lunge, 'Unilateral lower.'),
        slot('3', '8–12', '1–2', inclinePress, 'Push.'),
        slot('4', '8–10', '1–2', csRow, 'Pull.'),
        slot('4', '10–12', '0–1', legCurl, 'Hamstrings.'),
        slot('3', '10–12', '0–1', hammer, 'Biceps.'),
        slot('4', '12–15', '0–1', calf, 'Calves.'),
      ],
    };
  }

  /* ------------------------------- Export -------------------------------- */

  const Coach = {
    buildPlan,
    bmr,
    tdee,
    macros,
    determinePhase,
    trainingSplit,
    weeklyRecommendation,
    ACTIVITY_MULTIPLIERS,
    _normalizeBody: normalizeBody,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Coach;
  } else {
    global.Coach = Coach;
  }
})(typeof window !== 'undefined' ? window : globalThis);
