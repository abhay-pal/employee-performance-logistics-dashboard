# Employee Performance Analytics Dashboard — Build & Method Documentation

**Project:** Employee Performance Analytics Dashboard for a Logistics Company
**Folder:** `logistics-dashboard/`
**Stack:** plain HTML + CSS + JavaScript, Chart.js 4 (vendored locally). No build step, no framework, no CDN, no backend.
**Dataset:** 1,000 employees × 6 months (Apr 2026 – Sep 2026) = **6,000 monthly records**, generated from a fixed seed.

---

## 1. What was asked for, and where each item lives

| Requirement | Delivered as | File / location |
|---|---|---|
| ~1000 employees, logistics departments & hubs | Seeded generator, 6,000 rows | `js/data.js` |
| 5 KPI cards only | `renderKpis()` | `js/app.js` |
| Monthly performance trend (line) | Chart `cTrend` | `js/app.js` → `renderCharts()` |
| Department performance (bar) | Chart `cDept` | same |
| Location / hub comparison | Chart `cHub` | same |
| Top 10 employees | Chart `cTop` | same |
| Employee performance table + conditional formatting | `renderTable()` | `js/app.js` |
| Filters: Month, Department, Location, Employee | Multi-select component | `js/app.js` → `multiSelect()` |
| Drill-down on an employee | `openEmployee()` + modal | `js/app.js`, `index.html` |
| Import your own data | CSV import engine + dialog | `js/app.js` → `importCsv()` |
| Sample CSV to import | 15 employees × 5 months | `sample-import.csv` |

### File map

```
logistics-dashboard/
├── index.html            markup: sidebar, filter bar, 3 views, 2 modals
├── css/style.css         all styling (≈700 lines, no framework)
├── js/data.js            seeded data generator → global DATA object
├── js/app.js             model, filters, KPIs, charts, table, insights,
│                         drill-down, CSV import  (≈900 lines)
├── vendor/chart.umd.js   Chart.js 4, local copy
├── sample-import.csv     ready-to-import second dataset (75 rows)
├── README.md             how to run + user-facing feature guide
└── DOCUMENTATION.md      this document
```

**Run:** `cd logistics-dashboard && python3 -m http.server 8100` → `http://localhost:8100`.
Opening `index.html` directly from disk also works, because nothing uses `fetch()`.

---

## 2. Design decisions taken up front

1. **No CDN, no `fetch()`.** Chart.js is vendored and the data is a plain `<script>` that defines a global. This makes the dashboard work offline, inside sandboxed previews, and straight off the filesystem.
2. **One executive number.** Five separate metrics can't rank people, departments or hubs against each other, so a single weighted **Performance Index** was defined (section 4) and used everywhere that something has to be ordered or colour-banded.
3. **Correlated, not random, sample data.** Independent random metrics produce a dashboard where nothing means anything — no department is genuinely worse, no hub has a real problem. The generator therefore runs a **causal chain** (section 3) so the insights the dashboard prints are actually true of the data.
4. **Deliberate stories planted in the data**, so the dashboard has something to find: a problem hub, a weak department, a peak-season dip, chronic absentees, high-attendance/low-output cases, and an overtime-plus-errors cluster.
5. **Everything recomputes from the filtered row set.** There are no precomputed aggregates; KPIs, charts, tables and the written insights are all derived from `filtered()` on each render, which is what makes any combination of filters valid.

---

## 3. How the sample data is generated (`js/data.js`)

### 3.1 Determinism

A **linear congruential generator** replaces `Math.random()` so every reload shows identical numbers:

```
seed₀ = 78451236
seedₙ₊₁ = (1664525 · seedₙ + 1013904223)  mod  2³²
rnd()  = seedₙ₊₁ / 2³²                      → uniform on [0,1)
```

Derived helpers:

```
between(a,b) = a + rnd()·(b−a)
gauss(μ,σ)   = μ + (r₁+r₂+r₃+r₄ − 2) · 1.35 · σ      (Irwin–Hall approximation
                                                       of a normal distribution)
clamp(v,a,b) = max(a, min(b, v))
```

### 3.2 Reference tables

**Departments** — headcount share, monthly volume band per person, TAT profile `[base, spread]`, quality offset:

| Department | Share | Volume / month | TAT base | Quality offset | Unit |
|---|---|---|---|---|---|
| Operations | 22% | 420 – 760 | 3.2 h | 0.00 | consignments |
| Warehouse | 26% | 900 – 1,600 | 2.1 h | +0.03 | packages |
| Delivery | 30% | 1,100 – 1,900 | 5.4 h | **−0.06** | shipments |
| Customer Support | 14% | 520 – 900 | 1.6 h | +0.04 | tickets |
| MIS / Analytics | 8% | 120 – 260 | 6.5 h | +0.05 | reports |

