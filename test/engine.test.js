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

test("weekday holidays are spent at home in Hyderabad by default", () => {
  const s = base({
    policies: [{ type: "weeklyMin", value: 3 }],
    calendar: [{ category: "holiday", start: "2026-11-11", label: "Mid-week holiday" }],
  });
  const p = E.planMonth("2026-11", s, { weights: { trips: 40 } }); // even when trips are very costly
  assert.ok(p.feasible);
  assert.equal(p.days.find((d) => d.date === "2026-11-11").location, "HYD");
  assert.ok(p.explanation === undefined || true);
  assert.equal(p.metrics.holidaysHome, 1);
  s.prefs.holidaysAtHome = false;
  const q = E.planMonth("2026-11", s, { weights: { trips: 40 } });
  assert.equal(q.days.find((d) => d.date === "2026-11-11").location, "BLR");
});

test("a booked ticket or must-attend event overrides the holiday-at-home rule", () => {
  const s = base({
    policies: [{ type: "weeklyMin", value: 2 }],
    calendar: [
      { category: "holiday", start: "2026-11-11" },
      { category: "holiday", start: "2026-11-18" },
      { category: "event", start: "2026-11-18", location: "BLR", mustAttend: true, label: "Daughter's school day" },
    ],
    journeys: [{ date: "2026-11-10", from: "HYD", to: "BLR", status: "booked" }],
  });
  const p = E.planMonth("2026-11", s);
  assert.ok(p.feasible);
  assert.equal(p.days.find((d) => d.date === "2026-11-11").location, "BLR");
  assert.equal(p.days.find((d) => d.date === "2026-11-18").location, "BLR");
});

test("completed journeys fix where you were", () => {
  const s = base({
    policies: [{ type: "monthlyMin", value: 6 }],
    journeys: [{ date: "2026-11-03", from: "HYD", to: "BLR", status: "completed" }],
  });
  const p = E.planMonth("2026-11", s);
  assert.equal(p.days.find((d) => d.date === "2026-11-03").location, "HYD");
  assert.equal(p.days.find((d) => d.date === "2026-11-04").location, "BLR");
});

test("moving a suggested trip re-plans the month around it", () => {
  const s = base({ policies: [{ type: "weeklyMin", value: 2 }] });
  const before = E.planMonth("2026-11", s);
  const first = before.journeys.find((j) => j.from === "HYD");
  const moved = { date: E.addDays(first.date, 1), from: "HYD", to: "BLR" };
  const after = E.planMonth("2026-11", s, { pinTrips: [moved], noTravel: [first.date] });
  assert.ok(after.feasible);
  assert.ok(after.journeys.some((j) => j.date === moved.date && j.from === "HYD"));
  assert.ok(!after.journeys.some((j) => j.date === first.date));
  for (const w of after.requirements.weeks) {
    const n = after.days.filter((d) => w.dates.includes(d.date) && d.mode === "wfo").length;
    assert.ok(n >= w.required);
  }
});

test("a trip the user fixed in Travel stays fixed and changes the fingerprint", () => {
  const s = base({ policies: [{ type: "weeklyMin", value: 2 }] });
  const fp0 = E.inputsFingerprint("2026-11", s);
  s.journeys.push({ date: "2026-11-15", from: "HYD", to: "BLR", status: "proposed", locked: true });
  assert.notEqual(E.inputsFingerprint("2026-11", s), fp0);
  const p = E.planMonth("2026-11", s);
  assert.equal(p.days.find((d) => d.date === "2026-11-15").location, "HYD");
  assert.equal(p.days.find((d) => d.date === "2026-11-16").location, "BLR");
});

test("a change that breaks a rule is reported, not applied", () => {
  const s = base({ policies: [{ type: "weeklyMin", value: 5 }] });
  const p = E.planMonth("2026-11", s, { pinTrips: [{ date: "2026-11-10", from: "BLR", to: "HYD" }] });
  assert.equal(p.feasible, false);
  assert.ok(p.issues.length > 0);
});

