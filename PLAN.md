# 📐 Product Plan — Personal Trainer App

> The document we should have written first. Read this before building anything.

---

## 0. The one rule (learned the hard way)

**Build the core loop first. Nothing else gets built until the core is solid and used.**

The previous app (`ai-fitness-couch`) died because it inverted this: ~2,900 lines
of security/auth/encryption and a donation widget were fully built, while the
**database, exercise library, nutrition, and set-logging were left as empty
stub files.** All scaffolding, no engine. We will not repeat that.

**Guardrail:** every feature must pass this test before we build it —
*"Does the core loop work without it?"* If yes, it waits.

---

## 1. Vision

A free, private, phone-first app that gives you a trustworthy training + nutrition
plan and makes it effortless to **log, track, and adjust** — so you actually lose
fat and build muscle. No subscription. No account. Your data stays on your device.

---

## 2. The core loop (this is the whole product)

```
        ┌──────────────────────────────────────────────┐
        │  1. PLAN     → app builds your plan from your  │
        │                numbers (calories, macros,      │
        │                training split)                 │
        │  2. DO       → you train & eat                 │
        │  3. LOG      → log sets, food, bodyweight      │
        │                (fast, in the gym, on iPhone)   │
        │  4. ADJUST   → weekly: app reads your data and │
        │                tells you what to change        │
        └───────────────────┬──────────────────────────┘
                            └──── repeat every week ────┘
```

If those four steps work and feel good on your phone, the app is a success.
Everything else (AI coach, voice, form analysis) is a *bonus on top of a working
loop* — never a substitute for it.

---

## 3. Scope: MVP = Plan + Full Tracking

Per the decision made: the MVP is **Plan + full tracking** (workouts + weight +
food together). To keep that from becoming creep, each piece is defined tightly:

| Area | MVP includes | MVP explicitly excludes |
|------|-------------|-------------------------|
| **Plan** | Onboarding → calories, macros, training split (done ✅) | Multiple concurrent programs, plan marketplace |
| **Workout log** | Log sets (weight × reps) per exercise, see "last time," beat it | Supersets UI, RPE graphs, 1RM predictor, rest-timer *(Phase 2)* |
| **Food log** | Log food (kcal + protein) vs target, quick-add | Barcode scanner, full food database, recipes *(Phase 2)* |
| **Weight** | Daily log, trend chart, 7-day avg (done ✅) | Body-part measurements, photos *(Phase 2)* |
| **Adjust** | Weekly check-in card with a concrete recommendation | Automated plan re-generation *(Phase 3)* |
| **Access** | Installable PWA on iPhone, works offline | Native app, Apple Health, Live Activities *(later)* |

---

## 4. Onboarding & data model

### Onboarding flow (progressive — never one giant form)
1. **Welcome** — one line: what the app does.
2. **Goal** — lose fat / recomp / build muscle.
3. **4 essentials** — sex, age, height, weight.
4. **3 quick ones** — experience, days/week, equipment.
5. **Optional (skippable)** — body-fat %, diet preference, injuries.
6. **Your plan** — shown immediately, with the "why" behind every number.

### Data we store (all local, IndexedDB)
```
profile      { sex, age, height, weight, goal, experience, days, equipment,
               bodyFat?, diet?, activity?, injuries? }
plan         { calories, macros, split }         // derived, re-computable
weightLog    [{ date, kg }]
foodLog      { date: [{ name, kcal, protein }] }
workoutLog   { date: { exercise: [{ w, r }, ...] } }
settings     { units, lastCheckIn, ... }
```

Nothing leaves the device. One-tap **export/import** for backup.

---

## 5. How you'll know the plan works (trust)

A plan you don't trust is a plan you won't follow. Three mechanisms:

1. **Transparency** — every number shows its formula and reasoning (Mifflin-St
   Jeor, protein-first macros, frequency-based split). No black box.
2. **Evidence** — the science behind each rule is cited (see coaching-plan docs).
3. **Self-correction** — the plan is a *starting estimate* that adapts to YOUR
   data every 2 weeks. Success is defined up front by **leading indicators**:
   waist shrinking + lifts holding/rising — not just the scale.

The proof isn't "the first number was perfect." The proof is "it adjusts to me
and I'm progressing." That loop is the trust.

---

## 6. Architecture (keep it boring on purpose)

The old app's stack (React + MUI + TensorFlow + MediaPipe + voice + encryption)
was part of what made it unmaintainable. Our default is **minimum viable stack**:

- **Current base:** vanilla HTML/CSS/JS — no build step, instant to run, trivial
  to maintain. Already has plan + logging working.
- **Upgrade for MVP:** move storage from `localStorage` → **IndexedDB** (via a
  tiny wrapper) for robustness at scale, and add a **service worker** for
  offline/PWA.
- **Add a framework only if/when the app's size demands it** — not before. If we
  do, a light one (Preact/Svelte), not the heavy MUI stack.

> Decision point flagged for you in the chat: keep the simple vanilla base, or
> port to a React/Vite structure. Recommendation: **stay simple** — your failure
> mode is complexity, so we make simplicity the default and earn every dependency.

---

## 7. Reuse decisions (from `ai-fitness-couch`)

| Asset | Verdict |
|-------|---------|
| `localKnowledge.ts` (fitness Q&A base, 489 lines) | ♻️ **Salvage later** for the AI coach (Phase 4) |
| AI/Groq service pattern | ♻️ Reference later for the AI coach |
| PWA service-worker setup | ♻️ Reference for our PWA step |
| `LocalDB`, `ExerciseService`, `NutritionService` | ❌ Empty — nothing to reuse; we build fresh |
| Security/auth/encryption (~2,900 lines) | ❌ **Do not port.** Unneeded for a local, private app |
| BuyMeCoffee widget, voice, vision/form-analysis | ❌ Not now. Maybe someday, far after the core |

---

## 8. Roadmap — one shippable phase at a time

Each phase must be **usable on its own** before the next begins.

- **Phase 0 — Foundation (done ✅):** plan engine, food/weight/workout logging,
  Strava-style UI.
- **Phase 1 — Make it real on your phone:** IndexedDB storage + PWA (installable,
  offline) + polished onboarding. *← ship this first.*
- **Phase 2 — Better logging:** rest timer, exercise library with swaps, per-set
  history, food quick-picks. Only after Phase 1 is used for real.
- **Phase 3 — Smart adjust:** weekly check-in that reads your data and auto-suggests
  calorie/volume changes; optional plan re-gen.
- **Phase 4 — AI coach (optional):** reuse `localKnowledge.ts` + an LLM for Q&A.
- **Phase 5+ (someday, maybe):** native app, Apple Health, Live Activities, voice.
  Only if the core is loved and stable.

---

## 9. Definition of done for the MVP

You can, on your iPhone, in the gym, offline:
1. Open the app from your home screen.
2. See today's plan.
3. Log your sets in seconds and see what to beat.
4. Log your food and weight.
5. Get a weekly "here's what to change" recommendation.

When that's true and pleasant to use, the MVP is done. We resist everything else
until it is.