**Hubs** — headcount share and quality offset:

| Hub | Share | Quality offset |
|---|---|---|
| Bhiwandi (Mumbai) | 18% | +0.04 |
| Gurugram (NCR) | 17% | +0.06 |
| Bengaluru | 15% | +0.05 |
| Hyderabad | 12% | +0.01 |
| Chennai | 11% | −0.01 |
| **Kolkata** | 10% | **−0.07** ← deliberate problem hub |
| Pune | 9% | +0.02 |
| Ahmedabad | 8% | −0.03 |

**Months** — working days and a seasonal *load* multiplier (peak season in Jul):

| Month | Apr | May | Jun | Jul | Aug | Sep |
|---|---|---|---|---|---|---|
| Working days | 26 | 25 | 26 | 26 | 26 | 25 |
| Load | 0.97 | 1.00 | 1.06 | **1.12** | 1.03 | 0.99 |

### 3.3 Employee master record

For each of the 1,000 employees, department and hub are drawn by weighted share, then four latent traits are drawn:

```
skill    = clamp( gauss(0.60 + hub.quality + dept.quality, 0.165), 0.10, 0.98 )
trend    = gauss(0, 0.045)                                  monthly drift
absent   = clamp( gauss(0.5,0.24) + (0.58 − skill)·0.7, 0.02, 1 )
sloppy   = clamp( gauss(0.5,0.24) + (0.58 − skill)·0.7, 0.02, 1 )
otProne  = clamp( gauss(0.45,0.28), 0, 1 )
```

`skill` is the single latent variable everything else hangs off. Absence-proneness and sloppiness are deliberately *anti-correlated with skill*, which is what makes low performers look coherently low across several metrics rather than randomly bad on one.

**Planted cases** (indices into the employee array):

| Employee | Override | Story it creates |
|---|---|---|
| `[12]`, `[144]` | `absent≈0.05`, `skill≈0.29` | present almost every day, still far below target |
| `[318]`, `[529]` | `trend = −0.13 / −0.11` | steady month-on-month decline |
| `[77]` | `skill 0.96`, `sloppy 0.05` | star performer |
| `[640]` | `absent 0.97` | chronic absence |
| `[801]` | `sloppy 0.97`, `otProne 1` | high errors **and** high overtime |

### 3.4 The causal chain — monthly row formulas

For employee *e* in month *m* (index `mi` = 0…5):

**(a) Effective skill for the month**

```
skill = clamp( e.skill + e.trend·mi + 0.011·mi − (load − 1)·0.38 + gauss(0, 0.035), 0.08, 0.99 )
```
- `e.trend·mi` — the individual's own trajectory
- `+0.011·mi` — the network improving slowly over the period
- `−(load−1)·0.38` — peak-season pressure degrades performance

**(b) Attendance**

```
absences    = clamp( round( gauss(e.absent · 4.4, 1.5) ), 0, workingDays − 12 )
presentDays = workingDays − absences
Attendance %= presentDays / workingDays × 100
```

**(c) Volume, target and achievement**

```
capacity  = between(dept.volumeLow, dept.volumeHigh) · load
Target    = round(capacity / 10) × 10                        (rounded to a tidy number)
Actual    = round( Target · clamp( 0.66 + skill·0.55 + (Attendance − 90)·0.006
                                   + gauss(0, 0.08), 0.35, 1.5 ) )
Target Achievement % = Actual / Target × 100
```

**(d) Turnaround time** (lower is better)

```
TAT = clamp( dept.tatBase + (1 − skill)·dept.tatSpread·1.6
             + max(0, load − 1)·dept.tatSpread·1.2
             + gauss(0, dept.tatSpread·0.22),
             dept.tatBase·0.55, dept.tatBase·2.4 )
```

**(e) Overtime**

```
Overtime = clamp( gauss( e.otProne·26·load + max(0, 0.6 − skill)·22 , 6 ), 0, 85 )
```

**(f) SLA %** — driven by TAT, attendance and skill, penalised by extreme overtime

```
SLA % = clamp( 83 + skill·18
               − (TAT − dept.tatBase)·3.4
               + (Attendance − 90)·0.18
               − max(0, Overtime − 45)·0.12
               + gauss(0, 2.2),
               55, 99.6 )
```

