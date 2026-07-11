# Feature 004 — Zero-Friction Logging

Status: **Implemented — awaiting post-implementation review (step 9).**
Layer: UI (Layer 3) + logic (`coach.js`). User-visible: **Yes** (the core loop).

---

## 1. Product goal
Reduce the effort of logging a set to nearly zero. Success = *less interaction*,
not more features. The user spends attention lifting, not operating the app.

## 2. User problem
Even with a good logger, users had to remember last time's numbers, whether to
progress, and what to type. A coach removes those decisions — so the app does too.

## 3. UX (per exercise)
- **Last time:** the previous session's sets.
- **Beat last time:** the next-set target (e.g. `100×6 (+1 rep)`), computed by the
  coach logic — a coaching invitation, not a data field.
- **Smart defaults:** inputs preload with the last session's weight × reps.
- **✓ Repeat Last Set:** one tap logs the preloaded set. Editing any field
  overrides just that value.
- **Set indicator:** `Set N` advances after each log (auto-advance).
- **Rest timer:** auto-starts on every logged set.
- **No history:** empty inputs, `Log Set`, `Target: <rep range>`.
- **No popups / celebrations** — progress is the reward; the UI stays calm.

## 4. Technical architecture
- **Separation law honored:** the "beat last time" target is computed in
  `Coach.nextSetTarget(lastSets, repRange)` (pure, in `coach.js`), **not** the UI.
  The UI only displays it. Double-progression: +1 rep to the top of the range,
  then +2.5 kg and reset to the bottom.
- `wireTraining` now: `applyDefaults()` preloads inputs + button label + target +
  set indicator from `Store.getLastSession`; `logCurrent(weight?, reps?)` is a
  **source-agnostic** pipeline (taps/typing today; voice later populates the same
  function). Inputs stay preloaded after logging so the next Repeat is one tap.
- Swap re-runs `applyDefaults` for the new exercise (clears when no history).

## 5. Data contract
**No product-data schema change, no new keys, no migrations.** Reads/writes the
existing `workout` structure via `Store.logSet/getSets/getLastSession`. Editing
state is in-memory only.

## 6. Acceptance criteria — all met ✅
Preloads previous values · target visible before logging · Repeat Last Set logs a
full set in one tap · auto-advances the set indicator · rest timer auto-starts ·
manual editing overrides · history compatible (legacy single-set migrates) ·
offline unchanged · no new schema · no regressions (Progress/Today/Nutrition/Coach
Brain).

## 7. Test plan — executed (headless browser, 10 scenarios)
(1) first workout empty + Log Set + rep-range target, (2) second workout preloads
100×5 + "Repeat Last Set" + "Beat last time 100×6 (+1 rep)", (3) Repeat logs in one
tap, (4) manual edit overrides (→100×8), (5) rest timer auto-starts, (6) indicator
Set 1→Set 2, (7) swap to a no-history exercise preloads correctly (empty + Log
Set), (8) offline logging works, (9) progress chart updates, (10) legacy history
readable. Plus a `Coach.nextSetTarget` unit test across +1-rep / +2.5-kg / `/leg`
cases, and a no-dialog assertion (zero popups). No console errors.

## 8. Claude implementation prompt
"Make logging zero-friction: preload each exercise's inputs from the last session,
show a `Coach.nextSetTarget` 'Beat last time' line, a one-tap 'Repeat Last Set'
button, a 'Set N' indicator that advances, and auto rest timer. Route all logging
through one source-agnostic function (voice-ready). No UI calculation of the
target (compute in coach.js). No schema change. Verify the 10 scenarios."

## 9. Post-implementation review
_Pending PM review. Note: the "Beat last time" default suggests +1 rep until the
range top, then +2.5 kg — surfaced from `coach.js`. Files: `app/js/coach.js`
(nextSetTarget), `app/js/app.js` (exerciseRow + wireTraining), `app/styles.css`
(.beat-target/.set-indicator)._
