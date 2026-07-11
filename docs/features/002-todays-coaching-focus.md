# Feature 002 — Today's Coaching Focus

Status: **Implemented — awaiting post-implementation review (step 9).**
Layer: UI (Layer 3), reading the Coach Brain (Layer 2). User-visible: **Yes** (first one).

---

## 1. Product goal
The first moment the user *feels* the Coach Brain: a single card on Overview that
surfaces the one highest-priority thing for today — insight, reasoning, evidence,
and one clear next step. Reassurance counts too (a positive/on-track focus renders
just as intentionally as a problem).

## 2. User problem
The app understood the data (F001) but never told the user what mattered most.
This turns silent intelligence into a calm, single, actionable message.

## 3. UX flow
- Top of **Overview**: "Today's Coaching Focus" → one card from `getTopFocus()`.
- Card: title (insight) · reasoning (why) · **collapsible** evidence · 👉 recommendation
  · optional **action button** (when the signal has an action) · **Mark as understood**.
- **Mark as understood:** dims the card slightly + shows a "✓ Reviewed today" badge
  for the rest of the day; the recommendation does **not** disappear.
- **Empty state:** calm "✓ You're on track" card when `getTopFocus()` is null.

## 4. Technical architecture
- `overviewPanel()` gains a `#coachFocus` container; `renderCoachFocus(plan)` fills it.
- Renders **only** what `CoachBrain.getTopFocus(buildContext({plan}))` returns.
  No thresholds/formulas/decisions in the view (Separation Law).
- Evidence = native `<details>` (collapsible, no JS). Action = proto-Executor
  `applyFocusAction()` (currently `adjust_calories`, reuses the calorie-adjust path).
- Confidence is intentionally **not** rendered.

## 5. Data contract
**No storage changes to fitness data. No new localStorage keys. No migrations.**
The card is derived entirely from Coach Brain output.
- **Deviation flagged for review:** "understood for the rest of the day" persists
  via **`sessionStorage`** (`coach_ack`), not `localStorage` — so it survives
  navigation/backgrounding but resets on a full app relaunch. This honors the
  "no new localStorage keys" contract. If whole-calendar-day persistence across
  relaunches is required, add one tiny UI-only `localStorage` key (PM's call).

## 6. Acceptance criteria — all met ✅
- Exactly one coaching card on Overview. ✅
- Renders from the Coach Brain only. ✅
- No calculations in the UI (action label uses the raw delta). ✅
- Confidence not shown. ✅ (verified: no "confidence" text, no score rendered)
- Evidence collapsible (closed by default). ✅
- Action button present when the signal has an action. ✅
- Empty state renders when no focus exists. ✅
- Existing Overview (energy, cardio) unchanged. ✅
- No regression in onboarding/logging/charts/check-in. ✅
- Mark-as-understood dims + checkmark, keeps the recommendation, persists. ✅

## 7. Test plan — executed
Headless browser: one card asserted; evidence collapsed→open; action label; ack →
`acked` class + checkmark + reco retained + `sessionStorage` persistence; tab
regression checks (Training, Track/check-in); zero console errors. Plus a
duplication check (title ≠ recommendation after the provider split).

## 8. Claude implementation prompt
"Add a `#coachFocus` card to the top of Overview that renders
`CoachBrain.getTopFocus()`: title, reasoning, collapsible evidence, recommendation,
an action button when `signal.action` exists, and a 'Mark as understood' that dims
the card + shows a checkmark for the day (sessionStorage) without hiding the
recommendation. No calculations in the UI; do not show confidence; empty state when
null. No regression."

## 9. Post-implementation review
_Pending PM review. Note the sessionStorage deviation in §5. Files:
`app/js/app.js` (renderCoachFocus + overview container), `app/styles.css` (.focus*),
`app/js/intelligence.js` (weight_trend title/recommendation split)._