**(g) Errors, then accuracy** — errors scale with *volume*, so the two always agree

```
defectRate = clamp( 0.004 + e.sloppy·0.030 + max(0, 0.6 − skill)·0.045
                    + max(0, load − 1)·0.020 + max(0, Overtime − 40)·0.0004,
                    0.0015, 0.16 )
Errors     = round( Actual · defectRate · between(0.8, 1.2) )
Accuracy % = clamp( 100 − Errors / Actual × 100, 78, 100 )
```

> **Why volume-scaled defects:** the first version used a flat error count independent of volume. It clipped at the floor, made quality look uniformly terrible, and broke the relationship between "errors" and "accuracy %". Defect *rate* × volume fixed both problems at once.

### 3.5 Resulting distributions (all 6,000 rows)

| Metric | Mean | SD | Min | Max |
|---|---|---|---|---|
| Attendance % | 91.6 | 5.5 | 73.1 | 100.0 |
| Target Achievement % | 101.9 | 12.6 | 56.3 | 140.2 |
| SLA % | 91.3 | 5.6 | 68.8 | 99.6 |
| Accuracy % | 97.85 | 0.92 | 93.86 | 99.71 |
| Average TAT (hrs) | 4.5 | 2.2 | 1.4 | 10.8 |
| Errors / month | 22 | 14 | 1 | 91 |
| Overtime (hrs) | 13.6 | 7.7 | 0.0 | 43.2 |
| Performance Index | 94.6 | 4.0 | 73.4 | 99.8 |

Volume-weighted achievement (the figure on the KPI card) = **101.0%**.
**44%** of individual monthly rows, and **41.6%** of employees over the whole period, are below target — a realistic spread rather than everyone passing.

---

## 4. The Performance Index — the formula behind every ranking

A weighted composite of the four metrics management named:

```
Performance Index = min(Target Achievement %, 100) × 0.35
                  + SLA %                          × 0.25
                  + Accuracy %                     × 0.25
                  + Attendance %                   × 0.15
```

Design points:

- **Achievement is capped at 100** before weighting. Without the cap someone at 140% of target would out-score a balanced performer purely on volume, and over-delivery would mask poor SLA or quality.
- **Weights** put over half the score (35 + 25) on output and speed, a quarter on quality, and the smallest slice on attendance — attendance is an *input*, not a result, so it is represented but not dominant.
- The index is computed **per employee per month**, then averaged when rolling up, so a person is judged on their typical month rather than their best one.

### Bands

| Band | Index | Employees (sample data) |
|---|---|---|
| 🟢 Performing | ≥ 96.5 | 356 |
| 🟡 On Track | 93 – 96.5 | 389 |
| 🔴 Needs Attention | < 93 | 255 |

**How the thresholds were chosen.** Logistics metrics are naturally high and tightly packed (SLA ≈ 91, accuracy ≈ 98), so the index compresses into the low 90s — absolute thresholds like "80 = good" would put everybody in one bucket. The employee-level index distribution was measured and the cut-points set at its **70th and 25th percentiles**, giving roughly a 35 / 39 / 26 split. The lever is the *threshold*, not the metric levels.

---

## 5. Aggregation rules (`js/app.js`)

Getting these consistent matters more than it looks; mixing them up is how dashboards end up disagreeing with themselves.

### 5.1 Employee roll-up (`byEmployee`)

| Field | Rule |
|---|---|
| Target, Actual, Errors, Overtime | **Summed** over the months in scope |
| Target Achievement % | **Volume-weighted:** `Σ Actual / Σ Target × 100` |
| Attendance, SLA, Accuracy, TAT, Index | **Simple mean** of the monthly values |

Achievement is volume-weighted because summing a ratio is meaningless — a month with a 2,000 target must count more than a month with a 400 target.

### 5.2 Department / hub roll-up (`groupBy`)

Same rules, plus `staff = count of distinct employee IDs` (never a row count, which would be 6× too high over six months).

### 5.3 KPI cards

```
Total Employees         = distinct IDs in the filtered set
Avg Target Achievement  = Σ Actual / Σ Target × 100        (volume-weighted)
Avg Attendance / SLA / Accuracy = mean of the filtered rows
Δ vs previous month     = mean(latest month) − mean(previous month), in points
```

If the selection contains only one month, the delta reads *"single month"* instead of showing a fake zero.

### 5.4 Trend verdict (the tag on the trend chart)

```
d = achievement(last month) − achievement(first month)
d > +0.5 pts  → "Improving"
d < −0.5 pts  → "Declining"
otherwise     → "Stable"
```

