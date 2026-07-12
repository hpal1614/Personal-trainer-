# Direction — Session-based + Immersion

A planning doc (not a spec). Captures the post-v0.5 direction so we sequence it
well and don't drift. Nothing is built from this yet.

---

## The shift

Two inversions, both sharpening the existing identity:

1. **Calendar-based → Session-based.** No weekdays. A **queue**: Next → (complete)
   → next → wraps. Completion advances the program, not the date. This *is* the
   differentiator — "your coach adapts to your progress," which can't depend on it
   being Monday.
2. **Dashboard-first → Workout-first (immersion).** The workout is the hero and
   the destination: `Today → Start → Immersive Workout Mode → Complete → Today`.

Both fix real weaknesses we shipped: Today currently picks a session by
`dayOfYear % days` (a stand-in we flagged in Feature 003), and the workout lives
inside a tab instead of being a focused experience.

## What we can build now (PWA) vs. what needs native

| Piece | Buildable now (PWA)? | Notes |
|-------|----------------------|-------|
| **Session Queue** (completion advances) | ✅ Yes | Deterministic, additive data field. Foundation for the rest. |
| **Workout-as-hero on Today** | ✅ Yes | The queue's "Next" session dominates the screen. |
| **Immersive Workout Mode** (full-screen, no tabs) | ✅ Yes | Reuses the zero-friction logger we built. Add **Screen Wake Lock** to keep the screen on. |
| **Simplified Workout Settings** (rest timer, order, swap, equipment, notes) | ✅ Yes | Mostly reshuffling existing controls. |
| **Live Activity** (lock screen / Dynamic Island) | ❌ Native only | A PWA cannot render a Live Activity. Needs a native shell + plugin. |
| **Apple Health** import/onboarding | ❌ Native only | HealthKit is native-only. (Fitbit is already covered via its web API.) |

**Honest constraint:** I can build, test, and ship the PWA pieces from here today.
The two native-only pieces need a **native shell** (e.g., **Capacitor** wrapping
*this same* web app) built on a Mac — I can scaffold it, but can't compile/verify
it in this environment. So the plan is: get ~80% of the vision (session model +
immersion) live in the PWA now; treat Live Activity + Apple Health as a later
"native shell" milestone, not a blocker.

## The session/queue model (data contract sketch)

- The plan already defines `training.days` (e.g. Push / Pull / Legs, or Upper A /
  Lower A / Upper B / Lower B). That ordered list **is** the cycle.
- Add one additive field to `ptrainer_data_v1`: `queueIndex` (default 0). **No
  migration** (absent = 0).
- **Next session** = `training.days[queueIndex]`. **Finish Workout** (we already
  have this) → `queueIndex = (queueIndex + 1) % days.length`.
- Today's hero renders "Next: {session}" + the beat-last-time headline + **Start**.

## Recommended sequence (one at a time, each shippable)

1. **Feature 006 — Session Queue.** Replace `dayOfYear` rotation with the queue;
   Finish Workout advances it. Small, foundational, low-risk. *Do this first.*
2. **Feature 007 — Workout as Hero.** Restructure Today so the session card
   dominates; demote macros/weight to supporting summaries.
3. **Feature 008 — Immersive Workout Mode.** Full-screen focus mode: one exercise
   at a time, zero-friction logging, rest timer, exit → Complete. Wake Lock.
4. **Feature 009 — Workout Settings (simplified).** Rest timer / order / swap /
   equipment / notes, framed around completing the workout.
5. **Later — Native shell (Capacitor).** Live Activity + Apple Health + haptics.
   A separate track; scaffolded when there's a Mac in the loop.

## Discipline notes
- Still validate immersion with the beta users — but the **session-queue model is
  a structural bet worth making now** because it's core identity, not polish.
- One feature at a time, each with the 9-step spec cycle. The queue (006) is the
  natural first spec because everything else sits on it.
- Promise to protect: *your personal coach that adapts to your progress* — the
  session model is what makes that literally true.
