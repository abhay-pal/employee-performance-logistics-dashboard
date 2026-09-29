# Employee Performance Analytics Dashboard — Logistics

A single-page, executive-style performance dashboard for a logistics company:
**1,000 employees × 6 months (Apr – Sep 2026) = 6,000 monthly records**.

Plain HTML / CSS / JavaScript. No build step, no framework, no CDN — Chart.js is
vendored locally so it also works offline.

**Live dashboard:** https://abhay-pal.github.io/employee-performance-logistics-dashboard/

---

## Run it

```bash
cd logistics-dashboard
python3 -m http.server 8100
# open http://localhost:8100
```

(Opening `index.html` straight from disk works too — nothing uses `fetch`.)

---

## Files

| File | What it holds |
|---|---|
| `index.html` | Layout: sidebar, filter bar, 3 views, drill-down modal |
| `css/style.css` | All styling (navy + teal theme, responsive down to mobile) |
| `js/data.js` | The seeded sample dataset — 1,000 employees × 6 months |
| `js/app.js` | Filtering, KPIs, charts, table, insights, drill-down, CSV import |
| `vendor/chart.umd.js` | Chart.js 4 (local copy) |
| `sample-import.csv` | A ready-to-import sample file — 15 employees × 5 months, 75 rows |
| `DOCUMENTATION.md` / `.docx` | How everything was built, and every formula used |

---

## What's on screen

### KPI cards (5)
Total Employees · Avg Target Achievement % · Avg Attendance % · Avg SLA % · Avg Accuracy %.
Each one shows the month-on-month movement for the current selection.

### Charts
1. **Monthly Performance Trend** — line chart of Target Achievement %, SLA % and Accuracy % by month, with an automatic *Improving / Stable / Declining* verdict.
2. **Department Performance** — achievement vs SLA per department.
3. **Location / Hub Comparison** — performance index per hub; best hub in teal, weakest in red.
4. **Top 10 Employees** — the four metrics they are ranked on (achievement, SLA, accuracy, attendance); click a bar to drill down.

### Employee Performance Table
Employee · Department · Location · Target · Actual · Achievement % · Attendance % ·
SLA % · Accuracy % · Errors · Index — every metric cell is colour-coded
green / yellow / red. Sortable on every column, searchable, filterable by band,
paged 50 at a time. Clicking a row opens the drill-down.

### Insights
Written statements generated from the current selection (direction of travel,
strongest and weakest department, the problem hub, how many people are below
target, who attends but under-delivers, who is burning overtime and making
errors), plus below-target, department and hub scorecards.

### Drill-down (click any employee row, top-10 bar, or below-target row)
Target vs Actual, Attendance, SLA, Accuracy, Errors and Overtime for the
employee, a **Target vs Actual by month** chart, a **monthly performance trend**,
the full month-by-month table, and a short written read-out of what is going on.
The drill-down always shows all six months, whatever the month filter is set to.

---

## Import your own data

**Sidebar → ⤒ Import your own data.** Drop a CSV on the dialog (or pick a file) and
every KPI, chart, table, insight and drill-down rebuilds from it. Nothing is
uploaded anywhere — the file is read in your browser, so it works offline too.

Three buttons in that dialog:

- **⤓ Download CSV template** — an empty-ish template with the exact headers, filled with 8 sample employees so you can see the shape.
- **⤓ Download sample data file** — `sample-import.csv`, a complete second dataset (a different company, 15 employees × 5 months) you can import straight away to see the feature work.
- **↺ Restore built-in sample data** — go back to the 1,000-employee dataset. A banner across the top also offers this while imported data is loaded.

### CSV format

One row per **employee per month**. Column order does not matter, and common
header spellings are accepted (`Location`, `Hub`, `Branch` and `City` all map to
Location / Hub).

| Required | Optional |
|---|---|
| Employee ID | Working Days |
| Employee Name | Present Days |
| Department | Attendance % *(else derived from days, else 100)* |
| Location / Hub | Target Achievement % *(else actual ÷ target)* |
| Month | Average TAT (hrs) |
| Monthly Target | Error / Rework Count |
| Actual Handled | Overtime Hours |
| SLA % | |
| Accuracy % | |

**Month** accepts `Sep 2026`, `2026-09`, `09/2026`, `30/09/2026` or a full date.
Rows that can't be read are skipped and reported back to you with the row number
and the reason; missing required columns abort the import with a clear message.
The Performance Index is recalculated for imported rows with the same published
weights.

Example (first two lines of `sample-import.csv`):

```csv
Employee ID,Employee Name,Department,Location / Hub,Month,Working Days,Present Days,Attendance %,Monthly Target,Actual Handled,Target Achievement %,SLA %,Accuracy %,Average TAT (hrs),Error / Rework Count,Overtime Hours
NSF2001,Lokesh Fernandes,Operations,Kochi Hub,May 2026,25,23,92.0,640,541,84.5,86.8,95.93,4.2,22,14.4
```

---

## Filters — multi-select

Month · Department · Location / Hub · Employee. Each one is a **checkbox
dropdown: pick as many values as you like**, e.g. three months at once, or
Delivery + Warehouse, or five named employees.

- Nothing ticked = **all** (the button reads *All months*, *All departments*, …).
- The button shows the choice: one or two names in full, otherwise *“3 selected”*.
- **Select all / Clear** inside each dropdown; with a search term active they
  apply only to the matching options.
- The **Employee** dropdown has a search box and narrows automatically to the
  departments and locations already selected.
- Every KPI, chart, table, insight and the top-bar scope pill responds to all
  four filters together. *Reset filters* clears everything.
- *Export filtered CSV* downloads exactly the rows in the current selection.

---

## Performance Index

One executive number so employees, departments and hubs are comparable:

```
Index = Target Achievement (capped at 100) × 35%
      + SLA %                              × 25%
      + Accuracy %                         × 25%
      + Attendance %                       × 15%
```

| Band | Index | Employees |
|---|---|---|
| 🟢 Performing | 96.5 + | 356 |
| 🟡 On Track | 93 – 96.5 | 389 |
| 🔴 Needs Attention | below 93 | 255 |

---

## How the sample data behaves

Generated from a fixed seed (`78451236`), so the numbers are identical on every
reload. The metrics are *linked*, the way they are in a real network, rather
than drawn independently:

```
skill + hub quality + season
   → attendance → volume handled → target achievement
   → TAT → SLA % → errors → accuracy %
```

Departments: Operations, Warehouse, Delivery, Customer Support, MIS / Analytics.
Hubs: Bhiwandi (Mumbai), Gurugram (NCR), Bengaluru, Hyderabad, Chennai, Kolkata,
Pune, Ahmedabad.

Headline figures: achievement **101.0%**, attendance **91.6%**, SLA **91.3%**,
accuracy **97.8%**, average TAT 4.5 h, 41.6% of employees below target.
July is the peak-season dip; performance recovers and ends the period up
**+2.3 pts**. **Delivery** is the weakest department and **Kolkata Hub** the
weakest location — both by design, so the dashboard has something to find.

---

## The questions management asked

| Question | Where it is answered |
|---|---|
| Who is performing well? | Top 10 chart · table sorted by Index · green band |
| Who is below target? | Insights → *Employees below target* · red Achievement cells |
| Which department performs better? | Department Performance chart · department scorecard |
| Which location has issues? | Hub comparison chart (red bar) · hub scorecard |
| Is performance improving or declining? | Monthly trend chart + its Improving/Declining tag · per-employee trend in the drill-down |

All data is synthetic sample data.