---

## 6. Conditional formatting

One shared rule set drives every coloured cell in every table, so green means the same thing everywhere.

| Metric | 🟢 Green | 🟡 Yellow | 🔴 Red |
|---|---|---|---|
| Target Achievement % | ≥ 100 | 90 – 100 | < 90 |
| Attendance % | ≥ 95 | 90 – 95 | < 90 |
| SLA % | ≥ 92 | 86 – 92 | < 86 |
| Accuracy % | ≥ 98 | 96 – 98 | < 96 |
| Performance Index | ≥ 96.5 | 93 – 96.5 | < 93 |
| Errors *(per month)* | ≤ 12 | 13 – 30 | > 30 |

The errors column in the main table displays a **6-month total** but is coloured on the **monthly average**, so a long period doesn't turn every row red.

---

## 7. The written insights — how each statement is derived

The Insights view is not hand-written text; each line is computed from the current selection.

| Insight | Rule |
|---|---|
| Improving / declining | `achievement(last month) − achievement(first month)`, ±0.5 pt threshold; weakest month = `argmin` of monthly achievement |
| Strongest / weakest department | departments sorted by Performance Index; gap = best − worst |
| Location needing attention | hub with the lowest Performance Index, reported with its achievement, SLA, attendance and headcount |
| Below target | `achievement < 100`; "genuine difficulty" = `achievement < 90 OR SLA < 85` |
| Present but under-delivering | `attendance ≥ 95 AND achievement < 95` — separates *capability/workload* problems from *absence* problems |
| Fatigue signal | `overtime/month > 24 AND errors/month > 28` |

On the sample data that yields: 416 below target, 163 in genuine difficulty, 22 present-but-short, 29 in the fatigue cluster.

The drill-down adds a per-employee read-out using the same logic on that person's six months (index change > ±1 pt for improving/declining, plus flags for attendance < 88, SLA < 86, errors/month > 28, and achievement ≥ 110 with SLA ≥ 95 for "top performer").

---

## 8. Charts — what each one answers, and how it's drawn

All charts are Chart.js 4, redrawn from scratch on every filter change (`draw()` destroys the previous instance first, which is what prevents the classic ghost-tooltip/memory-leak bug).

| # | Chart | Type | Answers | Notes |
|---|---|---|---|---|
| 1 | Monthly Performance Trend | Line, 3 series | *Is performance improving or declining?* | Achievement is volume-weighted per month; y-axis pinned to 84–106% so real movement is visible |
| 2 | Department Performance | Horizontal grouped bar | *Which department performs better?* | Achievement vs SLA side by side; x-axis 60–110% |
| 3 | Location / Hub Comparison | Vertical bar | *Which location has issues?* | Best hub teal, worst hub red, rest muted; value labels drawn by a small custom plugin; y-axis starts just below the minimum so a 3-point gap is visible |
| 4 | Top 10 Employees | Horizontal grouped bar, 4 series | *Who is performing well?* | Ranked by index, but plotted on the four metrics they are ranked by, because the top 10 indices differ by only ~0.1 and a single-bar chart looked flat. Clicking a bar opens the drill-down |

Two Chart.js specifics worth recording: bar charts **ignore `suggestedMin`** on the value axis (an explicit `min` is required for truncated ranking bars), and chart boxes must be sized with **inline pixel heights** — a CSS class that doesn't match silently collapses a canvas to 150 px.

---

## 9. Filters — multi-select implementation

Native `<select multiple>` is unusable for 1,000 employees, so a small custom component (`multiSelect()`) was written: a button + popup with checkboxes.

- **State:** each filter is an **array**; an empty array means *all*. Matching is `!picked.length || picked.includes(value)`.
- **Label logic:** 0 picked → placeholder; 1 → that name; 2 → both (if ≤ 34 characters); 3+ → *"N selected"*.
- **Select all / Clear** operate on the *currently searched subset*, so you can type "Kolkata" and select all of those.
- **Employee list is dependent:** it is rebuilt from the department + hub selection, and any now-invalid employee picks are dropped rather than silently filtering everything to zero.
- **Performance:** the list renders at most 200 options (with a "type to narrow it down" hint) and `onChange` is debounced by 90 ms, so ticking several boxes quickly triggers one re-render, not five.
- Clicking outside or pressing **Esc** closes the popup; only one popup can be open at a time.

---

## 10. CSV import — how it works

The dashboard reads `M` (a mutable model), never the raw `DATA` constant, so an imported file can replace the entire dataset at runtime.

