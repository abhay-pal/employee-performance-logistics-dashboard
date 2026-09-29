/* ===========================================================================
   app.js — filtering, KPIs, charts, table, insights and employee drill-down
   Depends on: vendor/chart.umd.js, js/data.js (global DATA)
   =========================================================================== */
(() => {
  'use strict';

  /* ------------------------------------------------------------- helpers */
  const $  = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const sum = (a, f) => a.reduce((t, x) => t + f(x), 0);
  const avg = (a, f) => (a.length ? sum(a, f) / a.length : 0);
  const r1  = v => Math.round(v * 10) / 10;
  const n0  = v => Math.round(v).toLocaleString('en-IN');
  const pct = v => r1(v).toFixed(1) + '%';
  const f1  = v => Number(v).toFixed(1);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const uniq = a => Array.from(new Set(a));

  const C = {
    teal: '#0e9f8f', blue: '#2b7fd4', violet: '#6a5ae0', amber: '#e0a109',
    green: '#10a37f', red: '#e0454f', grid: '#e8edf2', ink: '#5a6b7a',
  };

  // shared thresholds for the conditional formatting in the table
  const RULES = {
    achievement: [100, 90], attendance: [95, 90], sla: [92, 86],
    accuracy: [98, 96], score: [96.5, 93], errors: [null, null],
  };
  const clsFor = (key, v) => {
    if (key === 'errors') return v <= 12 ? 'good' : v <= 30 ? 'mid' : 'bad';
    const [g, m] = RULES[key];
    return v >= g ? 'good' : v >= m ? 'mid' : 'bad';
  };


  /* =======================================================================
     Data model — the dashboard reads M, never DATA directly, so an imported
     CSV can replace the whole dataset at runtime.
     ======================================================================= */
  const M = { rows: [], months: [], employees: [], MONTH_LABEL: {},
    departments: [], hubs: [], unitOf: () => 'units', source: 'sample', label: '' };

  function setModel(rowsIn, source, unitOf, label) {
    M.rows = rowsIn;
    M.source = source;
    M.label = label || '';
    M.unitOf = unitOf || (() => 'units');

    const seen = new Map();
    rowsIn.forEach(r => { if (!seen.has(r.month)) seen.set(r.month, r.monthLabel); });
    M.months = Array.from(seen, ([key, lbl]) => ({ key, label: lbl })).sort((a, b) => a.key.localeCompare(b.key));
    M.MONTH_LABEL = {};
    M.months.forEach(m => { M.MONTH_LABEL[m.key] = m.label; });

    const emp = new Map();
    rowsIn.forEach(r => { if (!emp.has(r.id)) emp.set(r.id, { id: r.id, name: r.name, dept: r.dept, hub: r.hub }); });
    M.employees = Array.from(emp.values());
    M.departments = uniq(rowsIn.map(r => r.dept)).sort();
    M.hubs = uniq(rowsIn.map(r => r.hub)).sort();
  }

  // the published index formula, reused for imported rows
  const indexOf = r => Math.round((Math.min(r.achievement, 100) * DATA.WEIGHTS.achievement +
    r.sla * DATA.WEIGHTS.sla + r.accuracy * DATA.WEIGHTS.accuracy +
    r.attendance * DATA.WEIGHTS.attendance) * 10) / 10;

  /* -------------------------------------------------------------- charts */
  Chart.defaults.font.family = '"Segoe UI",Inter,system-ui,sans-serif';
  Chart.defaults.font.size = 12;
  Chart.defaults.color = C.ink;
  Chart.defaults.animation.duration = 420;
  Chart.defaults.maintainAspectRatio = false;

  // draws the numeric value at the end of each bar (ranking charts)
  const valueLabels = (fmt, axis) => ({
    id: 'valueLabels',
    afterDatasetsDraw(c) {
      const { ctx } = c;
      ctx.save();
      ctx.font = '600 11.5px "Segoe UI",Inter,system-ui,sans-serif';
      ctx.fillStyle = '#41525f';
      c.getDatasetMeta(0).data.forEach((bar, i) => {
        const v = c.data.datasets[0].data[i];
        if (axis === 'y') { ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(fmt(v), bar.x + 7, bar.y); }
        else { ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(fmt(v), bar.x, bar.y - 5); }
      });
      ctx.restore();
    },
  });

  const charts = {};
  const draw = (id, cfg) => {
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(document.getElementById(id).getContext('2d'), cfg);
  };
  const legendTop = { position: 'top', align: 'end', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'circle', padding: 14 } };
  const axisPct = (min, max) => ({
    min, max, grid: { color: C.grid, drawTicks: false }, border: { display: false },
    ticks: { padding: 8, callback: v => v + '%' },
  });
  const axisCat = { grid: { display: false }, border: { display: false } };

  /* ---------------------------------------------------------- filter state */
  // every filter holds an array of chosen values; an empty array means "all"
  const state = { month: [], dept: [], hub: [], emp: [], view: 'overview', limit: 50,
    sortKey: 'score', sortDir: -1, search: '', band: 'all' };

  const hits = (picked, v) => !picked.length || picked.includes(v);

  /* ------------------------------------------------- multi-select dropdown */
  const allPops = [];
  function multiSelect(hostSel, placeholder, onChange, searchable) {
    const host = $(hostSel);
    host.classList.add('ms');
    host.innerHTML =
      '<button type="button" class="ms-btn" aria-haspopup="true" aria-expanded="false">' +
        '<span class="ms-label"></span><span class="ms-caret">▾</span></button>' +
      '<div class="ms-pop hidden">' +
        (searchable ? '<input type="search" class="ms-search" placeholder="Search…" aria-label="Search options">' : '') +
        '<div class="ms-tools"><button type="button" data-act="all">Select all</button>' +
          '<button type="button" data-act="none">Clear</button><span class="ms-count"></span></div>' +
        '<div class="ms-list" role="group"></div>' +
        '<div class="ms-more hidden"></div>' +
      '</div>';

    const btn = host.querySelector('.ms-btn'), pop = host.querySelector('.ms-pop');
    const list = host.querySelector('.ms-list'), lbl = host.querySelector('.ms-label');
    const more = host.querySelector('.ms-more'), cnt = host.querySelector('.ms-count');
    const box = host.querySelector('.ms-search');
    const MAX = 200;
    let items = [], sel = new Set(), q = '', timer = null;

    const fire = () => { clearTimeout(timer); timer = setTimeout(() => onChange(Array.from(sel)), 90); };

    function label() {
      const names = items.filter(i => sel.has(i.v)).map(i => i.t);
      const two = names.slice(0, 2).join(', ');
      lbl.textContent = !names.length ? placeholder
        : names.length === 1 ? names[0]
        : names.length === 2 && two.length <= 34 ? two
        : `${names.length} selected`;
      host.classList.toggle('picked', names.length > 0);
      cnt.textContent = sel.size ? `${sel.size} selected` : '';
    }
    function paint() {
      const ql = q.trim().toLowerCase();
      const match = ql ? items.filter(i => i.t.toLowerCase().includes(ql)) : items;
      const show = match.slice(0, MAX);
      list.innerHTML = show.length ? show.map(i =>
        `<label class="ms-item"><input type="checkbox" value="${esc(i.v)}"${sel.has(i.v) ? ' checked' : ''}>` +
        `<span>${esc(i.t)}</span></label>`).join('') : '<div class="ms-empty">No matches</div>';
      more.classList.toggle('hidden', match.length <= MAX);
      more.textContent = match.length > MAX ? `First ${MAX} of ${n0(match.length)} shown — type to narrow it down` : '';
      label();
    }
    const open = () => {
      allPops.forEach(c => { if (c !== api) c.close(); });
      pop.classList.remove('hidden'); btn.setAttribute('aria-expanded', 'true');
      if (box) { box.value = ''; q = ''; paint(); box.focus(); }
    };
    const close = () => { pop.classList.add('hidden'); btn.setAttribute('aria-expanded', 'false'); };

    btn.addEventListener('click', e => { e.stopPropagation(); pop.classList.contains('hidden') ? open() : close(); });
    pop.addEventListener('click', e => e.stopPropagation());
    list.addEventListener('change', e => {
      const cb = e.target;
      if (cb.checked) sel.add(cb.value); else sel.delete(cb.value);
      label(); fire();
    });
    host.querySelectorAll('.ms-tools button').forEach(b => b.addEventListener('click', () => {
      const ql = q.trim().toLowerCase();
      const scope = ql ? items.filter(i => i.t.toLowerCase().includes(ql)) : items;
      if (b.dataset.act === 'all') scope.forEach(i => sel.add(i.v)); else scope.forEach(i => sel.delete(i.v));
      paint(); fire();
    }));
    if (box) box.addEventListener('input', () => { q = box.value; paint(); });

    const api = {
      close,
      setItems(next, keepSelection) {
        items = next;
        const valid = new Set(next.map(i => i.v));
        if (keepSelection) sel = new Set(Array.from(sel).filter(v => valid.has(v))); else sel = new Set();
        paint();
        return Array.from(sel);
      },
      clear() { sel = new Set(); paint(); },
      selected: () => Array.from(sel),
    };
    allPops.push(api);
    return api;
  }
  document.addEventListener('click', () => allPops.forEach(c => c.close()));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') allPops.forEach(c => c.close()); });

  /* --------------------------------------------------------- the 4 filters */
  let msMonth, msDept, msHub, msEmp;

  function initFilters() {
    msMonth = multiSelect('#fMonth', 'All months', v => { state.month = v; render(); });
    msDept  = multiSelect('#fDept', 'All departments', v => { state.dept = v; refreshEmployeeOptions(); render(); });
    msHub   = multiSelect('#fHub', 'All locations', v => { state.hub = v; refreshEmployeeOptions(); render(); });
    msEmp   = multiSelect('#fEmp', 'All employees', v => { state.emp = v; render(); }, true);
  }

  function buildFilters(keep) {
    state.month = msMonth.setItems(M.months.map(m => ({ v: m.key, t: m.label })), keep);
    state.dept  = msDept.setItems(M.departments.map(d => ({ v: d, t: d })), keep);
    state.hub   = msHub.setItems(M.hubs.map(h => ({ v: h, t: h })), keep);
    refreshEmployeeOptions(keep);
  }

  // the employee list respects the department / location selection
  function refreshEmployeeOptions(keep = true) {
    const pool = M.employees
      .filter(e => hits(state.dept, e.dept) && hits(state.hub, e.hub))
      .sort((a, b) => a.name.localeCompare(b.name));
    state.emp = msEmp.setItems(pool.map(e => ({ v: e.id, t: `${e.name} · ${e.id}` })), keep);
  }

  const filtered = () => M.rows.filter(r =>
    hits(state.month, r.month) && hits(state.dept, r.dept) &&
    hits(state.hub, r.hub) && hits(state.emp, r.id));

  // roll monthly records up to one line per employee
  function byEmployee(rows) {
    const map = new Map();
    rows.forEach(r => {
      let e = map.get(r.id);
      if (!e) { e = { id: r.id, name: r.name, dept: r.dept, hub: r.hub, months: 0,
        target: 0, actual: 0, errors: 0, overtime: 0, _att: 0, _sla: 0, _acc: 0, _tat: 0, _sc: 0 }; map.set(r.id, e); }
      e.months++; e.target += r.target; e.actual += r.actual; e.errors += r.errors; e.overtime += r.overtime;
      e._att += r.attendance; e._sla += r.sla; e._acc += r.accuracy; e._tat += r.tat; e._sc += r.score;
    });
    return Array.from(map.values()).map(e => ({
      ...e,
      overtime: r1(e.overtime),
      achievement: r1(e.target ? e.actual / e.target * 100 : 0),
      attendance: r1(e._att / e.months), sla: r1(e._sla / e.months),
      accuracy: r1(e._acc / e.months), tat: r1(e._tat / e.months), score: r1(e._sc / e.months),
    }));
  }

  const groupBy = (rows, key) => {
    const m = new Map();
    rows.forEach(r => { if (!m.has(r[key])) m.set(r[key], []); m.get(r[key]).push(r); });
    return Array.from(m, ([name, rs]) => ({
      name, rows: rs, staff: uniq(rs.map(r => r.id)).length,
      achievement: r1(sum(rs, r => r.actual) / Math.max(1, sum(rs, r => r.target)) * 100),
      attendance: r1(avg(rs, r => r.attendance)), sla: r1(avg(rs, r => r.sla)),
      accuracy: r1(avg(rs, r => r.accuracy)), tat: r1(avg(rs, r => r.tat)),
      errors: Math.round(sum(rs, r => r.errors)), score: r1(avg(rs, r => r.score)),
    }));
  };

  /* ================================================================ render */
  let people = [], rows = [];

  function render() {
    rows = filtered();
    people = byEmployee(rows);
    renderScope();
    renderKpis();
    renderCharts();
    renderTable(true);
    renderInsights();
  }

  function renderScope() {
    const many = (arr, all, one) => !arr.length ? all
      : arr.length === 1 ? one(arr[0])
      : arr.length === 2 ? arr.map(one).join(', ')
      : `${arr.length} ${all.replace('All ', '')}`;
    const bits = [
      many(state.month, 'All months', v => M.MONTH_LABEL[v] || v),
      many(state.dept, 'All departments', v => v),
    ];
    if (state.hub.length) bits.push(many(state.hub, 'All locations', v => v));
    if (state.emp.length) bits.push(many(state.emp, 'All employees',
      v => (M.employees.find(e => e.id === v) || {}).name || v));
    $('#scopePill').textContent = bits.join(' · ');
    $('#recCount').textContent = `${n0(rows.length)} records · ${n0(people.length)} employees`;
  }

  /* --------------------------------------------------------------- KPIs */
  function renderKpis() {
    if (!rows.length) { $('#kpis').innerHTML = '<div class="kpi"><h4>No data</h4><div class="val">—</div><div class="sub">Adjust the filters</div></div>'; return; }

    const months = M.months.filter(m => rows.some(r => r.month === m.key));
    const at = k => {
      if (months.length < 2) return null;
      const last = rows.filter(r => r.month === months[months.length - 1].key);
      const prev = rows.filter(r => r.month === months[months.length - 2].key);
      return r1(avg(last, k) - avg(prev, k));
    };
    const deltaHtml = d => d === null ? '<span class="delta flat">single month</span>'
      : `<span class="delta ${d > 0.05 ? 'up' : d < -0.05 ? 'down' : 'flat'}">${d > 0 ? '▲' : d < 0 ? '▼' : '■'} ${Math.abs(d).toFixed(1)} pts vs prev. month</span>`;

    const achievement = sum(rows, r => r.actual) / Math.max(1, sum(rows, r => r.target)) * 100;
    const attendance = avg(rows, r => r.attendance);
    const sla = avg(rows, r => r.sla);
    const accuracy = avg(rows, r => r.accuracy);
    const bands = { Performing: 0, 'On Track': 0, 'Needs Attention': 0 };
    people.forEach(p => bands[DATA.bandOf(p.score).name]++);

    const cards = [
      { c: 'k1', h: 'Total Employees', v: n0(people.length),
        s: `<b>${bands.Performing}</b> performing · <b>${bands['On Track']}</b> on track · <b class="">${bands['Needs Attention']}</b> need attention` },
      { c: 'k2', h: 'Avg Target Achievement', v: pct(achievement),
        s: deltaHtml(at(r => r.achievement)) },
      { c: 'k3', h: 'Avg Attendance', v: pct(attendance), s: deltaHtml(at(r => r.attendance)) },
      { c: 'k4', h: 'Avg SLA', v: pct(sla), s: deltaHtml(at(r => r.sla)) },
      { c: 'k5', h: 'Avg Accuracy', v: pct(accuracy), s: deltaHtml(at(r => r.accuracy)) },
    ];
    $('#kpis').innerHTML = cards.map(k =>
      `<div class="kpi ${k.c}"><h4>${k.h}</h4><div class="val">${k.v}</div><div class="sub">${k.s}</div></div>`).join('');
  }


  /* -------------------------------------------------------------- charts */
  function renderCharts() {
    /* 1 — monthly trend */
    const months = M.months.filter(m => rows.some(r => r.month === m.key));
    const series = k => months.map(m => r1(avg(rows.filter(r => r.month === m.key), k)));
    const ach = months.map(m => {
      const rs = rows.filter(r => r.month === m.key);
      return r1(sum(rs, r => r.actual) / Math.max(1, sum(rs, r => r.target)) * 100);
    });
    const line = (label, data, color, fillIt) => ({
      label, data, borderColor: color, backgroundColor: fillIt ? color + '1f' : color,
      borderWidth: 2.4, tension: .35, fill: !!fillIt,
      pointRadius: 3, pointHoverRadius: 5, pointBackgroundColor: '#fff', pointBorderWidth: 2,
    });
    draw('cTrend', {
      type: 'line',
      data: { labels: months.map(m => m.label),
        datasets: [line('Target Achievement %', ach, C.teal, true), line('SLA %', series(r => r.sla), C.blue),
          line('Accuracy %', series(r => r.accuracy), C.violet)] },
      options: { plugins: { legend: legendTop, tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${c.parsed.y.toFixed(1)}%` } } },
        scales: { x: axisCat, y: axisPct(84, 106) }, interaction: { mode: 'index', intersect: false } },
    });

    // trend verdict tag
    if (ach.length >= 2) {
      const d = r1(ach[ach.length - 1] - ach[0]);
      const t = $('#trendTag');
      t.className = 'tag ' + (d > 0.5 ? 'good' : d < -0.5 ? 'bad' : 'mid');
      t.textContent = d > 0.5 ? `Improving · +${f1(d)} pts over the period`
        : d < -0.5 ? `Declining · ${f1(d)} pts over the period` : 'Stable over the period';
    } else { $('#trendTag').textContent = ''; $('#trendTag').className = 'tag'; }

    /* 2 — department */
    const depts = groupBy(rows, 'dept').sort((a, b) => b.score - a.score);
    draw('cDept', {
      type: 'bar',
      data: { labels: depts.map(d => d.name.replace(' / ', '/')),
        datasets: [
          { label: 'Achievement %', data: depts.map(d => d.achievement), backgroundColor: C.teal, borderRadius: 4, maxBarThickness: 22 },
          { label: 'SLA %', data: depts.map(d => d.sla), backgroundColor: C.blue, borderRadius: 4, maxBarThickness: 22 },
        ] },
      options: { indexAxis: 'y', plugins: { legend: legendTop,
        tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${c.parsed.x.toFixed(1)}%` } } },
        scales: { x: { ...axisPct(60, 110) }, y: axisCat } },
    });

    /* 3 — hubs */
    const hubs = groupBy(rows, 'hub').sort((a, b) => b.score - a.score);
    draw('cHub', {
      type: 'bar',
      data: { labels: hubs.map(h => h.name.replace(' Hub', '')),
        datasets: [{ label: 'Performance Index', data: hubs.map(h => h.score), borderRadius: 5, maxBarThickness: 44,
          backgroundColor: hubs.map((h, i) => i === hubs.length - 1 ? C.red : i === 0 ? C.teal : '#7fc4bc') }] },
      plugins: [valueLabels(v => v.toFixed(1), 'x')],
      options: { layout: { padding: { top: 16 } }, plugins: { legend: { display: false },
        tooltip: { callbacks: { label: c => {
          const h = hubs[c.dataIndex];
          return [` Index ${h.score}`, ` Achievement ${h.achievement}%`, ` SLA ${h.sla}%`, ` Attendance ${h.attendance}%`, ` ${h.staff} employees`];
        } } } },
        scales: { x: { ...axisCat, ticks: { maxRotation: 40, minRotation: 0 } },
          y: { min: Math.max(0, Math.floor(Math.min(...hubs.map(h => h.score)) - 3)), grid: { color: C.grid, drawTicks: false }, border: { display: false } } } },
    });

    /* 4 — top 10 employees, shown on the four metrics they are ranked by */
    const top = people.slice().sort((a, b) => b.score - a.score).slice(0, 10).reverse();
    const mset = (label, key, color) => ({ label, data: top.map(p => p[key]), backgroundColor: color,
      borderRadius: 3, barThickness: 6, categoryPercentage: .82, barPercentage: .96 });
    draw('cTop', {
      type: 'bar',
      data: { labels: top.map(p => p.name),
        datasets: [mset('Achievement %', 'achievement', C.teal), mset('SLA %', 'sla', C.blue),
          mset('Accuracy %', 'accuracy', C.violet), mset('Attendance %', 'attendance', C.amber)] },
      options: { indexAxis: 'y',
        plugins: { legend: legendTop,
          tooltip: { callbacks: {
            title: items => `#${top.length - items[0].dataIndex} ${top[items[0].dataIndex].name} · index ${top[items[0].dataIndex].score}`,
            label: c => ` ${c.dataset.label}: ${c.parsed.x.toFixed(1)}%`,
            afterBody: items => `${top[items[0].dataIndex].dept} · ${top[items[0].dataIndex].hub}` } } },
        onClick: (e, els) => { if (els.length) openEmployee(top[els[0].index].id); },
        scales: { x: { min: 80, max: 130, grid: { color: C.grid, drawTicks: false }, border: { display: false },
          ticks: { padding: 6, callback: v => v + '%' } },
          y: { ...axisCat, ticks: { font: { size: 11.5 } } } } },
    });
  }

  /* --------------------------------------------------------------- table */
  function tableRows() {
    const q = state.search.trim().toLowerCase();
    let list = people;
    if (q) list = list.filter(p => (p.name + ' ' + p.id + ' ' + p.dept + ' ' + p.hub).toLowerCase().includes(q));
    if (state.band !== 'all') list = list.filter(p => DATA.bandOf(p.score).name === state.band);
    const k = state.sortKey;
    return list.sort((a, b) => (typeof a[k] === 'string'
      ? a[k].localeCompare(b[k]) : a[k] - b[k]) * state.sortDir);
  }

  function renderTable(reset) {
    if (reset) state.limit = 50;
    const list = tableRows();
    const shown = list.slice(0, state.limit);
    const cell = (k, v, suffix) => `<td><span class="cell ${clsFor(k, v)}">${k === 'errors' ? n0(v) : f1(v)}${suffix || ''}</span></td>`;
    $('#empBody').innerHTML = shown.length ? shown.map(p => `
      <tr data-id="${p.id}">
        <td class="left"><div class="who"><b>${esc(p.name)}</b><span>${p.id}</span></div></td>
        <td class="left">${esc(p.dept)}</td>
        <td class="left">${esc(p.hub)}</td>
        <td>${n0(p.target)}</td>
        <td>${n0(p.actual)}</td>
        ${cell('achievement', p.achievement, '%')}
        ${cell('attendance', p.attendance, '%')}
        ${cell('sla', p.sla, '%')}
        ${cell('accuracy', p.accuracy, '%')}
        <td><span class="cell ${clsFor('errors', p.errors / Math.max(1, p.months))}">${n0(p.errors)}</span></td>
        ${cell('score', p.score, '')}
      </tr>`).join('') : '<tr><td colspan="11" class="empty">No employees match the current filters.</td></tr>';

    $('#tblInfo').textContent = `Showing ${n0(shown.length)} of ${n0(list.length)} employees`;
    $('#btnMore').classList.toggle('hidden', shown.length >= list.length);
    $$('#empTable th').forEach(th => {
      th.classList.toggle('sorted', th.dataset.sort === state.sortKey);
      th.classList.toggle('asc', th.dataset.sort === state.sortKey && state.sortDir === 1);
    });
  }

  /* ------------------------------------------------------------ insights */
  function renderInsights() {
    const list = $('#insightList');
    if (!rows.length) { list.innerHTML = '<li>No data in the current selection.</li>'; $('#lowBody').innerHTML = $('#deptBody').innerHTML = $('#hubBody').innerHTML = ''; return; }

    const out = [];
    const depts = groupBy(rows, 'dept').sort((a, b) => b.score - a.score);
    const hubs = groupBy(rows, 'hub').sort((a, b) => b.score - a.score);
    const months = M.months.filter(m => rows.some(r => r.month === m.key));
    const monthAch = months.map(m => {
      const rs = rows.filter(r => r.month === m.key);
      return sum(rs, r => r.actual) / Math.max(1, sum(rs, r => r.target)) * 100;
    });

    // direction of travel
    if (months.length >= 2) {
      const d = r1(monthAch[monthAch.length - 1] - monthAch[0]);
      const worst = months[monthAch.indexOf(Math.min(...monthAch))].label;
      out.push({ t: d > 0.5 ? 'ok' : d < -0.5 ? 'warn' : '', i: d > 0.5 ? '↗' : d < -0.5 ? '↘' : '→',
        h: `Performance is ${d > 0.5 ? 'improving' : d < -0.5 ? 'declining' : 'broadly stable'}`,
        b: `Target achievement moved from <b>${f1(monthAch[0])}%</b> in ${months[0].label} to <b>${f1(monthAch[monthAch.length - 1])}%</b> in ${months[months.length - 1].label} (${d > 0 ? '+' : ''}${f1(d)} pts). The weakest month was <b>${worst}</b>${M.source === 'sample' ? ', which lines up with the peak-season volume spike' : ''}.` });
    }

    // department spread
    if (depts.length > 1) {
      const best = depts[0], worst = depts[depts.length - 1];
      out.push({ t: 'ok', i: '★', h: `${best.name} is the strongest department`,
        b: `Index <b>${f1(best.score)}</b> with ${f1(best.achievement)}% achievement and ${f1(best.sla)}% SLA. <b>${worst.name}</b> trails at index ${f1(worst.score)} (${f1(worst.achievement)}% achievement, ${f1(worst.sla)}% SLA) — a gap of ${f1(best.score - worst.score)} points.` });
    }

    // hub problem
    if (hubs.length > 1) {
      const worst = hubs[hubs.length - 1];
      out.push({ t: 'warn', i: '⚑', h: `${worst.name} is the location that needs attention`,
        b: `Index <b>${f1(worst.score)}</b>, achievement <b>${f1(worst.achievement)}%</b>, SLA <b>${f1(worst.sla)}%</b> and attendance ${f1(worst.attendance)}% across ${worst.staff} employees — the lowest of ${hubs.length} hubs, and ${f1(hubs[0].score - worst.score)} points behind ${hubs[0].name}.` });
    }

    // below target
    const below = people.filter(p => p.achievement < 100);
    const critical = people.filter(p => p.achievement < 90 || p.sla < 85);
    out.push({ t: critical.length ? 'warn' : 'ok', i: '⚠',
      h: `${below.length} of ${people.length} employees (${f1(below.length / people.length * 100)}%) are below target`,
      b: `<b>${critical.length}</b> are in genuine difficulty — under 90% achievement or under 85% SLA. They are listed in the table beside this panel and each one opens a drill-down.` });

    // present but under-delivering
    const idle = people.filter(p => p.attendance >= 95 && p.achievement < 95);
    if (idle.length) out.push({ t: '', i: '◔', h: `${idle.length} employees attend reliably but still miss target`,
      b: `Attendance of 95%+ with achievement under 95% points at workload allocation, training or tooling rather than absence — e.g. <b>${esc(idle.sort((a, b) => a.achievement - b.achievement)[0].name)}</b> at ${f1(idle[0].attendance)}% attendance and only ${f1(idle[0].achievement)}% achievement.` });

    // overtime / error pressure
    const strained = people.filter(p => p.overtime / Math.max(1, p.months) > 24 && p.errors / Math.max(1, p.months) > 28);
    if (strained.length) out.push({ t: 'warn', i: '◆',
      h: `${strained.length} employees are combining heavy overtime with high error counts`,
      b: `Averaging over 24 overtime hours a month and more than 28 errors or reworks — a fatigue signal worth checking before it turns into SLA breaches.` });

    list.innerHTML = out.map(o =>
      `<li class="${o.t}"><span class="ins-ico">${o.i}</span><span><b>${o.h}.</b> ${o.b}</span></li>`).join('');

    // supporting tables
    $('#lowBody').innerHTML = people.slice().sort((a, b) => a.achievement - b.achievement).slice(0, 10).map(p => `
      <tr data-id="${p.id}">
        <td class="left"><div class="who"><b>${esc(p.name)}</b><span>${p.id}</span></div></td>
        <td class="left">${esc(p.dept)}</td><td class="left">${esc(p.hub)}</td>
        <td><span class="cell ${clsFor('achievement', p.achievement)}">${f1(p.achievement)}%</span></td>
        <td><span class="cell ${clsFor('sla', p.sla)}">${f1(p.sla)}%</span></td>
        <td><span class="cell ${clsFor('score', p.score)}">${f1(p.score)}</span></td>
      </tr>`).join('');

    $('#deptBody').innerHTML = depts.map(d => `
      <tr><td class="left">${esc(d.name)}</td><td>${n0(d.staff)}</td>
        <td><span class="cell ${clsFor('achievement', d.achievement)}">${f1(d.achievement)}%</span></td>
        <td><span class="cell ${clsFor('sla', d.sla)}">${f1(d.sla)}%</span></td>
        <td><span class="cell ${clsFor('accuracy', d.accuracy)}">${f1(d.accuracy)}%</span></td>
        <td><span class="cell ${clsFor('score', d.score)}">${f1(d.score)}</span></td></tr>`).join('');

    $('#hubBody').innerHTML = hubs.map(h => `
      <tr><td class="left">${esc(h.name)}</td><td>${n0(h.staff)}</td>
        <td><span class="cell ${clsFor('achievement', h.achievement)}">${f1(h.achievement)}%</span></td>
        <td><span class="cell ${clsFor('sla', h.sla)}">${f1(h.sla)}%</span></td>
        <td><span class="cell ${clsFor('attendance', h.attendance)}">${f1(h.attendance)}%</span></td>
        <td>${h.tat} h</td>
        <td><span class="cell ${clsFor('score', h.score)}">${f1(h.score)}</span></td></tr>`).join('');
  }

  /* ----------------------------------------------------------- drill-down */
  function openEmployee(id) {
    // the drill-down always shows the full six months, whatever the month filter is
    const hist = M.rows.filter(r => r.id === id).sort((a, b) => a.month.localeCompare(b.month));
    if (!hist.length) return;
    const e = hist[0];
    const agg = byEmployee(hist)[0];
    const band = DATA.bandOf(agg.score);
    const unit = M.unitOf(e.dept);

    $('#mName').textContent = `${e.name} · ${e.id}`;
    $('#mMeta').textContent = `${e.dept} · ${e.hub} · ${band.name} (index ${f1(agg.score)})`;

    const mk = (h, v, s, cls) => `<div class="mini-kpi"><h5>${h}</h5><div class="v" style="color:${cls || 'inherit'}">${v}</div><div class="s">${s}</div></div>`;
    $('#mKpis').innerHTML = [
      mk('Target vs Actual', `${n0(agg.actual)}`, `of ${n0(agg.target)} ${unit}`),
      mk('Achievement', `${f1(agg.achievement)}%`, agg.achievement >= 100 ? 'at or above target' : 'below target',
        agg.achievement >= 100 ? C.green : C.red),
      mk('Attendance', `${f1(agg.attendance)}%`, `${sum(hist, r => r.presentDays)} of ${sum(hist, r => r.workingDays)} days`),
      mk('SLA', `${f1(agg.sla)}%`, 'six-month average', clsColor(clsFor('sla', agg.sla))),
      mk('Accuracy', `${f1(agg.accuracy)}%`, `${n0(agg.errors)} errors / reworks`, clsColor(clsFor('accuracy', agg.accuracy))),
      mk('Overtime', `${r1(agg.overtime / hist.length)} h`, 'per month, avg TAT ' + agg.tat + ' h'),
    ].join('');

    const labels = hist.map(r => r.monthLabel);
    draw('cMTarget', {
      type: 'bar',
      data: { labels, datasets: [
        { label: 'Target', data: hist.map(r => r.target), backgroundColor: '#cfdae4', borderRadius: 4, maxBarThickness: 26 },
        { label: `Actual ${unit}`, data: hist.map(r => r.actual), backgroundColor: C.teal, borderRadius: 4, maxBarThickness: 26 },
      ] },
      options: { plugins: { legend: legendTop }, scales: { x: axisCat,
        y: { grid: { color: C.grid, drawTicks: false }, border: { display: false }, ticks: { callback: v => n0(v) } } } },
    });

    draw('cMTrend', {
      type: 'line',
      data: { labels, datasets: [
        { label: 'Achievement %', data: hist.map(r => r.achievement), borderColor: C.teal, backgroundColor: C.teal + '22', fill: true, tension: .35, borderWidth: 2.4, pointRadius: 3, pointBackgroundColor: '#fff', pointBorderWidth: 2 },
        { label: 'SLA %', data: hist.map(r => r.sla), borderColor: C.blue, tension: .35, borderWidth: 2.2, pointRadius: 3, pointBackgroundColor: '#fff', pointBorderWidth: 2 },
        { label: 'Attendance %', data: hist.map(r => r.attendance), borderColor: C.amber, tension: .35, borderWidth: 2.2, borderDash: [5, 4], pointRadius: 3, pointBackgroundColor: '#fff', pointBorderWidth: 2 },
      ] },
      options: { plugins: { legend: legendTop, tooltip: { mode: 'index', intersect: false } },
        scales: { x: axisCat, y: axisPct(undefined, undefined) } },
    });

    $('#mBody').innerHTML = hist.map(r => `
      <tr><td class="left">${r.monthLabel}</td>
        <td>${r.presentDays} / ${r.workingDays}</td>
        <td><span class="cell ${clsFor('attendance', r.attendance)}">${f1(r.attendance)}%</span></td>
        <td>${n0(r.target)}</td><td>${n0(r.actual)}</td>
        <td><span class="cell ${clsFor('achievement', r.achievement)}">${f1(r.achievement)}%</span></td>
        <td><span class="cell ${clsFor('sla', r.sla)}">${f1(r.sla)}%</span></td>
        <td><span class="cell ${clsFor('accuracy', r.accuracy)}">${f1(r.accuracy)}%</span></td>
        <td>${r.tat} h</td><td><span class="cell ${clsFor('errors', r.errors)}">${r.errors}</span></td>
        <td>${r.overtime} h</td>
        <td><span class="cell ${clsFor('score', r.score)}">${f1(r.score)}</span></td></tr>`).join('');

    // short written read-out
    const d = r1(hist[hist.length - 1].score - hist[0].score);
    const dirn = d > 1 ? 'improving' : d < -1 ? 'declining' : 'holding steady';
    const notes = [`Performance index is <b>${dirn}</b> (${d > 0 ? '+' : ''}${f1(d)} pts from ${hist[0].monthLabel} to ${hist[hist.length - 1].monthLabel}).`];
    if (agg.attendance >= 95 && agg.achievement < 95) notes.push('Attendance is strong but output is short of target — look at workload, routing or training rather than absence.');
    if (agg.attendance < 88) notes.push('Attendance is the binding constraint here: absence is holding back volume.');
    if (agg.sla < 86) notes.push('SLA is below the 86% floor — TAT is the issue to fix first.');
    if (agg.errors / hist.length > 28) notes.push('Error and rework volume is high; pair a quality check with the overtime being worked.');
    if (agg.achievement >= 110 && agg.sla >= 95) notes.push('A clear top performer — a candidate for mentoring others in the hub.');
    $('#mNote').innerHTML = notes.join(' ');

    $('#overlay').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }
  const clsColor = c => c === 'good' ? C.green : c === 'mid' ? '#a87b06' : C.red;

  function closeModal() {
    $('#overlay').classList.add('hidden');
    document.body.style.overflow = '';
    ['cMTarget', 'cMTrend'].forEach(id => { if (charts[id]) { charts[id].destroy(); delete charts[id]; } });
  }


  /* =======================================================================
     CSV import — reads a file the user picks, validates it against the
     expected columns, and swaps it in for the sample data.
     ======================================================================= */
  const FIELDS = [
    ['id',          true,  ['employeeid', 'empid', 'id', 'employeecode']],
    ['name',        true,  ['employeename', 'name', 'fullname', 'employee']],
    ['dept',        true,  ['department', 'dept', 'function']],
    ['hub',         true,  ['locationhub', 'location', 'hub', 'branch', 'site', 'city']],
    ['month',       true,  ['month', 'period', 'monthyear']],
    ['target',      true,  ['monthlytarget', 'target', 'targettasks', 'targetshipments']],
    ['actual',      true,  ['actualhandled', 'actual', 'actualtaskshandled', 'tasksshipmentshandled',
                            'actualshipments', 'completed', 'actualtasks']],
    ['sla',         true,  ['sla', 'slapct', 'slapercent', 'slaadherence']],
    ['accuracy',    true,  ['accuracy', 'accuracypct', 'qualityscore', 'quality']],
    ['workingDays', false, ['workingdays', 'totalworkingdays']],
    ['presentDays', false, ['presentdays', 'dayspresent', 'daysworked']],
    ['attendance',  false, ['attendance', 'attendancepct', 'attendancepercent']],
    ['achievement', false, ['targetachievement', 'achievement', 'achievementpct']],
    ['tat',         false, ['averagetathrs', 'averagetat', 'avgtat', 'tat', 'tathours', 'turnaroundtime']],
    ['errors',      false, ['errorreworkcount', 'errors', 'errorcount', 'reworkcount', 'errorsrework']],
    ['overtime',    false, ['overtimehours', 'overtime', 'othours']],
  ];
  const norm = h => String(h).toLowerCase().replace(/[^a-z0-9]/g, '');

  function parseCsv(text) {
    const out = []; let row = [], cur = '', q = false;
    text = String(text).replace(/^\ufeff/, '');
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c;
      } else if (c === '"') q = true;
      else if (c === ',' || c === ';' || c === '\t') { row.push(cur); cur = ''; }
      else if (c === '\n') { row.push(cur); out.push(row); row = []; cur = ''; }
      else if (c !== '\r') cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); out.push(row); }
    return out.filter(r => r.some(c => String(c).trim() !== ''));
  }

  const MON3 = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const MONNAME = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function parseMonth(raw) {
    const s = String(raw).trim();
    const mk = (y, m) => (m >= 1 && m <= 12 && y > 1900
      ? { key: `${y}-${String(m).padStart(2, '0')}`, label: `${MONNAME[m]} ${y}` } : null);
    let m;
    if ((m = s.match(/^(\d{4})[-/.](\d{1,2})/))) return mk(+m[1], +m[2]);
    if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))) return mk(+m[3], +m[2]);
    if ((m = s.match(/^(\d{1,2})[-/.](\d{4})$/))) return mk(+m[2], +m[1]);
    if ((m = s.match(/^([A-Za-z]{3,})[\s\-/,]+(\d{2,4})$/))) {
      const mm = MON3[m[1].slice(0, 3).toLowerCase()];
      let y = +m[2]; if (y < 100) y += 2000;
      return mm ? mk(y, mm) : null;
    }
    const d = new Date(s);
    return isNaN(d) ? null : mk(d.getFullYear(), d.getMonth() + 1);
  }

  const num = v => {
    const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
    return isFinite(n) ? n : null;
  };

  function importCsv(text, fileName) {
    const grid = parseCsv(text);
    if (grid.length < 2) return { ok: false, errors: ['The file has no data rows.'] };

    const head = grid[0].map(norm);
    const col = {}, missing = [];
    FIELDS.forEach(([key, req, aliases]) => {
      const i = head.findIndex(h => aliases.includes(h));
      if (i >= 0) col[key] = i; else if (req) missing.push(key);
    });
    if (missing.length) {
      const nice = { id: 'Employee ID', name: 'Employee Name', dept: 'Department', hub: 'Location / Hub',
        month: 'Month', target: 'Monthly Target', actual: 'Actual Handled', sla: 'SLA %', accuracy: 'Accuracy %' };
      return { ok: false, errors: ['Missing required column(s): ' + missing.map(k => nice[k] || k).join(', ')] };
    }

    const rowsOut = [], skipped = [];
    for (let i = 1; i < grid.length; i++) {
      const g = grid[i], cell = k => (col[k] === undefined ? '' : (g[col[k]] || '').trim());
      const mo = parseMonth(cell('month'));
      const target = num(cell('target')), actual = num(cell('actual'));
      const sla = num(cell('sla')), accuracy = num(cell('accuracy'));
      if (!cell('id') || !cell('name')) { skipped.push(`row ${i + 1}: no employee id or name`); continue; }
      if (!mo) { skipped.push(`row ${i + 1}: month "${cell('month')}" not understood`); continue; }
      if (target === null || actual === null) { skipped.push(`row ${i + 1}: target or actual is not a number`); continue; }
      if (sla === null || accuracy === null) { skipped.push(`row ${i + 1}: SLA or accuracy is not a number`); continue; }

      const workingDays = num(cell('workingDays')) || 0;
      const presentDays = num(cell('presentDays')) || 0;
      let attendance = num(cell('attendance'));
      if (attendance === null) attendance = workingDays > 0 ? presentDays / workingDays * 100 : 100;
      let achievement = num(cell('achievement'));
      if (achievement === null) achievement = target > 0 ? actual / target * 100 : 0;

      const r = {
        id: cell('id'), name: cell('name'),
        dept: cell('dept') || 'Unassigned', hub: cell('hub') || 'Unassigned',
        month: mo.key, monthLabel: mo.label,
        workingDays: Math.round(workingDays), presentDays: Math.round(presentDays),
        attendance: Math.round(attendance * 10) / 10,
        target: Math.round(target), actual: Math.round(actual),
        achievement: Math.round(achievement * 10) / 10,
        sla: Math.round(sla * 10) / 10,
        accuracy: Math.round(accuracy * 100) / 100,
        tat: Math.round((num(cell('tat')) || 0) * 10) / 10,
        errors: Math.round(num(cell('errors')) || 0),
        overtime: Math.round((num(cell('overtime')) || 0) * 10) / 10,
      };
      r.score = indexOf(r);
      rowsOut.push(r);
    }
    if (!rowsOut.length) return { ok: false, errors: ['No usable rows.', ...skipped.slice(0, 5)] };

    setModel(rowsOut, 'imported', () => 'units', fileName);
    Object.assign(state, { month: [], dept: [], hub: [], emp: [], search: '', band: 'all',
      sortKey: 'score', sortDir: -1 });
    buildFilters(false);
    $('#tblSearch').value = ''; $('#tblBand').value = 'all';
    render();
    showBanner();
    return { ok: true, rows: rowsOut.length, employees: M.employees.length,
      months: M.months.length, skipped };
  }

  function useSampleData() {
    setModel(DATA.rows, 'sample', DATA.unitOf, '');
    Object.assign(state, { month: [], dept: [], hub: [], emp: [], search: '', band: 'all' });
    buildFilters(false);
    $('#tblSearch').value = ''; $('#tblBand').value = 'all';
    render();
    showBanner();
  }

  function showBanner() {
    const span = M.months.length ? `${M.months[0].label} – ${M.months[M.months.length - 1].label}` : '—';
    $('#dataFoot').textContent = `${span} · ${n0(M.employees.length)} employees · ${n0(M.rows.length)} records · ` +
      (M.source === 'imported' ? 'imported data' : 'sample data');
    const b = $('#dataBanner');
    if (M.source === 'imported') {
      b.classList.remove('hidden');
      $('#bannerText').innerHTML = `Showing <b>imported data</b>${M.label ? ' — ' + esc(M.label) : ''} · ` +
        `${n0(M.rows.length)} records · ${n0(M.employees.length)} employees · ${M.months.length} months`;
    } else b.classList.add('hidden');
  }

  // a ready-made template, built from the sample data so it is always valid
  function sampleCsv() {
    const ids = M.source === 'sample' ? DATA.employees.slice(0, 8).map(e => e.id) : [];
    const pick = DATA.rows.filter(r => ids.includes(r.id));
    const cols = [['id', 'Employee ID'], ['name', 'Employee Name'], ['dept', 'Department'], ['hub', 'Location / Hub'],
      ['monthLabel', 'Month'], ['workingDays', 'Working Days'], ['presentDays', 'Present Days'],
      ['attendance', 'Attendance %'], ['target', 'Monthly Target'], ['actual', 'Actual Handled'],
      ['achievement', 'Target Achievement %'], ['sla', 'SLA %'], ['accuracy', 'Accuracy %'],
      ['tat', 'Average TAT (hrs)'], ['errors', 'Error / Rework Count'], ['overtime', 'Overtime Hours']];
    return [cols.map(c => c[1]).join(',')]
      .concat(pick.map(r => cols.map(c => r[c[0]]).join(','))).join('\n');
  }

  const download = (name, text) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  /* --------------------------------------------------------------- views */
  const VIEWS = {
    overview: ['Performance Overview', 'How the network, its hubs and its people are performing'],
    people: ['Employee Performance Table', 'Every employee in the current selection, with conditional formatting'],
    insights: ['Insights', 'The answers management asks for, read straight off the data'],
  };
  function setView(v) {
    state.view = v;
    $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === v));
    $$('.view').forEach(s => s.classList.toggle('hidden', s.id !== 'view-' + v));
    $('#viewTitle').textContent = VIEWS[v][0];
    $('#viewSub').textContent = VIEWS[v][1];
    $('#sidebar').classList.remove('open');
    window.scrollTo({ top: 0 });
  }

  /* ---------------------------------------------------------------- wire */
  function wire() {
    $('#btnReset').addEventListener('click', () => {
      Object.assign(state, { search: '', band: 'all' });
      msMonth.clear(); msDept.clear(); msHub.clear();
      state.month = []; state.dept = []; state.hub = [];
      refreshEmployeeOptions(false);
      $('#tblSearch').value = ''; $('#tblBand').value = 'all';
      render();
    });

    $$('.nav-item').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
    $('#btnMenu').addEventListener('click', () => $('#sidebar').classList.toggle('open'));

    let t;
    $('#tblSearch').addEventListener('input', e => {
      clearTimeout(t); const v = e.target.value;
      t = setTimeout(() => { state.search = v; renderTable(true); }, 160);
    });
    $('#tblBand').addEventListener('change', e => { state.band = e.target.value; renderTable(true); });
    $('#btnMore').addEventListener('click', () => { state.limit += 50; renderTable(false); });

    $$('#empTable th').forEach(th => th.addEventListener('click', () => {
      const k = th.dataset.sort;
      if (state.sortKey === k) state.sortDir *= -1;
      else { state.sortKey = k; state.sortDir = (k === 'name' || k === 'dept' || k === 'hub') ? 1 : -1; }
      renderTable(true);
    }));

    document.addEventListener('click', ev => {
      const tr = ev.target.closest('tr[data-id]');
      if (tr) openEmployee(tr.dataset.id);
    });

    $('#btnClose').addEventListener('click', closeModal);
    $('#overlay').addEventListener('click', ev => { if (ev.target.id === 'overlay') closeModal(); });
    document.addEventListener('keydown', ev => { if (ev.key === 'Escape') closeModal(); });


    /* ---- data import ---- */
    $('#btnImport').addEventListener('click', () => {
      $('#importOverlay').classList.remove('hidden');
      $('#importResult').className = 'import-result hidden';
      $('#sidebar').classList.remove('open');
    });
    $('#btnImportClose').addEventListener('click', () => $('#importOverlay').classList.add('hidden'));
    $('#importOverlay').addEventListener('click', ev => { if (ev.target.id === 'importOverlay') $('#importOverlay').classList.add('hidden'); });
    $('#btnPick').addEventListener('click', () => $('#fileInput').click());
    $('#btnTemplate').addEventListener('click', () => download('performance-import-template.csv', sampleCsv()));
    $('#btnSample').addEventListener('click', () => { useSampleData(); $('#importOverlay').classList.add('hidden'); });
    $('#btnBannerSample').addEventListener('click', useSampleData);

    const dz = $('#dropZone');
    ['dragenter', 'dragover'].forEach(t => dz.addEventListener(t, e => { e.preventDefault(); dz.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(t => dz.addEventListener(t, e => { e.preventDefault(); dz.classList.remove('over'); }));
    dz.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) readFile(f); });
    $('#fileInput').addEventListener('change', e => { const f = e.target.files[0]; if (f) readFile(f); e.target.value = ''; });

    function readFile(file) {
      const box = $('#importResult');
      const reader = new FileReader();
      reader.onload = () => {
        let res;
        try { res = importCsv(reader.result, file.name); }
        catch (err) { res = { ok: false, errors: ['Could not read the file: ' + err.message] }; }
        if (res.ok) {
          box.className = 'import-result ok';
          box.innerHTML = `<b>Imported ${n0(res.rows)} rows</b> — ${n0(res.employees)} employees over ${res.months} month(s). ` +
            `The whole dashboard now runs on this data.` +
            (res.skipped.length ? `<div class="skip"><b>${res.skipped.length} row(s) skipped:</b><br>${res.skipped.slice(0, 5).map(esc).join('<br>')}${res.skipped.length > 5 ? '<br>…' : ''}</div>` : '');
          setTimeout(() => $('#importOverlay').classList.add('hidden'), 1400);
        } else {
          box.className = 'import-result bad';
          box.innerHTML = `<b>Import failed.</b><br>${res.errors.map(esc).join('<br>')}`;
        }
      };
      reader.onerror = () => {
        box.className = 'import-result bad';
        box.innerHTML = '<b>Import failed.</b><br>The file could not be read.';
      };
      reader.readAsText(file);
    }

    $('#btnCsv').addEventListener('click', () => {
      const cols = [['id', 'Employee ID'], ['name', 'Employee Name'], ['dept', 'Department'], ['hub', 'Location / Hub'],
        ['monthLabel', 'Month'], ['workingDays', 'Working Days'], ['presentDays', 'Present Days'], ['attendance', 'Attendance %'],
        ['target', 'Monthly Target'], ['actual', 'Actual Handled'], ['achievement', 'Target Achievement %'],
        ['sla', 'SLA %'], ['accuracy', 'Accuracy %'], ['tat', 'Average TAT (hrs)'], ['errors', 'Error / Rework Count'],
        ['overtime', 'Overtime Hours'], ['score', 'Performance Index']];
      const csv = [cols.map(c => c[1]).join(',')]
        .concat(rows.map(r => cols.map(c => r[c[0]]).join(','))).join('\n');
      download('employee-performance.csv', csv);
    });
  }

  setModel(DATA.rows, 'sample', DATA.unitOf, '');
  initFilters();
  buildFilters(false);
  wire();
  setView('overview');
  render();
  showBanner();
})();
