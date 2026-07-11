# Feature 001 — Coach Brain Foundation

Status: **Implemented — awaiting post-implementation review (step 9).**
Layer: Intelligence (Layer 2). User-visible: **No** (foundation only).

---

## 1. Product goal
Create a modular decision engine ("Coach Brain") that converts stored fitness
data into structured, prioritized signals — so every future smart feature plugs
into one abstraction instead of duplicating logic.

## 2. User problem
The app stores data but doesn't understand it. Nothing tells the user *what
matters most today*. This feature builds the understanding/prioritization layer
that later powers a single "Today's Coaching Focus".

## 3. UX flow
**None.** Invisible foundation. No screens, no UI changes. Verified via tests and
a developer-tools hook (`CoachBrain.debug()`).

## 4. Technical architecture
- New module `app/js/intelligence.js` → global `CoachBrain` (alias `Intelligence`).
- Pure, no DOM. Loaded after `coach.js`/`store.js`, before `app.js`. Inert until called.
- Pipeline: **Understand** (providers) → **Prioritize** (`priority` = severity ×
  confidence) → **Recommend** (`getTopFocus` returns the single top signal —
  Principle 6).
- Provider registry: `weightTrend`, `liftStall`, `pr`, `proteinGap`. Providers
  are isolated (one throwing never blocks the rest).
- Reuse: `weightTrend` wraps `Coach.weeklyRecommendation`; providers read via
  `Store` (no logic duplicated into the UI).
- Contract: each provider returns `CoachSignal[]` (`type, severity, confidence,
  priority, title, explanation, recommendation, action?, data`).

## 5. Data contract
**Read-only. No new keys, no schema change, no migration.** The engine only
*reads* existing `ptrainer_data_v1` + `lastPlanInput`. Nothing is written.
(Two future insights — `missed_workout`, `deload_due` — will need a schedule /
deload marker; explicitly out of scope here.)

## 6. Acceptance criteria — all met ✅
- `lift_stall` fires for an exercise with 3 sessions and no new est-1RM high.
- No `lift_stall` for an exercise that just PR'd (mutual exclusivity).
- `pr` fires when the newest session sets an all-time est-1RM high.
- `weight_trend` maps the weekly recommendation, incl. an `adjust_calories` action.
- `protein_gap` fires when today's protein is below target.
- `getTopFocus` returns exactly one signal (highest priority) or null.
- Null-safe on empty data. No app regression. No console errors.

## 7. Test plan — executed
- **Node unit test:** seeded stall (bench), PR (squat), stalled-cut weight, low
  protein → asserted each signal, mutual exclusivity, the action payload, and
  single top focus (weight_trend, prio 69). Null-safety confirmed.
- **Headless browser:** globals present; `CoachBrain.debug()` returns signals +
  top; `.plan-hero` still renders (no regression); zero errors.

## 8. Claude implementation prompt
"Build `app/js/intelligence.js` (Coach Brain): a pure, DOM-free engine that reads
Store + Coach plan and returns prioritized `CoachSignal[]`. Providers: lift
stall, PR, weight trend (wrap `weeklyRecommendation`), protein gap. Expose
`getSignals`, `getTopFocus` (one priority), `buildContext`, `debug`. Load it in
index.html without wiring any UI. Verify with Node + a browser smoke test."

## 9. Post-implementation review
_Pending PM review. Files: `app/js/intelligence.js` (+ `index.html` script tag),
`docs/PRINCIPLES.md` (Principle 6), `docs/INTELLIGENCE-ENGINE.md` (CoachSignal +
getTopFocus)._
