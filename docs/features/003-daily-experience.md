# Feature 003 — Daily Experience

Status: **Approved (PR review) — two refinements applied. Complete.**
Layer: UI (Layer 3) + app lifecycle. User-visible: **Yes** (the entry point).

---

## 1. Product goal
A returning user should feel like they're returning to their **coach**, not
reopening a website. Opening the app answers "What should I do next?" in under a
second, on a **Today** screen — not onboarding, not a dashboard.

## 2. User problem (P0 fix)
Returning users were landing back on the onboarding wizard. That's a P0 usability
bug. Feature 003 fixes the lifecycle *and* establishes the daily entry point.

## 3. UX / flows
- **First-time:** Open → Welcome → Onboarding → Generate → **Today**.
- **Returning:** Open → restore plan → **Today** (never re-onboard).
- **Edit plan:** More → Edit plan → wizard (as editor) → rebuild → **Today**.
- **Nav:** `Today · Training · Nutrition · Progress · More` (Overview+Track merged into More).
- **Today layout:** time-of-day greeting → 🧠 Coaching Focus → 🏋 Today's Workout
  (featured session + est. duration + Continue) → 🍗 Nutrition summary → ⚖ Check-in
  summary → quick links.

## 4. Technical architecture
- `todayPanel()` skeleton + `renderToday(plan)` fills greeting/workout/nutrition/
  weight and calls `renderCoachFocus`. Greeting is time-of-day (`getHours`); the
  subline is static for now (Coach Brain may drive it later).
- `morePanel(plan)` = `overviewPanel` (energy/cardio) + `trackPanel` (weight/
  fitbit/check-in/supplements) + Edit plan / Save-print. IDs unchanged, so
  `renderCheckin`/`refreshWeightCard`/`renderFitbitCard` keep working.
- **Landing logic** in the init: build+render on a valid saved plan (→ Today);
  `try/catch` around `JSON.parse` + `Coach.buildPlan` for corrupt input.
- Today's Workout has **no scheduler yet** — it features one session by
  date-rotation (`dayOfYear % days`). A real schedule is future work.

## 5. Data contract
- **Product data:** no new keys, no migrations — reads `lastPlanInput` +
  `ptrainer_data_v1`. Editing the plan rewrites only `lastPlanInput`; **logs are
  never touched**.
- **UI state:** `ui_state_v1` only (coach-focus ack).
- **Note for review:** greeting has **no user name** (onboarding doesn't collect
  one; adding it would be new product data). Matches the PM's greeting examples,
  which omit the name. A name field can be added later if desired.

## 6. Acceptance criteria — all met ✅
First-time → onboarding · returning → Today (bypasses onboarding) · focus renders ·
workout shown when available · nutrition reflects today's logs · weight reflects
latest · tabs accessible · editing never clears logs · reload restores state ·
offline unchanged · no regressions (onboarding/logging/charts/Coach Brain).

## 7. Test plan — executed (headless browser)
All 8 scenarios PASS: (1) new→onboarding, (2) returning→Today, (3) reload→ack
persists, (4) delete UI state→Today loads, (5) delete plan→onboarding, (6) corrupt
`lastPlanInput`→recovery banner + logs intact, (7) offline→Today loads, (8) edit
plan→workout history intact. Plus Today layout present and Nutrition/More
regression checks. Zero console errors.

## 8. Claude implementation prompt
"Restructure nav to Today/Training/Nutrition/Progress/More. Add a Today panel
(greeting, coaching focus, featured workout + Continue, nutrition & weight
summaries, quick links). Merge Overview+Track into More with an Edit-plan button.
Add landing logic: valid saved plan → render Today; corrupt → recovery + onboarding;
none → onboarding. No product-data schema change; never clear logs on edit. Verify
the 8 scenarios."

## 9. Post-implementation review
**Approved.** Greeting-without-name and workout date-rotation both endorsed
("good enough for this stage"). Two refinements applied:
- **Adaptive workout button:** label reflects today's logged sets for the
  featured session — `Start Workout` (none) → `Continue Workout` (some) →
  `View Summary` (all). Accounts for swaps; read-only over existing data.
- **Focus-driven ordering:** the summary card matching today's top focus rises
  just under the Coaching Focus — `protein_gap` → Nutrition first, `weight_trend`
  → Check-in first, lift focus → Workout first. Gentle prioritization, nothing
  hidden or animated.
- **Bonus fix:** tab activation now re-renders the opened panel, so Today (and
  Nutrition/More/Progress) always reflect the latest logs instead of a stale
  snapshot from build time.

Re-verified: all three button states + all three orderings via headless browser;
no console errors.
