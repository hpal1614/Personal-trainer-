# v0.5 Beta — Test Plan (5 users, 2 weeks)

The goal is not praise. It's to **watch where real people hesitate**. Those
hesitations should define Feature 006 — not our roadmap.

---

## Who
**Five people who actually train** (not designers, developers, or us). A mix
helps: 1–2 beginners, 2–3 intermediate, ideally one who's tried Strong/Hevy.

## How to give it to them
1. Send the link: **https://hpal1614.github.io/Personal-trainer-/**
2. One instruction only: *"Open it in Safari, tap Share → Add to Home Screen,
   and use it for your workouts for two weeks."*
3. **Explain nothing else.** If they ask how something works, note the question —
   that's a finding — then answer minimally.

## What to watch (hesitation = signal)
Don't ask "do you like it?" Watch for friction:
- **Onboarding:** Do they finish it? Where do they pause or re-read?
- **First workout:** Do they find how to log a set without help? Does "Repeat
  Last Set" make sense on sight?
- **Daily return:** Do they open it the next day *unprompted*? Do they land
  somewhere useful (Today)?
- **Coaching Focus:** Do they read it? Believe it? Act on it? Ignore it?
- **Logging food:** Where does this feel slow or annoying? (Likely friction hot-spot.)
- **Workout Complete:** Does it feel rewarding, or do they skip past it?
- **Drop-off:** Which day do they stop opening it, and what happened just before?

## The five questions (ask after 2 weeks, not before)
1. What did you open it for most?
2. What did you stop doing, and why?
3. Was there a moment it felt like a coach, not a tracker?
4. What was the single most annoying thing?
5. Would you keep using it? (And honestly — did you?)

## What to record
For each user, a one-page note:
- Did they return daily? (the retention signal that matters most)
- Top 3 friction points, verbatim.
- One thing they loved.
- One thing they expected that wasn't there.

## Turning it into Feature 006
After the two weeks, look for **patterns across users**, not one-off requests:
- If ≥3 users hesitate at the same step → that's Feature 006.
- Likely candidates the current design anticipates: *"logging meals is still
  slow"* (→ food quick-add / remembered meals), *"I forgot to start my workout"*
  (→ reminders / schedule), *"I wish it remembered my breakfast"* (→ meal
  templates / Coach Memory).
- Score each candidate against the one question we protect:
  **"Does this make someone feel more supported, with less effort?"**

## Guardrails during beta
- Don't ship changes mid-test (except crash fixes) — you're measuring *this*
  build.
- Don't add features in response to a single voice.
- Keep the identity intact: private, offline-first, calm, one priority at a time.