```
setModel(rows, source) → derives months, employees, departments, hubs, month labels
                       → filters rebuild → render() → banner updates
```

**Pipeline:**

1. **Read** — `FileReader.readAsText`. Nothing is uploaded anywhere; it also works offline and from `file://`.
2. **Parse** — a hand-written CSV parser (≈20 lines) handling quoted fields, escaped `""`, embedded newlines, `,` / `;` / tab delimiters, CRLF and a UTF-8 BOM.
3. **Map headers** — each header is normalised with `lowercase → strip non-alphanumerics`, then matched against an alias list. `Location / Hub`, `Location`, `Hub`, `Branch` and `City` all resolve to the same field.
4. **Validate** — missing *required* columns abort the import with a named list. Row-level problems (unparseable month, non-numeric target) skip that row and are reported with the row number and reason.
5. **Derive** — `Attendance %` from present ÷ working days when absent (else 100); `Target Achievement %` from actual ÷ target when absent.
6. **Recompute** — the Performance Index is recalculated for every imported row with the same published weights.
7. **Swap in** — filters, KPIs, charts, tables, insights and the drill-down all rebuild; a banner offers *Back to sample data*.

**Month parsing** accepts `Sep 2026`, `2026-09`, `2026/09/01`, `09/2026`, `30/09/2026` and anything `Date` can parse.

**Required:** Employee ID, Employee Name, Department, Location / Hub, Month, Monthly Target, Actual Handled, SLA %, Accuracy %
**Optional:** Working Days, Present Days, Attendance %, Target Achievement %, Average TAT (hrs), Error / Rework Count, Overtime Hours

`sample-import.csv` (15 employees × 5 months, a different company and different hubs) is shipped so the feature can be demonstrated in one click.

---

## 11. Calibration — how the numbers were tuned

The generator was not right first time. The measured distributions were checked from Node after each change, and the model adjusted:

| Problem found | Fix |
|---|---|
| Errors were drawn from a flat Poisson independent of volume → quality mean 58, heavy clipping at the floor | defect **rate** × volume |
| Target achievement averaged 85% with 90% of rows below target — unrealistically harsh | achievement base 0.52 → **0.66**, coefficient 0.52 → 0.55 |
| SLA averaged 87% — low for a logistics network | SLA base 78 → **83** |
| Departments were within 1.7 index points of each other — no story | added a per-department quality offset (Delivery −0.06) |
| Peak season *improved* scores (sign error) | inverted to `−(load−1)·0.38`, and a `+0.011·mi` improvement drift added |
| Everyone landed in one band (741 / 198 / 61) | band thresholds moved to the 70th / 25th percentiles → 356 / 389 / 255 |

**Lesson recorded:** with naturally-high components (attendance, SLA, accuracy) a weighted score skews upward and compresses. Tune **spread** (the skill SD) for tail shape and **thresholds** for level — changing one alone does not work.

---

## 12. Verification

Every build was checked end-to-end in headless Chrome (Playwright) rather than by eye alone:

- **zero console errors / page errors** on every pass
- all four filters individually and in combination, including *Select all*, *Clear*, search, the dependent employee list, and *Reset filters*
- table sorting (both directions, text and numeric), search, band filter and paging
- drill-down open/close from a table row, a top-10 bar and a below-target row; six month rows present every time
- CSV import of the sample file (75 rows → 15 employees → 5 months), an invalid file (correct error message), and restoring the sample data
- responsive layout at 1500 px and 430 px
- screenshots reviewed at each step, which is how the truncated table columns, the flat top-10 chart, the uppercase dropdown items and the all-yellow hub chart were caught and fixed

---

## 13. The five management questions, answered

| Question | Where the dashboard answers it | Answer in the sample data |
|---|---|---|
| Who is performing well? | Top 10 chart · table sorted by Index · green band | 356 employees at index ≥ 96.5 |
| Who is below target? | Insights → *Employees below target* · red achievement cells | 416 of 1,000 (41.6%); 163 in genuine difficulty |
| Which department performs better? | Department chart · department scorecard | **Customer Support 95.9** best, **Delivery 92.5** worst |
| Which location has issues? | Hub chart (red bar) · hub scorecard | **Kolkata Hub** — index 92.6, SLA 88.5%, achievement 95.3% |
| Is performance improving or declining? | Trend chart + verdict tag · per-employee trend in the drill-down | **Improving, +2.3 pts**, with a dip in Jul (peak season) |

---

*All data in this dashboard is synthetic sample data generated for demonstration.*
