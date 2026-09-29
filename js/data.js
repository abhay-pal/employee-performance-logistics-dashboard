/* ==========================================================================
   data.js — sample performance data for a logistics company
   1,000 employees × 6 months (Apr 2026 – Sep 2026) = 6,000 records
   --------------------------------------------------------------------------
   Generated from a fixed seed, so the dashboard shows the same numbers on
   every reload. The metrics are linked the way they are in a real network:

     skill + hub quality + season
        -> attendance
        -> volume handled  (attendance and skill decide throughput)
        -> target achievement
        -> TAT             (slower when overloaded or under-skilled)
        -> SLA %           (driven by TAT, attendance and skill)
        -> errors          (defect rate rises with volume pressure & overtime)
        -> accuracy %      (derived directly from errors, so the two agree)
   ========================================================================== */

const DATA = (() => {
  'use strict';

  /* ---------------------------------------------------------- seeded RNG */
  let seed = 78451236;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const between = (a, b) => a + rnd() * (b - a);
  const gauss = (mu, sd) => mu + (rnd() + rnd() + rnd() + rnd() - 2) * 1.35 * sd;
  const pick = a => a[Math.floor(rnd() * a.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const r1 = v => Math.round(v * 10) / 10;
  const r2 = v => Math.round(v * 100) / 100;

  /* ------------------------------------------------------------ reference */
  // department: share of headcount, monthly volume per person, TAT profile
  const DEPARTMENTS = {
    'Operations':       { share: .22, volume: [420, 760],   tat: [3.2, 1.4], quality:  0.00, unit: 'consignments' },
    'Warehouse':        { share: .26, volume: [900, 1600],  tat: [2.1, 0.9], quality:  0.03, unit: 'packages' },
    'Delivery':         { share: .30, volume: [1100, 1900], tat: [5.4, 2.2], quality: -0.06, unit: 'shipments' },
    'Customer Support': { share: .14, volume: [520, 900],   tat: [1.6, 0.7], quality:  0.04, unit: 'tickets' },
    'MIS / Analytics':  { share: .08, volume: [120, 260],   tat: [6.5, 2.6], quality:  0.05, unit: 'reports' },
  };

  // hub: headcount share and a quality offset (some hubs genuinely run better)
  const HUBS = [
    { name: 'Bhiwandi Hub (Mumbai)', share: .18, quality:  0.04 },
    { name: 'Gurugram Hub (NCR)',    share: .17, quality:  0.06 },
    { name: 'Bengaluru Hub',         share: .15, quality:  0.05 },
    { name: 'Hyderabad Hub',         share: .12, quality:  0.01 },
    { name: 'Chennai Hub',           share: .11, quality: -0.01 },
    { name: 'Kolkata Hub',           share: .10, quality: -0.07 },   // problem hub
    { name: 'Pune Hub',              share: .09, quality:  0.02 },
    { name: 'Ahmedabad Hub',         share: .08, quality: -0.03 },
  ];

  const FIRST = ('Aarav Aditya Ajay Akash Amit Ananya Anil Ankit Anuj Arjun Aryan Ashok Bharat Bhavna Chetan ' +
    'Deepak Dev Dhruv Divya Farhan Gaurav Girish Harish Harsh Imran Isha Jatin Jyoti Kabir Kajal Kamal Karan ' +
    'Kavya Kiran Lalit Mahesh Manish Manoj Meena Mohit Mukesh Naveen Neha Nikhil Nisha Nitin Omkar Pankaj ' +
    'Parth Pooja Prakash Pradeep Pramod Prateek Preeti Priya Rahul Raj Rajat Rajesh Rakesh Ramesh Ravi Rekha ' +
    'Rhea Riya Rohan Rohit Sagar Sahil Sandeep Sanjay Sanya Saurabh Shalini Shreya Shyam Siddharth Simran ' +
    'Sneha Sonal Subhash Sumit Sunil Suraj Suresh Swati Tanvi Tarun Umesh Vaibhav Varun Vijay Vikas Vikram ' +
    'Vinod Vishal Yash Yogesh Zoya').split(' ');
  const LAST = ('Sharma Verma Gupta Yadav Singh Kumar Mehta Iyer Nair Reddy Rao Patel Shah Desai Kulkarni ' +
    'Joshi Bhatt Chopra Kapoor Malhotra Khanna Bansal Agarwal Jain Sinha Mishra Pandey Tiwari Dubey Chauhan ' +
    'Rathore Sethi Bose Ghosh Dutta Banerjee Mukherjee Menon Pillai Thomas Fernandes Naidu Prasad Saxena ' +
    'Srivastava Ahuja Grover Bajaj Chandra Kaur').split(' ');

  /* --------------------------------------------------------------- months */
  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const months = [];
  const end = new Date(2026, 8, 1);                                   // Sep 2026
  for (let i = 5; i >= 0; i--) {
    const d = new Date(end.getFullYear(), end.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`,
      workingDays: [26, 25, 26, 26, 26, 25][5 - i],
      // peak-season pressure: more volume, slightly worse SLA
      load: [0.97, 1.00, 1.06, 1.12, 1.03, 0.99][5 - i],
    });
  }
  const MONTH_LABEL = Object.fromEntries(months.map(m => [m.key, m.label]));

  /* ---------------------------------------------- employee master records */
  const N = 1000;
  const employees = [];
  const usedNames = new Set();

  const weighted = (items, key) => {
    let x = rnd(), acc = 0;
    for (const it of items) { acc += it[key]; if (x <= acc) return it; }
    return items[items.length - 1];
  };
  const deptList = Object.entries(DEPARTMENTS).map(([name, cfg]) => ({ name, ...cfg }));

  for (let i = 0; i < N; i++) {
    const dept = weighted(deptList, 'share');
    const hub = weighted(HUBS, 'share');
    let name;
    do { name = `${pick(FIRST)} ${pick(LAST)}`; } while (usedNames.has(name));
    usedNames.add(name);

    const skill = clamp(gauss(0.60 + hub.quality + dept.quality, 0.165), 0.10, 0.98);
    employees.push({
      id: 'EMP' + String(1001 + i),
      name, dept: dept.name, hub: hub.name,
      skill,
      trend: gauss(0, 0.045),                                  // monthly drift
      absent: clamp(gauss(0.5, 0.24) + (0.58 - skill) * 0.7, 0.02, 1),
      sloppy: clamp(gauss(0.5, 0.24) + (0.58 - skill) * 0.7, 0.02, 1),
      otProne: clamp(gauss(0.45, 0.28), 0, 1),
    });
  }

  // a handful of deliberate cases so the dashboard has real stories in it
  employees[12].absent = 0.05; employees[12].skill = 0.30;            // present but under target
  employees[144].absent = 0.04; employees[144].skill = 0.28;
  employees[318].trend = -0.13;                                      // steady decline
  employees[529].trend = -0.11;
  employees[77].skill = 0.96; employees[77].sloppy = 0.05;           // star
  employees[640].absent = 0.97;                                      // chronic absence
  employees[801].sloppy = 0.97; employees[801].otProne = 1;          // high error, high overtime

  /* --------------------------------------------------------- monthly rows */
  const rows = [];
  employees.forEach(e => {
    const dept = DEPARTMENTS[e.dept];
    months.forEach((m, mi) => {
      // peak-season load hurts; the network is also improving slowly month on month
      const skill = clamp(e.skill + e.trend * mi + 0.011 * mi - (m.load - 1) * 0.38
        + gauss(0, 0.035), 0.08, 0.99);

      /* attendance ------------------------------------------------------- */
      const workingDays = m.workingDays;
      const absences = clamp(Math.round(gauss(e.absent * 4.4, 1.5)), 0, workingDays - 12);
      const presentDays = workingDays - absences;
      const attendance = presentDays / workingDays * 100;

      /* volume & target --------------------------------------------------- */
      const capacity = between(dept.volume[0], dept.volume[1]) * m.load;
      const target = Math.round(capacity / 10) * 10;
      const actual = Math.round(target * clamp(
        0.66 + skill * 0.55 + (attendance - 90) * 0.006 + gauss(0, 0.08), 0.35, 1.5));
      const achievement = actual / target * 100;

      /* turnaround time (lower is better) --------------------------------- */
      const tat = clamp(dept.tat[0] + (1 - skill) * dept.tat[1] * 1.6
        + Math.max(0, m.load - 1) * dept.tat[1] * 1.2 + gauss(0, dept.tat[1] * 0.22),
        dept.tat[0] * 0.55, dept.tat[0] * 2.4);

      /* overtime ----------------------------------------------------------- */
      const overtime = clamp(gauss(e.otProne * 26 * m.load + Math.max(0, 0.6 - skill) * 22, 6), 0, 85);

      /* SLA % -------------------------------------------------------------- */
      const sla = clamp(83 + skill * 18 - (tat - dept.tat[0]) * 3.4
        + (attendance - 90) * 0.18 - Math.max(0, overtime - 45) * 0.12 + gauss(0, 2.2), 55, 99.6);

      /* errors then accuracy (kept consistent with each other) -------------- */
      const defectRate = clamp(0.004 + e.sloppy * 0.030 + Math.max(0, 0.6 - skill) * 0.045
        + Math.max(0, m.load - 1) * 0.020 + Math.max(0, overtime - 40) * 0.0004, 0.0015, 0.16);
      const errors = Math.max(0, Math.round(actual * defectRate * between(0.8, 1.2)));
      const accuracy = clamp(100 - errors / Math.max(1, actual) * 100, 78, 100);

      rows.push({
        id: e.id, name: e.name, dept: e.dept, hub: e.hub,
        month: m.key, monthLabel: m.label,
        workingDays, presentDays,
        attendance: r1(attendance),
        target, actual,
        achievement: r1(achievement),
        sla: r1(sla),
        accuracy: r2(accuracy),
        tat: r1(tat),
        errors,
        overtime: r1(overtime),
      });
    });
  });

  /* ------------------------------------------------------ performance index */
  // Single executive number so employees, departments and hubs are comparable.
  // Target achievement 35% · SLA 25% · Accuracy 25% · Attendance 15%
  const WEIGHTS = { achievement: .35, sla: .25, accuracy: .25, attendance: .15 };
  const indexOf = r => r1(
    Math.min(r.achievement, 100) * WEIGHTS.achievement +
    r.sla * WEIGHTS.sla + r.accuracy * WEIGHTS.accuracy + r.attendance * WEIGHTS.attendance);
  rows.forEach(r => { r.score = indexOf(r); });

  const BANDS = [
    { name: 'Performing',      min: 96.5, color: '#10a37f', cls: 'good' },
    { name: 'On Track',        min: 93, color: '#e0a109', cls: 'mid'  },
    { name: 'Needs Attention', min: 0,  color: '#e0454f', cls: 'bad'  },
  ];
  const bandOf = s => BANDS.find(b => s >= b.min) || BANDS[BANDS.length - 1];

  const csvCols = [
    ['id', 'Employee ID'], ['name', 'Employee Name'], ['dept', 'Department'], ['hub', 'Location / Hub'],
    ['monthLabel', 'Month'], ['workingDays', 'Working Days'], ['presentDays', 'Present Days'],
    ['attendance', 'Attendance %'], ['target', 'Monthly Target'], ['actual', 'Actual Handled'],
    ['achievement', 'Target Achievement %'], ['sla', 'SLA %'], ['accuracy', 'Accuracy %'],
    ['tat', 'Average TAT (hrs)'], ['errors', 'Error / Rework Count'], ['overtime', 'Overtime Hours'],
    ['score', 'Performance Index'],
  ];

  return {
    rows, months, employees, MONTH_LABEL, WEIGHTS, BANDS, bandOf,
    departments: Object.keys(DEPARTMENTS),
    hubs: HUBS.map(h => h.name),
    unitOf: d => (DEPARTMENTS[d] || {}).unit || 'units',
    toCsv() {
      return [csvCols.map(c => c[1]).join(',')]
        .concat(rows.map(r => csvCols.map(c => r[c[0]]).join(',')))
        .join('\n');
    },
  };
})();
