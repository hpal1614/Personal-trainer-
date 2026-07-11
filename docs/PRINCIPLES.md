# Product Principles — the North Star

Every spec, feature, and code review is checked against this document. If a
proposal violates a principle, the proposal changes — not the principle.

---

## The thesis

**We are building a coach that decides — not a notebook that records.**

Most fitness apps stop at logging. Ours is built around **decisions**:

| A notebook says | A coach says |
|---|---|
| "Log Bench" | "Bench is stalling — add 2.5 kg or deload." |
| "Log Weight" | "You're losing weight too fast — add 150 kcal." |
| "Eat 220 g protein" | "You still need 58 g. Chicken breast or Greek yogurt." |

That shift — from **recording** data to **helping the user decide** — is the
product identity. It should feel less like "another AI fitness app" and more
like a coach that quietly makes the right calls.

---

## The evolution of the data

The product matures along one axis:

```
Phase 1  STORE      →  hold the data                 ✅ done
Phase 2  UNDERSTAND →  turn data into observations    (insights, no chat)
Phase 3  EXPLAIN    →  turn observations into advice  (recommendations)
Phase 4  AUTOMATE   →  apply advice on approval       (plan changes itself)
Phase 5  PREDICT/NL →  natural language as an INPUT    (not the core)
```

Conversation is optional. **Intelligence is not.**

---

## The five principles

**1. Logging should never feel like work.**
If a user spends more than ~10 seconds logging, we failed.

**2. AI should remove effort, not create conversation.**
Nobody wants to chat after heavy squats. Intelligence works silently; talking is
an opt-in convenience, never the main interface.

**3. Every screen answers "What do I do next?"**
No dead ends. A screen that only shows data without a next action is incomplete.

**4. The app gets smarter every week without asking more questions.**
Intelligence comes from the data the user already generates, not from more forms.

**5. Privacy is a feature.**
Everything stays on-device by default. Cloud/AI features are explicit, opt-in,
and clearly disclosed — never the default path.

---

## The separation law (non-negotiable)

**The UI never calculates anything. It only displays what the Intelligence
Engine returns.**

- No thresholds, formulas, or "if weight dropped more than X" logic in the view.
- The view asks the engine for insights/recommendations and renders them.
- All intelligence is testable in isolation, with no DOM.

See [`INTELLIGENCE-ENGINE.md`](INTELLIGENCE-ENGINE.md) for how this is enforced.

---

## The MVP gate — three questions

Before any feature enters the MVP, it must answer **yes to all three**:

1. **Does it reduce effort?**
2. **Does it improve results?**
3. **Will most users benefit from it every week?**

If any answer isn't a clear "yes," it waits. This is how the product stays a
coach instead of becoming a pile of features — the exact failure mode that
killed the previous app (2,900 lines of auth/donation code around an empty
core).
