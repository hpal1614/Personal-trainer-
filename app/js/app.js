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
      <div class="section-title">Log today's food</div>
      <div id="foodLogCard" class="info-card"></div>

      <div class="section-title">Your daily targets</div>
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
                <div style="flex:1">
                  <div class="ex-name">${esc(w.exercise)}</div>
                  ${w.note ? `<div class="ex-note">${esc(w.note)}</div>` : ''}
                  <div class="ex-log" data-ex="${esc(w.exercise)}">
                    <input class="w" type="number" inputmode="decimal" placeholder="wt" aria-label="weight" />
                    <span class="x">×</span>
                    <input class="r" type="number" inputmode="numeric" placeholder="reps" aria-label="reps" />
                    <button type="button" class="logBtn">Log</button>
                    <span class="last"></span>
                  </div>
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
      <div class="section-title">Bodyweight trend</div>
      <div id="weightCard" class="info-card"></div>

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
    currentUnit = unitsSel.value === 'imperial' ? 'lb' : 'kg';
    refreshFoodCard(plan);
    refreshWeightCard();
    wireLifts();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ----------------------- Food logger ---------------------------- */
  let currentUnit = 'kg';

  function refreshFoodCard(plan) {
    const card = $('#foodLogCard');
    if (!card) return;
    const kcalTarget = plan.energy.target;
    const protTarget = plan.macros.protein;
    const t = Store.foodTotals();
    const entries = Store.getFood();

    const kcalPct = Math.min(100, (t.kcal / kcalTarget) * 100);
    const protPct = Math.min(100, (t.protein / protTarget) * 100);
    const kcalOver = t.kcal > kcalTarget;

    const list = entries.length
      ? `<ul class="entries">${entries
          .map(
            (f, i) => `<li>
              <span><b>${esc(f.name)}</b> <span class="meta">${f.kcal} kcal · ${f.protein}g P</span></span>
              <button class="del" data-i="${i}" aria-label="remove">×</button>
            </li>`
          )
          .join('')}</ul>`
      : `<div class="empty">Nothing logged yet today. Add your first meal below.</div>`;

    card.innerHTML = `
      <div class="logger-head"><h3>🍽️ Today</h3><span class="today">${Store.todayISO()}</span></div>
      <div class="prog">
        <div class="prog-top"><span>Calories ${t.kcal} / ${kcalTarget}</span><span class="rem">${kcalOver ? '+' + (t.kcal - kcalTarget) + ' over' : (kcalTarget - t.kcal) + ' left'}</span></div>
        <div class="track"><div class="fill kcal ${kcalOver ? 'over' : ''}" style="width:${kcalPct}%"></div></div>
      </div>
      <div class="prog">
        <div class="prog-top"><span>Protein ${t.protein} / ${protTarget} g</span><span class="rem">${Math.max(0, protTarget - t.protein)}g left</span></div>
        <div class="track"><div class="fill prot" style="width:${protPct}%"></div></div>
      </div>
      <div class="log-form">
        <input id="fName" placeholder="Food (e.g. Chicken breast)" aria-label="food name" />
        <input id="fKcal" class="sm" type="number" inputmode="numeric" placeholder="kcal" aria-label="calories" />
        <input id="fProt" class="sm" type="number" inputmode="numeric" placeholder="P (g)" aria-label="protein" />
        <button id="fAdd" aria-label="add food">+</button>
      </div>
      ${list}`;

    const add = () => {
      const name = $('#fName').value.trim();
      const kcal = $('#fKcal').value;
      const prot = $('#fProt').value;
      if (!name && !kcal) return;
      Store.addFood({ name: name || 'Food', kcal, protein: prot });
      refreshFoodCard(plan);
    };
    $('#fAdd').addEventListener('click', add);
    card.querySelectorAll('.log-form input').forEach((inp) =>
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); })
    );
    card.querySelectorAll('.entries .del').forEach((b) =>
      b.addEventListener('click', () => { Store.removeFood(Number(b.dataset.i)); refreshFoodCard(plan); })
    );
  }

  /* ----------------------- Weight logger + chart ------------------ */
  function refreshWeightCard() {
    const card = $('#weightCard');
    if (!card) return;
    const series = Store.getWeightSeries();
    const avg = Store.weeklyAvg();
    const trend = Store.weeklyTrend();

    let trendPill = '<span class="trend-pill flat">Log a few days to see your trend</span>';
    if (trend != null) {
      const cls = trend < -0.05 ? 'down' : trend > 0.05 ? 'up' : 'flat';
      const arrow = trend < -0.05 ? '▼' : trend > 0.05 ? '▲' : '■';
      trendPill = `<span class="trend-pill ${cls}">${arrow} ${Math.abs(trend).toFixed(2)} ${currentUnit}/week</span>`;
    }

    card.innerHTML = `
      <div class="logger-head"><h3>⚖️ Weight</h3>${avg != null ? `<span class="today">7-day avg: <b>${avg.toFixed(1)} ${currentUnit}</b></span>` : ''}</div>
      <div class="chart-wrap">${weightChartSVG(series)}</div>
      <div style="margin:10px 0">${trendPill}</div>
      <div class="log-form">
        <input id="wIn" type="number" inputmode="decimal" placeholder="Today's weight (${currentUnit})" aria-label="weight" />
        <button id="wAdd" aria-label="log weight">+</button>
      </div>`;

    const add = () => {
      const v = parseFloat($('#wIn').value);
      if (!isFinite(v) || v <= 0) return;
      Store.logWeight(v);
      refreshWeightCard();
    };
    $('#wAdd').addEventListener('click', add);
    $('#wIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
  }

  /** Minimal, dependency-free SVG line chart of the weight series. */
  function weightChartSVG(series) {
    if (!series.length) return '<div class="empty">No weight logged yet. Add today\'s weight below to start your trend.</div>';
    const W = 320, H = 120, pad = 22;
    const vals = series.map((d) => d.kg);
    let min = Math.min(...vals), max = Math.max(...vals);
    if (min === max) { min -= 1; max += 1; }
    const n = series.length;
    const x = (i) => pad + (n === 1 ? (W - 2 * pad) / 2 : (i * (W - 2 * pad)) / (n - 1));
    const y = (v) => pad + (H - 2 * pad) * (1 - (v - min) / (max - min));
    const pts = series.map((d, i) => `${x(i).toFixed(1)},${y(d.kg).toFixed(1)}`).join(' ');
    const dots = series.map((d, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(d.kg).toFixed(1)}" r="2.5" fill="#fc4c02" />`).join('');
    const area = `${pad},${H - pad} ${pts} ${x(n - 1).toFixed(1)},${H - pad}`;
    return `
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Weight trend chart">
        <polyline points="${area}" fill="rgba(252,76,2,0.08)" stroke="none" />
        <polyline points="${pts}" fill="none" stroke="#fc4c02" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
        ${dots}
        <text x="${pad}" y="12" font-size="9" fill="#6d6d78">${max.toFixed(1)}</text>
        <text x="${pad}" y="${H - 6}" font-size="9" fill="#6d6d78">${min.toFixed(1)}</text>
      </svg>`;
  }

  /* ----------------------- Per-exercise lift log ------------------ */
  function wireLifts() {
    planEl.querySelectorAll('.ex-log').forEach((row) => {
      const ex = row.dataset.ex;
      const last = Store.getLastLift(ex);
      const lastEl = row.querySelector('.last');
      const paint = (l) => { lastEl.innerHTML = l ? `last: <b>${l.w}×${l.r}</b>` : ''; };
      paint(last);
      row.querySelector('.logBtn').addEventListener('click', () => {
        const w = row.querySelector('.w').value;
        const r = row.querySelector('.r').value;
        if (!w || !r) return;
        paint(Store.logLift(ex, w, r));
        row.querySelector('.w').value = '';
        row.querySelector('.r').value = '';
      });
    });
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
