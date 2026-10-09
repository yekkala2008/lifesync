// Run with: node --test test/
const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../src/engine.js");

const base = (extra = {}) =>
  Object.assign(
    {
      prefs: { startLocation: "HYD", minStayNights: 2, preferredTravelDays: [0, 5], tripCost: 900 },
      policies: [],
      calendar: [],
      family: [],
      journeys: [],
      attendance: {},
    },
    extra
  );
const wfoDays = (p) => p.days.filter((d) => d.mode === "wfo");

test("dates: weeks start Monday and months have the right length", () => {
  assert.equal(E.weekStart("2026-10-04"), "2026-09-28"); // Sunday → previous Monday
  assert.equal(E.weekStart("2026-10-05"), "2026-10-05");
  assert.equal(E.monthDays("2026-02").length, 28);
  assert.equal(E.monthDays("2028-02").length, 29);
  assert.equal(E.addDays("2026-12-31", 1), "2027-01-01");
});

test("monthly minimum is met and no extra office days are invented", () => {
  const s = base({ policies: [{ type: "monthlyMin", value: 10 }] });
  const p = E.planMonth("2026-11", s);
  assert.ok(p.feasible);
  assert.equal(wfoDays(p).length, 10);
  for (const d of wfoDays(p)) {
    assert.equal(d.location, "BLR");
    assert.ok(!E.isWeekend(d.date));
  }
});

test("holidays reduce the monthly requirement proportionally (rounded up)", () => {
  const s = base({
    policies: [{ type: "monthlyMin", value: 12 }],
    calendar: [
      { category: "holiday", start: "2026-11-09", label: "H1" },
      { category: "holiday", start: "2026-11-10", label: "H2" },
    ],
  });
  const r = E.requirements("2026-11", s);
  // Nov 2026 has 21 weekdays, 19 after holidays → ceil(12*19/21) = 11
  assert.equal(r.monthly.normal, 21);
  assert.equal(r.monthly.required, 11);
  s.counting = { holidaysReduceRequirement: false };
  assert.equal(E.requirements("2026-11", s).monthly.required, 12);
});

test("weekly minimum holds in every full week; partial weeks are prorated", () => {
  const s = base({ policies: [{ type: "weeklyMin", value: 3 }] });
  const p = E.planMonth("2026-10", s);
  assert.ok(p.feasible);
  for (const w of p.requirements.weeks) {
    const n = p.days.filter((d) => w.dates.includes(d.date) && d.mode === "wfo").length;
    assert.ok(n >= w.required, `week ${w.start} has ${n} < ${w.required}`);
  }
  // Oct 1-4 2026 is Thu-Sun: 2 weekdays in month → ceil(3*2/5) = 2
  assert.equal(p.requirements.weeks[0].required, 2);
});

test("fixed office day is always WFO; fixed WFH day never is", () => {
  const s = base({
    policies: [
      { type: "monthlyMin", value: 8 },
      { type: "fixedOffice", weekdays: [3] },
      { type: "fixedWfh", weekdays: [5] },
    ],
  });
  const p = E.planMonth("2026-11", s);
  assert.ok(p.feasible);
  for (const d of p.days) {
    if (E.weekday(d.date) === 3) assert.equal(d.mode, "wfo", d.date);
    if (E.weekday(d.date) === 5) assert.notEqual(d.mode, "wfo", d.date);
  }
});

test("policy effective dates are respected", () => {
  const s = base({ policies: [{ type: "fixedOffice", weekdays: [1], effectiveFrom: "2026-11-16" }] });
  const p = E.planMonth("2026-11", s);
  const mondays = p.days.filter((d) => E.weekday(d.date) === 1);
  assert.equal(mondays.find((d) => d.date === "2026-11-09").mode !== "wfo", true);
  assert.equal(mondays.find((d) => d.date === "2026-11-16").mode, "wfo");
});

test("leave and business travel never count as planned office days", () => {
  const s = base({
    policies: [{ type: "monthlyMin", value: 8 }],
    calendar: [
      { category: "leave", start: "2026-11-02", end: "2026-11-06" },
      { category: "business-travel", start: "2026-11-11" },
    ],
  });
  const p = E.planMonth("2026-11", s);
  assert.ok(p.feasible);
  for (const d of wfoDays(p)) {
    assert.ok(!(d.date >= "2026-11-02" && d.date <= "2026-11-06"));
    assert.notEqual(d.date, "2026-11-11");
  }
});