test("booking or completing a trip the plan suggested doesn't make the plan stale", () => {
  const s = base({ policies: [{ type: "weeklyMin", value: 2 }] });
  const plan = E.planMonth("2026-11", s);
  const fp = E.inputsFingerprint("2026-11", s, plan);
  const j = plan.journeys[0];
  s.journeys.push({ date: j.date, from: j.from, to: j.to, status: "booked" });
  assert.equal(E.inputsFingerprint("2026-11", s, plan), fp);
  s.journeys[0].status = "completed";
  assert.equal(E.inputsFingerprint("2026-11", s, plan), fp);
  s.journeys.push({ date: "2026-11-25", from: "HYD", to: "BLR", status: "booked" }); // not in plan
  assert.notEqual(E.inputsFingerprint("2026-11", s, plan), fp);
});

test("moving a trip onto the same evening as a booked trip is refused with a reason", () => {
  const s = base({
    policies: [{ type: "weeklyMin", value: 2 }],
    journeys: [{ date: "2026-11-15", from: "HYD", to: "BLR", status: "booked" }],
  });
  const p = E.planMonth("2026-11", s, { pinTrips: [{ date: "2026-11-15", from: "BLR", to: "HYD" }] });
  assert.equal(p.feasible, false);
  assert.match(p.issues[0].text, /clashes with another fixed trip/);
  assert.equal(p.issues.length, 1);
});

test("office-closed days: work from home in Hyderabad, no office, requirement reduced", () => {
  const s = base({
    policies: [{ type: "monthlyMin", value: 12 }, { type: "fixedOffice", weekdays: [3] }],
    calendar: [{ category: "office-closed", start: "2026-11-11", label: "Wellness day" }], // a Wednesday
  });
  const r = E.requirements("2026-11", s);
  assert.equal(r.monthly.required, Math.ceil((12 * 20) / 21)); // 12 → 12 with one day off 21? ceil(11.43)=12
  const p = E.planMonth("2026-11", s, { weights: { trips: 40 } });
  assert.ok(p.feasible);
  const d = p.days.find((x) => x.date === "2026-11-11");
  assert.equal(d.mode, "closed");
  assert.equal(d.location, "HYD");
  assert.ok(E.explain(p, s).some((t) => /Office closed on 1 day: working from home in Hyderabad/.test(t)));
  s.counting = { closedDaysReduceRequirement: false };
  s.prefs.closedDaysAtHome = false;
  const q = E.planMonth("2026-11", s, { weights: { trips: 40 } });
  assert.equal(q.days.find((x) => x.date === "2026-11-11").mode, "closed");
});

test("two office-closed days reduce the monthly requirement", () => {
  const s = base({
    policies: [{ type: "monthlyMin", value: 12 }],
    calendar: [{ category: "office-closed", start: "2026-11-12", end: "2026-11-13" }],
  });
  assert.equal(E.requirements("2026-11", s).monthly.required, 11); // ceil(12*19/21)
  s.counting = { closedDaysReduceRequirement: false };
  assert.equal(E.requirements("2026-11", s).monthly.required, 12);
});

test("explanations use your own city names", () => {
  const s = base({
    policies: [{ type: "weeklyMin", value: 2 }],
    family: [{ person: "Daughter", location: "BLR", start: "2026-11-14", end: "2026-11-15", status: "available" }],
  });
  s.prefs.officeCity = { name: "Chennai" };
  s.prefs.homeCity = { name: "Vizag" };
  const p = E.planMonth("2026-11", s);
  const text = E.explain(p, s).join(" ");
  assert.match(text, /In Chennai for/);
  assert.match(text, /at home in Vizag/);
  assert.doesNotMatch(text, /Bengaluru|Hyderabad/);
});

