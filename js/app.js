/*
 * app.js — UI layer
 * -----------------
 * Reads the intake form, hands the answers to Coach.buildPlan() (the logic),
 * and renders the personalized plan. No coaching math lives here — that's all
 * in coach.js. This file is purely about collecting input and drawing output.
 */

(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const form = $('#coachForm');
  const planEl = $('#plan');
  const intakeEl = $('#intake');
  const errorEl = $('#formError');

  /* ---- Unit toggle: show metric or imperial height + weight label ---- */
  const unitsSel = $('#units');
  function applyUnits() {
    const imperial = unitsSel.value === 'imperial';
    document.querySelectorAll('.metric-only').forEach((el) => (el.hidden = imperial));
    document.querySelectorAll('.imperial-only').forEach((el) => (el.hidden = !imperial));
    $('#wUnit').textContent = imperial ? '(lb)' : '(kg)';
  }
  unitsSel.addEventListener('change', applyUnits);
  applyUnits();

  /* ---- Collect form values into a plain object ---- */
  function readForm() {
    const data = Object.fromEntries(new FormData(form).entries());
    // FormData omits empty optional fields; normalize bodyFat.
    if (!data.bodyFat) data.bodyFat = '';
    return data;
  }

  /* ---- Validation ---- */
  function validate(d) {
    if (!d.age || Number(d.age) < 14) return 'Please enter a valid age.';
    if (!d.weight || Number(d.weight) <= 0) return 'Please enter your weight.';
    const h = d.units === 'imperial' ? d.heightIn : d.heightCm;
    if (!h || Number(h) <= 0) return 'Please enter your height.';
    return null;
  }

  /* ---- Small render helpers ---- */
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function statBlock(plan) {
    const e = plan.energy;
    const dirWord =
      plan.phase.direction === 'deficit' ? `−${e.adjustPct}% deficit` :
      plan.phase.direction === 'surplus' ? `+${e.adjustPct}% surplus` : 'maintenance';
    return `
      <div class="stat-grid">
        <div class="stat"><div class="num">${e.bmr}</div><div class="lbl">BMR (kcal)</div></div>
        <div class="stat"><div class="num">${e.maintenance}</div><div class="lbl">Maintenance (kcal)</div></div>
        <div class="stat accent"><div class="num">${e.target}</div><div class="lbl">Daily target · ${dirWord}</div></div>
      </div>`;
  }

  function macroSection(plan) {
    const m = plan.macros;
    const b = m.breakdown;
    const total = b.proteinKcal + b.fatKcal + b.carbsKcal || 1;
    const pPct = (b.proteinKcal / total) * 100;
    const cPct = (b.carbsKcal / total) * 100;
    const fPct = (b.fatKcal / total) * 100;
    return `
      <h3>🍽️ Daily Macros</h3>
      <div class="stat-grid">
        <div class="stat"><div class="num">${m.protein}<small>g</small></div><div class="lbl">Protein</div></div>
        <div class="stat"><div class="num">${m.carbs}<small>g</small></div><div class="lbl">Carbs</div></div>
        <div class="stat"><div class="num">${m.fat}<small>g</small></div><div class="lbl">Fat</div></div>
        <div class="stat"><div class="num">${m.fiber}<small>g</small></div><div class="lbl">Fiber (min)</div></div>
      </div>
      <div class="macro-bar">
        <i class="p" style="width:${pPct}%"></i>
        <i class="c" style="width:${cPct}%"></i>
        <i class="f" style="width:${fPct}%"></i>
      </div>
      <div class="macro-legend">
        <span><i class="dot" style="background:#ff5c39"></i><b>${Math.round(pPct)}%</b> protein</span>
        <span><i class="dot" style="background:#ffb03a"></i><b>${Math.round(cPct)}%</b> carbs</span>
        <span><i class="dot" style="background:#4ade80"></i><b>${Math.round(fPct)}%</b> fat</span>
        <span>💧 <b>${m.waterL} L</b> water/day</span>
      </div>
      <div class="callout">
        Protein is set first (muscle-protective), then fat for hormones, then carbs
        fuel training. Spread protein over 4–5 meals (~40–50 g each).
      </div>`;
  }

  function sessionTable(work) {
    const rows = work
      .map(
        (w) => `
        <tr>
          <td><span class="ex">${esc(w.exercise)}</span>${w.note ? `<div class="note">${esc(w.note)}</div>` : ''}</td>
          <td>${esc(w.sets)}</td>
          <td>${esc(w.reps)}</td>
          <td>${esc(w.rir)}</td>
        </tr>`
      )
      .join('');
    return `<table><thead><tr><th>Exercise</th><th>Sets</th><th>Reps</th><th>RIR</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  function trainingSection(plan) {
    const t = plan.training;
    const days = t.days
      .map((d) => `<div class="day-block"><h4>${esc(d.title)}</h4>${sessionTable(d.work)}</div>`)
      .join('');
    return `
      <h3>🏋️ Training — ${esc(t.name)}</h3>
      <div class="callout"><b>${esc(t.frequency)}.</b> ${t.rolling ? esc(t.rolling) : 'Train hard but leave 1–2 reps in reserve on compounds; take isolation closer to failure. Control the eccentric, full range of motion.'}</div>
      ${days}
      <div class="callout"><b>Progressive overload:</b> each session try to add a rep. When you hit the top of the rep range on all sets, add weight and drop back to the bottom. Deload every 5–6 weeks.</div>`;
  }

  function cardioSection(plan) {
    const c = plan.cardio;
    return `
      <h3>🏃 Cardio</h3>
      <ul class="clean">
        <li><b>Steps:</b> <span>${esc(c.steps)}</span></li>
        <li><b>Sessions:</b> <span>${esc(c.sessions)}</span></li>
      </ul>
      <div class="callout">${esc(c.note)}</div>`;
  }

  function suppSection(plan) {
    const items = plan.supplements
      .map((s) => `<li><b>${esc(s.name)}</b> — <span>${esc(s.dose)} · ${esc(s.why)}</span></li>`)
      .join('');
    return `<h3>💊 Supplements (evidence-based)</h3><ul class="clean">${items}</ul>`;
  }

  function trackingSection() {
    return `
      <h3>📊 Track & Adjust Weekly</h3>
      <ul class="clean">
        <li><b>Weigh daily,</b> <span>use the 7-day average — single days are noisy.</span></li>
        <li><b>Measure your waist</b> <span>and take photos every 1–2 weeks.</span></li>
        <li><b>Log every working set</b> <span>(weight × reps × RIR) and try to beat it.</span></li>
        <li><b>Adjust on the trend:</b> <span>losing 0.5–1%/wk → hold. Stalled 2 wks → −150 kcal or +2k steps. Losing too fast / lifts dropping → +150 kcal.</span></li>
      </ul>
      <div class="callout">Change <b>one</b> variable at a time, then wait ~2 weeks to read the result. See <b>coaching-plan/07-tracking.md</b> for the full protocol.</div>`;
  }

  function render(plan) {
    const goalWord =
      plan.phase.direction === 'deficit' ? 'Fat Loss' :
      plan.phase.direction === 'surplus' ? 'Muscle Gain' : 'Recomposition';
    const bf = plan.body.bodyFat != null ? ` · ~${plan.body.bodyFat}% body fat` : '';
    const rate = plan.phase.targetRate ? ` Target loss rate: <b>${plan.phase.targetRate}</b>.` : '';

    planEl.innerHTML = `
      <h2>Your ${esc(goalWord)} Plan</h2>
      <div class="phase-banner">
        <div class="pill">Phase: ${esc(plan.phase.name)}</div>
        <div>${esc(plan.phase.summary)}${rate}</div>
      </div>

      <p style="color:var(--muted);margin-top:-6px">
        ${plan.body.sex === 'female' ? 'Female' : 'Male'}, ${plan.body.age} yrs ·
        ${plan.body.weightKg} kg (${plan.body.weightLb} lb) · ${plan.body.heightCm} cm${bf} ·
        ${esc(plan.experience)} · ${plan.days} days/week
      </p>

      <h3>🔥 Energy Targets</h3>
      ${statBlock(plan)}

      ${macroSection(plan)}
      ${trainingSection(plan)}
      ${cardioSection(plan)}
      ${suppSection(plan)}
      ${trackingSection()}

      <div class="actions">
        <button class="btn-ghost" id="editBtn">← Edit my answers</button>
        <button class="btn-ghost" id="printBtn">🖨️ Save / print plan</button>
      </div>
    `;

    planEl.hidden = false;
    intakeEl.hidden = true;
    window.scrollTo({ top: 0, behavior: 'smooth' });

    $('#editBtn').addEventListener('click', () => {
      planEl.hidden = true;
      intakeEl.hidden = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    $('#printBtn').addEventListener('click', () => window.print());
  }

  /* ---- Submit handler ---- */
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    errorEl.hidden = true;

    const data = readForm();
    const err = validate(data);
    if (err) {
      errorEl.textContent = err;
      errorEl.hidden = false;
      return;
    }

    try {
      const plan = Coach.buildPlan(data);
      render(plan);
    } catch (ex) {
      errorEl.textContent = 'Something went wrong building your plan. Check your inputs and try again.';
      errorEl.hidden = false;
      console.error(ex);
    }
  });
})();