test("conflicting rules are explained, not silently broken", () => {
  const s = base({
    policies: [
      { type: "fixedOffice", weekdays: [2] },
      { type: "fixedWfh", weekdays: [2] },
    ],
  });
  const p = E.planMonth("2026-11", s);
  assert.equal(p.feasible, false);
  assert.ok(p.issues.some((i) => /both a fixed office day and a fixed WFH day/.test(i.text)));
});

test("impossible weekly minimum is diagnosed", () => {
  const s = base({
    policies: [{ type: "weeklyMin", value: 5 }],
    calendar: [{ category: "leave", start: "2026-11-03" }],
    counting: { leaveReducesRequirement: false },
  });
  const p = E.planMonth("2026-11", s);
  assert.equal(p.feasible, false);
  assert.ok(p.issues.some((i) => /Week of 2026-11-02 needs 5/.test(i.text)));
});

test("must-attend event pins location", () => {
  const s = base({
    policies: [{ type: "weeklyMin", value: 2 }],
    calendar: [{ category: "event", start: "2026-11-12", location: "HYD", mustAttend: true, label: "Family function" }],
  });
  const p = E.planMonth("2026-11", s);
  assert.equal(p.days.find((d) => d.date === "2026-11-12").location, "HYD");
});

test("booked journeys are fixed and never moved", () => {
  const s = base({
    policies: [{ type: "weeklyMin", value: 2 }],
    journeys: [{ id: "j1", date: "2026-11-17", from: "HYD", to: "BLR", status: "booked" }],
  });
  const p = E.planMonth("2026-11", s);
  assert.equal(p.days.find((d) => d.date === "2026-11-17").location, "HYD");
  assert.equal(p.days.find((d) => d.date === "2026-11-18").location, "BLR");
  assert.ok(p.journeys.some((j) => j.date === "2026-11-17" && j.from === "HYD" && j.to === "BLR"));
});

test("no departures on blackout dates", () => {
  const blackouts = [];
  for (let d = 1; d <= 30; d++) {
    const iso = `2026-11-${String(d).padStart(2, "0")}`;
    if (E.weekday(iso) === 0) blackouts.push({ category: "blackout", start: iso });
  }
  const s = base({ policies: [{ type: "weeklyMin", value: 2 }], calendar: blackouts });
  const p = E.planMonth("2026-11", s);
  assert.ok(p.feasible);
  for (const j of p.journeys) assert.notEqual(E.weekday(j.date), 0, j.date);
});

test("daughter's availability pulls Bengaluru time onto those dates", () => {
  const s = base({ policies: [{ type: "monthlyMin", value: 6 }] });
  const without = E.planMonth("2026-11", s);
  s.family = [{ person: "Daughter", location: "BLR", start: "2026-11-21", end: "2026-11-22", status: "available" }];
  const withD = E.planMonth("2026-11", s, { weights: { daughter: 8 } });
  const blr = (p) => p.days.filter((d) => ["2026-11-21", "2026-11-22"].includes(d.date) && d.location === "BLR").length;
  assert.ok(blr(withD) >= blr(without));
  assert.equal(blr(withD), 2);
});

test("journeys line up with location changes", () => {
  const s = base({ policies: [{ type: "weeklyMin", value: 2 }] });
  const p = E.planMonth("2026-11", s);
  let loc = "HYD";
  const jMap = new Map(p.journeys.map((j) => [j.date, j]));
  for (let i = 0; i < p.days.length; i++) {
    const dep = i === 0 ? E.addDays(p.days[0].date, -1) : p.days[i - 1].date;
    if (p.days[i].location !== loc) {
      const j = jMap.get(dep);
      assert.ok(j, `missing journey before ${p.days[i].date}`);
      assert.equal(j.to, p.days[i].location);
    }
    loc = p.days[i].location;
  }
});

test("alternatives are distinct and flagged for a choice when trade-offs are material", () => {
  const s = base({
    policies: [{ type: "weeklyMin", value: 2 }],
    family: [{ person: "Daughter", location: "BLR", start: "2026-11-07", end: "2026-11-08", status: "available" }],
  });
  const r = E.proposePlans("2026-11", s);
  assert.ok(r.feasible);
  const sigs = new Set(r.plans.map((p) => JSON.stringify(p.days)));
  assert.equal(sigs.size, r.plans.length);
  for (const p of r.plans) assert.ok(p.explanation.length >= 3);
});

