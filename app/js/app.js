/*
 * app.js — UI layer (Strava-style, tabbed dashboard)
 * --------------------------------------------------
 * Reads the intake form, calls Coach.buildPlan() (the logic in coach.js), and
 * renders a sectioned, app-like plan: Overview · Nutrition · Training · Track.
 * The Track tab hosts the Fitbit connection (fitbit.js). No coaching math here.
 */

(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const form = $('#coachForm');
  const planEl = $('#plan');
  const intakeEl = $('#intake');
  const errorEl = $('#formError');
  const LS_INPUT = 'lastPlanInput';

  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ------------------------- Units toggle ------------------------- */
  const unitsSel = $('#units');
  function applyUnits() {
    const imperial = unitsSel.value === 'imperial';
    document.querySelectorAll('.metric-only').forEach((el) => (el.hidden = imperial));
    document.querySelectorAll('.imperial-only').forEach((el) => (el.hidden = !imperial));
    $('#wUnit').textContent = imperial ? '(lb)' : '(kg)';
  }
  unitsSel.addEventListener('change', applyUnits);
  applyUnits();

  /* --------------------------- Form I/O --------------------------- */
  function readForm() {
    const data = Object.fromEntries(new FormData(form).entries());
    if (!data.bodyFat) data.bodyFat = '';
    return data;
  }

  function prefillForm(d) {
    if (!d) return;
    Object.entries(d).forEach(([k, v]) => {
      const el = form.elements[k];
      if (!el) return;
      if (el instanceof RadioNodeList || (el.length && el[0] && el[0].type === 'radio')) {
        const radio = form.querySelector(`input[name="${k}"][value="${v}"]`);
        if (radio) radio.checked = true;
      } else {
        el.value = v;
      }
    });
    applyUnits();
  }

  function validate(d) {
    if (!d.age || Number(d.age) < 14) return 'Please enter a valid age.';
    if (!d.weight || Number(d.weight) <= 0) return 'Please enter your weight.';
    const h = d.units === 'imperial' ? d.heightIn : d.heightCm;
    if (!h || Number(h) <= 0) return 'Please enter your height.';
    return null;
  }

  /* ---------------------- Panel builders -------------------------- */

  function overviewPanel(plan) {
    const e = plan.energy;
    const dir =
      plan.phase.direction === 'deficit' ? `−${e.adjustPct}% deficit` :
      plan.phase.direction === 'surplus' ? `+${e.adjustPct}% surplus` : 'maintenance';
    const c = plan.cardio;
    return `
      <div class="section-title">Daily energy</div>
      <div class="stat-row">
        <div class="stat"><div class="num">${e.bmr}</div><div class="lbl">BMR</div></div>
        <div class="stat"><div class="num">${e.maintenance}</div><div class="lbl">Maintenance</div></div>
        <div class="stat hero-stat"><div class="num">${e.target}</div><div class="lbl">Target · ${dir}</div></div>
      </div>
      <div class="info-card">
        <h3>🏃 Cardio & Activity</h3>
        <ul class="clean">
          <li><b>Steps</b><div style="color:var(--muted);margin-top:2px">${esc(c.steps)}</div></li>
          <li><b>Sessions</b><div style="color:var(--muted);margin-top:2px">${esc(c.sessions)}</div></li>
        </ul>
        <div class="callout" style="margin-top:12px">${esc(c.note)}</div>
      </div>`;
  }

  function nutritionPanel(plan) {
    const m = plan.macros;
    const b = m.breakdown;
    const total = b.proteinKcal + b.fatKcal + b.carbsKcal || 1;
    const pPct = (b.proteinKcal / total) * 100;
    const cPct = (b.carbsKcal / total) * 100;
    const fPct = (b.fatKcal / total) * 100;
    return `
      <div class="section-title">Hit these every day</div>
      <div class="stat-row">
        <div class="stat hero-stat"><div class="num">${plan.energy.target}</div><div class="lbl">Calories</div></div>
        <div class="stat"><div class="num">${m.protein}<small>g</small></div><div class="lbl">Protein</div></div>
        <div class="stat"><div class="num">${m.carbs}<small>g</small></div><div class="lbl">Carbs</div></div>
        <div class="stat"><div class="num">${m.fat}<small>g</small></div><div class="lbl">Fat</div></div>
      </div>
      <div class="info-card">
        <div class="macro-bar">
          <i class="p" style="width:${pPct}%"></i><i class="c" style="width:${cPct}%"></i><i class="f" style="width:${fPct}%"></i>
        </div>
        <div class="macro-legend" style="margin-top:12px">
          <span><i class="dot" style="background:var(--orange)"></i><b>${Math.round(pPct)}%</b> protein</span>
          <span><i class="dot" style="background:#f7b500"></i><b>${Math.round(cPct)}%</b> carbs</span>
          <span><i class="dot" style="background:var(--good)"></i><b>${Math.round(fPct)}%</b> fat</span>
          <span>🌾 <b>${m.fiber} g</b> fiber</span>
          <span>💧 <b>${m.waterL} L</b> water</span>
        </div>
        <div class="callout" style="margin-top:14px">
          Protein is set first (protects muscle), then fat for hormones, then carbs
          fuel training. Spread protein over <b>4–5 meals</b> (~40–50 g each).
        </div>
      </div>`;
  }

  function trainingPanel(plan) {
    const t = plan.training;
    const cards = t.days
      .map(
        (d) => `
        <div class="day-card">
          <h4>💪 ${esc(d.title)}</h4>
          <div class="exs">
            ${d.work
              .map(
                (w) => `
              <div class="ex-row">
                <div>
                  <div class="ex-name">${esc(w.exercise)}</div>
                  ${w.note ? `<div class="ex-note">${esc(w.note)}</div>` : ''}
                </div>
                <div class="ex-prescription">${esc(w.sets)} × ${esc(w.reps)}<small>${esc(w.rir)} RIR</small></div>
              </div>`
              )
              .join('')}
          </div>
        </div>`
      )
      .join('');
    return `
      <div class="section-title">${esc(t.name)} · ${esc(t.frequency)}</div>
      <div class="callout">${t.rolling ? esc(t.rolling) : 'Leave 1–2 reps in reserve on compounds; take isolation closer to failure. Control the eccentric, full range of motion.'}</div>
      ${cards}
      <div class="callout"><b>Progressive overload:</b> each session add a rep. Hit the top of the range on all sets → add weight, drop to the bottom. Deload every 5–6 weeks.</div>`;
  }

  function trackPanel(plan) {
    const supps = plan.supplements
      .map((s) => `<li><b>${esc(s.name)}</b> <span style="float:right">${esc(s.dose)}</span><div style="color:var(--muted);font-size:0.82rem;clear:both">${esc(s.why)}</div></li>`)
      .join('');
    return `
      <div class="section-title">Sync your wearable</div>
      <div id="fitbitCard" class="fitbit-card"></div>

      <div class="section-title">Weekly check-in</div>
      <div class="info-card">
        <ul class="clean">
          <li><b>Weigh daily</b> <span>— track the 7-day average, not single days.</span></li>
          <li><b>Waist + photos</b> <span>every 1–2 weeks.</span></li>
          <li><b>Log every working set</b> <span>and try to beat it.</span></li>
          <li><b>Adjust on the trend</b> <span>— losing 0.5–1%/wk → hold; stalled 2 wks → −150 kcal or +2k steps; too fast → +150 kcal.</span></li>
        </ul>
        <div class="callout" style="margin-top:12px">Change <b>one</b> variable at a time, then wait ~2 weeks. Full protocol in <b>coaching-plan/07-tracking.md</b>.</div>
      </div>

      <div class="section-title">Supplements</div>
      <div class="info-card"><ul class="clean">${supps}</ul></div>`;
  }

  /* ------------------------- Render plan -------------------------- */
  function render(plan) {
    const goalWord =
      plan.phase.direction === 'deficit' ? 'Fat Loss' :
      plan.phase.direction === 'surplus' ? 'Muscle Gain' : 'Recomposition';
    const bf = plan.body.bodyFat != null ? ` · ~${plan.body.bodyFat}% bf` : '';
    const rate = plan.phase.targetRate ? ` Target rate: ${plan.phase.targetRate}.` : '';

    planEl.innerHTML = `
      <div class="plan-hero">
        <span class="phase-chip">${esc(plan.phase.name)}</span>
        <div class="goal">Your ${esc(goalWord)} Plan</div>
        <div class="athlete-line">
          ${plan.body.sex === 'female' ? 'Female' : 'Male'} · ${plan.body.age} yrs ·
          ${plan.body.weightKg} kg (${plan.body.weightLb} lb) · ${plan.body.heightCm} cm${bf} ·
          ${esc(plan.experience)} · ${plan.days} days/week
        </div>
        <div class="phase-summary">${esc(plan.phase.summary)}${rate}</div>
      </div>

      <nav class="tabs" role="tablist">
        <button data-tab="overview" class="active">Overview</button>
        <button data-tab="nutrition">Nutrition</button>
        <button data-tab="training">Training</button>
        <button data-tab="track">Track</button>
      </nav>

      <div class="panel" data-panel="overview">${overviewPanel(plan)}</div>
      <div class="panel" data-panel="nutrition" hidden>${nutritionPanel(plan)}</div>
      <div class="panel" data-panel="training" hidden>${trainingPanel(plan)}</div>
      <div class="panel" data-panel="track" hidden>${trackPanel(plan)}</div>

      <div class="actions">
        <button class="btn-ghost" id="editBtn">← Edit answers</button>
        <button class="btn-ghost" id="printBtn">🖨️ Save / print</button>
      </div>
    `;

    planEl.hidden = false;
    intakeEl.hidden = true;

    // Tab switching
    const tabBtns = planEl.querySelectorAll('.tabs button');
    tabBtns.forEach((btn) =>
      btn.addEventListener('click', () => activateTab(btn.dataset.tab))
    );

    $('#editBtn').addEventListener('click', () => {
      planEl.hidden = true;
      intakeEl.hidden = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    $('#printBtn').addEventListener('click', () => window.print());

    renderFitbitCard();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function activateTab(name) {
    planEl.querySelectorAll('.tabs button').forEach((b) =>
      b.classList.toggle('active', b.dataset.tab === name)
    );
    planEl.querySelectorAll('.panel').forEach((p) => (p.hidden = p.dataset.panel !== name));
  }

  /* ------------------------- Fitbit wiring ------------------------ */
  function renderFitbitCard() {
    const card = $('#fitbitCard');
    if (!card || typeof Fitbit === 'undefined') return;

    if (Fitbit.isConnected()) {
      card.innerHTML = `
        <div class="fb-head"><span class="fb-teal">●</span> Fitbit connected</div>
        <div id="fbData" class="fb-note">Loading today's data…</div>
        <div class="actions" style="margin-top:12px">
          <button class="btn-ghost" id="fbRefresh">Refresh</button>
          <button class="btn-ghost" id="fbDisconnect">Disconnect</button>
        </div>`;
      $('#fbRefresh').addEventListener('click', syncFitbit);
      $('#fbDisconnect').addEventListener('click', () => { Fitbit.disconnect(); renderFitbitCard(); });
      syncFitbit();
      return;
    }

    const configured = Fitbit.isConfigured();
    card.innerHTML = `
      <div class="fb-head"><span class="fb-teal">⌚</span> Connect Fitbit</div>
      <div class="fb-note">Auto-fill your steps, weight, sleep, and resting heart rate straight from your Fitbit account.</div>
      <button class="btn-fitbit" id="fbConnect">Connect Fitbit</button>
      ${configured ? '' : '<div class="fb-note">⚙️ Setup needed: add your Client ID in <b>app/js/fitbit-config.js</b> and host over HTTPS. See <b>app/FITBIT.md</b>.</div>'}`;
    $('#fbConnect').addEventListener('click', async () => {
      try {
        await Fitbit.connect();
      } catch (e) {
        alert(e.message);
      }
    });
  }

  async function syncFitbit() {
    const box = $('#fbData');
    if (!box) return;
    try {
      const today = new Date().toISOString().slice(0, 10);
      const s = await Fitbit.fetchSnapshot(today);
      const sleepH = s.sleepMinutes != null ? (s.sleepMinutes / 60).toFixed(1) + ' h' : '—';
      box.outerHTML = `
        <div id="fbData" class="stat-row" style="margin-top:6px">
          <div class="stat"><div class="num">${s.steps ?? '—'}</div><div class="lbl">Steps</div></div>
          <div class="stat"><div class="num">${s.restingHr ?? '—'}</div><div class="lbl">Rest HR</div></div>
          <div class="stat"><div class="num">${sleepH}</div><div class="lbl">Sleep</div></div>
          <div class="stat"><div class="num">${s.weight ?? '—'}</div><div class="lbl">Weight</div></div>
        </div>`;
    } catch (e) {
      box.textContent = e.message;
    }
  }

  /* --------------------------- Submit ----------------------------- */
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    const data = readForm();
    const err = validate(data);
    if (err) { errorEl.textContent = err; errorEl.hidden = false; return; }
    try {
      const plan = Coach.buildPlan(data);
      localStorage.setItem(LS_INPUT, JSON.stringify(data));
      render(plan);
    } catch (ex) {
      errorEl.textContent = 'Something went wrong building your plan. Check your inputs and try again.';
      errorEl.hidden = false;
      console.error(ex);
    }
  });

  /* ----------------------- Init / OAuth redirect ------------------ */
  document.addEventListener('DOMContentLoaded', async () => {
    let justLoggedIn = false;
    try {
      if (typeof Fitbit !== 'undefined') justLoggedIn = await Fitbit.handleRedirect();
    } catch (e) {
      console.warn('Fitbit redirect handling failed:', e.message);
    }
    const saved = localStorage.getItem(LS_INPUT);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        prefillForm(data);
        // After a Fitbit login (or on revisit), jump straight back to the plan.
        if (justLoggedIn) {
          render(Coach.buildPlan(data));
          activateTab('track');
        }
      } catch { /* ignore corrupt saved state */ }
    }
  });
})();
