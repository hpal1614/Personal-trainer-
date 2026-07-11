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

  /** One exercise: name + swap, prescription, last-time hint, per-set logger. */
  function exerciseRow(w) {
    const def = w.exercise;
    const current = (typeof Store !== 'undefined' && Store.getSwap(def)) || def;
    const alts = w.alternatives && w.alternatives.length > 1 ? w.alternatives : null;
    return `
      <div class="ex-row" data-default="${esc(def)}" data-ex="${esc(current)}">
        <div class="ex-head">
          <div style="flex:1">
            <div class="ex-name">
              <span class="ex-name-text">${esc(current)}</span>
              ${alts ? '<button type="button" class="swap-btn" aria-label="swap exercise" title="Swap exercise">⇄</button>' : ''}
            </div>
            ${w.note ? `<div class="ex-note">${esc(w.note)}</div>` : ''}
          </div>
          <div class="ex-prescription">${esc(w.sets)} × ${esc(w.reps)}<small>${esc(w.rir)} RIR</small></div>
        </div>
        ${alts ? `<div class="swap-menu" hidden>
          <select aria-label="choose alternative">
            ${alts.map((n) => `<option value="${esc(n)}"${n === current ? ' selected' : ''}>${esc(n)}</option>`).join('')}
          </select>
        </div>` : ''}
        <div class="last-hint"></div>
        <div class="set-list"></div>
        <div class="ex-log">
          <input class="w" type="number" inputmode="decimal" placeholder="wt" aria-label="weight" />
          <span class="x">×</span>
          <input class="r" type="number" inputmode="numeric" placeholder="reps" aria-label="reps" />
          <button type="button" class="logBtn">+ Set</button>
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
            ${d.work.map(exerciseRow).join('')}
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
      <div id="checkinCard" class="info-card"></div>

      <div class="section-title">Supplements</div>
      <div class="info-card"><ul class="clean">${supps}</ul></div>`;
  }

  function progressPanel() {
    return `
      <div class="section-title">Strength progress</div>
      <div id="progressBody" class="info-card"></div>`;
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
        <button data-tab="progress">Progress</button>
        <button data-tab="track">Track</button>
      </nav>

      <div class="panel" data-panel="overview">${overviewPanel(plan)}</div>
      <div class="panel" data-panel="nutrition" hidden>${nutritionPanel(plan)}</div>
      <div class="panel" data-panel="training" hidden>${trainingPanel(plan)}</div>
      <div class="panel" data-panel="progress" hidden>${progressPanel()}</div>
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
      if (typeof showStep === 'function') showStep(1); // skip the welcome screen when editing
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    $('#printBtn').addEventListener('click', () => window.print());

    renderFitbitCard();
    currentUnit = unitsSel.value === 'imperial' ? 'lb' : 'kg';
    refreshFoodCard(plan);
    refreshWeightCard();
    renderCheckin(plan);
    wireTraining();
    renderProgress();
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
  function wireTraining() {
    planEl.querySelectorAll('.ex-row').forEach((row) => {
      const def = row.dataset.default;
      let current = row.dataset.ex;

      const setListEl = row.querySelector('.set-list');
      const lastEl = row.querySelector('.last-hint');
      const nameEl = row.querySelector('.ex-name-text');

      const fmtSets = (sets) => sets.map((s) => `${s.w}×${s.r}`).join(', ');

      const paintLast = () => {
        const last = Store.getLastSession(current);
        lastEl.innerHTML = last
          ? `Last time (${last.date.slice(5)}): <b>${fmtSets(last.sets)}</b>`
          : '<span class="muted">No history yet — log your first set.</span>';
      };

      const paintSets = () => {
        const sets = Store.getSets(current);
        setListEl.innerHTML = sets.length
          ? sets
              .map(
                (s, i) =>
                  `<span class="set-chip">${i + 1}. <b>${s.w}×${s.r}</b><button class="set-del" data-i="${i}" aria-label="remove set">×</button></span>`
              )
              .join('')
          : '';
        setListEl.querySelectorAll('.set-del').forEach((b) =>
          b.addEventListener('click', () => { Store.removeSet(current, Number(b.dataset.i)); paintSets(); })
        );
      };

      paintLast();
      paintSets();

      // Log a set
      const logSet = () => {
        const w = row.querySelector('.w').value;
        const r = row.querySelector('.r').value;
        if (!w || !r) return;
        Store.logSet(current, w, r);
        paintSets();
        row.querySelector('.r').value = '';
        row.querySelector('.w').focus();
        startRest(); // auto-start the rest timer between sets
      };
      row.querySelector('.logBtn').addEventListener('click', logSet);
      row.querySelectorAll('.ex-log input').forEach((inp) =>
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') logSet(); })
      );

      // Swap exercise
      const swapBtn = row.querySelector('.swap-btn');
      const swapMenu = row.querySelector('.swap-menu');
      if (swapBtn) {
        swapBtn.addEventListener('click', () => { swapMenu.hidden = !swapMenu.hidden; });
        swapMenu.querySelector('select').addEventListener('change', (e) => {
          current = e.target.value;
          Store.setSwap(def, current);
          row.dataset.ex = current;
          nameEl.textContent = current;
          swapMenu.hidden = true;
          paintLast();
          paintSets();
        });
      }
    });
  }

  /* --------------------- Weekly check-in (smart adjust) ----------- */
  function renderCheckin(plan) {
    const card = $('#checkinCard');
    if (!card) return;

    const series = Store.getWeightSeries();
    const bodyweight = series.length ? series[series.length - 1].kg : null;
    const weeklyKg = Store.weeklyTrend();
    const { avg, loggedDays } = Store.recentCalories(7);

    const rec = Coach.weeklyRecommendation({
      direction: plan.phase.direction,
      weeklyKg,
      bodyweight,
      avgCalories: avg,
      loggedDays,
      calorieTarget: plan.energy.target,
    });

    const adj = plan.energy.calorieAdjust || 0;
    const adjNote = adj !== 0
      ? `<div class="chk-adj">Target adjusted ${adj > 0 ? '+' : ''}${adj} kcal → now <b>${plan.energy.target} kcal</b></div>`
      : '';

    const applyBtn = rec.deltaKcal
      ? `<button class="btn-primary chk-apply" id="chkApply">Apply ${rec.deltaKcal > 0 ? '+' : ''}${rec.deltaKcal} kcal → ${plan.energy.target + rec.deltaKcal}</button>`
      : '';

    const dataLine = weeklyKg != null
      ? `<div class="chk-data">
           <span>📉 Trend: <b>${weeklyKg < 0 ? '−' : '+'}${Math.abs(weeklyKg).toFixed(2)} ${currentUnit}/wk</b></span>
           <span>🍽️ Logged: <b>${avg != null ? avg + ' kcal' : '—'}</b>${loggedDays ? ` · ${loggedDays}/7 days` : ''}</span>
         </div>`
      : '';

    card.innerHTML = `
      <div class="checkin chk-${rec.status}">
        <div class="chk-title">${esc(rec.title)}</div>
        <div class="chk-detail">${esc(rec.detail)}</div>
        ${dataLine}
        ${adjNote}
        ${applyBtn}
      </div>
      <div class="callout" style="margin-top:12px">Change <b>one</b> thing at a time, then recheck in ~2 weeks. Success = waist shrinking + lifts holding, not just the scale.</div>`;

    const apply = $('#chkApply');
    if (apply) {
      apply.addEventListener('click', () => {
        try {
          const saved = JSON.parse(localStorage.getItem(LS_INPUT) || '{}');
          saved.calorieAdjust = (Number(saved.calorieAdjust) || 0) + rec.deltaKcal;
          localStorage.setItem(LS_INPUT, JSON.stringify(saved));
          const updated = Coach.buildPlan(saved);
          render(updated);
          activateTab('track');
        } catch (e) { console.error(e); }
      });
    }
  }

  /* ----------------------- Progress / history --------------------- */
  let progressEx = null;

  const est1RM = (w, r) => w * (1 + r / 30); // Epley formula

  function bestSet(sets) {
    return sets.reduce((best, s) => {
      const e = est1RM(s.w, s.r);
      return !best || e > best.e ? { w: s.w, r: s.r, e } : best;
    }, null);
  }

  function renderProgress() {
    const body = $('#progressBody');
    if (!body) return;

    const exs = Store.loggedExercises();
    if (!exs.length) {
      body.innerHTML =
        '<div class="empty">📈 Log a few workouts in the Training tab and your strength charts will appear here — you\'ll watch your lifts climb week over week.</div>';
      return;
    }

    // Default to the exercise with the most logged sessions (richest chart).
    if (!progressEx || !exs.includes(progressEx)) {
      progressEx = exs
        .map((n) => ({ n, count: Store.getExerciseHistory(n).length }))
        .sort((a, b) => b.count - a.count)[0].n;
    }

    const history = Store.getExerciseHistory(progressEx); // newest-first
    const chrono = [...history].reverse(); // oldest-first for the chart
    const points = chrono.map((h) => {
      const b = bestSet(h.sets);
      return { date: h.date, value: b ? b.e : 0 };
    });

    // Personal records
    let prE = 0, prSet = null, prDate = '';
    chrono.forEach((h) => {
      const b = bestSet(h.sets);
      if (b && b.e > prE) { prE = b.e; prSet = b; prDate = h.date; }
    });

    const sessionList = history
      .slice(0, 8)
      .map((h) => {
        const b = bestSet(h.sets);
        return `<li>
          <span><b>${h.date.slice(5)}</b> · ${h.sets.map((s) => `${s.w}×${s.r}`).join(', ')}</span>
          <span class="meta">best ~${Math.round(b.e)} ${currentUnit} 1RM</span>
        </li>`;
      })
      .join('');

    body.innerHTML = `
      <div class="log-form" style="margin-bottom:14px">
        <select id="progSelect" aria-label="choose exercise">
          ${exs.map((n) => `<option value="${esc(n)}"${n === progressEx ? ' selected' : ''}>${esc(n)}</option>`).join('')}
        </select>
      </div>
      ${prSet ? `<div class="pr-badge">🏆 Best: <b>${prSet.w}×${prSet.r}</b> (~${Math.round(prE)} ${currentUnit} est. 1RM) on ${prDate.slice(5)}</div>` : ''}
      <div class="chart-wrap">${lineChartSVG(points, currentUnit)}</div>
      <div class="chart-caption">Estimated 1-rep max per session — the honest way to track strength when reps &amp; weight vary.</div>
      <ul class="entries" style="margin-top:14px">${sessionList}</ul>`;

    const sel = $('#progSelect');
    if (sel) sel.addEventListener('change', (e) => { progressEx = e.target.value; renderProgress(); });
  }

  /** Generic dependency-free SVG line chart for [{date, value}]. */
  function lineChartSVG(series, unit) {
    if (!series.length) return '<div class="empty">No data yet.</div>';
    if (series.length === 1) {
      return `<div class="single-point">One session logged (~${Math.round(series[0].value)} ${unit} 1RM). Log another to see the trend line.</div>`;
    }
    const W = 320, H = 130, pad = 24;
    const vals = series.map((d) => d.value);
    let min = Math.min(...vals), max = Math.max(...vals);
    if (min === max) { min -= 1; max += 1; }
    const n = series.length;
    const x = (i) => pad + (i * (W - 2 * pad)) / (n - 1);
    const y = (v) => pad + (H - 2 * pad) * (1 - (v - min) / (max - min));
    const pts = series.map((d, i) => `${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(' ');
    const dots = series.map((d, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(d.value).toFixed(1)}" r="2.5" fill="#fc4c02" />`).join('');
    const area = `${pad},${H - pad} ${pts} ${x(n - 1).toFixed(1)},${H - pad}`;
    return `
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Strength progress chart">
        <polyline points="${area}" fill="rgba(252,76,2,0.08)" stroke="none" />
        <polyline points="${pts}" fill="none" stroke="#fc4c02" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
        ${dots}
        <text x="${pad}" y="13" font-size="9" fill="#6d6d78">${Math.round(max)} ${unit}</text>
        <text x="${pad}" y="${H - 7}" font-size="9" fill="#6d6d78">${Math.round(min)} ${unit}</text>
      </svg>`;
  }

  /* --------------------------- Rest timer ------------------------- */
  let restInterval = null;
  let restRemaining = 0;

  function ensureRestBar() {
    let bar = $('#restTimer');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'restTimer';
      bar.hidden = true;
      bar.innerHTML = `
        <button class="rest-adjust" id="restMinus">−30s</button>
        <div class="rest-face"><span id="restTime">2:00</span><small>rest</small></div>
        <button class="rest-adjust" id="restPlus">+30s</button>
        <button class="rest-skip" id="restSkip">Skip</button>`;
      document.body.appendChild(bar);
      $('#restPlus').addEventListener('click', () => adjustRest(30));
      $('#restMinus').addEventListener('click', () => adjustRest(-30));
      $('#restSkip').addEventListener('click', stopRest);
    }
    return bar;
  }

  function paintRest() {
    const m = Math.floor(restRemaining / 60);
    const s = restRemaining % 60;
    const el = $('#restTime');
    if (el) el.textContent = `${m}:${String(s).padStart(2, '0')}`;
  }

  function startRest(seconds = 120) {
    ensureRestBar().hidden = false;
    restRemaining = seconds;
    paintRest();
    if (restInterval) clearInterval(restInterval);
    restInterval = setInterval(() => {
      restRemaining -= 1;
      paintRest();
      if (restRemaining <= 0) {
        stopRest();
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]); // buzz when rest is up
      }
    }, 1000);
  }

  function adjustRest(delta) {
    restRemaining = Math.max(5, restRemaining + delta);
    paintRest();
  }

  function stopRest() {
    if (restInterval) clearInterval(restInterval);
    restInterval = null;
    const bar = $('#restTimer');
    if (bar) bar.hidden = true;
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

  /* ----------------------- Onboarding wizard ---------------------- */
  const steps = Array.from(document.querySelectorAll('.step'));
  const backBtn = $('#wizBack');
  const nextBtn = $('#wizNext');
  const wizBar = $('#wizBar');
  let step = 0;

  const NEXT_LABELS = ['Get started →', 'Next →', 'Next →', 'Next →', 'Build my plan →'];

  function showStep(n) {
    step = Math.max(0, Math.min(steps.length - 1, n));
    steps.forEach((s) => (s.hidden = Number(s.dataset.step) !== step));
    backBtn.hidden = step === 0;
    nextBtn.textContent = NEXT_LABELS[step] || 'Next →';
    wizBar.style.width = `${(step / (steps.length - 1)) * 100}%`;
    errorEl.hidden = true;
    // focus the first input on data-entry steps for fast typing
    const firstInput = steps[step].querySelector('input[type="number"], input:not([type="radio"])');
    if (firstInput) setTimeout(() => firstInput.focus(), 50);
  }

  // Only step 2 (stats) has required fields.
  function validateStep(n) {
    if (n !== 2) return null;
    const d = readForm();
    return validate(d);
  }

  function buildAndShow() {
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
  }

  nextBtn.addEventListener('click', () => {
    const err = validateStep(step);
    if (err) { errorEl.textContent = err; errorEl.hidden = false; return; }
    if (step === steps.length - 1) buildAndShow();
    else showStep(step + 1);
  });
  backBtn.addEventListener('click', () => showStep(step - 1));

  // Enter advances the wizard instead of submitting the form.
  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') { e.preventDefault(); nextBtn.click(); }
  });

  showStep(0);

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