test("compliance never counts planned as completed", () => {
  const s = base({ policies: [{ type: "monthlyMin", value: 4 }] });
  const plan = E.planMonth("2026-11", s);
  const c0 = E.compliance("2026-11", s, plan, "2026-11-01");
  assert.equal(c0.monthly.completed, 0);
  assert.equal(c0.monthly.planned, 4);
  assert.equal(c0.monthly.status, "on-track");
  s.attendance = { "2026-11-03": "wfo", "2026-11-04": "wfh" };
  const c1 = E.compliance("2026-11", s, plan, "2026-11-05");
  assert.equal(c1.monthly.completed, 1);
});

test("compliance flags a projected shortfall and a missed month", () => {
  const s = base({ policies: [{ type: "monthlyMin", value: 4 }] });
  const c = E.compliance("2026-11", s, { days: [] }, "2026-11-10");
  assert.equal(c.monthly.status, "at-risk");
  const past = E.compliance("2026-11", s, { days: [] }, "2026-12-02");
  assert.equal(past.monthly.status, "missed");
});

test("journey status: proposed becomes booking-due inside the lead time", () => {
  const prefs = { bookingLeadDays: 21 };
  const j = { date: "2026-11-20", status: "proposed" };
  assert.equal(E.journeyState(j, "2026-10-01", prefs).status, "proposed");
  assert.equal(E.journeyState(j, "2026-11-05", prefs).status, "booking-due");
  assert.match(E.journeyState({ date: "2026-11-01", status: "booked" }, "2026-11-03", prefs).action, /Mark it completed/);
});

test("fingerprint changes when a plan-affecting input changes", () => {
  const s = base({ policies: [{ type: "monthlyMin", value: 8 }] });
  const a = E.inputsFingerprint("2026-11", s);
  s.calendar.push({ category: "holiday", start: "2026-11-09" });
  const b = E.inputsFingerprint("2026-11", s);
  assert.notEqual(a, b);
  s.calendar.push({ category: "holiday", start: "2026-12-25" }); // other month
  assert.equal(E.inputsFingerprint("2026-11", s), b);
});

test("diff lists changed days and journeys", () => {
  const s = base({ policies: [{ type: "monthlyMin", value: 8 }] });
  const a = E.planMonth("2026-11", s);
  const day = a.days.find((x) => x.location === "BLR" && x.mode !== "wfo");
  s.calendar.push({ category: "event", start: day.date, location: "HYD", mustAttend: true });
  const b = E.planMonth("2026-11", s);
  assert.equal(b.days.find((x) => x.date === day.date).location, "HYD");
  const d = E.diffPlans(a, b);
  assert.ok(d.days.some((x) => x.date === day.date));
});

test("replanning mid-month keeps past days and counts logged office days", () => {
  const s = base({ policies: [{ type: "monthlyMin", value: 10 }] });
  const fixedDays = {};
  for (const d of ["2026-11-02", "2026-11-03", "2026-11-04"]) fixedDays[d] = { location: "BLR", office: true };
  fixedDays["2026-11-01"] = { location: "HYD", office: false };
  const p = E.planMonth("2026-11", s, { fixedDays });
  assert.ok(p.feasible);
  for (const d of ["2026-11-02", "2026-11-03", "2026-11-04"]) assert.equal(p.days.find((x) => x.date === d).mode, "wfo");
  assert.equal(wfoDays(p).length, 10);
});

test("a past week that missed its minimum doesn't block planning the rest of the month", () => {
  const s = base({ policies: [{ type: "weeklyMin", value: 2 }, { type: "monthlyMin", value: 8 }] });
  const fixedDays = {};
  for (let d = 1; d <= 8; d++) fixedDays[`2026-10-0${d}`] = { office: false };
  const p = E.planMonth("2026-10", s, { fixedDays, today: "2026-10-09" });
  assert.ok(p.feasible);
  assert.equal(wfoDays(p).length, 8);
  assert.ok(wfoDays(p).every((d) => d.date >= "2026-10-09"));
  assert.ok(p.warnings.some((w) => /Week of 2026-10-05: at most 1 of 2/.test(w)));
});

test("late in the month, an unreachable minimum gives a best-effort plan with a warning", () => {
  const s = base({ policies: [{ type: "monthlyMin", value: 12 }] });
  const fixedDays = {};
  for (let d = 1; d <= 25; d++) fixedDays[`2026-11-${String(d).padStart(2, "0")}`] = { office: d === 3 };
  const p = E.planMonth("2026-11", s, { fixedDays, today: "2026-11-26" });
  assert.ok(p.feasible);
  assert.equal(wfoDays(p).length, 4); // 1 logged + the 3 days left
  assert.ok(p.warnings.some((w) => /At most 4 of the 12/.test(w)), JSON.stringify(p.warnings));
});
