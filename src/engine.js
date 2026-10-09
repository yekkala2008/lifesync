/*
 * LifeSync planning engine.
 *
 * Pure, deterministic functions: no DOM, no storage, no clock (callers pass
 * `today`). Everything that decides compliance or feasibility lives here so it
 * can be unit-tested in Node and reused unchanged in the browser.
 *
 * Dates are ISO strings "YYYY-MM-DD" and all arithmetic is done in UTC so a
 * phone's time zone can never shift a day.
 *
 * Locations: "BLR" (Bengaluru, office city) and "HYD" (Hyderabad, home city).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.LSEngine = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---------------------------------------------------------------- dates
  const DAY_MS = 86400000;
  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  function parse(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  }
  function fmt(ms) {
    return new Date(ms).toISOString().slice(0, 10);
  }
  function addDays(iso, n) {
    return fmt(parse(iso) + n * DAY_MS);
  }
  function diffDays(a, b) {
    return Math.round((parse(b) - parse(a)) / DAY_MS);
  }
  function weekday(iso) {
    return new Date(parse(iso)).getUTCDay();
  }
  function monthDays(ym) {
    const [y, m] = ym.split("-").map(Number);
    const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const out = [];
    for (let d = 1; d <= n; d++) out.push(`${ym}-${String(d).padStart(2, "0")}`);
    return out;
  }
  /** Monday of the ISO week containing `iso`. Weeks run Mon–Sun. */
  function weekStart(iso) {
    const wd = weekday(iso);
    return addDays(iso, wd === 0 ? -6 : 1 - wd);
  }
  function inRange(iso, start, end) {
    return iso >= start && iso <= (end || start);
  }
  function isWeekend(iso) {
    const wd = weekday(iso);
    return wd === 0 || wd === 6;
  }

  // ---------------------------------------------------------------- rules
  /**
   * Counting rules decide how holidays and leave affect requirements.
   * PRD §9: never assume these; every default is surfaced as an assumption.
   */
  const DEFAULT_COUNTING = {
    holidaysReduceRequirement: true, // a holiday removes a working day from the base
    leaveReducesRequirement: true,
    businessTravelCountsAsWFO: false,
    partialWeeks: "prorate", // "prorate" | "full" | "ignore"
    weeklyBase: 5, // working days in a normal week, used to prorate
  };

  function policyActive(p, iso) {
    if (p.active === false) return false;
    if (p.effectiveFrom && iso < p.effectiveFrom) return false;
    if (p.effectiveTo && iso > p.effectiveTo) return false;
    return true;
  }

  /** Items of one category covering a date. */
  function itemsOn(items, iso, category) {
    return (items || []).filter(
      (it) => (!category || it.category === category) && inRange(iso, it.start, it.end)
    );
  }

  /**
   * Classify every date of the month: is it a working day, what is fixed,
   * what is forbidden. This is the single source of truth for the planner and
   * for compliance.
   */
  function classifyMonth(ym, state) {
    const policies = state.policies || [];
    const items = state.calendar || [];
    return monthDays(ym).map((iso) => {
      const wd = weekday(iso);
      const active = policies.filter((p) => policyActive(p, iso));
      const holiday = itemsOn(items, iso, "holiday")[0] || null;
      const leave = itemsOn(items, iso, "leave")[0] || null;
      const business = itemsOn(items, iso, "business-travel")[0] || null;
      const blackout = itemsOn(items, iso, "blackout")[0] || null;
      const events = itemsOn(items, iso, "event");
      const workday = !isWeekend(iso) && !holiday && !leave;
      const fixedOffice = active.some(
        (p) => p.type === "fixedOffice" && (p.weekdays || []).includes(wd)
      );
      const fixedWfh = active.some(
        (p) => p.type === "fixedWfh" && (p.weekdays || []).includes(wd)
      );
      const required = active.some((p) => p.type === "requiredDate" && p.date === iso);
      // Location pinned by a must-attend event, if any.
      const pinned = events.find((e) => e.mustAttend && e.location);
      return {
        date: iso,
        weekday: wd,
        workday,
        holiday,
        leave,
        business,
        blackout,
        events,
        mustOffice: workday && !business && (fixedOffice || required),
        noOffice: !workday || !!business || fixedWfh,
        fixedWfh,
        pinnedLocation: pinned ? pinned.location : null,
        pinnedBy: pinned || null,
      };
    });
  }

  function activePolicy(state, type, iso) {
    return (state.policies || []).find((p) => p.type === type && policyActive(p, iso)) || null;
  }

  /**
   * Required WFO days for each week touching the month, plus the month total.
   * Returns { monthly: {required, base, policy}, weeks: [{start, days, required, ...}] }
   */
  function requirements(ym, state, classified) {
    const c = Object.assign({}, DEFAULT_COUNTING, state.counting || {});
    const days = classified || classifyMonth(ym, state);
    const first = days[0].date;
    const monthlyP = activePolicy(state, "monthlyMin", first);
    const weeklyP = activePolicy(state, "weeklyMin", first);

    // Monthly: base reductions are expressed proportionally to the month's
    // normal working days, rounded up, so 12/21 with 2 days of leave → ceil(12*19/21).
    let monthly = { required: 0, policy: monthlyP, base: 0, normal: 0 };
    const normal = days.filter((d) => !isWeekend(d.date)).length;
    let base = 0;
    for (const d of days) {
      if (isWeekend(d.date)) continue;
      if (d.holiday && c.holidaysReduceRequirement) continue;
      if (d.leave && c.leaveReducesRequirement) continue;
      base++;
    }
    if (monthlyP) {
      const req = Math.ceil((monthlyP.value * base) / normal - 1e-9);
      monthly = { required: Math.min(req, monthlyP.value), policy: monthlyP, base, normal };
    }

    // Weekly
    const byWeek = new Map();
    for (const d of days) {
      const ws = weekStart(d.date);
      if (!byWeek.has(ws)) byWeek.set(ws, []);
      byWeek.get(ws).push(d);
    }
    const weeks = [];
    for (const [ws, wdays] of byWeek) {
      const inMonthWeekdays = wdays.filter((d) => !isWeekend(d.date)).length;
      let reduce = 0;
      for (const d of wdays) {
        if (isWeekend(d.date)) continue;
        if (d.holiday && c.holidaysReduceRequirement) reduce++;
        else if (d.leave && c.leaveReducesRequirement) reduce++;
      }
      const eligible = wdays.filter((d) => d.workday && !d.noOffice).length;
      let required = 0;
      const partial = inMonthWeekdays < c.weeklyBase;
      if (weeklyP) {
        if (partial && c.partialWeeks === "ignore") required = 0;
        else {
          const baseDays = (partial && c.partialWeeks === "prorate" ? inMonthWeekdays : c.weeklyBase) - reduce;
          const scale = partial && c.partialWeeks === "prorate" ? baseDays / c.weeklyBase : (c.weeklyBase - reduce) / c.weeklyBase;
          required = Math.max(0, Math.ceil(weeklyP.value * scale - 1e-9));
          required = Math.min(required, weeklyP.value);
        }
      }
      weeks.push({
        start: ws,
        dates: wdays.map((d) => d.date),
        required,
        eligible,
        partial,
        mustOffice: wdays.filter((d) => d.mustOffice).length,
      });
    }
    return { monthly, weeks, counting: c };
  }

  // ---------------------------------------------------------------- feasibility
  /**
   * Explain why no plan can exist. Returns an array of human-readable
   * conflicts; empty means "nothing obviously impossible".
   */
  function diagnose(ym, state, opts) {
    opts = opts || {};
    const days = classifyMonth(ym, state);
    const req = requirements(ym, state, days);
    const issues = [];
    const fixed = opts.fixedDays || {};
    if (opts.today && req.monthly.required) {
      const logged = days.filter((d) => fixed[d.date] && fixed[d.date].office).length;
      const left = days.filter((d) => d.date >= opts.today && !fixed[d.date] && d.workday && !d.noOffice).length;
      if (logged + left < req.monthly.required)
        issues.push({
          text: `You've logged ${logged} office ${logged === 1 ? "day" : "days"} and ${left} working ${left === 1 ? "day remains" : "days remain"}, short of the ${req.monthly.required} required. Log any office days you've missed, or record leave or holidays that reduce the requirement.`,
        });
    }
    for (const d of days) {
      if (d.mustOffice && d.fixedWfh)
        issues.push({
          date: d.date,
          text: `${d.date} is both a fixed office day and a fixed WFH day.`,
        });
      if (d.mustOffice && d.pinnedLocation === "HYD")
        issues.push({
          date: d.date,
          text: `${d.date} is a required office day, but “${d.pinnedBy.label}” needs you in Hyderabad.`,
        });
    }
    (state.policies || [])
      .filter((p) => p.type === "requiredDate" && p.date && p.date.startsWith(ym))
      .forEach((p) => {
        const d = days.find((x) => x.date === p.date);
        if (d && !d.workday)
          issues.push({
            date: p.date,
            text: `Required on-site date ${p.date} falls on a ${d.holiday ? "holiday" : d.leave ? "leave day" : "weekend"}.`,
          });
      });
    for (const w of req.weeks) {
      if (opts.today && w.dates[w.dates.length - 1] < opts.today) continue;
      if (w.required > w.eligible)
        issues.push({
          week: w.start,
          text: `Week of ${w.start} needs ${w.required} office days but only ${w.eligible} are available.`,
        });
    }
    const eligibleMonth = days.filter((d) => d.workday && !d.noOffice).length;
    if (req.monthly.required > eligibleMonth)
      issues.push({
        text: `The month needs ${req.monthly.required} office days but only ${eligibleMonth} are available.`,
      });
    const weeklySum = req.weeks.reduce((s, w) => s + w.required, 0);
    if (req.monthly.policy && req.weeks.length && weeklySum > eligibleMonth)
      issues.push({ text: `Weekly minimums add up to more days than the month allows.` });
    return issues;
  }

  // ---------------------------------------------------------------- planner
  const DEFAULT_WEIGHTS = {
    trips: 10, // cost of one one-way journey
    daughter: 6, // reward per evening/day in BLR overlapping daughter's availability
    homeWeekend: 8, // reward per weekend day in Hyderabad
    homeWeekday: 3, // reward per non-office weekday in Hyderabad
    shortStay: 6, // penalty per night short of the minimum stay
    midweekTravel: 2, // penalty for travelling on a weeknight other than the preferred ones
    extraOffice: 0.5, // tiny penalty per office day above requirement (keeps plans lean)
    eventMiss: 25, // soft penalty for being away from a (non must-attend) located event
  };

  const PROFILES = {
    balanced: { label: "Balanced", weights: {} },
    fewerTrips: { label: "Fewest trips", weights: { trips: 30, midweekTravel: 4 } },
    family: { label: "Most family time", weights: { trips: 6, daughter: 10, homeWeekend: 10, homeWeekday: 5 } },
  };

  function familyOn(state, iso, loc) {
    return (state.family || []).filter(
      (f) => f.status !== "unavailable" && (f.location || "BLR") === loc && inRange(iso, f.start, f.end)
    );
  }

  /**
   * Fixed journeys (booked, waitlisted) are hard facts: an overnight journey
   * departing on date d from X to Y forces location(d)=X and location(d+1)=Y.
   * Returns Map(date -> location).
   */
  function forcedLocations(state, ym) {
    const forced = new Map();
    const conflicts = [];
    const locked = (state.journeys || []).filter((j) =>
      ["booked", "waitlisted", "completed"].includes(j.status) || (j.locked && j.status !== "cancelled")
    );
    const put = (date, loc, j) => {
      if (forced.has(date) && forced.get(date) !== loc)
        conflicts.push({ date, journey: j });
      forced.set(date, loc);
    };
    for (const j of locked) {
      put(j.date, j.from, j);
      put(addDays(j.date, 1), j.to, j);
    }
    return { forced, conflicts };
  }

  /**
   * Plan one month with dynamic programming over days.
   *
   * Decision per day: where you are (BLR/HYD) and, on an eligible BLR workday,
   * whether you go to the office. Travel happens overnight between two days.
   * Hard constraints (never traded away):
   *   - monthly and weekly minimums, as computed by requirements()
   *   - fixed office / required dates (must be WFO, so must be in BLR)
   *   - fixed WFH / business travel / non-workdays (cannot be WFO)
   *   - must-attend events pin a location
   *   - booked/waitlisted journeys pin locations
   *   - no departures on blackout dates
   * Everything else is a weighted soft score.
   */
  function planMonth(ym, state, opts) {
    opts = opts || {};
    const prefs = Object.assign(
      { startLocation: "HYD", minStayNights: 2, preferredTravelDays: [0, 5], endLocation: null, holidaysAtHome: true },
      state.prefs || {}
    );
    const w = Object.assign({}, DEFAULT_WEIGHTS, (state.prefs && state.prefs.weights) || {}, opts.weights || {});
    const days = classifyMonth(ym, state);
    const req = requirements(ym, state, days);
    // Trips the user fixed while adjusting this plan count like booked ones.
    const pinned = (opts.pinTrips || []).map((j) => Object.assign({}, j, { status: "booked" }));
    const { forced, conflicts: forcedConflicts } = forcedLocations(
      Object.assign({}, state, { journeys: (state.journeys || []).concat(pinned) }),
      ym
    );
    const noTravel = new Set(opts.noTravel || []);
    if (forcedConflicts.length)
      return {
        feasible: false,
        issues: [{ date: forcedConflicts[0].date, text: `That clashes with another fixed trip around ${forcedConflicts[0].date}: you'd need to be in both cities at once.` }],
        requirements: req,
      };
    const N = days.length;
    const LOCS = ["BLR", "HYD"];

    const weekIdx = days.map((d) => req.weeks.findIndex((w2) => w2.start === weekStart(d.date)));
    const weekEnd = days.map((d, i) => i === N - 1 || weekIdx[i + 1] !== weekIdx[i]);
    // Days already lived are fixed. If they make a minimum unreachable, plan the
    // best remaining schedule and say so, rather than refusing to plan.
    const fixedAll = opts.fixedDays || {};
    const warnings = [];
    const reachable = (dates) =>
      dates.filter((iso) => {
        const fx = fixedAll[iso];
        if (fx) return !!fx.office;
        const d = days.find((x) => x.date === iso);
        return (!opts.today || iso >= opts.today) && d.workday && !d.noOffice;
      }).length;
    const hasPast = (dates) => opts.today && dates.some((x) => x < opts.today);
    const weekNeed = req.weeks.map((wk) => {
      if (!hasPast(wk.dates) || wk.dates[wk.dates.length - 1] < opts.today) return wk.required;
      const r = reachable(wk.dates);
      if (r < wk.required) {
        warnings.push(`Week of ${wk.start}: at most ${r} of ${wk.required} office days are still possible.`);
        return r;
      }
      return wk.required;
    });
    let monthReq = req.monthly.required;
    if (hasPast(days.map((d) => d.date))) {
      const r = reachable(days.map((d) => d.date));
      if (r < monthReq) {
        warnings.push(`At most ${r} of the ${monthReq} required office days are still possible this month.`);
        monthReq = r;
      }
    }
    const MCAP = Math.max(monthReq, 0); // count saturates at requirement
    const WCAP = Math.max(0, ...weekNeed);
    const SCAP = Math.max(1, prefs.minStayNights);

    const startLoc = opts.startLocation || prefs.startLocation;
    // state key: loc, month office count, week office count, nights in BLR (capped)
    const key = (l, m, wc, s) => ((l * (MCAP + 1) + m) * (WCAP + 1) + wc) * (SCAP + 1) + s;
    const decode = (kk) => {
      const s = kk % (SCAP + 1);
      kk = (kk - s) / (SCAP + 1);
      const wc = kk % (WCAP + 1);
      kk = (kk - wc) / (WCAP + 1);
      const m = kk % (MCAP + 1);
      return { l: (kk - m) / (MCAP + 1), m, wc, s };
    };
    const SIZE = 2 * (MCAP + 1) * (WCAP + 1) * (SCAP + 1);

    function dayScore(i, loc, office) {
      const d = days[i];
      let s = office ? w.extraOffice : 0;
      if (loc === "BLR")
        for (const f of familyOn(state, d.date, "BLR")) s -= f.status === "tentative" ? w.daughter / 2 : w.daughter;
      if (loc === "HYD") {
        const away = (state.family || []).some(
          (f) => f.status === "unavailable" && (f.location || "BLR") === "HYD" && inRange(d.date, f.start, f.end)
        );
        if (!away) s -= isWeekend(d.date) || d.holiday ? w.homeWeekend : !office ? w.homeWeekday : 0;
      }
      for (const e of d.events) if (!e.mustAttend && e.location && e.location !== loc) s += w.eventMiss;
      return s;
    }
    const fixed = opts.fixedDays || {};
    function allowedLoc(i, loc) {
      const d = days[i];
      const fx = fixed[d.date];
      if (fx && fx.location) return fx.location === loc;
      if (fx) return !d.pinnedLocation || d.pinnedLocation === loc;
      if (d.mustOffice && loc !== "BLR") return false;
      if (d.pinnedLocation && d.pinnedLocation !== loc) return false;
      if (forced.has(d.date)) return forced.get(d.date) === loc;
      // Weekday holidays at home, unless a ticket or a must-attend event says otherwise.
      if (prefs.holidaysAtHome && d.holiday && !isWeekend(d.date) && !d.pinnedLocation && loc !== "HYD") return false;
      return true;
    }
    function officeOK(i, loc, office) {
      const d = days[i];
      const fx = fixed[d.date];
      if (fx) return !!fx.office === office;
      if (office) return loc === "BLR" && d.workday && !d.noOffice;
      return !d.mustOffice;
    }
    // Weeks that ended before `today` are history (shown in compliance), not constraints.
    function weekOK(i, wc) {
      if (!weekEnd[i]) return true;
      if (opts.today && days[i].date < opts.today) return true;
      return wc >= weekNeed[weekIdx[i]];
    }

    // Virtual "day -1": you are at startLoc. A BLR start counts as a settled stay.
    let cur = new Float64Array(SIZE).fill(Infinity);
    const L0 = LOCS.indexOf(startLoc);
    cur[key(L0, 0, 0, L0 === 0 ? SCAP : 0)] = 0;
    const backs = [];
    for (let i = 0; i < N; i++) {
      const nxt = new Float64Array(SIZE).fill(Infinity);
      const bk = new Int32Array(SIZE).fill(-1);
      const bo = new Uint8Array(SIZE);
      const depDate = i === 0 ? addDays(days[0].date, -1) : days[i - 1].date;
      const depBlackout = (i > 0 && days[i - 1].blackout) || noTravel.has(depDate);
      const newWeek = i === 0 || weekEnd[i - 1];
      for (let k = 0; k < SIZE; k++) {
        const c0 = cur[k];
        if (c0 === Infinity) continue;
        const { l, m, wc, s } = decode(k);
        if (i > 0 && !weekOK(i - 1, wc)) continue;
        const wcBase = newWeek ? 0 : wc;
        for (let l2 = 0; l2 < 2; l2++) {
          if (!allowedLoc(i, LOCS[l2])) continue;
          const travel = l2 !== l;
          if (travel && depBlackout) continue;
          let tc = 0;
          let s2;
          if (travel) {
            tc = w.trips;
            if (!(prefs.preferredTravelDays || []).includes(weekday(depDate))) tc += w.midweekTravel;
            if (l === 0) tc += Math.max(0, SCAP - s) * w.shortStay;
            s2 = 0;
          } else s2 = l2 === 0 ? Math.min(SCAP, s + 1) : 0;
          for (let o = 0; o < 2; o++) {
            const office = o === 1;
            if (!officeOK(i, LOCS[l2], office)) continue;
            const m2 = Math.min(MCAP, m + o);
            const wc2 = Math.min(WCAP, wcBase + o);
            const c = c0 + tc + dayScore(i, LOCS[l2], office);
            const k2 = key(l2, m2, wc2, s2);
            if (c < nxt[k2]) {
              nxt[k2] = c;
              bk[k2] = k;
              bo[k2] = o;
            }
          }
        }
      }
      backs.push({ bk, bo });
      cur = nxt;
    }

    let best = Infinity;
    let bestK = -1;
    for (let k = 0; k < SIZE; k++) {
      if (cur[k] >= best) continue;
      const { l, m, wc } = decode(k);
      if (m < monthReq || !weekOK(N - 1, wc)) continue;
      if (prefs.endLocation && LOCS[l] !== prefs.endLocation) continue;
      best = cur[k];
      bestK = k;
    }
    if (bestK < 0) {
      const issues = diagnose(ym, state, opts).concat(forcedConflicts);
      if (!issues.length)
        issues.push({
          text: "No schedule meets every hard rule together with your fixed journeys and must-attend events. Relax one of them and plan again.",
        });
      return { feasible: false, issues, requirements: req };
    }

    const locs = new Array(N);
    const office = new Array(N);
    let k = bestK;
    for (let i = N - 1; i >= 0; i--) {
      locs[i] = LOCS[decode(k).l];
      office[i] = backs[i].bo[k] === 1;
      k = backs[i].bk[k];
    }

    const planDays = days.map((d, i) => ({
      date: d.date,
      location: locs[i],
      mode: office[i] ? "wfo" : d.workday ? "wfh" : d.holiday ? "holiday" : d.leave ? "leave" : "off",
    }));
    const prevLoc = startLoc;
    const journeys = [];
    let last = prevLoc;
    for (let i = 0; i < N; i++) {
      if (locs[i] !== last) {
        const dep = i === 0 ? addDays(days[0].date, -1) : days[i - 1].date;
        journeys.push({ date: dep, from: last, to: locs[i] });
      }
      last = locs[i];
    }
    const result = {
      feasible: true,
      month: ym,
      days: planDays,
      journeys,
      requirements: req,
      cost: best,
      weights: w,
      warnings,
      weekNeed,
      today: opts.today || null,
    };
    result.metrics = metrics(result, state);
    return result;
  }

  function metrics(plan, state) {
    const wfo = plan.days.filter((d) => d.mode === "wfo").length;
    const daughterDays = plan.days.filter(
      (d) => d.location === "BLR" && familyOn(state, d.date, "BLR").length > 0
    ).length;
    const daughterWindow = plan.days.filter((d) => familyOn(state, d.date, "BLR").length > 0).length;
    const hydDays = plan.days.filter((d) => d.location === "HYD").length;
    const hydWeekends = plan.days.filter((d) => d.location === "HYD" && isWeekend(d.date)).length;
    const hol = plan.days.filter((d) => d.mode === "holiday" && !isWeekend(d.date));
    const holidaysHome = hol.filter((d) => d.location === "HYD").length;
    const cost = (state.prefs && state.prefs.tripCost) || 0;
    return {
      wfo,
      trips: plan.journeys.length,
      daughterDays,
      daughterWindow,
      hydDays,
      weekdayHolidays: hol.length,
      holidaysHome,
      hydWeekends,
      estCost: plan.journeys.length * cost,
    };
  }

  /**
   * Recommended plan plus distinct alternatives, each with an explanation.
   */
  function proposePlans(ym, state, opts) {
    opts = opts || {};
    const out = [];
    const seen = new Set();
    let infeasible = null;
    for (const [id, prof] of Object.entries(PROFILES)) {
      const p = planMonth(ym, state, {
        weights: prof.weights,
        startLocation: opts.startLocation,
        fixedDays: opts.fixedDays,
        today: opts.today,
        pinTrips: opts.pinTrips,
        noTravel: opts.noTravel,
      });
      if (!p.feasible) {
        infeasible = p;
        continue;
      }
      const sig = p.days.map((d) => d.location[0] + d.mode[2]).join("");
      if (seen.has(sig)) continue;
      seen.add(sig);
      p.profile = id;
      p.label = prof.label;
      out.push(p);
    }
    if (!out.length) return { feasible: false, issues: infeasible.issues, requirements: infeasible.requirements };
    out.forEach((p) => (p.explanation = explain(p, state)));
    const tradeoffs = out.length > 1 && materialDifference(out);
    return { feasible: true, plans: out, recommended: out[0], askUser: tradeoffs };
  }

  function materialDifference(plans) {
    const a = plans.map((p) => p.metrics);
    const span = (f) => Math.max(...a.map(f)) - Math.min(...a.map(f));
    return span((m) => m.trips) >= 2 || span((m) => m.daughterDays) >= 2 || span((m) => m.hydWeekends) >= 2;
  }

  function explain(plan, state) {
    const m = plan.metrics;
    const r = plan.requirements;
    const lines = [];
    if (r.monthly.policy)
      lines.push(`${m.wfo} office days planned against ${r.monthly.required} required this month.`);
    else lines.push(`${m.wfo} office days planned. No monthly minimum is set.`);
    const need = plan.weekNeed || r.weeks.map((x) => x.required);
    const wk = r.weeks
      .map((x, i) => ({ x, need: need[i] }))
      .filter((o) => o.need > 0 && !(plan.today && o.x.dates[o.x.dates.length - 1] < plan.today));
    if (wk.length) {
      const counts = wk.map(({ x, need: n0 }) => {
        const n = plan.days.filter((d) => x.dates.includes(d.date) && d.mode === "wfo").length;
        return n >= n0;
      });
      lines.push(
        counts.every(Boolean)
          ? `Every ${plan.today ? "remaining " : ""}week meets its weekly minimum.`
          : `Some weeks fall short of the weekly minimum.`
      );
    }
    lines.push(`${m.trips} one-way ${m.trips === 1 ? "journey" : "journeys"}.`);
    if (m.daughterWindow)
      lines.push(`In Bengaluru for ${m.daughterDays} of ${m.daughterWindow} days your daughter is available.`);
    lines.push(`${m.hydWeekends} weekend ${m.hydWeekends === 1 ? "day" : "days"} at home in Hyderabad.`);
    if (m.weekdayHolidays)
      lines.push(
        m.holidaysHome === m.weekdayHolidays
          ? `${m.weekdayHolidays === 1 ? "The weekday holiday is" : `All ${m.weekdayHolidays} weekday holidays are`} spent at home in Hyderabad.`
          : `${m.holidaysHome} of ${m.weekdayHolidays} weekday holidays at home; a ticket or event keeps you in Bengaluru for the rest.`
      );
    return lines;
  }

  // ---------------------------------------------------------------- compliance
  /**
   * Required vs planned vs completed. Completed comes only from attendance the
   * user logged; a planned day never counts as completed.
   */
  function compliance(ym, state, plan, today) {
    const days = classifyMonth(ym, state);
    const req = requirements(ym, state, days);
    const att = state.attendance || {};
    const planned = new Set(((plan && plan.days) || []).filter((d) => d.mode === "wfo").map((d) => d.date));
    const c = req.counting;
    const isDone = (iso) =>
      att[iso] === "wfo" || (c.businessTravelCountsAsWFO && att[iso] === "business");
    const weekRows = req.weeks.map((w) => {
      const completed = w.dates.filter(isDone).length;
      const plannedN = w.dates.filter((d) => planned.has(d) || isDone(d)).length;
      const remainingPlanned = w.dates.filter((d) => planned.has(d) && !isDone(d) && d >= today).length;
      const projected = completed + remainingPlanned;
      return Object.assign({}, w, {
        completed,
        planned: plannedN,
        projected,
        status: status(w.required, completed, projected, w.dates[w.dates.length - 1] < today),
      });
    });
    const completed = days.filter((d) => isDone(d.date)).length;
    const plannedTotal = days.filter((d) => planned.has(d.date) || isDone(d.date)).length;
    const remaining = days.filter((d) => planned.has(d.date) && !isDone(d.date) && d.date >= today).length;
    const projected = completed + remaining;
    const monthEnd = days[days.length - 1].date;
    return {
      month: ym,
      monthly: {
        required: req.monthly.required,
        hasPolicy: !!req.monthly.policy,
        planned: plannedTotal,
        completed,
        projected,
        status: status(req.monthly.required, completed, projected, monthEnd < today),
      },
      weeks: weekRows,
      counting: c,
    };
  }

  function status(required, completed, projected, past) {
    if (!required) return "no-rule";
    if (completed >= required) return "met";
    if (past) return "missed";
    if (projected >= required) return "on-track";
    return "at-risk";
  }

  // ---------------------------------------------------------------- travel
  const STATUSES = ["proposed", "booking-due", "booked", "waitlisted", "completed", "cancelled"];

  /** Derive the effective status and the next action for a journey. */
  function journeyState(j, today, prefs) {
    prefs = prefs || {};
    const lead = prefs.bookingLeadDays != null ? prefs.bookingLeadDays : 21;
    const opens = prefs.bookingOpensDays != null ? prefs.bookingOpensDays : 60;
    const days = diffDays(today, j.date);
    let st = j.status;
    if (st === "proposed" && days <= lead && days >= 0) st = "booking-due";
    let action = null;
    if (st === "booking-due") action = days <= 3 ? "Book now, departure is close" : "Book this ticket";
    else if (st === "proposed") action = days <= opens ? `Booking open. Aim to book by ${addDays(j.date, -lead)}` : `Booking usually opens around ${addDays(j.date, -opens)}`;
    else if (st === "waitlisted") action = "Not confirmed. Check status or book a backup";
    else if (st === "booked" && days >= 0 && days <= 1) action = "Travelling soon. Leave time to reach the station";
    if (st !== "completed" && st !== "cancelled" && days < 0) action = "Did this journey happen? Mark it completed or cancelled";
    return { status: st, daysAway: days, action, bookBy: addDays(j.date, -lead) };
  }

  /** Grouped, actionable reminders for the Today screen. */
  function reminders(state, today) {
    const out = [];
    for (const j of state.journeys || []) {
      const s = journeyState(j, today, state.prefs);
      if (!s.action) continue;
      if (s.daysAway > 45 && s.status === "proposed") continue;
      let priority = 3;
      if (s.status === "booking-due") priority = s.daysAway <= 7 ? 1 : 2;
      if (s.status === "waitlisted") priority = 1;
      if (s.status === "booked" && s.daysAway <= 1) priority = 1;
      if (s.daysAway < 0) priority = 2;
      out.push({ kind: "journey", journey: j, state: s, priority, text: s.action });
    }
    return out.sort((a, b) => a.priority - b.priority || a.journey.date.localeCompare(b.journey.date));
  }

  // ---------------------------------------------------------------- replanning
  /** Stable fingerprint of everything that can change a plan for a month. */
  // `plan` (optional): fixed journeys that match the plan's own trips don't
  // count, so booking or completing a suggested trip doesn't make it stale.
  function inputsFingerprint(ym, state, plan) {
    const planTrips = new Set(((plan && plan.journeys) || []).map((j) => `${j.date}|${j.from}|${j.to}`));
    const monthStart = ym + "-01";
    const monthEnd = monthDays(ym).slice(-1)[0];
    const touches = (s, e) => !(e && e < monthStart) && !(s > monthEnd);
    const pick = {
      policies: (state.policies || []).map((p) => [p.type, p.value, p.weekdays, p.date, p.effectiveFrom, p.effectiveTo, p.active]),
      calendar: (state.calendar || []).filter((c) => touches(c.start, c.end || c.start)).map((c) => [c.category, c.start, c.end, c.location, c.mustAttend]),
      family: (state.family || []).filter((f) => touches(f.start, f.end)).map((f) => [f.person, f.start, f.end, f.status, f.location]),
      journeys: (state.journeys || []).filter((j) => (["booked", "waitlisted", "completed"].includes(j.status) || (j.locked && j.status !== "cancelled")) && !planTrips.has(`${j.date}|${j.from}|${j.to}`)).map((j) => [j.date, j.from, j.to, j.status, !!j.locked]),
      counting: state.counting || {},
      prefs: state.prefs ? [state.prefs.minStayNights, state.prefs.preferredTravelDays, state.prefs.weights, state.prefs.holidaysAtHome] : null,
    };
    const str = JSON.stringify(pick);
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
  }

  /** Before/after summary between two plans for the same month. */
  function diffPlans(before, after) {
    const changes = [];
    const map = new Map((before ? before.days : []).map((d) => [d.date, d]));
    for (const d of after.days) {
      const b = map.get(d.date);
      if (!b) continue;
      if (b.location !== d.location || b.mode !== d.mode)
        changes.push({ date: d.date, from: b, to: d });
    }
    const key = (j) => `${j.date}|${j.from}|${j.to}`;
    const bj = new Set((before ? before.journeys : []).map(key));
    const aj = new Set(after.journeys.map(key));
    return {
      days: changes,
      addedJourneys: after.journeys.filter((j) => !bj.has(key(j))),
      removedJourneys: (before ? before.journeys : []).filter((j) => !aj.has(key(j))),
    };
  }

  return {
    // dates
    addDays, diffDays, weekday, monthDays, weekStart, isWeekend, WEEKDAYS,
    // rules
    DEFAULT_COUNTING, DEFAULT_WEIGHTS, PROFILES, classifyMonth, requirements, diagnose,
    // planning
    planMonth, proposePlans, explain,
    // compliance
    compliance,
    // travel
    STATUSES, journeyState, reminders,
    // replanning
    inputsFingerprint, diffPlans,
  };
});
