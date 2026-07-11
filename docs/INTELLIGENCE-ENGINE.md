# The Intelligence Engine — Architecture

This is the spine every feature plugs into. It is **implementation-agnostic**:
powered by deterministic rules today, expandable to on-device ML or cloud models
later — behind the *same interface*, so the UI never depends on how a decision
was reached.

> Governing rule (from [`PRINCIPLES.md`](PRINCIPLES.md)): **the UI never
> calculates. It renders what the engine returns.**

---

## 1. The four layers

```
┌──────────────────────────────────────────────────────────────┐
│  LAYER 4 · EXECUTOR        applies APPROVED actions to data    │  (Phase 4)
│    the only writer of plan changes; never runs without consent │
├──────────────────────────────────────────────────────────────┤
│  LAYER 3 · UI              renders Insights + Recommendations   │
│    zero calculation; on approval calls the Executor            │
├──────────────────────────────────────────────────────────────┤
│  LAYER 2 · INTELLIGENCE    Context → Insights → Recommendations │  ← the engine
│    pure, testable, no DOM; a registry of providers             │
├──────────────────────────────────────────────────────────────┤
│  LAYER 1 · DATA (store.js) persistence only, no logic          │  ✅ exists
└──────────────────────────────────────────────────────────────┘
```

Dependencies point **down only**. UI → Intelligence → Data. Intelligence never
imports the DOM; Data never imports Intelligence.

---

## 2. Core types (the contract)

These shapes are the boundary. The UI knows only these — never a formula.

```ts
// A read-only snapshot the engine reads from. Assembled from Store by the
// engine, NOT by the UI. The engine is the only thing that touches raw data.
interface Context {
  profile:   PlanInput;                 // goal, stats, calorieAdjust…
  plan:      Plan;                      // derived targets/split (Coach.buildPlan)
  weight:    { date: string; kg: number }[];
  food:      Record<string, FoodEntry[]>;
  workouts:  Record<string, Record<string, Set[]>>;
  today:     string;                    // ISO date, injected (never Date.now in core)
}

// LAYER 2 output A — an OBSERVATION. No advice, just "what is true."
interface Insight {
  id:       string;                     // stable, e.g. "lift_stalling:Bench"
  type:     InsightType;                // see taxonomy §5
  severity: 'info' | 'good' | 'watch' | 'alert';
  subject?: string;                     // e.g. an exercise name
  title:    string;                     // "Bench is stalling"
  detail:   string;                     // human sentence
  data:     Record<string, unknown>;    // machine values (e.g. { weeks: 3 })
  since?:   string;                     // ISO date the condition began
}

// LAYER 2 output B — ADVICE tied to insight(s), with a concrete action.
interface Recommendation {
  id:         string;
  insightIds: string[];                 // provenance
  title:      string;                   // "Add 150 kcal"
  detail:     string;
  confidence: number;                   // 0–1
  action:     Action;                   // what the Executor would do
}

// A described, not-yet-applied change. The Executor knows how to run each kind.
interface Action {
  kind:    'adjust_calories' | 'swap_exercise' | 'increase_load'
         | 'deload' | 'adjust_cardio' | 'none';
  payload: Record<string, unknown>;     // e.g. { delta: -150 }
  reversible: boolean;
}
```

### The engine calls the UI is allowed to make

```ts
Intelligence.getSignals(ctx: Context): CoachSignal[]   // all observations+advice
Intelligence.getTopFocus(ctx: Context): CoachSignal | null  // the ONE priority
```

That's it. The UI renders what it's given. It never inspects raw `Context` to
decide anything.

**`getTopFocus` enforces Principle 6 (one priority at a time):** it ranks all
signals by a computed `priority` (severity × confidence, with type weighting) and
returns only the single highest-impact one for today. The rest stay available via
`getSignals` but never compete for attention.

### CoachSignal — the unified provider output (Feature 001)

For the foundation, a provider returns one combined object that carries both the
observation *and* the advice (an `Insight` fused with an optional
`Recommendation`). This is the shape the UI will render:

```ts
interface CoachSignal {
  id:             string;
  type:           string;      // 'lift_stall' | 'pr' | 'weight_trend' | 'protein_gap' …
  subject?:       string;      // e.g. an exercise name
  severity:       'info' | 'good' | 'watch' | 'alert';
  confidence:     number;      // 0–100 (also feeds priority ranking)
  priority:       number;      // computed impact score for ranking
  title:          string;      // INSIGHT — "Bench press has stalled"
  explanation:    string;      // the observed fact, one line
  reasoning:      string;      // REASONING — the coach's "why", the thinking step
  evidence:       string[];    // data-backed bullets the user can verify
  recommendation: string;      // what to do about it
  action?:        Action;      // optional machine-applicable change
  data:           Record<string, unknown>;
}
```

**The layered thinking (Insight → Reasoning → Recommendation):** a signal doesn't
jump from observation to advice. `title`/`explanation` state *what is true*,
`reasoning` explains *why it matters* (e.g. "other lifts are still progressing,
so this is exercise-specific, not fatigue"), and `recommendation` says *what to
do*. `evidence` backs it with the user's own numbers — trust comes from showing
the work. `confidence` (0–100) both informs the user and is a ranking input, so
a 96%-confident stall outranks a 41%-confident protein gap.

A `CoachSignal` with no `action` is a pure observation (Phase 2). One with an
`action` is a recommendation the Executor could apply (Phase 3/4).

---

## 3. Providers — how features are added

The engine is a **registry of providers**. A provider is a pure function that
reads `Context` and emits insights or recommendations. **Adding a feature =
adding a provider, not editing the UI.**

```ts
interface InsightProvider {
  id: string;
  run(ctx: Context): Insight[];         // pure, deterministic-by-default
}
interface RecommendationProvider {
  id: string;
  run(ctx: Context, insights: Insight[]): Recommendation[];
}
```

`getInsights` runs all insight providers and flattens; `getRecommendations`
runs recommendation providers over the produced insights. Order-independent;
each provider is independently unit-testable.

**Existing code maps in cleanly (future refactor, not now):**
- `Coach.weeklyRecommendation` → one `RecommendationProvider` (calories).
- `Store.getExerciseHistory` / `weeklyTrend` / `recentCalories` → data the
  engine reads to build `Context`; they stay in Layer 1.

---

## 4. Tiered intelligence (same interface, swappable power)

A provider declares how it's powered; the interface is identical, so the UI is
blind to the tier.

| Tier | Power source | Privacy/offline/free | Use for |
|---|---|---|---|
| **T1 Deterministic** | pure rules over Context | ✅ default, always on | ~80% of coaching decisions |
| **T2 On-device ML** | small local model | ✅ on-device | NL parsing, pattern personalization |
| **T3 Cloud model** | remote LLM | ❌ opt-in only, discloses, may cost | open-ended chat, nuance |

Rules:
- **T1 is the always-on core.** Ship every decision as T1 first.
- **T2/T3 are opt-in** behind a settings flag (Principle 5). If the flag is off
  or offline, the engine falls back to T1 and the UI is unaffected.
- A provider may be **upgraded** T1→T2→T3 later without any UI change, because
  the output type is fixed.

---

## 5. Insight taxonomy (Phase 2 — "Understand")

The catalog of observations to build, all T1/deterministic. Each is one provider
reading data we already store.

| `type` | Fires when | Reads |
|---|---|---|
| `lift_stalling` | est-1RM flat/down over N sessions | `getExerciseHistory` |
| `lift_pr` | new best est-1RM | `getExerciseHistory` |
| `weight_too_fast` | weekly loss > 1.25% BW | `weeklyTrend` |
| `weight_stalled` | ~0 change over 2 wks on a cut | `weeklyTrend` |
| `weight_on_track` | within target rate | `weeklyTrend` |
| `protein_gap` | today's protein < target, day progressing | `foodTotals`, `plan` |
| `calorie_over` / `calorie_under` | vs today's target | `foodTotals`, `plan` |
| `adherence_low` | few logged days in last 7 | `recentCalories` |
| `missed_workout` | scheduled day with no sets | workouts + schedule* |
| `deload_due` | N weeks since last deload | workouts* |

`*` needs a small data addition (schedule / deload marker) — spec it explicitly
via the Data Contract (§7).

---

## 6. Recommendations, Automation, NL (Phases 3–5)

- **Phase 3 (Explain):** `RecommendationProvider`s map insights → `Action`s
  (`weight_stalled` → `adjust_calories {delta:-150}`; `lift_progressing` →
  `increase_load`). Still deterministic. UI shows an **Approve** button.
- **Phase 4 (Automate):** on approve, UI calls `Executor.apply(action)` — the
  **only** writer of plan changes. Every action is `reversible` where possible;
  applied actions are logged so they can be undone/audited.
- **Phase 5 (NL):** natural language is an **input adapter** — text/voice →
  either a Store write ("Bench 100 for 5") or a Context query ("I only have 25
  min"). It feeds the same engine; it is not the intelligence.

---

## 6b. Coach Memory (reserved — not yet implemented)

A future layer sits between insights and reasoning:

```
Data  →  Insights  →  Memory  →  Reasoning  →  Recommendation
```

**Coach Memory** holds *persistent* user facts — not transient insights — that
make recommendations feel personal:

- dislikes Bulgarian split squats
- trains after work
- prefers dumbbells
- recurring shoulder irritation
- usually misses Friday workouts

When present, `buildContext()` will attach `memory` to the `Context`, and
providers/reasoning may read it (e.g. never recommend an exercise the user
flagged as painful; assume Friday sessions slip). It will live under its own
store namespace (e.g. `coach_memory`), so adding it is **additive — no change to
existing keys**. **No implementation in the current phase**; this section only
reserves the concept and its place in the pipeline so nothing else is designed in
a way that blocks it.

---

## 7. Feature spec template (what each spec must contain)

Every feature is specified with these seven sections so implementation is
unambiguous and testable:

1. **Problem** — the user pain, in one paragraph.
2. **UX flow** — every screen, interaction, animation, empty/loading state.
3. **Edge cases** — skipped workout, offline, bad input, edited data, engine
   returns nothing, etc.
4. **Technical architecture** — which layer(s) change; which provider(s) are
   added; confirmation the UI stays calculation-free.
5. **Data contract** — exact store shape/keys **added or changed**, and the
   **migration** for existing `ptrainer_data_v1` users (must never corrupt
   existing data).
6. **Acceptance criteria / Definition of Done** — the observable pass/fail
   checks (unit + headless-browser) I run before declaring done.
7. **Claude implementation prompt** — the low-ambiguity task to execute.

---

## 8. Non-negotiables (enforced in review)

- **UI purity:** no thresholds/formulas/decisions in view code. If a view needs
  a number to decide, that decision belongs to a provider.
- **Privacy default:** T1 on-device is the default path; T3 is opt-in + disclosed.
- **Offline-first:** every feature degrades to T1 and works with no network.
- **No feature without a provider:** intelligence is added by registering a
  provider, never by branching inside the UI.
- **Data safety:** persistence changes ship with a migration and are covered by
  the Definition of Done.
- **The MVP gate:** a feature ships only if it passes the three questions in
  [`PRINCIPLES.md`](PRINCIPLES.md).

---

## 9. Current status vs. this architecture

- **Layer 1 (Data):** exists (`store.js`) — persistence only. ✅
- **Layer 2 (Intelligence):** partially present but **not yet abstracted** —
  `Coach.weeklyRecommendation` is a de-facto recommendation provider; there is
  no `Insight` layer, no registry. This is the next build target.
- **Layer 3 (UI):** mostly compliant — the weekly check-in already only renders
  what `weeklyRecommendation` returns. Some other cards still compute display
  values inline; those get migrated as providers are introduced.
- **Layer 4 (Executor):** the check-in "Apply" is a proto-executor
  (`adjust_calories`); it will formalize under this contract in Phase 4.

**Immediate goal:** stand up Layer 2 — a thin Intelligence Engine with the
`Insight`/`Recommendation` types, a provider registry, and the first insight
providers — so Phases 2–5 plug into one abstraction instead of each re-deriving
trends in the UI.
