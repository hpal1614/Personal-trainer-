# 🏋️ Personal Bodybuilding Coaching Plan

A complete, evidence-based coaching system built for an **advanced lifter** (3+ years), training **5–6 days/week** in a **full commercial gym**, with the goal of **losing body fat while building/retaining muscle** (body recomposition → lean physique).

This is not a generic template. It's structured the way a qualified coach would program: a clear strategy, a periodized training block, a nutrition framework you plug your own numbers into, and the tracking system that actually drives results.

---

## ▶️ Use the interactive app

Don't want to do the math by hand? The repo ships a **runnable web app** that asks you the same questions a coach would and generates your personalized plan — calories, macros, a training split matched to your schedule and equipment, cardio, and supplements — all computed live from your inputs.

```bash
cd app
python3 -m http.server 8000   # then open http://localhost:8000
# or just open app/index.html directly in your browser
```

The coaching **logic** lives in [`app/js/coach.js`](app/js/coach.js) — pure, documented functions (Mifflin-St Jeor energy, protein-first macros, frequency-based split selection) that mirror the markdown docs below, so the app and the written plan never disagree.

---

## 📂 What's in here

| File | What it covers |
|------|----------------|
| [`coaching-plan/01-strategy.md`](coaching-plan/01-strategy.md) | The big picture: cut vs. recomp, timeline, phase structure, how the whole thing fits together. |
| [`coaching-plan/02-nutrition.md`](coaching-plan/02-nutrition.md) | Calorie & macro calculation (with a worked example), meal structure, food choices, refeeds, and diet breaks. |
| [`coaching-plan/03-training.md`](coaching-plan/03-training.md) | The full 6-day Push/Pull/Legs program with sets, reps, RIR, tempo, and exercise rationale. |
| [`coaching-plan/04-progression.md`](coaching-plan/04-progression.md) | Progressive overload scheme, autoregulation, deloads, and how to break plateaus. |
| [`coaching-plan/05-cardio-recovery.md`](coaching-plan/05-cardio-recovery.md) | Cardio prescription, step targets, sleep, stress, and recovery management. |
| [`coaching-plan/06-supplements.md`](coaching-plan/06-supplements.md) | Supplements ranked by evidence — what's worth it and what's a waste of money. |
| [`coaching-plan/07-tracking.md`](coaching-plan/07-tracking.md) | Weekly tracking protocol, biofeedback, and decision rules for adjusting the plan. |

---

## 🎯 Start here (5-minute setup)

1. **Read** [`01-strategy.md`](coaching-plan/01-strategy.md) to understand the approach.
2. **Calculate your numbers** in [`02-nutrition.md`](coaching-plan/02-nutrition.md) — you'll need bodyweight, height, age, and a rough body-fat estimate.
3. **Take baseline measurements** (see [`07-tracking.md`](coaching-plan/07-tracking.md)): weight, waist, photos, and key lift numbers.
4. **Start the program** in [`03-training.md`](coaching-plan/03-training.md).
5. **Check in weekly** using the protocol in [`07-tracking.md`](coaching-plan/07-tracking.md) and adjust.

---

## ⚠️ Important

This plan is educational and built on current exercise-science consensus. It is **not medical advice**. Before starting, clear it with a physician if you have any cardiovascular, metabolic, orthopedic, or other medical condition, are on medication, or are returning from injury. Train hard, train smart, and prioritize long-term joint health over short-term ego.
