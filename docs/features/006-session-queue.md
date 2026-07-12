# Feature 006 — Session Queue (progress-led programming)

Status: **Implemented — awaiting post-implementation review (step 9).**
Layer: logic (`coach.js`) + data (`store.js`) + UI (`app.js`). User-visible: **Yes**.

---

## 1. Product goal
Replace calendar-driven workout selection with **completion-driven** progression.
The user never asks "what day is it?" — they ask "what's my next workout?", and
the app always knows. This is the positioning: **progress-led, not coach-led.**

## 2. User flow
Queue: ▶ Push A · Pull A · Legs A → complete Push → ✓ Push ▶ Pull → complete Pull
→ ✓ ✓ ▶ Legs → complete Legs → cycle wraps → ▶ Push. Missing days changes
nothing — the next session is still the next session.

## 3. Data model (journey-shaped, not an index)
Additive object in `ptrainer_data_v1` — **no new key, no migration**:
```
program { currentSessionId, completedSessions, completedCycles }
```
Session IDs are stable and meaningful (`push`/`pull`/`legs`, `upper-a`… ,
`full-a`…), added to each `training.days` entry in `coach.js`. Room to grow
(mesocycles, deloads, travel templates) without redesigning storage.

## 4. Technical architecture
- `coach.js`: each session day now has `{ id, label, title, work }`.
- `store.js`: `getProgramState()` / `saveProgramState()` (time-independent).
- `app.js`:
  - `currentSession(plan)` — resolves the current session; self-heals to the
    first session if the stored id no longer exists (e.g. split changed).
  - `advanceIfCurrent(plan, sessionId)` — advances only when the *current*
    session is completed (so re-finishing never double-advances); wraps and
    increments `completedCycles`.
  - Today's hero = the current session ("Next Session", not date-rotation). The
    `dayOfYear` selection is gone.
  - **Program Progress** card on Today (▶ current, ✓ done-this-cycle, · pending).
  - Completing the current session (Finish Workout / Today's View Summary)
    advances the queue and the completion screen names the next session.

## 5. Data contract
No new localStorage key, no migration. `program` is additive; workout history,
swaps, food, and weight are untouched. Editing the plan **preserves** the queue
when the split is unchanged (same session ids); a structural split change
self-heals to the first session (see §9).

## 6. Acceptance criteria — status
- Calendar/day-of-week logic removed from workout selection ✅
- Today always displays the current session ✅
- Completing a workout advances to the next session ✅
- Closing the app does not lose queue position ✅ (persisted)
- Missing days does not advance or rewind ✅ (time-independent)
- Existing workout history untouched ✅
- Coach Brain continues to work ✅
- Editing resets the queue only with consent — **partial, see §9**
- Program Progress card on Today ✅
- No calendar streaks / "you missed Monday" messaging ✅ (never added)

## 7. Test plan — executed
Node: advance push→pull→legs→wrap (cycles++), double-finish guard, time-
independence, heal on structural change. Browser: current session on Today +
Program Progress markers; log all Push → Finish → completion names "Next session:
Pull" → queue advances → Today shows Pull (✓ Push ▶ Pull); position survives
reload; Coach Brain + history intact. No console errors.

## 8. Claude implementation prompt
"Add session-based programming: stable session ids on plan days; a `program`
object in the store (currentSessionId/completedSessions/completedCycles); resolve
the current session on Today (remove date-rotation); advance the queue when the
current session is completed (guard against double-advance, wrap cycles); add a
Program Progress card. No new storage key, no calendar/streak logic. Verify the
queue flow."

## 9. Post-implementation review
_Pending PM review. One flag on the "reset only with consent" criterion:
same-structure edits (weight/goal/etc.) **preserve** the queue (ids unchanged); a
**structural** split change (e.g. 6-day PPL → 3-day full body) makes the old
session ids meaningless, so the queue self-heals to the first session silently.
Adding an explicit "your program changed — restart queue?" confirm is a small
follow-up if you want strict adherence. Files: `coach.js` (session ids),
`store.js` (program state), `app.js` (currentSession/advance/Today/Program
Progress), `styles.css` (.prog-queue/.pq-*/.wc-nextsession)._