test("working from home on a planned office day lowers the actual count and the projection", () => {
  const s = base({ policies: [{ type: "monthlyMin", value: 4 }] });
  const plan = E.planMonth("2026-11", s);
  const office = plan.days.filter((d) => d.mode === "wfo").map((d) => d.date);
  s.attendance = { [office[0]]: "wfo", [office[1]]: "wfh" };
  const c = E.compliance("2026-11", s, plan, E.addDays(office[1], 1));
  assert.equal(c.monthly.completed, 1);
  assert.equal(c.monthly.projected, 3); // 1 done + 2 still planned
  assert.equal(c.monthly.status, "at-risk");
  s.attendance = Object.fromEntries(office.concat(["2026-11-30"]).map((d) => [d, "wfo"]));
  const over = E.compliance("2026-11", s, plan, "2026-12-01");
  assert.equal(over.monthly.completed, 5); // more than required shows as it is
  assert.equal(over.monthly.status, "met");
});

test("plans the requested work-from-home days in the office city, in every option", () => {
  const s = base({ policies: [{ type: "monthlyMin", value: 12 }] });
  s.prefs.officeCityWfh = { "2026-11": 3 };
  const r = E.proposePlans("2026-11", s);
  assert.ok(r.feasible);
  assert.equal(r.plans[0].profile, "balanced"); // Balanced always first
  for (const p of r.plans) {
    const blrWfh = p.days.filter((d) => d.location === "BLR" && d.mode === "wfh").length;
    assert.ok(blrWfh >= 3, `${p.label}: ${blrWfh}`);
    assert.equal(p.days.filter((d) => d.mode === "wfo").length, 12);
    assert.ok(E.explain(p, s).some((t) => /work-from-home days? in Bengaluru \(you asked for (at least )?3\)/.test(t)));
  }
  assert.deepEqual(r.plans.map((p) => p.label).filter((l) => !["Balanced", "Most home time", "Fewest trips"].includes(l)), []);
});

test("changing the office-city WFH days marks the plan out of date, only for that month", () => {
  const s = base({ policies: [{ type: "monthlyMin", value: 8 }] });
  const fp = E.inputsFingerprint("2026-11", s);
  s.prefs.officeCityWfh = { "2026-12": 2 };
  assert.equal(E.inputsFingerprint("2026-11", s), fp);
  s.prefs.officeCityWfh["2026-11"] = 2;
  assert.notEqual(E.inputsFingerprint("2026-11", s), fp);
});

test("too many office-city WFH days is explained, not ignored", () => {
  const s = base({ policies: [{ type: "monthlyMin", value: 15 }] });
  const p = E.planMonth("2026-11", s, { officeCityWfh: 10 }); // 21 working days, 15 office
  assert.equal(p.feasible, false);
  assert.match(p.issues.map((i) => i.text).join(" "), /won't fit alongside 15 office days/);
});

test("options come in a fixed order: Balanced, Most home time, Fewest trips", () => {
  const s = base({ policies: [{ type: "weeklyMin", value: 2 }] });
  const order = ["balanced", "home", "fewerTrips"];
  const got = E.proposePlans("2026-11", s).plans.map((p) => p.profile);
  assert.equal(got[0], "balanced");
  assert.deepEqual(got, order.filter((x) => got.includes(x)));
});

test("usual office-city WFH days apply to every month unless a month overrides them", () => {
  const s = base({ policies: [{ type: "monthlyMin", value: 10 }] });
  s.prefs.officeCityWfhDefault = 2;
  assert.equal(E.officeCityWfhFor(s, "2026-11"), 2);
  s.prefs.officeCityWfh = { "2026-11": 0, "2026-12": 4 };
  assert.equal(E.officeCityWfhFor(s, "2026-11"), 0); // explicit 0 wins
  assert.equal(E.officeCityWfhFor(s, "2026-12"), 4);
  assert.equal(E.officeCityWfhFor(s, "2027-01"), 2);
  const p = E.planMonth("2027-01", s);
  assert.ok(p.days.filter((d) => d.location === "BLR" && d.mode === "wfh").length >= 2);
});
