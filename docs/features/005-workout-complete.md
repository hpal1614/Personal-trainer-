# Feature 005 — Workout Complete

Status: **Implemented — awaiting post-implementation review (step 9).**
Layer: UI (Layer 3) + Coach Brain (Layer 2). User-visible: **Yes** (closes the loop).

---

## 1. Product goal
Give the workout **closure**. When the user finishes, the app becomes a coach
again — calm, meaningful feedback, not fireworks. The reward is clearly explained
progress.

## 2. User problem
After the last set, the app went passive. No acknowledgment, no sense of
completion, no gentle nudge toward the next thing.

## 3. UX
- Reachable via **✓ Finish Workout** (each Training day-card) and the Today
  **View Summary** button (when the featured session is complete).
- A centered glass overlay: **Workout Complete** → "Nice work" (+"you completed
  every planned exercise today" when all done) → **Today** bullets (working sets,
  per-exercise rep/1RM improvement, protein remaining) → **Coach's Note** →
  **Next** action → **Continue**.
- **No XP, coins, streak explosions, trophies, or hype.** Progress is the reward.

## 4. Technical architecture
- **Separation law honored:** the entire summary (counts, improvements, note,
  next action) is computed by `CoachBrain.workoutSummary(ctx, names)` — the UI
  only renders it.
- `openWorkoutComplete(names, title)` builds the overlay; `Continue` closes it and
  navigates to `nextAction.goto` (or Today). Tapping the backdrop closes it.
- Improvement = today's best est-1RM vs the last session's best (Epley).
- Next action (one, context-aware): protein gap → Nutrition; missing weigh-in →
  More; otherwise "You're finished for today".

## 5. Data contract
**No product-data schema change, no new keys, no migrations.** Read-only over
existing logs + plan. The overlay is transient DOM (no persistence).

## 6. Acceptance criteria — all met ✅
Completion reachable from Training (and Today when complete) · summary computed by
the Coach Brain (no UI calc) · working-set count · per-exercise improvement
(rep + est-1RM) · protein remaining · calm coach's note · exactly one next action ·
Continue navigates and closes · no popups/confetti · offline unchanged · no
regressions.

## 7. Test plan — executed
`workoutSummary` unit test (sets count, allDone, improvement rep/1RM deltas,
protein remaining, check-in missing, note, next action). Headless browser: Finish
Workout opens the overlay; asserted title/sub/bullets ("2 working sets", "improved
by 1 rep", "1RM increased by 3.3 kg", "Protein remaining: 176 g"), coach's note,
next action, Continue closes + navigates to Nutrition; **zero dialogs** (no
confetti). No console errors.

## 8. Claude implementation prompt
"Add a Workout Complete overlay reachable from a per-day 'Finish Workout' button
(and Today's View Summary when the session is complete). Compute the summary in
`CoachBrain.workoutSummary` (sets, per-exercise rep/1RM improvement vs last
session, protein remaining, calm note, one context-aware next action). Render it
calmly — no XP/confetti. Continue closes + navigates. No schema change. Verify."

## 9. Post-implementation review
_Pending PM review. The habit loop is now closed: Open → Focus → Workout →
Frictionless logging → **Workout Complete** → Tomorrow. Files: `app/js/
intelligence.js` (workoutSummary), `app/js/app.js` (openWorkoutComplete + finish
buttons + Today wiring), `app/styles.css` (.wc-*)._
