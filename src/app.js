/* LifeSync UI. Preact + htm, no build step. Planning logic lives in engine.js. */
(function () {
  "use strict";
  const { html, render, useState, useEffect, useMemo, useRef } = window.htmPreact;
  const E = window.LSEngine;

  // ------------------------------------------------------------ helpers
  const pad = (n) => String(n).padStart(2, "0");
  const todayISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const ymOf = (iso) => iso.slice(0, 7);
  const addMonths = (ym, n) => {
    const [y, m] = ym.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
  };
  const utc = (iso) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d || 1));
  };
  const fmt = (iso, o) => new Intl.DateTimeFormat("en-IN", Object.assign({ timeZone: "UTC" }, o)).format(utc(iso));
  const fDay = (iso) => fmt(iso, { weekday: "short", day: "numeric", month: "short" });
  const fLong = (iso) => fmt(iso, { weekday: "long", day: "numeric", month: "long" });
  const fMonth = (ym) => fmt(ym + "-01", { month: "long", year: "numeric" });
  const fMonthShort = (ym) => fmt(ym + "-01", { month: "long" });
  const uid = () => Math.random().toString(36).slice(2, 10);
  // Two place slots: "BLR" = office city, "HYD" = home city. The keys never change
  // (so saved data stays valid); the names and codes shown come from your settings.
  const CITY = { BLR: "Bengaluru", HYD: "Hyderabad" };
  const CODE = { BLR: "BLR", HYD: "HYD" };
  function setPlaces(prefs) {
    const o = (prefs && prefs.officeCity) || {};
    const h = (prefs && prefs.homeCity) || {};
    CITY.BLR = (o.name || "").trim() || "Bengaluru";
    CITY.HYD = (h.name || "").trim() || "Hyderabad";
    CODE.BLR = ((o.code || "").trim() || CITY.BLR.slice(0, 3)).toUpperCase().slice(0, 4);
    CODE.HYD = ((h.code || "").trim() || CITY.HYD.slice(0, 3)).toUpperCase().slice(0, 4);
    if (!o.code && !o.name) CODE.BLR = "BLR";
    if (!h.code && !h.name) CODE.HYD = "HYD";
  }
  const other = (c) => (c === "BLR" ? "HYD" : "BLR");
  const plural = (n, a, b) => `${n} ${n === 1 ? a : b || a + "s"}`;
  const rupees = (n) => (n ? "₹" + Number(n).toLocaleString("en-IN") : "—");

  const DEFAULT_PREFS = {
    name: "",
    startLocation: "HYD",
    minStayNights: 2,
    preferredTravelDays: [0, 5],
    bookingLeadDays: 21,
    bookingOpensDays: 60,
    tripCost: 900,
    defaultMode: "train",
    departWindow: "20:00–23:00",
    maxJourneyHours: 12,
    holidaysAtHome: true,
    closedDaysAtHome: true,
    weights: {},
  };
  const EMPTY = () => ({
    prefs: Object.assign({}, DEFAULT_PREFS),
    policies: [],
    counting: {},
    calendar: [],
    family: [],
    journeys: [],
    attendance: {},
    plans: [],
    meta: { setupDone: false },
  });

  // ------------------------------------------------------------ example data (relative to today, all marked)
  function exampleState(today) {
    const s = EMPTY();
    const ym = ymOf(today);
    const next = addMonths(ym, 1);
    const firstWeekday = (fromISO, wd) => {
      let d = fromISO;
      while (E.weekday(d) !== wd) d = E.addDays(d, 1);
      return d;
    };
    const sat1 = firstWeekday(E.addDays(today, 3), 6);
    const sun1 = E.addDays(sat1, 1);
    const sat2 = E.addDays(sat1, 14);
    const hol = firstWeekday(E.addDays(today, 9), 2);
    const nextSat = firstWeekday(next + "-10", 6);
    const sunBook = firstWeekday(E.addDays(today, 1), 0);
    s.prefs.name = "";
    s.policies = [
      { id: uid(), type: "monthlyMin", value: 12, source: "Example", active: true, example: true },
      { id: uid(), type: "weeklyMin", value: 2, source: "Example", active: true, example: true },
      { id: uid(), type: "fixedOffice", weekdays: [3], source: "Example", active: true, example: true },
    ];
    s.calendar = [
      { id: uid(), category: "holiday", label: "Example company holiday", start: hol, example: true },
      { id: uid(), category: "event", label: "Example: family function", start: nextSat, location: "HYD", mustAttend: true, example: true },
    ];
    s.family = [
      { id: uid(), person: "Daughter", location: "BLR", start: sat1, end: sun1, status: "available", source: "Manual", updatedAt: today, example: true },
      { id: uid(), person: "Daughter", location: "BLR", start: sat2, end: E.addDays(sat2, 1), status: "tentative", source: "Manual", updatedAt: today, example: true },
    ];
    s.journeys = [
      { id: uid(), from: "HYD", to: "BLR", date: sunBook, depTime: "21:30", arrTime: "06:45", mode: "train", operator: "Example overnight train", ref: "", cost: 1150, status: "booked", notes: "Example booking", example: true },
    ];
    const att = {};
    const exAtt = [];
    for (let d = ym + "-01"; d < today; d = E.addDays(d, 1)) {
      const wd = E.weekday(d);
      if (wd >= 2 && wd <= 4) {
        att[d] = "wfo";
        exAtt.push(d);
      }
    }
    s.attendance = att;
    s.meta = { setupDone: true, example: true, exampleAttendance: exAtt };
    return s;
  }

  // ------------------------------------------------------------ icons
  const I = {
    today: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`,
    plan: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.5"/></svg>`,
    cal: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>`,
    travel: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 11h14M9 21l-2-4M15 21l2-4"/><circle cx="9" cy="14" r=".6" fill="currentColor"/><circle cx="15" cy="14" r=".6" fill="currentColor"/></svg>`,
    more: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/></svg>`,
    left: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>`,
    right: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>`,
    close: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
    plus: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`,
    warn: html`<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17.5v.01"/></svg>`,
    info: html`<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/></svg>`,
    check: html`<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 10"/></svg>`,
    gauge: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 18a8 8 0 1 1 16 0"/><path d="M12 18l4-6"/></svg>`,
    family: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="8" cy="8" r="3"/><circle cx="17" cy="10" r="2.3"/><path d="M3 20c0-3 2.2-5.5 5-5.5s5 2.5 5 5.5M13.5 20c.2-2.4 1.6-4.2 3.5-4.2S20.3 17.6 20.5 20"/></svg>`,
    rules: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>`,
    report: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 13h6M9 17h4"/></svg>`,
    data: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><ellipse cx="12" cy="6" rx="7" ry="2.8"/><path d="M5 6v6c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V6M5 12v6c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-6"/></svg>`,
    items: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4M8.5 14.5h3"/></svg>`,
  };
  I.lock = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/><circle cx="12" cy="15.5" r="1.3" fill="currentColor"/></svg>`;
  I.finger = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M6.5 6.5A8 8 0 0 1 20 12v1.5"/><path d="M4 11a8 8 0 0 1 1-3.5M4.3 15.5c.4-1.2.7-2.7.7-4.5"/><path d="M8 18.5c.7-1.8 1-4 1-6.5a3 3 0 0 1 6 0c0 1.5-.1 3-.4 4.4"/><path d="M12 12c0 3.2-.6 6-1.8 8.5M14 19.5c.3-.7.6-1.5.8-2.3M17.5 17c.3-1.2.5-2.6.5-4"/></svg>`;
  I.share = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="M8.2 10.8l7.6-4.1M8.2 13.2l7.6 4.1"/></svg>`;
  I.help = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.6M12 17h.01"/></svg>`;
  const Signature = ({ compact }) => html`<div class=${"signature" + (compact ? " compact" : "")} role="img" aria-label="Designed and built by Srinivas Yekkala">
    <span class="sig-by" aria-hidden="true">Designed & built by</span>
    <span class="sig-mark" aria-hidden="true"></span>
    <span class="sig-flourish" aria-hidden="true"><i></i>◆<i></i></span>
    <span class="sig-name" aria-hidden="true">Srinivas Yekkala</span>
  </div>`;
  const BrandMark = () => html`<svg class="brand-mark" viewBox="0 0 28 28" aria-hidden="true">
    <path d="M7 19 C 7 9, 21 19, 21 9" fill="none" stroke="var(--muted)" stroke-width="1.6" stroke-dasharray="2 2.4" stroke-linecap="round"/>
    <circle cx="7" cy="20" r="4.5" fill="var(--hyd)"/><circle cx="21" cy="8" r="4.5" fill="var(--blr)"/></svg>`;

  // ------------------------------------------------------------ small components
  const City = ({ c, long }) => html`<span class=${"city " + c} title=${CITY[c]}>${long ? CITY[c] : CODE[c]}</span>`;
  const Route = ({ j }) => html`<span class="route"><${City} c=${j.from} /><span class="arrow" aria-label="to">→</span><${City} c=${j.to} /></span>`;

  const JSTATUS = {
    proposed: ["neutral", "◇", "Proposed"],
    "booking-due": ["warn", "!", "Booking due"],
    booked: ["ok", "✓", "Booked"],
    waitlisted: ["bad", "~", "Waitlisted"],
    completed: ["info", "✓", "Completed"],
    cancelled: ["neutral", "×", "Cancelled"],
  };
  const CSTATUS = {
    met: ["ok", "✓", "Met"],
    "on-track": ["info", "→", "On track"],
    "at-risk": ["warn", "!", "At risk"],
    missed: ["bad", "×", "Missed"],
    "no-rule": ["neutral", "–", "No rule"],
  };
  const Pill = ({ map, k }) => {
    const [tone, glyph, label] = map[k] || ["neutral", "·", k];
    return html`<span class=${"pill " + tone}><span class="glyph" aria-hidden="true">${glyph}</span>${label}</span>`;
  };
  const Alert = ({ tone, title, children }) => html`<div class=${"alert " + tone} role=${tone === "bad" ? "alert" : "status"}>
    ${tone === "ok" ? I.check : tone === "info" ? I.info : I.warn}
    <div class="body">${title ? html`<strong>${title}</strong>` : null}${children}</div></div>`;

  function Field({ label, hint, children, id }) {
    return html`<div class="field"><label for=${id}>${label}</label>${children}${hint ? html`<span class="hint">${hint}</span>` : null}</div>`;
  }
  function DaysPick({ value, onChange, name }) {
    const v = value || [];
    const order = [1, 2, 3, 4, 5, 6, 0];
    return html`<div class="days-pick" role="group">
      ${order.map(
        (d) => html`<label><input type="checkbox" id=${name + "-" + d} checked=${v.includes(d)}
          onChange=${(e) => onChange(e.target.checked ? [...v, d].sort() : v.filter((x) => x !== d))} /><span>${E.WEEKDAYS[d]}</span></label>`
      )}</div>`;
  }
  function Seg({ options, value, onChange, label }) {
    return html`<div class="seg" role="group" aria-label=${label}>
      ${options.map(
        ([v, t]) => html`<button type="button" aria-pressed=${String(value === v)} onClick=${() => onChange(value === v ? null : v)}>${t}</button>`
      )}</div>`;
  }
  function Sheet({ title, onClose, children }) {
    useEffect(() => {
      const k = (e) => e.key === "Escape" && onClose();
      addEventListener("keydown", k);
      return () => removeEventListener("keydown", k);
    }, []);
    return html`<div class="scrim" onClick=${(e) => e.target === e.currentTarget && onClose()}>
      <div class="sheet" role="dialog" aria-modal="true" aria-label=${title}>
        <div class="grab" aria-hidden="true"></div>
        <div class="sheet-head"><h2>${title}</h2><button class="icon-btn" aria-label="Close" onClick=${onClose}>${I.close}</button></div>
        ${children}
      </div></div>`;
  }
  function ConfirmButton({ label, confirmLabel, onConfirm, cls }) {
    const [armed, setArmed] = useState(false);
    if (!armed) return html`<button class=${"btn " + (cls || "danger")} onClick=${() => setArmed(true)}>${label}</button>`;
    return html`<div class="btn-row"><button class="btn danger" onClick=${() => { setArmed(false); onConfirm(); }}>${confirmLabel || "Yes, " + label.toLowerCase()}</button>
      <button class="btn" onClick=${() => setArmed(false)}>Keep it</button></div>`;
  }

  // ------------------------------------------------------------ derived data
  function acceptedPlan(state, ym) {
    return (state.plans || []).filter((p) => p.month === ym && p.accepted).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] || null;
  }
  function planDay(state, iso) {
    const p = acceptedPlan(state, ymOf(iso));
    return p ? p.days.find((d) => d.date === iso) || null : null;
  }
  function startLocationFor(state, ym) {
    const prev = acceptedPlan(state, addMonths(ym, -1));
    if (prev) return prev.days[prev.days.length - 1].location;
    return (state.prefs && state.prefs.startLocation) || "HYD";
  }
  function fixedDaysFor(state, ym, today) {
    const fx = {};
    const plan = acceptedPlan(state, ym);
    for (const iso of E.monthDays(ym)) {
      if (iso > today) break;
      const att = state.attendance[iso];
      if (iso === today && !att) continue; // today is still open unless you've logged it
      const pd = plan && plan.days.find((d) => d.date === iso);
      if (att === "wfo") fx[iso] = { location: "BLR", office: true };
      else if (pd) fx[iso] = { location: pd.location, office: false };
      else fx[iso] = { office: false };
    }
    return fx;
  }
  function staleMonths(state, today) {
    const out = [];
    for (const ym of [ymOf(today), addMonths(ymOf(today), 1)]) {
      const p = acceptedPlan(state, ym);
      if (p && p.fingerprint !== E.inputsFingerprint(ym, state, p)) out.push(ym);
    }
    return out;
  }
  // What actually happened on a day. Logged entries win. Otherwise, a past working
  // day planned in the home city, or planned as work-from-home, counts as
  // work from home automatically. Planned office days need you to confirm.
  function actualFor(state, iso, today) {
    const att = state.attendance[iso];
    if (att) return { mode: att, auto: false };
    if (iso > today) return null;
    const pd = planDay(state, iso);
    if (iso === today && !(pd && pd.location === "HYD")) return null; // office-city day still open
    if (pd && (pd.mode === "wfh" || pd.mode === "closed")) return { mode: "wfh", auto: true, location: pd.location };
    return null;
  }
  function actualSummary(state, ym, today) {
    const out = { wfo: 0, wfhOffice: 0, wfhHome: 0, leave: 0, business: 0, unconfirmed: 0 };
    for (const iso of E.monthDays(ym)) {
      if (iso > today) break;
      const a = actualFor(state, iso, today);
      const pd = planDay(state, iso);
      if (!a) { if (pd && pd.mode === "wfo" && iso < today) out.unconfirmed++; continue; }
      if (a.mode === "wfo") out.wfo++;
      else if (a.mode === "wfh") (pd && pd.location === "BLR" ? out.wfhOffice++ : out.wfhHome++);
      else if (a.mode === "leave") out.leave++;
      else if (a.mode === "business") out.business++;
    }
    return out;
  }

  function unloggedPast(state, today) {
    const ym = ymOf(today);
    const p = acceptedPlan(state, ym);
    if (!p) return [];
    return p.days.filter((d) => d.date < today && d.mode === "wfo" && !state.attendance[d.date]).map((d) => d.date);
  }
  function journeyLabel(j) {
    return `${CITY[j.from]} → ${CITY[j.to]}`;
  }
  function gcalLink(title, details, start, end, allDay, where) {
    const z = (iso, t) => iso.replace(/-/g, "") + (t ? "T" + t.replace(":", "") + "00" : "");
    const dates = allDay ? `${z(start)}/${z(E.addDays(start, 1))}` : `${z(start.date, start.time)}/${z(end.date, end.time)}`;
    const q = new URLSearchParams({ action: "TEMPLATE", text: title, details, dates, ctz: "Asia/Kolkata" });
    if (where) q.set("location", where);
    return "https://calendar.google.com/calendar/render?" + q.toString();
  }

  // ------------------------------------------------------------ file delivery
  async function deliverFile(filename, blob, toast) {
    try {
      if (window.claude && window.claude.use) {
        const dl = await Promise.race([window.claude.use("downloads"), new Promise((r) => setTimeout(() => r(null), 1500))]);
        if (dl) {
          await dl.save({ filename, data: blob });
          toast("Saved " + filename);
          return;
        }
      }
    } catch (e) {
      if (e && e.code === "declined") return toast("Save cancelled");
    }
    const file = typeof File !== "undefined" ? new File([blob], filename, { type: blob.type }) : null;
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: filename });
        return;
      } catch (e) {
        if (e && e.name === "AbortError") return;
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast("Downloaded " + filename);
  }

  // ------------------------------------------------------------ PDF report
  function buildReport(state, ym, today) {
    const plan = acceptedPlan(state, ym);
    const comp = E.compliance(ym, state, plan, today);
    const monthJ = (state.journeys || []).filter((j) => ymOf(j.date) === ym || (j.date === E.addDays(ym + "-01", -1))).sort((a, b) => a.date.localeCompare(b.date));
    const versions = (state.plans || []).filter((p) => p.month === ym).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const actions = E.reminders(state, today).filter((r) => ymOf(r.journey.date) <= ym);
    const un = ym === ymOf(today) ? unloggedPast(state, today) : [];
    return { plan, comp, journeys: monthJ, versions, actions, unlogged: un };
  }
  function makePDF(state, ym, today) {
    const { jsPDF } = window.jspdf;
    const r = buildReport(state, ym, today);
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    const M = 48;
    let y = 56;
    const line = (t, size, style, color) => {
      if (y > 780) { doc.addPage(); y = 56; }
      doc.setFont("helvetica", style || "normal");
      doc.setFontSize(size || 10);
      doc.setTextColor(...(color || [24, 34, 29]));
      const parts = doc.splitTextToSize(String(t), W - 2 * M);
      doc.text(parts, M, y);
      y += parts.length * (size || 10) * 1.35;
    };
    const rule = () => { doc.setDrawColor(216, 223, 214); doc.line(M, y, W - M, y); y += 14; };
    const row = (cols, widths, bold) => {
      if (y > 780) { doc.addPage(); y = 56; }
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(24, 34, 29);
      let x = M;
      cols.forEach((c, i) => { doc.text(String(c), x, y); x += widths[i]; });
      y += 15;
    };
    const st = (k) => (CSTATUS[k] || [0, 0, k])[2];
    const js = (j) => (JSTATUS[E.journeyState(j, today, state.prefs).status] || [0, 0, j.status])[2];

    doc.setFillColor(29, 115, 92); doc.rect(0, 0, W, 6, "F");
    doc.setFillColor(168, 87, 26); doc.rect(W / 2, 0, W / 2, 6, "F");
    line("LifeSync report", 20, "bold");
    line(`${fMonth(ym)}  ·  generated ${fDay(today)}${state.prefs.name ? "  ·  " + state.prefs.name : ""}`, 10, "normal", [86, 100, 92]);
    if (state.meta && state.meta.example) line("Contains example data.", 9, "italic", [154, 91, 0]);
    y += 6; rule();

    line("Office attendance", 13, "bold");
    const m = r.comp.monthly;
    line(m.hasPolicy ? `Required ${m.required}  ·  Planned ${m.planned}  ·  Completed ${m.completed}  ·  Projected ${m.projected}  ·  ${st(m.status)}` : `No monthly minimum set. Planned ${m.planned}, completed ${m.completed}.`, 10);
    { const a = actualSummary(state, ym, today); line(`Actual so far: ${a.wfo} office, ${a.wfhOffice} from home in ${CITY.BLR}, ${a.wfhHome} from home in ${CITY.HYD}${a.leave ? ", " + a.leave + " leave" : ""}${a.business ? ", " + a.business + " work trip" : ""}${a.unconfirmed ? ", " + a.unconfirmed + " not confirmed" : ""}.`, 9.5); }
    line("Completed counts only days you logged as office days. Planned days are never counted as completed.", 8.5, "italic", [86, 100, 92]);
    y += 4;
    row(["Week of", "Required", "Planned", "Completed", "Status"], [120, 80, 80, 90, 120], true);
    for (const w of r.comp.weeks) row([fDay(w.start), w.required, w.planned, w.completed, st(w.status)], [120, 80, 80, 90, 120]);
    y += 6; rule();

    line("Travel", 13, "bold");
    if (!r.journeys.length) line("No journeys this month.", 10, "normal", [86, 100, 92]);
    else {
      row(["Date", "Route", "Time", "Mode / ref", "Status"], [92, 150, 70, 110, 90], true);
      for (const j of r.journeys)
        row([fDay(j.date), `${CITY[j.from]} > ${CITY[j.to]}`, j.depTime || "-", [j.mode, j.ref].filter(Boolean).join(" ").slice(0, 22) || "-", js(j)], [92, 150, 70, 110, 90]);
      const cost = r.journeys.filter((j) => j.status !== "cancelled").reduce((s, j) => s + (Number(j.cost) || 0), 0);
      if (cost) line(`Recorded ticket cost: Rs ${cost.toLocaleString("en-IN")}`, 9.5);
    }
    y += 6; rule();

    line("Plan", 13, "bold");
    if (r.plan) {
      line(`${r.plan.label} plan, saved ${fDay(r.plan.createdAt.slice(0, 10))}`, 10);
      r.plan.explanation.forEach((t) => line("• " + t, 9.5));
      const blr = r.plan.days.filter((d) => d.location === "BLR").length;
      line(`${blr} days in ${CITY.BLR}, ${r.plan.days.length - blr} in ${CITY.HYD}.`, 9.5);
    } else line("No plan saved for this month.", 10, "normal", [86, 100, 92]);
    if (r.versions.length > 1) {
      y += 4;
      line("Plan changes", 11, "bold");
      r.versions.forEach((v) => line(`${fDay(v.createdAt.slice(0, 10))}: ${v.label}${v.accepted ? " (current)" : ""}${v.reason ? " — " + v.reason : ""}`, 9.5));
    }
    y += 6; rule();

    line("Outstanding actions", 13, "bold");
    if (!r.actions.length && !r.unlogged.length) line("Nothing outstanding.", 10, "normal", [86, 100, 92]);
    r.actions.forEach((a) => line(`• ${fDay(a.journey.date)} ${CITY[a.journey.from]} > ${CITY[a.journey.to]}: ${a.text}`, 9.5));
    if (r.unlogged.length) line(`• ${r.unlogged.length} planned office day(s) not yet logged: ${r.unlogged.map(fDay).join(", ")}`, 9.5);
    const pages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(120, 130, 124);
      doc.text("LifeSync · designed & built by Srinivas Yekkala", M, doc.internal.pageSize.getHeight() - 24);
      doc.text(`${i} / ${pages}`, W - M, doc.internal.pageSize.getHeight() - 24, { align: "right" });
    }
    return doc.output("blob");
  }

  // ------------------------------------------------------------ screens: Today
  function LockOffer({ go }) {
    const [show, setShow] = useState(false);
    useEffect(() => {
      let dismissed = false;
      try { dismissed = localStorage.getItem("lifesync.lockOffer") === "no"; } catch (e) {}
      if (dismissed || !window.LSLock || LSLock.read()) return;
      LSLock.unsupportedReason().then((r) => setShow(!r));
    }, []);
    if (!show) return null;
    const later = () => { try { localStorage.setItem("lifesync.lockOffer", "no"); } catch (e) {} setShow(false); };
    return html`<${Alert} tone="info" title="Protect LifeSync with your fingerprint">
      <p class="small">Ask for your phone's fingerprint, face, PIN or pattern every time LifeSync opens.</p>
      <div class="btn-row"><button class="btn small primary" onClick=${() => go("more", "lock")}>Set up App lock</button><button class="btn small" onClick=${later}>Not now</button></div>
    </${Alert}>`;
  }

  function Today({ state, today, go, openJourney, setAttendance, openDay, openConfirm }) {
    const ym = ymOf(today);
    const plan = acceptedPlan(state, ym);
    const pd = plan && plan.days.find((d) => d.date === today);
    const cls = E.classifyMonth(ym, state).find((d) => d.date === today);
    const att = state.attendance[today];
    const tonight = (state.journeys || []).find((j) => j.date === today && j.status !== "cancelled");
    const rem = E.reminders(state, today);
    const comp = E.compliance(ym, state, plan, today);
    const stale = staleMonths(state, today);
    const unlogged = unloggedPast(state, today);
    const nextJ = (state.journeys || []).filter((j) => j.date >= today && !["cancelled", "completed"].includes(j.status)).sort((a, b) => a.date.localeCompare(b.date))[0];
    const thisWeek = comp.weeks.find((w) => w.dates.includes(today));
    const hour = new Date().getHours();
    const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    const loc = pd ? pd.location : null;
    const famSoon = (state.family || [])
      .filter((f) => f.end >= today && f.start <= E.addDays(today, 30) && f.status !== "unavailable")
      .sort((a, b) => a.start.localeCompare(b.start))
      .slice(0, 3);

    return html`<div class="page">
      <div class="page-head"><span class="eyebrow">${fLong(today)}</span><h1>${greet}${state.prefs.name ? ", " + state.prefs.name : ""}</h1></div>

      ${state.meta.example ? html`<${Alert} tone="info" title="You're looking at example data">
        <p class="small">Rules, dates and the booked journey are samples so you can see how LifeSync works. Replace them with your own, or remove them in Backup & data.</p>
        <div><button class="link" onClick=${() => go("more", "data")}>Remove example data</button></div></${Alert}>` : null}

      ${state.meta.example ? null : html`<${LockOffer} go=${go} />`}
      ${stale.map((m) => html`<${Alert} tone="warn" title=${`Your ${fMonthShort(m)} plan may be out of date`}>
        <p class="small">A rule, holiday, family date or booked journey changed after you saved it.</p>
        <div><button class="btn small primary" onClick=${() => go("plan", m, true)}>Review an updated plan</button></div></${Alert}>`)}

      <div class=${"where " + (loc || "none")}>
        <span class="eyebrow">Today</span>
        ${loc
          ? html`<span class="big">${CITY[loc]}</span>
            <span class="small">${pd.mode === "wfo" ? "Office day" : pd.mode === "wfh" ? "Working from home" : pd.mode === "closed" ? "Office closed · working from home" + (cls && cls.closed && cls.closed.label ? ": " + cls.closed.label : "") : pd.mode === "holiday" ? "Holiday" + (cls && cls.holiday ? ": " + cls.holiday.label : "") : pd.mode === "leave" ? "On leave" : "Day off"}
              ${tonight ? html` · Travelling tonight to ${CITY[tonight.to]}${tonight.depTime ? " at " + tonight.depTime : ""}` : null}</span>
            <span class="stamp" aria-hidden="true">${loc}</span>`
          : html`<span class="big" style="font-size:22px">No plan for ${fMonthShort(ym)} yet</span>
            <span class="small muted">Make a plan to see where you should be each day.</span>
            <div><button class="btn primary small" onClick=${() => go("plan", ym)}>Make a plan</button></div>`}
      </div>

      ${cls && cls.workday ? html`<div class="card"><${LogDay} state=${state} iso=${today} today=${today} setAttendance=${setAttendance} label="Log today" /></div>` : null}

      ${unlogged.length ? html`<${Alert} tone="warn" title=${`${plural(unlogged.length, "planned office day")} to confirm`}>
        <p class="small">Did you go to the office? Only confirmed office days count. ${unlogged.slice(0, 4).map(fDay).join(", ")}${unlogged.length > 4 ? "…" : ""}</p>
        <div><button class="btn small" onClick=${() => openConfirm(unlogged)}>Confirm ${unlogged.length === 1 ? fDay(unlogged[0]) : plural(unlogged.length, "day")}</button></div></${Alert}>` : null}
      ${plan && !stale.includes(ym) && !unlogged.length && comp.monthly.status === "at-risk" ? html`<${Alert} tone="warn" title=${`On track for ${comp.monthly.projected} of ${comp.monthly.required} office days`}>
        <p class="small">You've worked from home on some planned office days. An updated plan can fit in the ${comp.monthly.required - comp.monthly.projected} you still need.</p>
        <div><button class="btn small primary" onClick=${() => go("plan", ym, true)}>Review an updated plan</button></div></${Alert}>` : null}

      <div class="section">
        <div class="section-head"><h2>Next up</h2>${rem.length ? html`<span class="small muted">${plural(rem.length, "action")}</span>` : null}</div>
        ${rem.length || nextJ
          ? html`<div class="list">
            ${rem.slice(0, 4).map(
              (r) => html`<button class="item" onClick=${() => openJourney(r.journey.id)}>
                <div class="stack grow"><div class="row wrap"><${Route} j=${r.journey} /><${Pill} map=${JSTATUS} k=${r.state.status} /></div>
                <span class="small">${r.text}</span><span class="tiny muted">${fDay(r.journey.date)}${r.journey.depTime ? " · " + r.journey.depTime : ""}</span></div></button>`
            )}
            ${nextJ && !rem.some((r) => r.journey.id === nextJ.id)
              ? html`<button class="item" onClick=${() => openJourney(nextJ.id)}><div class="stack grow">
                <div class="row wrap"><${Route} j=${nextJ} /><${Pill} map=${JSTATUS} k=${E.journeyState(nextJ, today, state.prefs).status} /></div>
                <span class="small">Next journey · ${fDay(nextJ.date)}${nextJ.depTime ? " at " + nextJ.depTime : ""}</span></div></button>`
              : null}
          </div>`
          : html`<div class="list"><div class="empty">No journeys or booking actions coming up.</div></div>`}
      </div>

      <div class="section">
        <div class="section-head"><h2>Office days</h2><button class="link" onClick=${() => go("more", "compliance")}>Details</button></div>
        <div class="card"><${MonthMeter} c=${comp.monthly} ym=${ym} />
          ${thisWeek && thisWeek.required ? html`<div class="divider"></div><div class="row between small"><span>This week: ${thisWeek.completed} of ${thisWeek.required} done, ${thisWeek.projected} projected</span><${Pill} map=${CSTATUS} k=${thisWeek.status} /></div>` : null}
        </div>
      </div>

      <div class="section">
        <div class="section-head"><h2>Family</h2><button class="link" onClick=${() => go("more", "family")}>All dates</button></div>
        ${famSoon.length
          ? html`<div class="list">${famSoon.map((f) => {
              const days = [];
              for (let d = f.start; d <= f.end; d = E.addDays(d, 1)) days.push(d);
              const there = days.filter((d) => { const p = planDay(state, d); return p && p.location === (f.location || "BLR"); }).length;
              const known = days.some((d) => planDay(state, d));
              return html`<div class="item" style="cursor:default"><div class="stack grow">
                <div class="row wrap"><strong>${f.person}</strong><${City} c=${f.location || "BLR"} /><span class=${"pill " + (f.status === "tentative" ? "warn" : "ok")}>${f.status === "tentative" ? "Tentative" : "Available"}</span></div>
                <span class="small">${fDay(f.start)}${f.end !== f.start ? " – " + fDay(f.end) : ""}</span>
                <span class="tiny muted">${known ? (there === days.length ? `You're in ${CITY[f.location || "BLR"]} for all of it` : there ? `You're there ${there} of ${days.length} days` : `Your plan has you in ${CITY[other(f.location || "BLR")]}`) : "No plan covers these dates yet"}</span></div></div>`;
            })}</div>`
          : html`<div class="list"><div class="empty">No family dates in the next 30 days.<button class="btn small" onClick=${() => go("more", "family")}>Add your daughter's dates</button></div></div>`}
      </div>
    </div>`;
  }

  function LogDay({ state, iso, today, setAttendance, label }) {
    const pd = planDay(state, iso);
    const att = state.attendance[iso];
    const atHome = pd && pd.location === "HYD";
    const auto = !att && atHome && iso <= today;
    const opts = atHome
      ? [["wfh", "Home"], ["leave", "Leave"], ["business", "Work trip"], ["wfo", "Office"]]
      : [["wfo", "Office"], ["wfh", "Home"], ["leave", "Leave"], ["business", "Work trip"]];
    return html`<div class="stack" style="gap:8px">
      <div class="row between"><h3>${label}</h3><span class="small muted">${att ? "Logged" : auto ? "Logged automatically" : pd && pd.mode === "wfo" ? "Planned: office" : "Not logged yet"}</span></div>
      ${atHome ? html`<p class="small muted">You're in ${CITY.HYD}, so this counts as work from home. Change it only if the day went differently.</p>`
        : pd && pd.location === "BLR" ? html`<p class="small muted">In ${CITY.BLR}: choose <b>Office</b> or <b>Home</b>. Only Office counts towards your office days.</p>` : null}
      <${Seg} label="Attendance" value=${att || (auto ? "wfh" : null)} onChange=${(v) => setAttendance(iso, v)} options=${opts} />
    </div>`;
  }

  function ConfirmSheet({ state, days, today, setAttendance, onClose }) {
    return html`<${Sheet} title="Confirm past office days" onClose=${onClose}>
      <p class="small muted">These were planned as office days. Tap what actually happened. Only <b>Office</b> counts as an office day.</p>
      <div class="list">${days.map((iso) => {
        const att = state.attendance[iso];
        return html`<div class="item" style="cursor:default;flex-wrap:wrap"><div class="stack grow"><strong class="small">${fDay(iso)}</strong><span class="tiny muted">${att ? "Logged: " + ({ wfo: "office", wfh: "home", leave: "leave", business: "work trip" }[att]) : "Planned: office in " + CITY.BLR}</span></div>
          <div class="seg confirm-seg" role="group" aria-label=${"Attendance " + fDay(iso)}>
            ${[["wfo", "Office"], ["wfh", "Home"], ["leave", "Leave"]].map(([v, t]) => html`<button type="button" aria-pressed=${String(att === v)} onClick=${() => setAttendance(iso, att === v ? null : v, true)}>${t}</button>`)}
          </div></div>`;
      })}</div>
      <button class="btn primary" onClick=${onClose}>Done</button>
    </${Sheet}>`;
  }

  function MonthMeter({ c, ym }) {
    if (!c.hasPolicy) return html`<div class="stack"><span class="small">No monthly minimum is set for ${fMonthShort(ym)}.</span><span class="tiny muted">${c.completed} logged, ${c.planned} planned.</span></div>`;
    const max = Math.max(c.required, c.planned, c.completed, 1) * 1.12;
    return html`<div class="meter">
      <div class="row between"><span class="small"><strong class="num">${c.completed}</strong> of <span class="num">${c.required}</span> office days done in ${fMonthShort(ym)}${c.completed > c.required ? html`<span class="muted"> · ${c.completed - c.required} more than needed</span>` : null}</span><${Pill} map=${CSTATUS} k=${c.status} /></div>
      <div class="meter-bar" role="img" aria-label=${`${c.completed} completed, ${c.projected} projected, ${c.required} required`}>
        <div class="planned" style=${`width:${(c.projected / max) * 100}%`}></div>
        <div class="done" style=${`width:${(c.completed / max) * 100}%`}></div>
        <div class="target" style=${`left:${(c.required / max) * 100}%`}></div>
      </div>
      <div class="meter-legend"><span><i style="background:var(--blr)"></i>Done ${c.completed}</span><span><i style="background:color-mix(in srgb,var(--blr) 45%,transparent)"></i>Projected ${c.projected}</span><span><i style="background:var(--ink);width:3px"></i>Required ${c.required}</span></div>
    </div>`;
  }

  // ------------------------------------------------------------ screens: Plan
  function Strip({ days }) {
    return html`<div class="stack" style="gap:4px">
      <div class="strip" role="img" aria-label=${days.map((d) => `${d.date.slice(8)} ${d.location}${d.mode === "wfo" ? " office" : ""}`).join(", ")}>
        ${days.map((d) => html`<i class=${d.location + (d.mode === "wfo" ? " wfo" : "")} title=${`${fDay(d.date)}: ${CITY[d.location]}${d.mode === "wfo" ? ", office" : ""}`}></i>`)}
      </div>
      <div class="strip-axis"><span>1</span><span>${Math.ceil(days.length / 2)}</span><span>${days.length}</span></div>
    </div>`;
  }
  function Metrics({ m }) {
    return html`<div class="metrics">
      <div><span class="v">${m.wfo}</span><span class="k">office days</span></div>
      <div><span class="v">${m.trips}</span><span class="k">one-way trips</span></div>
      <div><span class="v">${m.daughterWindow ? `${m.daughterDays}/${m.daughterWindow}` : "—"}</span><span class="k">daughter days covered</span></div>
      <div><span class="v">${m.hydWeekends}</span><span class="k">home weekend days</span></div>
    </div>${m.cityWfh ? html`<span class="tiny muted">${m.cityWfh} work-from-home ${m.cityWfh === 1 ? "day" : "days"} in ${CITY.BLR} · ${m.hydDays} days in ${CITY.HYD}</span>` : html`<span class="tiny muted">${m.hydDays} days in ${CITY.HYD}</span>`}`;
  }
  const tripKey = (j) => `${j.date}|${j.from}|${j.to}`;
  const arriveLabel = (j) => "arrive " + fmt(E.addDays(j.date, 1), { weekday: "short", day: "numeric" });

  function TravelDates({ journeys, state, today, pins, onEdit }) {
    if (!journeys.length) return html`<p class="small muted">No travel needed.</p>`;
    const lead = state.prefs.bookingLeadDays != null ? state.prefs.bookingLeadDays : 21;
    const fixed = (state.journeys || []).filter((j) => ["booked", "waitlisted", "completed"].includes(j.status) || (j.locked && j.status !== "cancelled"));
    const match = (j) => fixed.find((b) => tripKey(b) === tripKey(j));
    const pinned = new Set((pins || []).map(tripKey));
    return html`<div class="trips">
      <div class="row between"><span class="eyebrow">Suggested travel</span>${onEdit ? html`<span class="tiny muted">Tap a trip to change it</span>` : null}</div>
      ${journeys.map((j) => {
        const b = match(j);
        const past = j.date < today;
        const mine = pinned.has(tripKey(j)) || (b && b.locked && b.status === "proposed");
        const bookBy = E.addDays(j.date, -lead);
        const note = b && b.status !== "proposed" ? (b.status === "completed" ? "Done" : b.status === "waitlisted" ? "Waitlisted" : "Booked") : past ? "Past" : `book by ${bookBy < today ? "now" : fDay(bookBy)}`;
        const body = html`<span class="trip-when"><span class="num trip-date">${fDay(j.date)}</span><span class="tiny muted">evening → ${arriveLabel(j)}</span></span>
          <${Route} j=${j} />
          <span class="trip-note">${mine ? html`<span class="pill info tiny-pill">Your date</span>` : null}<span class="tiny muted">${note}</span></span>`;
        const editable = onEdit && !past && !(b && b.status !== "proposed");
        return editable
          ? html`<button type="button" class="trip-row trip-btn" onClick=${(e) => { e.stopPropagation(); onEdit(j); }} aria-label=${`Change ${fDay(j.date)} ${CITY[j.from]} to ${CITY[j.to]}`}>${body}</button>`
          : html`<div class="trip-row">${body}</div>`;
      })}
    </div>`;
  }

  function TripSheet({ trip, month, today, onMove, onKeep, onSkip, onClose }) {
    const [date, setDate] = useState(trip.date);
    const monthStart = E.addDays(month + "-01", -1);
    const first = today > monthStart ? today : monthStart;
    const last = E.monthDays(month).slice(-1)[0];
    const ok = date && date >= first && date <= last;
    return html`<${Sheet} title=${`${CITY[trip.from]} → ${CITY[trip.to]}`} onClose=${onClose}>
      <p class="small">Suggested for <strong>${fDay(trip.date)}</strong> evening, arriving ${arriveLabel(trip).replace("arrive ", "")} morning.</p>
      <div class="card">
        <h3>Move to another evening</h3>
        <${Field} label="Leave on" id="t-date" hint=${`Any evening from ${fDay(first)} to ${fDay(last)}. LifeSync re-plans the rest of the month around it, including your office days and the return trip.`}><input id="t-date" type="date" min=${first} max=${last} value=${date} onInput=${(e) => setDate(e.target.value)} /></${Field}>
        <button class="btn primary" disabled=${!ok || date === trip.date} onClick=${() => onMove(date)}>Move trip to ${ok && date !== trip.date ? fDay(date) : "this date"}</button>
      </div>
      <div class="btn-row">
        <button class="btn" onClick=${onKeep}>Keep ${fDay(trip.date)}</button>
        <button class="btn" onClick=${onSkip}>Don't travel that evening</button>
      </div>
      <p class="tiny muted">Nothing is saved until you tap Save plan.</p>
    </${Sheet}>`;
  }

  function PlanInputs({ ym, value, usual, overridden, onChange, onReset }) {
    const set = (n) => onChange(Math.max(0, Math.min(20, n)));
    return html`<div class="card plan-inputs">
      <div class="row between">
        <div class="stack" style="gap:2px"><h3>Work from home in ${CITY.BLR}</h3><span class="small muted">Days in ${fMonthShort(ym)} you'll stay in ${CITY.BLR} but not go to the office. Planned on top of your office days.</span></div>
      </div>
      <div class="stepper" role="group" aria-label=${"Work from home days in " + CITY.BLR}>
        <button class="icon-btn" aria-label="One day fewer" disabled=${value <= 0} onClick=${() => set(value - 1)}>−</button>
        <input id="pi-wfh" type="number" inputmode="numeric" min="0" max="20" value=${value} onInput=${(e) => set(Number(e.target.value) || 0)} aria-label="Days" />
        <span class="small">${value === 1 ? "day" : "days"}</span>
        <button class="icon-btn" aria-label="One day more" onClick=${() => set(value + 1)}>+</button>
      </div>
      <span class="tiny muted">${overridden ? html`Just for ${fMonthShort(ym)}. Your usual is ${usual}. <button class="link tiny-link" onClick=${onReset}>Use usual</button>` : `Your usual number (set in Rules & preferences). Change it here for ${fMonthShort(ym)} only.`}</span>
    </div>`;
  }

  function PlanScreen({ state, today, month, setMonth, acceptPlan, go, autoRun, clearAutoRun, openHelp, setCityWfh }) {
    const ym = month;
    const current = acceptedPlan(state, ym);
    const stale = current && current.fingerprint !== E.inputsFingerprint(ym, state, current);
    const EMPTY_ADJ = { pins: [], noTravel: [] };
    const [result, setResult] = useState(null);
    const [pick, setPick] = useState(0);
    const [confirm, setConfirm] = useState(false);
    const [adj, setAdj] = useState(EMPTY_ADJ);
    const [history, setHistory] = useState([]);
    const [editing, setEditing] = useState(null);
    const [rejected, setRejected] = useState(null);
    useEffect(() => {
      setConfirm(false); setPick(0); setAdj(EMPTY_ADJ); setHistory([]); setRejected(null);
      setResult(autoRun ? compute(EMPTY_ADJ) : null);
      if (autoRun) clearAutoRun();
    }, [ym]);
    useEffect(() => {
      if (!autoRun) return;
      setResult(compute(EMPTY_ADJ));
      clearAutoRun();
    }, [autoRun]);
    const months = [ymOf(today), addMonths(ymOf(today), 1), addMonths(ymOf(today), 2)];
    const cityWfh = E.officeCityWfhFor(state, ym);
    const cityWfhUsual = Math.max(0, Number(state.prefs.officeCityWfhDefault) || 0);
    const cityWfhOver = ((state.prefs.officeCityWfh || {})[ym] != null);
    const compute = (a, wfh) => E.proposePlans(ym, state, {
      officeCityWfh: wfh != null ? wfh : cityWfh, startLocation: startLocationFor(state, ym), fixedDays: fixedDaysFor(state, ym, today), today, pinTrips: a.pins, noTravel: a.noTravel });
    const run = () => {
      setAdj(EMPTY_ADJ);
      setHistory([]);
      setRejected(null);
      setResult(compute(EMPTY_ADJ));
      setPick(0);
      setConfirm(false);
    };
    const applyAdj = (a, what) => {
      const r = compute(a);
      setEditing(null);
      if (!r.feasible) { setRejected({ what, issues: r.issues }); return; }
      const label = result && result.feasible ? result.plans[pick].profile : null;
      setHistory([...history, adj]);
      setAdj(a);
      setRejected(null);
      setResult(r);
      const keep = r.plans.findIndex((p) => p.profile === label);
      setPick(keep >= 0 ? keep : 0);
    };
    const without = (list, k) => list.filter((x) => tripKey(x) !== k);
    const moveTrip = (j, date) => {
      const pins = [...without(adj.pins, tripKey(j)), { date, from: j.from, to: j.to }];
      const noTravel = [...new Set([...adj.noTravel.filter((d) => d !== date), j.date])].filter((d) => !pins.some((p) => p.date === d));
      applyAdj({ pins, noTravel }, `Moving ${fDay(j.date)} to ${fDay(date)}`);
    };
    const keepTrip = (j) => applyAdj({ pins: [...without(adj.pins, tripKey(j)), { date: j.date, from: j.from, to: j.to }], noTravel: adj.noTravel.filter((d) => d !== j.date) }, `Keeping ${fDay(j.date)}`);
    const skipTrip = (j) => applyAdj({ pins: adj.pins.filter((p) => p.date !== j.date), noTravel: [...new Set([...adj.noTravel, j.date])] }, `No travel on ${fDay(j.date)}`);
    const undo = () => {
      const prev = history[history.length - 1] || EMPTY_ADJ;
      const r = compute(prev);
      setHistory(history.slice(0, -1));
      setAdj(prev);
      setRejected(null);
      setResult(r);
    };
    const changeCityWfh = (n) => {
      setCityWfh(ym, n);
      if (result) {
        const r = compute(adj, n == null ? cityWfhUsual : n);
        setRejected(null);
        setResult(r);
        setPick(0);
      }
    };
    const changed = adj.pins.length + adj.noTravel.length > 0;
    const req = E.requirements(ym, state);
    const counting = req.counting;
    const chosen = result && result.feasible ? result.plans[pick] : null;
    const diff = chosen ? E.diffPlans(current, chosen) : null;
    const booked = (state.journeys || []).filter((j) => ["booked", "waitlisted"].includes(j.status));
    const isBooked = (j) => booked.some((b) => tripKey(b) === tripKey(j));
    const isMine = (j) => adj.pins.some((p) => tripKey(p) === tripKey(j));
    const selectCard = (i) => (e) => { if (e.type === "click" || e.key === "Enter" || e.key === " ") { e.preventDefault && e.type !== "click" && e.preventDefault(); setPick(i); } };

    return html`<div class="page">
      <div class="page-head"><span class="eyebrow">Smart plan</span><h1>Plan ${fMonth(ym)}</h1><${HelpLink} id=${result && result.feasible ? "adjust" : "plan"} openHelp=${openHelp} label=${result && result.feasible ? "How to change travel dates" : "How planning works"} /></div>
      <${Seg} label="Month" value=${ym} onChange=${(v) => v && setMonth(v)} options=${months.map((m) => [m, fMonthShort(m)])} />

      ${current && !result ? html`<div class="card">
        <div class="row between"><h3>Current plan · ${current.label}</h3>${stale ? html`<span class="pill warn"><span class="glyph">!</span>Out of date</span>` : html`<span class="pill ok"><span class="glyph">✓</span>Up to date</span>`}</div>
        <${Strip} days=${current.days} /><${Metrics} m=${current.metrics} />
        <${TravelDates} journeys=${current.journeys} state=${state} today=${today} />
        <ul class="why">${current.explanation.map((t) => html`<li>${t}</li>`)}${(current.warnings || []).map((t) => html`<li style="color:var(--warn)">${t.replace(/(\d{4}-\d{2}-\d{2})/, (m) => fDay(m))}</li>`)}</ul>
        <span class="tiny muted">Saved ${fDay(current.createdAt.slice(0, 10))}</span>
        <div class="btn-row"><button class=${"btn " + (stale ? "primary" : "")} onClick=${run}>${stale ? "Review an updated plan" : "Change travel dates"}</button>${stale ? null : html`<button class="btn" onClick=${run}>Make a new plan</button>`}</div>
      </div>` : null}

      ${!confirm ? html`<${PlanInputs} ym=${ym} value=${cityWfh} usual=${cityWfhUsual} overridden=${cityWfhOver && cityWfh !== cityWfhUsual} onChange=${changeCityWfh} onReset=${() => changeCityWfh(null)} />` : null}

      ${!current && !result ? html`<div class="card">
        <h3>No plan for ${fMonthShort(ym)} yet</h3>
        <p class="small muted">LifeSync works out where you should be each day so you meet your office rules with as few trips as possible, and lines up time with your daughter in ${CITY.BLR} and family at home. Nothing is booked or saved until you choose.</p>
        <button class="btn primary block" onClick=${run}>Suggest plans</button>
      </div>` : null}

      ${result && !result.feasible ? html`<${Alert} tone="bad" title="No plan can meet all your rules this month">
        <ul class="why">${result.issues.map((i) => html`<li>${i.text}</li>`)}</ul>
        <p class="small">Change one of these, or mark an exception, then try again.</p>
        <div class="btn-row"><button class="btn small" onClick=${() => go("more", "rules")}>Open rules</button><button class="btn small" onClick=${() => go("more", "items")}>Holidays & leave</button></div></${Alert}>` : null}

      ${result && result.feasible && !confirm ? html`
        ${result.plans[0].warnings && result.plans[0].warnings.length ? html`<${Alert} tone="warn" title="Some days have already passed">
          <ul class="why">${result.plans[0].warnings.map((t) => html`<li>${t.replace(/(\d{4}-\d{2}-\d{2})/, (m) => fDay(m))}</li>`)}</ul>
          <p class="small">These plans make the most of the days left. If you went to the office on a day you didn't log, log it and plan again.</p></${Alert}>` : null}
        ${rejected ? html`<${Alert} tone="bad" title=${`${rejected.what} doesn't work`}>
          <ul class="why">${rejected.issues.map((i) => html`<li>${i.text.replace(/(\d{4}-\d{2}-\d{2})/g, (m) => fDay(m))}</li>`)}</ul>
          <p class="small">Your plan hasn't changed. Try another date.</p>
          <div><button class="btn small" onClick=${() => setRejected(null)}>OK</button></div></${Alert}>` : null}
        ${changed ? html`<div class="card changes">
          <div class="row between"><h3>Your changes</h3><div class="row"><button class="link" onClick=${undo} disabled=${!history.length}>Undo</button><button class="link" onClick=${() => applyAdj(EMPTY_ADJ, "Clearing changes")}>Clear all</button></div></div>
          ${adj.pins.map((p) => html`<div class="row between small"><span>Travel ${fDay(p.date)} evening · ${CITY[p.from]} → ${CITY[p.to]}</span><button class="icon-btn mini" aria-label="Remove this change" onClick=${() => applyAdj({ pins: without(adj.pins, tripKey(p)), noTravel: adj.noTravel }, "Removing that change")}>${I.close}</button></div>`)}
          ${adj.noTravel.map((d) => html`<div class="row between small"><span>No travel ${fDay(d)} evening</span><button class="icon-btn mini" aria-label="Remove this change" onClick=${() => applyAdj({ pins: adj.pins, noTravel: adj.noTravel.filter((x) => x !== d) }, "Removing that change")}>${I.close}</button></div>`)}
          <span class="tiny muted">Every option below respects these changes and still meets your office rules.</span>
        </div>` : null}
        <p class="small">${result.askUser ? "Balanced is the recommended mix. Most home time and Fewest trips trade one for the other. Pick one, then tap any trip to change its date." : "One option stands out. Tap any trip to change its date."}</p>
        <div class="plans">${result.plans.map((p, i) => html`<div class="plan-card" role="button" tabindex="0" aria-pressed=${String(pick === i)} onClick=${selectCard(i)} onKeyDown=${selectCard(i)}>
          <div class="row between"><h3>${p.label}${p.profile === "balanced" ? html` <span class="pill info" style="margin-left:6px">Recommended</span>` : null}</h3><span class="small muted">${p.metrics.estCost ? "≈ " + rupees(p.metrics.estCost) : ""}</span></div>
          <${Strip} days=${p.days} /><${Metrics} m=${p.metrics} />
          <${TravelDates} journeys=${p.journeys} state=${state} today=${today} pins=${adj.pins} onEdit=${(j) => { setPick(i); setEditing(j); }} />
          ${pick === i ? html`<ul class="why">${p.explanation.map((t) => html`<li>${t}</li>`)}</ul>` : null}
        </div>`)}</div>
        <div class="legend"><span><i class="sw" style="background:var(--blr)"></i>${CITY.BLR}</span><span><i class="sw" style="background:var(--hyd);opacity:.6"></i>${CITY.HYD}</span><span><i class="sw" style="background:var(--blr);position:relative"></i>with dot = office day</span></div>
        <details class="card"><summary class="small" style="cursor:pointer;font-weight:650">Assumptions used</summary>
          <ul class="why small">
            <li>${req.monthly.policy ? `Monthly minimum ${req.monthly.policy.value}, adjusted to ${req.monthly.required} for this month.` : "No monthly minimum."}</li>
            <li>Holidays ${counting.holidaysReduceRequirement ? "reduce" : "do not reduce"} the requirement. Leave ${counting.leaveReducesRequirement ? "reduces" : "does not reduce"} it.</li>
            <li>Work trips ${counting.businessTravelCountsAsWFO ? "count" : "do not count"} as office days. Partial weeks at month edges are ${counting.partialWeeks === "prorate" ? "prorated" : counting.partialWeeks === "ignore" ? "ignored" : "counted in full"}.</li>
            <li>Journeys are overnight: you leave in the evening and arrive the next morning. At least ${plural(state.prefs.minStayNights, "night")} per ${CITY.BLR} stay preferred.</li>
            <li>${state.prefs.holidaysAtHome !== false ? `Weekday holidays are spent at home in ${CITY.HYD}, unless a ticket or must-attend event says otherwise.` : "Weekday holidays can be spent in either city."}</li>
            <li>Office-closed days ${counting.closedDaysReduceRequirement ? "reduce" : "do not reduce"} the requirement${state.prefs.closedDaysAtHome !== false ? ` and are worked from home in ${CITY.HYD}` : ""}.</li>
            <li>Booked, waitlisted and completed journeys, and trips you fixed, are kept exactly as they are. Past days and logged office days are kept.</li>
          </ul><button class="link" onClick=${() => go("more", "rules")}>Change rules or priorities</button></details>
        <div class="btn-row"><button class="btn primary" onClick=${() => setConfirm(true)}>Use ${chosen.label.toLowerCase()} plan</button><button class="btn" onClick=${() => { setResult(null); setAdj(EMPTY_ADJ); setHistory([]); }}>Cancel</button></div>
      ` : null}

      ${confirm && chosen ? html`<div class="card raised">
        <h3>Confirm ${chosen.label.toLowerCase()} plan for ${fMonthShort(ym)}</h3>
        ${current ? html`<div class="diff-list">
          <strong class="small">What changes</strong>
          ${diff.days.length ? html`<span class="small">${plural(diff.days.length, "day")} change:</span>
            ${diff.days.slice(0, 8).map((d) => html`<div class="row small"><span class="num" style="width:96px">${fDay(d.date)}</span><span>${CITY[d.from.location]} ${d.from.mode === "wfo" ? "office" : ""}</span><span class="muted">→</span><strong>${CITY[d.to.location]} ${d.to.mode === "wfo" ? "office" : ""}</strong></div>`)}
            ${diff.days.length > 8 ? html`<span class="tiny muted">and ${diff.days.length - 8} more</span>` : null}` : html`<span class="small muted">No day changes.</span>`}
        </div>` : null}
        <div class="diff-list">
          <strong class="small">Journeys</strong>
          ${chosen.journeys.length ? chosen.journeys.map((j) => html`<div class="row small wrap"><span class="num" style="width:96px">${fDay(j.date)}</span><${Route} j=${j} />${isBooked(j) ? html`<span class="pill ok"><span class="glyph">✓</span>Already booked</span>` : isMine(j) ? html`<span class="pill info">Your date · kept fixed</span>` : html`<span class="pill neutral">Added as proposed</span>`}</div>`) : html`<span class="small muted">No journeys needed.</span>`}
          ${diff.removedJourneys.filter((j) => !isBooked(j)).length ? html`<span class="small">Proposed journeys no longer needed will be removed: ${diff.removedJourneys.filter((j) => !isBooked(j)).map((j) => fDay(j.date)).join(", ")}</span>` : null}
          ${adj.noTravel.length ? html`<span class="small">No-travel evenings saved to Holidays & leave: ${adj.noTravel.map(fDay).join(", ")}</span>` : null}
        </div>
        <p class="tiny muted">LifeSync never books, cancels or changes tickets. You record bookings yourself in Travel.</p>
        <div class="btn-row"><button class="btn primary" onClick=${() => { acceptPlan(chosen, stale ? "Inputs changed" : changed ? "Adjusted by you" : current ? "Replanned" : "First plan", adj); setResult(null); setConfirm(false); setAdj(EMPTY_ADJ); setHistory([]); }}>Save plan</button><button class="btn" onClick=${() => setConfirm(false)}>Back</button></div>
      </div>` : null}

      ${editing ? html`<${TripSheet} trip=${editing} month=${ym} today=${today} onClose=${() => setEditing(null)}
        onMove=${(d) => moveTrip(editing, d)} onKeep=${() => keepTrip(editing)} onSkip=${() => skipTrip(editing)} />` : null}
    </div>`;
  }

  // ------------------------------------------------------------ screens: Calendar
  function dayBits(state, iso, classified) {
    const c = classified;
    const pd = planDay(state, iso);
    const fam = (state.family || []).filter((f) => f.status !== "unavailable" && iso >= f.start && iso <= f.end);
    const dep = (state.journeys || []).filter((j) => j.date === iso && j.status !== "cancelled");
    const att = state.attendance[iso];
    return { c, pd, fam, dep, att };
  }
  function CalendarScreen({ state, today, month, setMonth, openDay }) {
    const ym = month;
    const [view, setView] = useState("month");
    const [weekOf, setWeekOf] = useState(E.weekStart(today));
    const classified = useMemo(() => E.classifyMonth(ym, state), [ym, state]);
    const first = ym + "-01";
    const lead = (E.weekday(first) + 6) % 7;
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push(null);
    classified.forEach((c) => cells.push(c));
    const weekDays = [];
    for (let i = 0; i < 7; i++) weekDays.push(E.addDays(weekOf, i));
    const clsFor = (iso) => (ymOf(iso) === ym ? classified : E.classifyMonth(ymOf(iso), state)).find((d) => d.date === iso);
    const markOf = (b) => {
      if (b.att === "wfo") return html`<span class="mark done">DONE</span>`;
      if (b.att === "wfh" && b.pd && b.pd.location === "BLR") return html`<span class="mark home">WFH</span>`;
      if (b.c.holiday) return html`<span class="mark hol">HOL</span>`;
      if (b.c.leave) return html`<span class="mark lv">LV</span>`;
      if (b.c.closed) return html`<span class="mark cls">WFH</span>`;
      if (b.pd && b.pd.mode === "wfo") return html`<span class="mark wfo">WFO</span>`;
      return null;
    };
    return html`<div class="page">
      <div class="month-nav">
        <button class="icon-btn" aria-label="Previous" onClick=${() => (view === "month" ? setMonth(addMonths(ym, -1)) : setWeekOf(E.addDays(weekOf, -7)))}>${I.left}</button>
        <h2>${view === "month" ? fMonth(ym) : "Week of " + fDay(weekOf)}</h2>
        <button class="icon-btn" aria-label="Next" onClick=${() => (view === "month" ? setMonth(addMonths(ym, 1)) : setWeekOf(E.addDays(weekOf, 7)))}>${I.right}</button>
      </div>
      <${Seg} label="View" value=${view} onChange=${(v) => v && setView(v)} options=${[["month", "Month"], ["week", "Week"]]} />
      ${view === "month" ? html`
        <div class="cal" role="grid" aria-label=${fMonth(ym)}>
          ${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => html`<div class="dow" aria-hidden="true">${d.slice(0, 2)}</div>`)}
          ${cells.map((c) => {
            if (!c) return html`<div class="cell blank" aria-hidden="true"></div>`;
            const b = dayBits(state, c.date, c);
            const loc = b.pd ? b.pd.location : null;
            const desc = [fLong(c.date), loc ? CITY[loc] : "no plan", b.pd && b.pd.mode === "wfo" ? "office day" : "", b.att ? "logged " + b.att : "", c.holiday ? "holiday" : "", c.leave ? "leave" : "", b.fam.length ? "family available" : "", b.dep.length ? "journey" : ""].filter(Boolean).join(", ");
            return html`<button class=${"cell " + (loc || "") + (c.date === today ? " today" : "")} aria-label=${desc} onClick=${() => openDay(c.date)}>
              <div class="top"><span class="d">${Number(c.date.slice(8))}</span>${b.dep.length ? html`<span class="trip" aria-hidden="true">${"→" + CODE[b.dep[0].to].slice(0, 1)}</span>` : null}</div>
              ${markOf(b)}
              <span class="code" aria-hidden="true">${loc || ""}</span>
              <span class="dots" aria-hidden="true">${b.fam.length ? html`<i class="dot fam"></i>` : null}${c.events.length ? html`<i class="dot"></i>` : null}</span>
            </button>`;
          })}
        </div>
        <div class="legend">
          <span><i class="sw" style="background:var(--blr-soft)"></i>${CODE.BLR} ${CITY.BLR}</span><span><i class="sw" style="background:var(--hyd-soft)"></i>${CODE.HYD} ${CITY.HYD}</span>
          <span><b class="mono tiny">WFO</b> planned office</span><span><b class="mono tiny">DONE</b> logged office</span><span><b class="mono tiny">WFH</b> worked from home</span><span><b class="mono tiny">HOL</b> holiday</span><span><b class="mono tiny">LV</b> leave</span><span><b class="mono tiny">WFH</b> office closed</span>
          <span><b class="mono tiny">→${CODE.BLR.slice(0, 1)}</b> travel to ${CITY.BLR} tonight</span><span><i class="sw" style="background:#b0369a;border-radius:50%;width:9px;height:9px;border:0"></i>family available</span><span><i class="sw" style="background:var(--accent);border-radius:50%;width:9px;height:9px;border:0"></i>event</span>
        </div>` : html`
        <div class="list agenda">${weekDays.map((iso) => {
          const c = clsFor(iso);
          const b = dayBits(state, iso, c);
          return html`<button class="item" onClick=${() => openDay(iso)}>
            <div class="date"><div class="tiny muted">${E.WEEKDAYS[E.weekday(iso)]}</div><div class="n">${Number(iso.slice(8))}</div></div>
            <div class="stack grow">
              <div class="row wrap">${b.pd ? html`<${City} c=${b.pd.location} />` : html`<span class="small muted">No plan</span>`}
                ${b.att === "wfo" ? html`<span class="pill ok"><span class="glyph">✓</span>Office logged</span>` : b.pd && b.pd.mode === "wfo" ? html`<span class="pill neutral">Office planned</span>` : null}
                ${c.holiday ? html`<span class="pill info">Holiday</span>` : null}${c.closed ? html`<span class="pill neutral">Office closed · WFH</span>` : null}${c.leave ? html`<span class="pill warn">Leave</span>` : null}</div>
              ${c.events.map((e) => html`<span class="small">${e.label}${e.location ? " · " + CITY[e.location] : ""}</span>`)}
              ${b.fam.map((f) => html`<span class="small">${f.person} available in ${CITY[f.location || "BLR"]}${f.status === "tentative" ? " (tentative)" : ""}</span>`)}
              ${b.dep.map((j) => html`<span class="small">Journey ${journeyLabel(j)}${j.depTime ? " at " + j.depTime : ""}</span>`)}
            </div></button>`;
        })}</div>`}
    </div>`;
  }

  function DaySheet({ state, iso, today, onClose, setAttendance, addItem, openJourney }) {
    const c = E.classifyMonth(ymOf(iso), state).find((d) => d.date === iso);
    const b = dayBits(state, iso, c);
    const arr = (state.journeys || []).filter((j) => E.addDays(j.date, 1) === iso && j.status !== "cancelled");
    return html`<${Sheet} title=${fLong(iso)} onClose=${onClose}>
      <div class="card">
        <div class="row between"><span class="eyebrow">Plan</span>${b.pd ? html`<${City} c=${b.pd.location} long />` : null}</div>
        <p>${b.pd ? (b.pd.mode === "wfo" ? `Office day in ${CITY.BLR}` : b.pd.mode === "wfh" ? `Working from home in ${CITY[b.pd.location]}` : b.pd.mode === "closed" ? `Office closed · working from home in ${CITY[b.pd.location]}` : b.pd.mode === "holiday" ? "Holiday" : b.pd.mode === "leave" ? "Leave" : `Day off in ${CITY[b.pd.location]}`) : "No plan covers this day."}</p>
        ${c.mustOffice ? html`<span class="small muted">Required office day by your rules.</span>` : null}
        ${c.fixedWfh ? html`<span class="small muted">Fixed work-from-home day by your rules.</span>` : null}
        ${c.blackout ? html`<span class="small muted">No travel: ${c.blackout.label || "blackout date"}.</span>` : null}
      </div>
      ${c.workday || b.att ? html`<div class="card">${iso > today ? html`<h3>What actually happened</h3><p class="small muted">You can log this day once it arrives.</p>` : html`<${LogDay} state=${state} iso=${iso} today=${today} setAttendance=${setAttendance} label="What actually happened" />`}</div>` : null}
      ${[...arr, ...b.dep].length ? html`<div class="list">${[...arr, ...b.dep].map((j) => html`<button class="item" onClick=${() => openJourney(j.id)}><div class="stack grow"><div class="row wrap"><${Route} j=${j} /><${Pill} map=${JSTATUS} k=${E.journeyState(j, today, state.prefs).status} /></div><span class="small">${j.date === iso ? "Departs" : "Arrives"} ${j.date === iso ? j.depTime || "" : j.arrTime || ""}</span></div></button>`)}</div>` : null}
      ${c.holiday || c.closed || c.leave || c.events.length || c.business ? html`<div class="list">
        ${[c.holiday, c.closed, c.leave, c.business, ...c.events].filter(Boolean).map((it) => html`<div class="item" style="cursor:default"><div class="stack grow"><strong class="small">${it.label || it.category}</strong><span class="tiny muted">${CATS[it.category]}${it.location ? " · " + CITY[it.location] : ""}${it.mustAttend ? " · must attend" : ""}</span></div></div>`)}
      </div>` : null}
      ${b.fam.length ? html`<div class="list">${b.fam.map((f) => html`<div class="item" style="cursor:default"><div class="stack grow"><strong class="small">${f.person} available</strong><span class="tiny muted">${CITY[f.location || "BLR"]} · ${f.status} · source: ${f.source || "Manual"}</span></div></div>`)}</div>` : null}
      <div class="btn-row">
        <button class="btn small" onClick=${() => addItem({ category: "holiday", start: iso })}>Add holiday</button>
        <button class="btn small" onClick=${() => addItem({ category: "leave", start: iso })}>Add leave</button>
        <button class="btn small" onClick=${() => addItem({ category: "event", start: iso })}>Add event</button>
      </div>
    </${Sheet}>`;
  }

  // ------------------------------------------------------------ screens: Travel
  function TravelScreen({ state, today, openJourney, newJourney, openHelp }) {
    const [tab, setTab] = useState("upcoming");
    const js = (state.journeys || []).slice().sort((a, b) => a.date.localeCompare(b.date));
    const upcoming = js.filter((j) => j.date >= E.addDays(today, -1) && !["completed", "cancelled"].includes(j.status));
    const past = js.filter((j) => !upcoming.includes(j)).reverse();
    const list = tab === "upcoming" ? upcoming : past;
    return html`<div class="page">
      <div class="page-head head-row"><div class="stack" style="gap:4px"><span class="eyebrow">Travel</span><h1>Journeys</h1></div>
        <button class="btn small primary" onClick=${newJourney}>${I.plus}Add</button></div>
      <${Seg} label="Show" value=${tab} onChange=${(v) => v && setTab(v)} options=${[["upcoming", `Upcoming (${upcoming.length})`], ["past", `Past & cancelled (${past.length})`]]} />
      ${list.length ? html`<div class="list">${list.map((j) => {
        const s = E.journeyState(j, today, state.prefs);
        return html`<button class="item" onClick=${() => openJourney(j.id)}>
          <div class="date" style="width:46px;text-align:center"><div class="tiny muted">${fmt(j.date, { month: "short" })}</div><div class="num" style="font-size:18px;font-weight:700">${Number(j.date.slice(8))}</div></div>
          <div class="stack grow"><div class="row wrap"><${Route} j=${j} /><${Pill} map=${JSTATUS} k=${s.status} />${j.locked && j.status === "proposed" ? html`<span class="pill info">Your date</span>` : null}</div>
            <span class="small">${[j.depTime ? "Departs " + j.depTime : "Evening", arriveLabel(j), j.mode, j.operator].filter(Boolean).join(" · ")}</span>
            ${s.action ? html`<span class="tiny" style="color:var(--warn)">${s.action}</span>` : null}</div></button>`;
      })}</div>` : html`<div class="list"><div class="empty">${tab === "upcoming" ? "No upcoming journeys. Save a plan to get proposed journeys, or add one you've booked." : "Nothing here yet."}</div></div>`}
      <${HelpLink} id="travel" openHelp=${openHelp} label="How bookings and reminders work" />
      <p class="tiny muted">LifeSync doesn't check live seat availability. Record what you booked, and it reminds you about booking dates, waitlists and departures.</p>
    </div>`;
  }

  function JourneySheet({ journey, state, today, onSave, onDelete, onClose }) {
    const [j, setJ] = useState(Object.assign({ from: "HYD", to: "BLR", date: E.addDays(today, 7), depTime: "", arrTime: "", mode: state.prefs.defaultMode || "train", operator: "", ref: "", cost: "", status: "proposed", notes: "" }, journey));
    const set = (k) => (e) => setJ(Object.assign({}, j, { [k]: e && e.target ? e.target.value : e }));
    const s = E.journeyState(j, today, state.prefs);
    const isNew = !journey || !journey.id;
    const moved = journey && journey.id && (journey.date !== j.date || journey.from !== j.from);
    const arrDate = j.arrTime && j.depTime && j.arrTime < j.depTime ? E.addDays(j.date, 1) : j.date;
    return html`<${Sheet} title=${isNew ? "Add journey" : journeyLabel(j)} onClose=${onClose}>
      <div class="grid2">
        <${Field} label="From" id="j-from"><select id="j-from" value=${j.from} onChange=${(e) => setJ(Object.assign({}, j, { from: e.target.value, to: other(e.target.value) }))}><option value="HYD">${CITY.HYD}</option><option value="BLR">${CITY.BLR}</option></select></${Field}>
        <${Field} label="To" id="j-to"><select id="j-to" value=${j.to} onChange=${(e) => setJ(Object.assign({}, j, { to: e.target.value, from: other(e.target.value) }))}><option value="BLR">${CITY.BLR}</option><option value="HYD">${CITY.HYD}</option></select></${Field}>
      </div>
      <div class="grid2">
        <${Field} label="Departure date" id="j-date"><input id="j-date" type="date" value=${j.date} onInput=${set("date")} /></${Field}>
        <${Field} label="Mode" id="j-mode"><select id="j-mode" value=${j.mode} onChange=${set("mode")}><option value="train">Train</option><option value="bus">Bus</option><option value="flight">Flight</option><option value="car">Car</option></select></${Field}>
      </div>
      <div class="grid2">
        <${Field} label="Departs" id="j-dep"><input id="j-dep" type="time" value=${j.depTime} onInput=${set("depTime")} /></${Field}>
        <${Field} label="Arrives" id="j-arr" hint=${arrDate !== j.date ? "Next morning" : ""}><input id="j-arr" type="time" value=${j.arrTime} onInput=${set("arrTime")} /></${Field}>
      </div>
      <${Field} label="Status" id="j-status"><select id="j-status" value=${j.status} onChange=${set("status")}>
        <option value="proposed">Proposed (idea, not booked)</option><option value="booked">Booked and confirmed</option><option value="waitlisted">Waitlisted / not confirmed</option><option value="completed">Travel completed</option><option value="cancelled">Changed / cancelled</option></select></${Field}>
      ${s.action ? html`<${Alert} tone=${s.status === "waitlisted" || s.status === "booking-due" ? "warn" : "info"}><p class="small">${s.action}</p></${Alert}>` : null}
      ${j.status === "proposed" ? html`<label class="check"><input type="checkbox" id="j-lock" checked=${!!j.locked || moved} disabled=${moved} onChange=${(e) => setJ(Object.assign({}, j, { locked: e.target.checked }))} />Keep this date when replanning${moved ? " (you changed the date)" : ""}</label>` : null}
      <div class="grid2">
        <${Field} label="Operator / train" id="j-op"><input id="j-op" type="text" value=${j.operator} onInput=${set("operator")} placeholder="e.g. train name or bus operator" /></${Field}>
        <${Field} label="PNR / booking ref" id="j-ref"><input id="j-ref" type="text" value=${j.ref} onInput=${set("ref")} /></${Field}>
      </div>
      <${Field} label="Cost (₹)" id="j-cost"><input id="j-cost" type="number" inputmode="numeric" value=${j.cost} onInput=${set("cost")} /></${Field}>
      <${Field} label="Notes" id="j-notes"><textarea id="j-notes" value=${j.notes} onInput=${set("notes")}></textarea></${Field}>
      ${!isNew && j.status !== "cancelled" && j.status !== "completed" ? html`<div class="card"><h3>Reminders on your phone</h3>
        <p class="small muted">Add these to Google Calendar so your phone alerts you, even when LifeSync is closed.</p>
        <div class="btn-row">
          ${j.status === "proposed" ? html`<a class="btn small" target="_blank" rel="noopener" href=${gcalLink(`Book ticket: ${journeyLabel(j)}`, `Journey on ${fDay(j.date)}. Book by ${fDay(s.bookBy)}.`, s.bookBy, null, true)}>Booking reminder</a>` : null}
          <a class="btn small" target="_blank" rel="noopener" href=${j.depTime ? gcalLink(`${journeyLabel(j)}${j.ref ? " · PNR " + j.ref : ""}`, [j.operator, j.notes].filter(Boolean).join("\n"), { date: j.date, time: j.depTime }, { date: arrDate, time: j.arrTime || j.depTime }) : gcalLink(journeyLabel(j), "", j.date, null, true)}>Departure in calendar</a>
        </div></div>` : null}
      <div class="btn-row"><button class="btn primary" onClick=${() => onSave(Object.assign({}, j, { id: j.id || uid(), cost: j.cost === "" ? "" : Number(j.cost), locked: j.status === "proposed" ? !!(j.locked || moved || isNew) : j.locked }))}>${isNew ? "Add journey" : "Save changes"}</button></div>
      ${!isNew ? html`<${ConfirmButton} label="Delete journey" onConfirm=${() => onDelete(j.id)} />` : null}
    </${Sheet}>`;
  }

  // ------------------------------------------------------------ More: Compliance
  function ComplianceScreen({ state, today, back }) {
    const [ym, setYm] = useState(ymOf(today));
    const plan = acceptedPlan(state, ym);
    const c = E.compliance(ym, state, plan, today);
    return html`<div class="page">
      <button class="link back" onClick=${back}>${I.left}More</button>
      <div class="page-head"><span class="eyebrow">Compliance</span><h1>Office attendance</h1></div>
      <div class="month-nav"><button class="icon-btn" aria-label="Previous month" onClick=${() => setYm(addMonths(ym, -1))}>${I.left}</button><h2>${fMonth(ym)}</h2><button class="icon-btn" aria-label="Next month" onClick=${() => setYm(addMonths(ym, 1))}>${I.right}</button></div>
      <div class="card"><${MonthMeter} c=${c.monthly} ym=${ym} />
        <div class="kv"><div><span class="v">${c.monthly.required}</span><span class="k">required</span></div><div><span class="v">${c.monthly.planned}</span><span class="k">planned</span></div><div><span class="v">${c.monthly.completed}</span><span class="k">actual office</span></div></div>
        ${(() => { const a = actualSummary(state, ym, today); return html`<div class="actuals small">
          <span class="eyebrow">What actually happened so far</span>
          <div class="row wrap" style="gap:6px 14px"><span><b class="num">${a.wfo}</b> office</span><span><b class="num">${a.wfhOffice}</b> from home in ${CITY.BLR}</span><span><b class="num">${a.wfhHome}</b> from home in ${CITY.HYD}</span>${a.leave ? html`<span><b class="num">${a.leave}</b> leave</span>` : null}${a.business ? html`<span><b class="num">${a.business}</b> work trip</span>` : null}${a.unconfirmed ? html`<span style="color:var(--warn)"><b class="num">${a.unconfirmed}</b> to confirm</span>` : null}</div></div>`; })()}
      </div>
      <div class="card"><h3>By week</h3><div class="scroll-x"><table class="t">
        <thead><tr><th>Week of</th><th class="n">Req.</th><th class="n">Plan</th><th class="n">Done</th><th>Status</th></tr></thead>
        <tbody>${c.weeks.map((w) => html`<tr><td>${fDay(w.start)}${w.partial ? html`<span class="tiny muted"> · part</span>` : null}</td><td class="n">${w.required}</td><td class="n">${w.planned}</td><td class="n">${w.completed}</td><td><${Pill} map=${CSTATUS} k=${w.status} /></td></tr>`)}</tbody>
      </table></div></div>
      <div class="card"><h3>How this is counted</h3><ul class="why small">
        <li>Completed means days you logged as Office. A planned day never counts as completed.</li>
        <li>Holidays ${c.counting.holidaysReduceRequirement ? "reduce" : "don't reduce"} the requirement; office-closed days ${c.counting.closedDaysReduceRequirement ? "reduce" : "don't reduce"} it; leave ${c.counting.leaveReducesRequirement ? "reduces" : "doesn't reduce"} it. Work trips ${c.counting.businessTravelCountsAsWFO ? "count" : "don't count"} as office days.</li>
        <li>Weeks run Monday to Sunday. Partial weeks at the month's edges are ${c.counting.partialWeeks === "prorate" ? "prorated" : c.counting.partialWeeks === "ignore" ? "ignored" : "counted in full"}.</li>
        <li>These are assumptions until you confirm your company's policy in Rules.</li></ul></div>
    </div>`;
  }

  // ------------------------------------------------------------ More: Family
  function FamilyScreen({ state, today, back, edit }) {
    const list = (state.family || []).slice().sort((a, b) => b.start.localeCompare(a.start));
    const upcoming = list.filter((f) => f.end >= today).reverse();
    const past = list.filter((f) => f.end < today);
    const Row = (f) => html`<button class="item" onClick=${() => edit(f)}><div class="stack grow">
      <div class="row wrap"><strong>${f.person}</strong><${City} c=${f.location || "BLR"} /><span class=${"pill " + ({ available: "ok", tentative: "warn", unavailable: "bad", unknown: "neutral" }[f.status] || "neutral")}>${{ available: "Available", tentative: "Tentative", unavailable: "Unavailable", unknown: "Not yet known" }[f.status] || f.status}</span></div>
      <span class="small">${fDay(f.start)}${f.end !== f.start ? " – " + fDay(f.end) : ""}</span>
      <span class="tiny muted">Source: ${f.source || "Manual"} · updated ${f.updatedAt ? fDay(f.updatedAt) : "—"}</span></div></button>`;
    return html`<div class="page">
      <button class="link back" onClick=${back}>${I.left}More</button>
      <div class="page-head head-row"><div class="stack" style="gap:4px"><span class="eyebrow">Family</span><h1>Availability</h1></div><button class="btn small primary" onClick=${() => edit({})}>${I.plus}Add</button></div>
      <p class="small muted">Only dates and a status are stored, never event details. The planner favours being in ${CITY.BLR} when your daughter is free there, and at home in ${CITY.HYD} on weekends unless someone is away.</p>
      ${upcoming.length ? html`<div class="list">${upcoming.map(Row)}</div>` : html`<div class="list"><div class="empty">No upcoming dates. Add when your daughter is free in ${CITY.BLR}.</div></div>`}
      ${past.length ? html`<div class="section"><h3 class="muted">Past</h3><div class="list">${past.map(Row)}</div></div>` : null}
    </div>`;
  }
  function FamilySheet({ item, today, onSave, onDelete, onClose }) {
    const [f, setF] = useState(Object.assign({ person: "Daughter", location: "BLR", start: today, end: today, status: "available", source: "Manual" }, item));
    const set = (k) => (e) => setF(Object.assign({}, f, { [k]: e.target.value }));
    const bad = f.end < f.start;
    return html`<${Sheet} title=${item.id ? "Edit availability" : "Add availability"} onClose=${onClose}>
      <div class="grid2">
        <${Field} label="Who" id="f-person"><input id="f-person" type="text" value=${f.person} onInput=${set("person")} /></${Field}>
        <${Field} label="Where" id="f-loc"><select id="f-loc" value=${f.location} onChange=${set("location")}><option value="BLR">${CITY.BLR}</option><option value="HYD">${CITY.HYD}</option></select></${Field}>
      </div>
      <div class="grid2">
        <${Field} label="From" id="f-start"><input id="f-start" type="date" value=${f.start} onInput=${(e) => setF(Object.assign({}, f, { start: e.target.value, end: f.end < e.target.value ? e.target.value : f.end }))} /></${Field}>
        <${Field} label="To" id="f-end"><input id="f-end" type="date" value=${f.end} onInput=${set("end")} /></${Field}>
      </div>
      ${bad ? html`<${Alert} tone="bad"><p class="small">The end date is before the start date.</p></${Alert}>` : null}
      <${Field} label="Status" id="f-status"><select id="f-status" value=${f.status} onChange=${set("status")}><option value="available">Available</option><option value="tentative">Tentative</option><option value="unavailable">Unavailable / away</option><option value="unknown">Not yet known</option></select></${Field}>
      <${Field} label="Source" id="f-src" hint="Where these dates came from."><select id="f-src" value=${f.source} onChange=${set("source")}><option>Manual</option><option>Shared calendar</option><option>Imported</option></select></${Field}>
      <button class="btn primary" disabled=${bad || !f.person} onClick=${() => onSave(Object.assign({}, f, { id: f.id || uid(), updatedAt: today, example: false }))}>Save</button>
      ${item.id ? html`<${ConfirmButton} label="Delete" onConfirm=${() => onDelete(f.id)} />` : null}
    </${Sheet}>`;
  }

  // ------------------------------------------------------------ More: Rules & preferences
  const PTYPES = {
    monthlyMin: "Monthly minimum office days",
    weeklyMin: "Weekly minimum office days",
    fixedOffice: "Fixed office weekdays",
    fixedWfh: "Fixed work-from-home weekdays",
    requiredDate: "Required on-site date",
  };
  const CATS = { holiday: "Holiday", "office-closed": "Office closed (work from home)", leave: "Leave", event: "Event", "business-travel": "Work trip", blackout: "No-travel date" };
  function policyText(p) {
    if (p.type === "monthlyMin" || p.type === "weeklyMin") return `${p.value} days`;
    if (p.type === "requiredDate") return p.date ? fDay(p.date) : "date not set";
    return (p.weekdays || []).map((d) => E.WEEKDAYS[d]).join(", ") || "no days selected";
  }
  function PlacesCard({ p, setP }) {
    const o = p.officeCity || {};
    const h = p.homeCity || {};
    const setO = (k) => (e) => setP("officeCity", Object.assign({}, o, { [k]: e.target.value }));
    const setH = (k) => (e) => setP("homeCity", Object.assign({}, h, { [k]: e.target.value }));
    return html`<div class="card"><h3>Your places</h3>
      <p class="small muted">Renaming a place keeps all your plans, trips and logged days. They simply show the new name.</p>
      <div class="places">
        <div class="stack"><span class="eyebrow" style="color:var(--blr)">Office city</span>
          <div class="grid2"><${Field} label="Name" id="pl-on"><input id="pl-on" type="text" placeholder="Bengaluru" value=${o.name || ""} onInput=${setO("name")} /></${Field}>
          <${Field} label="Short code" id="pl-oc"><input id="pl-oc" type="text" maxlength="4" placeholder="BLR" value=${o.code || ""} onInput=${setO("code")} /></${Field}></div>
          <${Field} label="Office address (optional)" id="pl-oa"><input id="pl-oa" type="text" value=${o.address || ""} onInput=${setO("address")} /></${Field}></div>
        <div class="stack"><span class="eyebrow" style="color:var(--hyd)">Home city</span>
          <div class="grid2"><${Field} label="Name" id="pl-hn"><input id="pl-hn" type="text" placeholder="Hyderabad" value=${h.name || ""} onInput=${setH("name")} /></${Field}>
          <${Field} label="Short code" id="pl-hc"><input id="pl-hc" type="text" maxlength="4" placeholder="HYD" value=${h.code || ""} onInput=${setH("code")} /></${Field}></div>
          <${Field} label="Home address (optional)" id="pl-ha"><input id="pl-ha" type="text" value=${h.address || ""} onInput=${setH("address")} /></${Field}></div>
      </div></div>`;
  }

  function RulesScreen({ state, update, back, editPolicy, toast, openHelp }) {
    const p = state.prefs;
    const c = Object.assign({}, E.DEFAULT_COUNTING, state.counting);
    const w = Object.assign({}, E.DEFAULT_WEIGHTS, p.weights || {});
    const setP = (k, v) => update("prefs", Object.assign({}, p, { [k]: v }));
    const setC = (k, v) => update("counting", Object.assign({}, state.counting, { [k]: v }));
    const setW = (k, v) => setP("weights", Object.assign({}, p.weights, { [k]: v }));
    const SLIDERS = [
      ["trips", "Avoid trips", 2, 40],
      ["daughter", `Time with daughter in ${CITY.BLR}"`, 0, 20],
      ["homeWeekend", `Weekends at home in ${CITY.HYD}"`, 0, 20],
      ["homeWeekday", "Weekdays at home", 0, 10],
      ["shortStay", `Avoid very short ${CITY.BLR} stays"`, 0, 20],
    ];
    return html`<div class="page">
      <button class="link back" onClick=${back}>${I.left}More</button>
      <div class="page-head"><span class="eyebrow">Rules & preferences</span><h1>Your rules</h1><${HelpLink} id="rules" openHelp=${openHelp} label="How rules and counting work" /></div>

      <${PlacesCard} p=${p} setP=${setP} />

      <div class="section"><div class="section-head"><h2>Office rules</h2><button class="btn small" onClick=${() => editPolicy({})}>${I.plus}Add rule</button></div>
        ${(state.policies || []).length ? html`<div class="list">${state.policies.map((r) => html`<button class="item" onClick=${() => editPolicy(r)}><div class="stack grow">
          <div class="row wrap"><strong class="small">${PTYPES[r.type]}</strong>${r.active === false ? html`<span class="pill neutral">Off</span>` : null}${r.example ? html`<span class="pill info">Example</span>` : null}</div>
          <span class="small">${policyText(r)}</span>
          <span class="tiny muted">${r.effectiveFrom || r.effectiveTo ? `${r.effectiveFrom ? "From " + fDay(r.effectiveFrom) : ""}${r.effectiveTo ? " until " + fDay(r.effectiveTo) : ""} · ` : ""}Source: ${r.source || "Entered by you"}</span></div></button>`)}</div>`
          : html`<div class="list"><div class="empty">No office rules yet. Add your monthly or weekly minimum.</div></div>`}
      </div>

      <div class="card"><h3>Work from home in ${CITY.BLR}</h3>
        <p class="small muted">Your usual number of days a month to stay in ${CITY.BLR} without going to the office. Every month's plan starts from this; change a single month on the Plan screen.</p>
        <${Field} label="Usual days per month" id="r-cwfh"><input id="r-cwfh" type="number" inputmode="numeric" min="0" max="20" value=${p.officeCityWfhDefault || 0} onInput=${(e) => setP("officeCityWfhDefault", Math.max(0, Math.min(20, Number(e.target.value) || 0)))} /></${Field}>
      </div>

      <div class="card"><h3>How days are counted</h3>
        <p class="small muted">Confirm these against your company's policy. They change how many office days you need.</p>
        <label class="check"><input type="checkbox" id="c-hol" checked=${c.holidaysReduceRequirement} onChange=${(e) => setC("holidaysReduceRequirement", e.target.checked)} />Public holidays reduce the number of office days I need</label>
        <label class="check"><input type="checkbox" id="c-closed" checked=${c.closedDaysReduceRequirement} onChange=${(e) => setC("closedDaysReduceRequirement", e.target.checked)} />Office-closed days (e.g. wellness days) reduce the number of office days I need</label>
        <label class="check"><input type="checkbox" id="c-leave" checked=${c.leaveReducesRequirement} onChange=${(e) => setC("leaveReducesRequirement", e.target.checked)} />Leave reduces the number of office days I need</label>
        <label class="check"><input type="checkbox" id="c-biz" checked=${c.businessTravelCountsAsWFO} onChange=${(e) => setC("businessTravelCountsAsWFO", e.target.checked)} />Work trips count as office days</label>
        <${Field} label="Weeks split across two months" id="c-partial"><select id="c-partial" value=${c.partialWeeks} onChange=${(e) => setC("partialWeeks", e.target.value)}><option value="prorate">Prorate the weekly minimum</option><option value="full">Apply the full weekly minimum</option><option value="ignore">Don't apply a weekly minimum</option></select></${Field}>
      </div>

      <div class="card"><h3>Travel</h3>
        <div class="grid2">
          <${Field} label="Start of month location" id="p-start" hint="Used when there's no plan for the previous month."><select id="p-start" value=${p.startLocation} onChange=${(e) => setP("startLocation", e.target.value)}><option value="HYD">${CITY.HYD}</option><option value="BLR">${CITY.BLR}</option></select></${Field}>
          <${Field} label="Usual mode" id="p-mode"><select id="p-mode" value=${p.defaultMode} onChange=${(e) => setP("defaultMode", e.target.value)}><option value="train">Train</option><option value="bus">Bus</option><option value="flight">Flight</option><option value="car">Car</option></select></${Field}>
        </div>
        <label class="check"><input type="checkbox" id="p-closedhome" checked=${p.closedDaysAtHome !== false} onChange=${(e) => setP("closedDaysAtHome", e.target.checked)} />Work from home in ${CITY.HYD} when the office is closed</label>
        <label class="check"><input type="checkbox" id="p-holhome" checked=${p.holidaysAtHome !== false} onChange=${(e) => setP("holidaysAtHome", e.target.checked)} />Spend weekday holidays at home in ${CITY.HYD}</label>
        <div class="field"><span class="label">Preferred departure days</span><${DaysPick} name="p-days" value=${p.preferredTravelDays} onChange=${(v) => setP("preferredTravelDays", v)} /><span class="hint">Overnight journeys leave on the evening of these days.</span></div>
        <div class="grid2">
          <${Field} label="Shortest ${CITY.BLR} stay (nights)" id="p-stay"><input id="p-stay" type="number" min="0" max="7" value=${p.minStayNights} onInput=${(e) => setP("minStayNights", Math.max(0, Math.min(7, Number(e.target.value) || 0)))} /></${Field}>
          <${Field} label="Typical one-way cost (₹)" id="p-cost"><input id="p-cost" type="number" value=${p.tripCost} onInput=${(e) => setP("tripCost", Number(e.target.value) || 0)} /></${Field}>
          <${Field} label="Book this many days ahead" id="p-lead"><input id="p-lead" type="number" value=${p.bookingLeadDays} onInput=${(e) => setP("bookingLeadDays", Number(e.target.value) || 0)} /></${Field}>
          <${Field} label="Booking opens (days before)" id="p-open" hint="Check your operator's current window."><input id="p-open" type="number" value=${p.bookingOpensDays} onInput=${(e) => setP("bookingOpensDays", Number(e.target.value) || 0)} /></${Field}>
        </div>
        <${Field} label="Preferred departure window" id="p-win"><input id="p-win" type="text" value=${p.departWindow} onInput=${(e) => setP("departWindow", e.target.value)} /></${Field}>
      </div>

      <div class="card"><h3>Planning priorities</h3>
        <p class="small muted">Office rules always come first. These decide the trade-offs between plans.</p>
        ${SLIDERS.map(([k, label, min, max]) => html`<div class="field"><div class="row between"><label for=${"w-" + k}>${label}</label><span class="num small">${w[k]}</span></div>
          <input id=${"w-" + k} type="range" min=${min} max=${max} step="1" value=${w[k]} onInput=${(e) => setW(k, Number(e.target.value))} /></div>`)}
        <button class="link" onClick=${() => { setP("weights", {}); toast("Priorities reset"); }}>Reset priorities</button>
      </div>

      <div class="card"><h3>About you</h3>
        <${Field} label="Your name (for greetings and reports)" id="p-name"><input id="p-name" type="text" value=${p.name} onInput=${(e) => setP("name", e.target.value)} /></${Field}>
      </div>
    </div>`;
  }
  function PolicySheet({ item, onSave, onDelete, onClose }) {
    const [p, setP] = useState(Object.assign({ type: "monthlyMin", value: 12, weekdays: [], date: "", effectiveFrom: "", effectiveTo: "", source: "Entered by you", active: true }, item));
    const set = (k) => (e) => setP(Object.assign({}, p, { [k]: e.target.value }));
    const numeric = p.type === "monthlyMin" || p.type === "weeklyMin";
    const days = p.type === "fixedOffice" || p.type === "fixedWfh";
    const valid = numeric ? Number(p.value) > 0 : days ? (p.weekdays || []).length > 0 : !!p.date;
    return html`<${Sheet} title=${item.id ? "Edit rule" : "Add rule"} onClose=${onClose}>
      <${Field} label="Rule" id="r-type"><select id="r-type" value=${p.type} onChange=${set("type")}>${Object.entries(PTYPES).map(([k, v]) => html`<option value=${k}>${v}</option>`)}</select></${Field}>
      ${numeric ? html`<${Field} label="Days" id="r-val"><input id="r-val" type="number" min="1" max=${p.type === "weeklyMin" ? 5 : 23} value=${p.value} onInput=${set("value")} /></${Field}>` : null}
      ${days ? html`<div class="field"><span class="label">Weekdays</span><${DaysPick} name="r-days" value=${p.weekdays} onChange=${(v) => setP(Object.assign({}, p, { weekdays: v }))} /></div>` : null}
      ${p.type === "requiredDate" ? html`<${Field} label="Date" id="r-date"><input id="r-date" type="date" value=${p.date} onInput=${set("date")} /></${Field}>` : null}
      <div class="grid2">
        <${Field} label="Effective from" id="r-from" hint="Optional"><input id="r-from" type="date" value=${p.effectiveFrom} onInput=${set("effectiveFrom")} /></${Field}>
        <${Field} label="Until" id="r-to" hint="Optional"><input id="r-to" type="date" value=${p.effectiveTo} onInput=${set("effectiveTo")} /></${Field}>
      </div>
      <${Field} label="Source" id="r-src"><select id="r-src" value=${p.source} onChange=${set("source")}><option>Entered by you</option><option>Confirmed company policy</option><option>Imported calendar</option><option>Example</option></select></${Field}>
      <label class="check"><input type="checkbox" id="r-active" checked=${p.active !== false} onChange=${(e) => setP(Object.assign({}, p, { active: e.target.checked }))} />Rule is active</label>
      <button class="btn primary" disabled=${!valid} onClick=${() => onSave(Object.assign({}, p, { id: p.id || uid(), value: numeric ? Number(p.value) : undefined, example: p.source === "Example" }))}>Save rule</button>
      ${item.id ? html`<${ConfirmButton} label="Delete rule" onConfirm=${() => onDelete(p.id)} />` : null}
    </${Sheet}>`;
  }

  // ------------------------------------------------------------ More: holidays, leave, events
  function ItemsScreen({ state, today, back, edit, openHelp }) {
    const [cat, setCat] = useState("all");
    const list = (state.calendar || []).filter((i) => cat === "all" || i.category === cat).slice().sort((a, b) => a.start.localeCompare(b.start));
    const up = list.filter((i) => (i.end || i.start) >= today);
    const past = list.filter((i) => (i.end || i.start) < today).reverse();
    const Row = (i) => html`<button class="item" onClick=${() => edit(i)}><div class="stack grow">
      <div class="row wrap"><strong class="small">${i.label || CATS[i.category]}</strong><span class="pill neutral">${CATS[i.category]}</span>${i.example ? html`<span class="pill info">Example</span>` : null}</div>
      <span class="small">${fDay(i.start)}${i.end && i.end !== i.start ? " – " + fDay(i.end) : ""}${i.location ? " · " + CITY[i.location] : ""}${i.mustAttend ? " · must attend" : ""}</span></div></button>`;
    return html`<div class="page">
      <button class="link back" onClick=${back}>${I.left}More</button>
      <div class="page-head head-row"><div class="stack" style="gap:4px"><span class="eyebrow">Calendar items</span><h1>Holidays, leave & events</h1></div><button class="btn small primary" onClick=${() => edit({ category: cat === "all" ? "holiday" : cat })}>${I.plus}Add</button></div>
      <${HelpLink} id="days" openHelp=${openHelp} label="Which type should I use?" />
      <select aria-label="Filter" value=${cat} onChange=${(e) => setCat(e.target.value)}><option value="all">All items</option>${Object.entries(CATS).map(([k, v]) => html`<option value=${k}>${v}</option>`)}</select>
      ${up.length ? html`<div class="list">${up.map(Row)}</div>` : html`<div class="list"><div class="empty">Nothing upcoming. Add your company's holiday list, planned leave and family events.</div></div>`}
      ${past.length ? html`<div class="section"><h3 class="muted">Past</h3><div class="list">${past.map(Row)}</div></div>` : null}
    </div>`;
  }
  function ItemSheet({ item, onSave, onDelete, onClose }) {
    const [i, setI] = useState(Object.assign({ category: "holiday", label: "", start: "", end: "", location: "", mustAttend: false }, item));
    const set = (k) => (e) => setI(Object.assign({}, i, { [k]: e.target.value }));
    const bad = i.end && i.end < i.start;
    return html`<${Sheet} title=${item.id ? "Edit item" : "Add " + CATS[i.category].toLowerCase()} onClose=${onClose}>
      <${Field} label="Type" id="i-cat"><select id="i-cat" value=${i.category} onChange=${set("category")}>${Object.entries(CATS).map(([k, v]) => html`<option value=${k}>${v}</option>`)}</select></${Field}>
      <${Field} label="Label" id="i-label"><input id="i-label" type="text" value=${i.label} onInput=${set("label")} placeholder=${{ holiday: "e.g. Deepavali", "office-closed": "e.g. Wellness day", leave: "e.g. Annual leave", event: "e.g. Cousin's wedding", "business-travel": "e.g. Client visit, Pune", blackout: "e.g. Exam week" }[i.category]} /></${Field}>
      <div class="grid2">
        <${Field} label="From" id="i-start"><input id="i-start" type="date" value=${i.start} onInput=${set("start")} /></${Field}>
        <${Field} label="To" id="i-end" hint="Leave blank for one day"><input id="i-end" type="date" value=${i.end || ""} onInput=${set("end")} /></${Field}>
      </div>
      ${bad ? html`<${Alert} tone="bad"><p class="small">The end date is before the start date.</p></${Alert}>` : null}
      ${i.category === "event" ? html`
        <${Field} label="Where" id="i-loc"><select id="i-loc" value=${i.location} onChange=${set("location")}><option value="">Anywhere / not location-bound</option><option value="BLR">${CITY.BLR}</option><option value="HYD">${CITY.HYD}</option></select></${Field}>
        <label class="check"><input type="checkbox" id="i-must" checked=${!!i.mustAttend} onChange=${(e) => setI(Object.assign({}, i, { mustAttend: e.target.checked }))} />I must be there (the planner will never schedule around it)</label>` : null}
      <button class="btn primary" disabled=${!i.start || bad} onClick=${() => onSave(Object.assign({}, i, { id: i.id || uid(), end: i.end || "", example: false }))}>Save</button>
      ${item.id ? html`<${ConfirmButton} label="Delete" onConfirm=${() => onDelete(i.id)} />` : null}
    </${Sheet}>`;
  }

  // ------------------------------------------------------------ More: Reports
  function ReportsScreen({ state, today, back, toast }) {
    const [ym, setYm] = useState(ymOf(today));
    const [busy, setBusy] = useState(false);
    const r = buildReport(state, ym, today);
    const pdfReady = !!(window.jspdf && window.jspdf.jsPDF);
    const create = async () => {
      setBusy(true);
      try {
        const blob = makePDF(state, ym, today);
        await deliverFile(`LifeSync-${ym}.pdf`, blob, toast);
      } catch (e) {
        toast("Couldn't create the PDF: " + (e.message || e));
      }
      setBusy(false);
    };
    return html`<div class="page">
      <button class="link back" onClick=${back}>${I.left}More</button>
      <div class="page-head"><span class="eyebrow">Reports</span><h1>Monthly report</h1></div>
      <div class="month-nav"><button class="icon-btn" aria-label="Previous month" onClick=${() => setYm(addMonths(ym, -1))}>${I.left}</button><h2>${fMonth(ym)}</h2><button class="icon-btn" aria-label="Next month" onClick=${() => setYm(addMonths(ym, 1))}>${I.right}</button></div>
      <div class="card"><span class="eyebrow">Preview</span>
        <h3>Office attendance</h3><${MonthMeter} c=${r.comp.monthly} ym=${ym} />
        <div class="divider"></div>
        <h3>Travel · ${plural(r.journeys.length, "journey")}</h3>
        ${r.journeys.length ? html`<div class="stack">${r.journeys.map((j) => html`<div class="row wrap small"><span class="num" style="width:96px">${fDay(j.date)}</span><${Route} j=${j} /><${Pill} map=${JSTATUS} k=${E.journeyState(j, today, state.prefs).status} /></div>`)}</div>` : html`<p class="small muted">No journeys.</p>`}
        <div class="divider"></div>
        <h3>Plan</h3>
        <p class="small">${r.plan ? `${r.plan.label} plan · ${plural(r.versions.length, "version")} this month` : "No plan saved."}</p>
        <div class="divider"></div>
        <h3>Outstanding</h3>
        <p class="small">${r.actions.length || r.unlogged.length ? `${plural(r.actions.length, "travel action")}${r.unlogged.length ? `, ${plural(r.unlogged.length, "unlogged office day")}` : ""}` : "Nothing outstanding."}</p>
      </div>
      <button class="btn primary block" disabled=${busy || !pdfReady} onClick=${create}>${busy ? "Creating…" : pdfReady ? "Create PDF" : "PDF tool is still loading…"}</button>
      <p class="tiny muted">On your phone you can share the PDF straight to WhatsApp or email after saving it.</p>
    </div>`;
  }

  // ------------------------------------------------------------ More: Data
  function DataScreen({ state, replaceState, back, toast, storeLabel }) {
    const [pending, setPending] = useState(null);
    const fileRef = useRef(null);
    const exportJSON = () => {
      const blob = new Blob([JSON.stringify({ app: "LifeSync", version: 1, exportedAt: new Date().toISOString(), state }, null, 2)], { type: "application/json" });
      deliverFile(`LifeSync-backup-${todayISO()}.json`, blob, toast);
    };
    const onFile = (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        try {
          const j = JSON.parse(rd.result);
          if (!j || j.app !== "LifeSync" || !j.state) throw new Error("This isn't a LifeSync backup file.");
          setPending(j);
        } catch (err) {
          toast(err.message || "Couldn't read that file.");
        }
      };
      rd.readAsText(f);
      e.target.value = "";
    };
    const clearExamples = () => {
      const s = JSON.parse(JSON.stringify(state));
      const ex = new Set((s.meta && s.meta.exampleAttendance) || []);
      s.policies = s.policies.filter((x) => !x.example);
      s.calendar = s.calendar.filter((x) => !x.example);
      s.family = s.family.filter((x) => !x.example);
      s.journeys = s.journeys.filter((x) => !x.example);
      s.plans = s.plans.filter((x) => !x.example);
      for (const d of ex) delete s.attendance[d];
      s.meta = Object.assign({}, s.meta, { example: false, exampleAttendance: [] });
      replaceState(s);
      toast("Example data removed");
    };
    return html`<div class="page">
      <button class="link back" onClick=${back}>${I.left}More</button>
      <div class="page-head"><span class="eyebrow">Backup & data</span><h1>Your data</h1></div>
      <div class="card"><h3>Where it's stored</h3><p class="small">${storeLabel}. Nothing is shared with anyone else.</p></div>
      ${state.meta.example ? html`<div class="card"><h3>Example data</h3><p class="small muted">Removes the sample rules, holiday, family dates, booking and logged days. Anything you added yourself stays.</p><${ConfirmButton} label="Remove example data" cls="primary" onConfirm=${clearExamples} /></div>` : null}
      <div class="card"><h3>Backup</h3><p class="small muted">Save a copy of everything as a file. Keep it somewhere safe, or use it to move LifeSync to another phone.</p>
        <div class="btn-row"><button class="btn" onClick=${exportJSON}>Save backup</button><button class="btn" onClick=${() => fileRef.current && fileRef.current.click()}>Restore from backup</button></div>
        <input ref=${fileRef} id="restore-file" type="file" accept="application/json,.json" hidden onChange=${onFile} />
        ${pending ? html`<${Alert} tone="warn" title="Replace everything with this backup?"><p class="small">Backup from ${pending.exportedAt ? fDay(pending.exportedAt.slice(0, 10)) : "an unknown date"}. Your current data will be replaced.</p>
          <div class="btn-row"><button class="btn small danger" onClick=${() => { replaceState(Object.assign(EMPTY(), pending.state)); setPending(null); toast("Backup restored"); }}>Replace my data</button><button class="btn small" onClick=${() => setPending(null)}>Cancel</button></div></${Alert}>` : null}
      </div>
      <div class="card"><h3>Start over</h3><p class="small muted">Deletes all rules, plans, journeys and logs.</p><${ConfirmButton} label="Delete everything" onConfirm=${() => { replaceState(EMPTY()); toast("All data deleted"); }} /></div>
    </div>`;
  }

  // ------------------------------------------------------------ App lock
  const RELOCK = [[0, "Immediately"], [60, "After 1 minute"], [300, "After 5 minutes"], [900, "After 15 minutes"]];

  function LockScreen({ cfg, onUnlocked, onRecovered }) {
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");
    const [recover, setRecover] = useState(false);
    const [code, setCode] = useState("");
    const tried = useRef(false);
    const go = async () => {
      if (busy) return;
      setBusy(true);
      setErr("");
      try {
        await LSLock.unlock(cfg);
        onUnlocked();
      } catch (e) {
        setErr(e.message);
      }
      setBusy(false);
    };
    useEffect(() => {
      if (tried.current) return;
      tried.current = true;
      setTimeout(go, 250); // ask straight away; the button is there if the phone wants a tap
    }, []);
    const useCode = async () => {
      if (await LSLock.checkRecovery(cfg, code)) onRecovered();
      else setErr("That recovery code doesn't match. Check it and try again.");
    };
    return html`<div class="lock-screen" role="dialog" aria-modal="true" aria-label="LifeSync is locked">
      <div class="lock-inner">
        <div class="brand" style="font-size:22px"><${BrandMark} />LifeSync</div>
        <div class="lock-icon" aria-hidden="true">${I.lock}</div>
        <h1 style="font-size:22px">LifeSync is locked</h1>
        <p class="small muted">Unlock with your phone's fingerprint, face, PIN or pattern.</p>
        <button class="btn primary block lock-btn" onClick=${go} disabled=${busy}>${I.finger}${busy ? "Waiting for your phone…" : "Unlock"}</button>
        ${err ? html`<p class="small" style="color:var(--bad)" role="alert">${err}</p>` : null}
        ${!recover
          ? html`<button class="link" onClick=${() => { setRecover(true); setErr(""); }}>Can't unlock?</button>`
          : html`<div class="card" style="width:100%;text-align:left">
              <h3>Use your recovery code</h3>
              <p class="small muted">You saw this code when you turned on App lock. Entering it opens LifeSync and turns the lock off. You can turn it on again in More → App lock.</p>
              <${Field} label="Recovery code" id="rc-code"><input id="rc-code" type="text" autocomplete="off" autocapitalize="characters" placeholder="XXXX-XXXX-XXXX-XXXX" value=${code} onInput=${(e) => setCode(e.target.value)} /></${Field}>
              <button class="btn" disabled=${code.replace(/[^A-Za-z0-9]/g, "").length < 16} onClick=${useCode}>Open with recovery code</button>
            </div>`}
        <div style="margin-top:28px"><${Signature} compact /></div>
      </div>
    </div>`;
  }

  function AppLockScreen({ back, lockCfg, setLockCfg, toast, userName }) {
    const [reason, setReason] = useState(null);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");
    const [shown, setShown] = useState(null); // recovery code to show once
    const [saved, setSaved] = useState(false);
    const [delay, setDelay] = useState(lockCfg ? lockCfg.relockAfter : 60);
    useEffect(() => { LSLock.unsupportedReason().then(setReason); }, []);
    const turnOn = async () => {
      setBusy(true); setErr("");
      try {
        const r = await LSLock.enable({ relockAfter: delay, displayName: userName ? `${userName} · LifeSync` : "LifeSync app lock" });
        setShown(r.recovery);
        setLockCfg(r.cfg);
      } catch (e) {
        setErr(e && e.name === "NotAllowedError" ? "Cancelled. Nothing was changed." : (e && e.message) || "Couldn't turn on App lock.");
      }
      setBusy(false);
    };
    const turnOff = async () => {
      setBusy(true); setErr("");
      try {
        await LSLock.unlock(lockCfg);
        LSLock.disable();
        setLockCfg(null);
        toast("App lock turned off");
      } catch (e) { setErr(e.message); }
      setBusy(false);
    };
    const test = async () => {
      setBusy(true); setErr("");
      try { await LSLock.unlock(lockCfg); toast("Unlock works"); } catch (e) { setErr(e.message); }
      setBusy(false);
    };
    const changeDelay = (v) => {
      setDelay(v);
      if (lockCfg) { const c = Object.assign({}, lockCfg, { relockAfter: v }); LSLock.write(c); setLockCfg(c); }
    };
    const copy = (text) => {
      try { navigator.clipboard.writeText(text).then(() => toast("Recovery code copied"), () => toast("Select the code and copy it")); }
      catch (e) { toast("Select the code and copy it"); }
    };
    return html`<div class="page">
      <button class="link back" onClick=${back}>${I.left}More</button>
      <div class="page-head"><span class="eyebrow">Security</span><h1>App lock</h1></div>
      <p class="small muted">Ask for your phone's fingerprint, face, PIN or pattern every time LifeSync opens. Your phone does the check; LifeSync never sees your fingerprint or PIN.</p>

      ${shown ? html`<div class="card raised">
        <h3>Save your recovery code</h3>
        <p class="small">If your phone's lock ever stops working with LifeSync (for example after resetting your fingerprints), this code opens the app. It's shown only once.</p>
        <div class="recovery mono" aria-label="Recovery code">${shown}</div>
        <div class="btn-row"><button class="btn" onClick=${() => copy(shown)}>Copy code</button></div>
        <p class="tiny muted">Keep it somewhere safe outside LifeSync, such as your password manager or a note on your laptop.</p>
        <label class="check"><input type="checkbox" id="rc-saved" checked=${saved} onChange=${(e) => setSaved(e.target.checked)} />I've saved my recovery code</label>
        <button class="btn primary" disabled=${!saved} onClick=${() => { setShown(null); toast("App lock is on"); }}>Done</button>
      </div>` : null}

      ${!shown ? html`<div class="card">
        <div class="row between"><h3>Status</h3>${lockCfg ? html`<span class="pill ok"><span class="glyph">✓</span>On</span>` : html`<span class="pill neutral">Off</span>`}</div>
        ${reason === null ? html`<p class="small muted">Checking your phone…</p>` : reason && !lockCfg ? html`<${Alert} tone="info"><p class="small">${reason}</p></${Alert}>` : null}
        <${Field} label="Lock again when I leave the app" id="lk-delay"><select id="lk-delay" value=${String(delay)} onChange=${(e) => changeDelay(Number(e.target.value))}>${RELOCK.map(([v, t]) => html`<option value=${String(v)}>${t}</option>`)}</select></${Field}>
        ${lockCfg ? html`<p class="small">LifeSync now asks for your fingerprint when it opens, and ${delay === 0 ? "as soon as you leave it" : `when you come back after ${RELOCK.find((x) => x[0] === delay)[1].replace("After ", "")} away`}. Tap the ${I.lock} at the top of any screen to lock it now.</p>` : null}
        ${lockCfg
          ? html`<div class="btn-row"><button class="btn" disabled=${busy} onClick=${test}>Test unlock</button><button class="btn danger" disabled=${busy} onClick=${turnOff}>Turn off App lock</button></div>
             <p class="tiny muted">Turning it off asks you to unlock first.</p>`
          : html`<button class="btn primary" disabled=${busy || !!reason} onClick=${turnOn}>${I.lock}${busy ? "Waiting for your phone…" : "Turn on App lock"}</button>`}
        ${err ? html`<p class="small" style="color:var(--bad)" role="alert">${err}</p>` : null}
      </div>` : null}

      <div class="card"><h3>Good to know</h3><ul class="why small">
        <li>The lock is set per phone and isn't included in backups. Restoring a backup on a new phone opens without a lock until you turn it on there.</li>
        <li>It locks the screen in front of your data. It doesn't encrypt what's stored on the phone, so keep your phone's own lock on as well.</li>
        <li>Your phone may save a passkey called “LifeSync” in its password manager. Leave it there; deleting it means you'll need your recovery code.</li>
      </ul></div>
    </div>`;
  }

  // ------------------------------------------------------------ Sharing and invite-only access
  function ShareScreen({ back, toast }) {
    const url = location.origin + location.pathname.replace(/index\.html$/, "");
    const inClaude = window.self !== window.top;
    const invite = window.LSAccess && LSAccess.enabled();
    const msg = `I'm using LifeSync to plan office days, travel and family time. Open ${url} on your phone${invite ? " and enter the access code I'll send you separately" : ""}. Then in Chrome tap ⋮ → Install app (iPhone: Safari → Share → Add to Home Screen). Your data stays on your own phone.`;
    const copy = (t, what) => {
      try { navigator.clipboard.writeText(t).then(() => toast(what + " copied"), () => toast("Select the text and copy it")); } catch (e) { toast("Select the text and copy it"); }
    };
    return html`<div class="page">
      <button class="link back" onClick=${back}>${I.left}More</button>
      <div class="page-head"><span class="eyebrow">Share</span><h1>Share LifeSync</h1></div>
      ${inClaude ? html`<${Alert} tone="info"><p class="small">You're using the copy inside Claude. Share the installed app's address instead: <b>https://yekkala2008.github.io/lifesync/</b></p></${Alert}>` : null}
      <div class="card"><h3>1. Send the link</h3>
        <div class="recovery mono" style="font-size:14px">${inClaude ? "https://yekkala2008.github.io/lifesync/" : url}</div>
        <div class="btn-row"><button class="btn" onClick=${() => copy(inClaude ? "https://yekkala2008.github.io/lifesync/" : url, "Link")}>Copy link</button><button class="btn" onClick=${() => copy(msg, "Message")}>Copy invite message</button></div>
      </div>
      <div class="card"><h3>2. Access code</h3>
        ${invite
          ? html`<p class="small"><span class="pill ok"><span class="glyph">✓</span>Invite-only is on</span></p><p class="small">New people must enter an access code before they can use or install LifeSync. Send the code separately from the link, for example in a different chat.</p>`
          : html`<p class="small"><span class="pill warn"><span class="glyph">!</span>Invite-only is off</span></p><p class="small">Anyone with the link can use LifeSync. To require an access code, the owner adds a secret on GitHub (see <b>Help → Sharing LifeSync</b>).</p>`}
      </div>
      <div class="card"><h3>Good to know</h3><ul class="why small">
        <li>Everyone gets their own empty LifeSync. Your plans, trips and logs stay on your phone and are never shared.</li>
        <li>They set their own office and home cities, rules and family dates.</li>
        <li>The access code keeps casual visitors out, but it's not bank-grade security. Don't rely on it to protect secrets.</li>
      </ul></div>
    </div>`;
  }

  function AccessGate({ onIn }) {
    const [code, setCode] = useState("");
    const [err, setErr] = useState("");
    const [busy, setBusy] = useState(false);
    const submit = async (e) => {
      e && e.preventDefault();
      setBusy(true); setErr("");
      if (await LSAccess.tryCode(code)) onIn();
      else setErr("That code isn't valid. Check it with the person who invited you.");
      setBusy(false);
    };
    return html`<div class="lock-screen" role="dialog" aria-modal="true" aria-label="Enter access code">
      <form class="lock-inner" onSubmit=${submit}>
        <div class="brand" style="font-size:22px"><${BrandMark} />LifeSync</div>
        <div class="lock-icon" aria-hidden="true">${I.lock}</div>
        <h1 style="font-size:22px">Invite only</h1>
        <p class="small muted">Plan office days, travel and family time between two cities. Enter the access code you were given to start.</p>
        <input id="ac-code" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Access code" value=${code} onInput=${(e) => setCode(e.target.value)} aria-label="Access code" style="text-align:center;font-size:17px" />
        <button class="btn primary block lock-btn" type="submit" disabled=${busy || code.trim().length < 4}>${busy ? "Checking…" : "Continue"}</button>
        ${err ? html`<p class="small" style="color:var(--bad)" role="alert">${err}</p>` : null}
        <p class="tiny muted">You only need to do this once on this phone. After that, install it: Chrome ⋮ → Install app, or Safari → Share → Add to Home Screen.</p>
        <div style="margin-top:22px"><${Signature} compact /></div>
      </form>
    </div>`;
  }

  // ------------------------------------------------------------ Help window
  function HelpWindow({ section, onClose }) {
    const H = window.LSHelp || { sections: [], whatsNew: [] };
    const [q, setQ] = useState("");
    const [open, setOpen] = useState(section || null);
    const bodyRef = useRef(null);
    useEffect(() => {
      const k = (e) => e.key === "Escape" && onClose();
      addEventListener("keydown", k);
      document.body.style.overflow = "hidden";
      return () => { removeEventListener("keydown", k); document.body.style.overflow = ""; };
    }, []);
    useEffect(() => {
      if (!section || !bodyRef.current) return;
      const el = bodyRef.current.querySelector("#help-" + section);
      if (el) setTimeout(() => el.scrollIntoView({ block: "start" }), 30);
    }, [section]);
    const places = (t) => t.replace(/Bengaluru/g, CITY.BLR).replace(/Hyderabad/g, CITY.HYD);
    const strip = (h) => h.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").toLowerCase();
    const term = q.trim().toLowerCase();
    const list = H.sections.filter((x) => !term || x.title.toLowerCase().includes(term) || strip(x.body).includes(term));
    return html`<div class="help-window" role="dialog" aria-modal="true" aria-label="LifeSync help">
      <div class="help-head">
        <div class="stack" style="gap:2px"><span class="eyebrow">Help · version ${H.version}</span><h2>How to use LifeSync</h2></div>
        <button class="icon-btn" aria-label="Close help" onClick=${onClose}>${I.close}</button>
      </div>
      <div class="help-body" ref=${bodyRef}>
        <input type="text" id="help-search" placeholder="Search help, e.g. holiday, PNR, backup" value=${q} onInput=${(e) => setQ(e.target.value)} aria-label="Search help" />
        ${list.length ? null : html`<div class="empty">Nothing matches “${q}”. Try another word.</div>`}
        <div class="help-list">
          ${list.map((x) => html`<details id=${"help-" + x.id} class="help-sec" open=${!!term || open === x.id} onToggle=${(e) => e.target.open && setOpen(x.id)}>
            <summary><span>${x.title}</span></summary>
            <div class="help-text" dangerouslySetInnerHTML=${{ __html: places(x.body) }}></div>
          </details>`)}
        </div>
        ${!term ? html`<div class="card"><h3>What's new</h3>
          ${H.whatsNew.map((w) => html`<div class="stack" style="gap:4px"><span class="eyebrow">Version ${w.version}</span>
            <ul class="why small">${w.items.map((t) => html`<li dangerouslySetInnerHTML=${{ __html: places(t) }}></li>`)}</ul></div>`)}
        </div>` : null}
        <div class="credit-card"><${Signature} compact /></div>
        <p class="tiny muted">Guide updated ${H.updated ? fDay(H.updated) : ""}. LifeSync keeps your data on this device.</p>
      </div>
    </div>`;
  }
  const HelpLink = ({ id, openHelp, label }) => html`<button class="link help-link" onClick=${() => openHelp(id)}>${I.help}${label || "How this works"}</button>`;

  function MoreScreen({ go, state, today }) {
    const comp = E.compliance(ymOf(today), state, acceptedPlan(state, ymOf(today)), today);
    const tiles = [
      ["compliance", I.gauge, "Compliance", `${comp.monthly.completed} of ${comp.monthly.required || "—"} office days`],
      ["family", I.family, "Family", `${(state.family || []).filter((f) => f.end >= today).length} upcoming dates`],
      ["rules", I.rules, "Rules & preferences", `${(state.policies || []).filter((p) => p.active !== false).length} active rules`],
      ["items", I.items, "Holidays & leave", `${(state.calendar || []).filter((i) => (i.end || i.start) >= today).length} upcoming`],
      ["reports", I.report, "Reports", "PDF for any month"],
      ["data", I.data, "Backup & data", "Save, restore, reset"],
      ["lock", I.lock, "App lock", (window.LSLock && LSLock.read()) ? "On · phone unlock" : "Off"],
      ["help", I.help, "Help", "How to use LifeSync"],
      ["share", I.share, "Share LifeSync", "Invite someone to use it"],
    ];
    return html`<div class="page">
      <div class="page-head"><span class="eyebrow">More</span><h1>Settings & tools</h1></div>
      <div class="more-grid">${tiles.map(([k, icon, t, sub]) => html`<button class="tile" onClick=${() => go("more", k)}>${icon}<strong>${t}</strong><span class="tiny muted">${sub}</span></button>`)}</div>
    </div>`;
  }

  // ------------------------------------------------------------ first run
  function Setup({ today, onDone, openHelp }) {
    const [m, setM] = useState(12);
    const [w, setW] = useState(2);
    const [fixed, setFixed] = useState([]);
    const [name, setName] = useState("");
    const [start, setStart] = useState("HYD");
    const [officeName, setOfficeName] = useState("Bengaluru");
    const [homeName, setHomeName] = useState("Hyderabad");
    const finish = () => {
      const s = EMPTY();
      s.prefs.name = name.trim();
      s.prefs.startLocation = start;
      if (officeName.trim() && officeName.trim() !== "Bengaluru") s.prefs.officeCity = { name: officeName.trim() };
      if (homeName.trim() && homeName.trim() !== "Hyderabad") s.prefs.homeCity = { name: homeName.trim() };
      if (Number(m) > 0) s.policies.push({ id: uid(), type: "monthlyMin", value: Number(m), source: "Entered by you", active: true });
      if (Number(w) > 0) s.policies.push({ id: uid(), type: "weeklyMin", value: Number(w), source: "Entered by you", active: true });
      if (fixed.length) s.policies.push({ id: uid(), type: "fixedOffice", weekdays: fixed, source: "Entered by you", active: true });
      s.meta.setupDone = true;
      onDone(s);
    };
    return html`<div class="page">
      <div class="page-head"><span class="eyebrow">Welcome</span><h1>Set up LifeSync</h1>
        <p class="small muted">Plan office days in ${CITY.BLR}, time at home in ${CITY.HYD} and time with your daughter, with fewer trips. Start with your office rule; everything can be changed later.</p>
        <${HelpLink} id="start" openHelp=${openHelp} label="Read the getting-started guide" /></div>
      <div class="card">
        <${Field} label="Your name (optional)" id="s-name"><input id="s-name" type="text" value=${name} onInput=${(e) => setName(e.target.value)} /></${Field}>
        <div class="grid2">
          <${Field} label="Office city" id="s-office"><input id="s-office" type="text" value=${officeName} onInput=${(e) => setOfficeName(e.target.value)} /></${Field}>
          <${Field} label="Home city" id="s-home"><input id="s-home" type="text" value=${homeName} onInput=${(e) => setHomeName(e.target.value)} /></${Field}>
        </div>
        <div class="grid2">
          <${Field} label="Office days per month" id="s-m" hint="0 if none"><input id="s-m" type="number" min="0" max="23" value=${m} onInput=${(e) => setM(e.target.value)} /></${Field}>
          <${Field} label="Office days per week" id="s-w" hint="0 if none"><input id="s-w" type="number" min="0" max="5" value=${w} onInput=${(e) => setW(e.target.value)} /></${Field}>
        </div>
        <div class="field"><span class="label">Fixed office weekdays (optional)</span><${DaysPick} name="s-fixed" value=${fixed} onChange=${setFixed} /></div>
        <${Field} label="Where are you at the start of this month?" id="s-start"><select id="s-start" value=${start} onChange=${(e) => setStart(e.target.value)}><option value="HYD">${CITY.HYD}</option><option value="BLR">${CITY.BLR}</option></select></${Field}>
        <button class="btn primary block" onClick=${finish}>Save and start</button>
      </div>
      <div class="card"><h3>Just looking?</h3><p class="small muted">Load a sample month with example rules, a holiday, your daughter's dates and a booked train, all clearly marked so you can remove them later.</p>
        <button class="btn block" onClick=${() => onDone(exampleState(today), true)}>Explore with example data</button></div>
    </div>`;
  }

  // ------------------------------------------------------------ app
  function App() {
    const [state, setState] = useState(null);
    const [store, setStore] = useState(null);
    const [saveStatus, setSaveStatus] = useState("");
    const [tab, setTab] = useState("today");
    const [sub, setSub] = useState(null);
    const [planMonth, setPlanMonth] = useState(ymOf(todayISO()));
    const [planAuto, setPlanAuto] = useState(false);
    const [calMonth, setCalMonth] = useState(ymOf(todayISO()));
    const [sheet, setSheet] = useState(null);
    const [accessOk, setAccessOk] = useState(() => !(window.LSAccess && LSAccess.needed()));
    const [lockCfg, setLockCfg] = useState(() => (window.LSLock && window.self === window.top ? LSLock.read() : null));
    const [locked, setLocked] = useState(() => !!(window.LSLock && window.self === window.top && LSLock.read()));
    const [hiddenCover, setHiddenCover] = useState(false);
    const hiddenAt = useRef(0);
    useEffect(() => {
      const onVis = () => {
        if (document.visibilityState === "hidden") {
          hiddenAt.current = Date.now();
          if (lockCfg) setHiddenCover(true); // keep the app switcher preview blank
        } else {
          setHiddenCover(false);
          if (lockCfg && Date.now() - hiddenAt.current >= (lockCfg.relockAfter || 0) * 1000) setLocked(true);
        }
      };
      document.addEventListener("visibilitychange", onVis);
      return () => document.removeEventListener("visibilitychange", onVis);
    }, [lockCfg]);
    const [help, setHelp] = useState(null); // null = closed, "" = open at top, "<id>" = open at section
    const openHelp = (id) => setHelp(id || "");
    const [toastMsg, setToastMsg] = useState("");
    const toastT = useRef(null);
    const today = todayISO();

    useEffect(() => {
      let alive = true;
      LSStore.openStore(setSaveStatus).then(async (st) => {
        const loaded = await st.load().catch(() => ({}));
        if (!alive) return;
        const s = Object.assign(EMPTY(), loaded);
        s.prefs = Object.assign({}, DEFAULT_PREFS, loaded.prefs || {});
        s.meta = Object.assign({ setupDone: false }, loaded.meta || {});
        setStore(st);
        setState(s);
      });
      const h = location.hash.replace("#", "");
      if (["today", "plan", "calendar", "travel", "more"].includes(h)) setTab(h);
      return () => { alive = false; };
    }, []);

    const toast = (m) => {
      setToastMsg(m);
      clearTimeout(toastT.current);
      toastT.current = setTimeout(() => setToastMsg(""), 2600);
    };
    const update = (key, value) => {
      setState((s) => Object.assign({}, s, { [key]: value }));
      store && store.save(key, value);
    };
    const replaceState = (s) => {
      setState(s);
      if (store) for (const k of LSStore.KEYS) store.save(k, s[k]);
    };
    const go = (t, s, auto) => {
      if (t === "more" && s === "help") { setHelp(""); return; }
      setTab(t);
      setSheet(null);
      if (t === "plan" && s) setPlanMonth(s);
      setPlanAuto(t === "plan" && !!auto);
      setSub(t === "more" ? s || null : null);
      window.scrollTo(0, 0);
    };
    const upsert = (key, item) => {
      const list = state[key] || [];
      const i = list.findIndex((x) => x.id === item.id);
      const next = i >= 0 ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item];
      update(key, next);
    };
    const remove = (key, id) => update(key, (state[key] || []).filter((x) => x.id !== id));
    const setAttendance = (iso, v, quiet) => {
      const a = Object.assign({}, state.attendance);
      if (v) a[iso] = v;
      else delete a[iso];
      update("attendance", a);
      if (!quiet) toast(v ? `${fDay(iso)} logged as ${{ wfo: "office", wfh: "home", leave: "leave", business: "work trip" }[v]}` : "Log cleared");
    };
    const acceptPlan = (plan, reason, adj) => {
      adj = adj || { pins: [], noTravel: [] };
      const ym = plan.month;
      const key = (j) => `${j.date}|${j.from}|${j.to}`;
      const pinKeys = new Set(adj.pins.map(key));
      const newKeys = new Set(plan.journeys.map(key));
      let journeys = (state.journeys || []).filter((j) => !(j.status === "proposed" && j.planMonth === ym && !newKeys.has(key(j)) && !j.locked));
      journeys = journeys.map((j) => (j.status === "proposed" && pinKeys.has(key(j)) ? Object.assign({}, j, { locked: true }) : j));
      const have = new Set(journeys.filter((j) => j.status !== "cancelled").map(key));
      for (const j of plan.journeys)
        if (!have.has(key(j)))
          journeys.push({ id: uid(), from: j.from, to: j.to, date: j.date, depTime: "", arrTime: "", mode: state.prefs.defaultMode, operator: "", ref: "", cost: "", status: "proposed", notes: "", planMonth: ym, locked: pinKeys.has(key(j)), example: !!state.meta.example });
      let calendar = state.calendar || [];
      const existingBlack = new Set(calendar.filter((c) => c.category === "blackout").map((c) => c.start));
      const addBlack = adj.noTravel.filter((d) => !existingBlack.has(d)).map((d) => ({ id: uid(), category: "blackout", label: "No travel this evening (set in plan)", start: d, end: "" }));
      if (addBlack.length) calendar = calendar.concat(addBlack);
      const fp = E.inputsFingerprint(ym, Object.assign({}, state, { journeys, calendar }), plan);
      const version = {
        id: uid(), month: ym, createdAt: new Date().toISOString(), profile: plan.profile, label: plan.label,
        days: plan.days, journeys: plan.journeys, explanation: plan.explanation, metrics: plan.metrics, warnings: plan.warnings || [],
        fingerprint: fp, accepted: true, reason, example: !!state.meta.example,
      };
      let plans = (state.plans || []).map((p) => (p.month === ym && p.accepted ? Object.assign({}, p, { accepted: false }) : p));
      plans.push(version);
      const forMonth = plans.filter((p) => p.month === ym).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const drop = new Set(forMonth.slice(6).map((p) => p.id));
      plans = plans.filter((p) => !drop.has(p.id));
      setState((s) => Object.assign({}, s, { plans, journeys, calendar }));
      if (store) { store.save("plans", plans); store.save("journeys", journeys); if (addBlack.length) store.save("calendar", calendar); }
      toast(`${fMonthShort(ym)} plan saved`);
    };
    const finishSetup = (s, example) => {
      if (example) {
        // Save a plan for the example month so every screen has something to show.
        const ym = ymOf(today);
        const r = E.proposePlans(ym, s, { startLocation: s.prefs.startLocation, fixedDays: fixedDaysFor(s, ym, today), today });
        if (r.feasible) {
          const p = r.plans[0];
          s.plans = [{ id: uid(), month: ym, createdAt: new Date().toISOString(), profile: p.profile, label: p.label, days: p.days, journeys: p.journeys, explanation: p.explanation, metrics: p.metrics, fingerprint: "", accepted: true, reason: "Example", example: true }];
          const key = (j) => `${j.date}|${j.from}|${j.to}`;
          const have = new Set(s.journeys.map(key));
          for (const j of p.journeys) if (!have.has(key(j))) s.journeys.push({ id: uid(), from: j.from, to: j.to, date: j.date, depTime: "", arrTime: "", mode: "train", operator: "", ref: "", cost: "", status: j.date < today ? "completed" : "proposed", notes: "", planMonth: ym, example: true });
          s.plans[0].fingerprint = E.inputsFingerprint(ym, s, s.plans[0]);
        }
      }
      replaceState(s);
      setTab("today");
    };

    if (!accessOk) return html`<${AccessGate} onIn=${() => setAccessOk(true)} />`;
    if (locked && lockCfg)
      return html`<${LockScreen} cfg=${lockCfg} onUnlocked=${() => setLocked(false)} onRecovered=${() => { LSLock.disable(); setLockCfg(null); setLocked(false); setTimeout(() => toast("App lock turned off. Turn it on again in More → App lock."), 300); }} />`;
    if (state) setPlaces(state.prefs);
    if (!state) return html`<div class="app"><div class="loading"><div class="spinner" aria-hidden="true"></div><span>Opening LifeSync…</span></div></div>`;

    const badge = E.reminders(state, today).filter((r) => r.priority === 1).length;
    const openJourney = (id) => setSheet({ type: "journey", item: state.journeys.find((j) => j.id === id) });
    const openDay = (iso) => setSheet({ type: "day", iso });
    const openConfirm = (days) => setSheet({ type: "confirm", days });
    const addItem = (it) => setSheet({ type: "item", item: it });
    const back = () => setSub(null);
    const saveErr = saveStatus && saveStatus !== "saving" && saveStatus !== "saved";

    let body;
    if (!state.meta.setupDone) body = html`<${Setup} today=${today} onDone=${finishSetup} openHelp=${openHelp} />`;
    else if (tab === "today") body = html`<${Today} state=${state} today=${today} go=${go} openJourney=${openJourney} setAttendance=${setAttendance} openDay=${openDay} openConfirm=${openConfirm} />`;
    else if (tab === "plan") body = html`<${PlanScreen} state=${state} today=${today} month=${planMonth} setMonth=${setPlanMonth} acceptPlan=${acceptPlan} go=${go} autoRun=${planAuto} clearAutoRun=${() => setPlanAuto(false)} openHelp=${openHelp} setCityWfh=${(ym, n) => { const m = Object.assign({}, state.prefs.officeCityWfh); if (n == null) delete m[ym]; else m[ym] = n; update("prefs", Object.assign({}, state.prefs, { officeCityWfh: m })); }} />`;
    else if (tab === "calendar") body = html`<${CalendarScreen} state=${state} today=${today} month=${calMonth} setMonth=${setCalMonth} openDay=${openDay} />`;
    else if (tab === "travel") body = html`<${TravelScreen} state=${state} today=${today} openJourney=${openJourney} newJourney=${() => setSheet({ type: "journey", item: null })} openHelp=${openHelp} />`;
    else if (sub === "compliance") body = html`<${ComplianceScreen} state=${state} today=${today} back=${back} />`;
    else if (sub === "family") body = html`<${FamilyScreen} state=${state} today=${today} back=${back} edit=${(f) => setSheet({ type: "family", item: f })} />`;
    else if (sub === "rules") body = html`<${RulesScreen} state=${state} update=${update} back=${back} toast=${toast} editPolicy=${(p) => setSheet({ type: "policy", item: p })} openHelp=${openHelp} />`;
    else if (sub === "items") body = html`<${ItemsScreen} state=${state} today=${today} back=${back} edit=${(i) => setSheet({ type: "item", item: i })} openHelp=${openHelp} />`;
    else if (sub === "reports") body = html`<${ReportsScreen} state=${state} today=${today} back=${back} toast=${toast} />`;
    else if (sub === "share") body = html`<${ShareScreen} back=${back} toast=${toast} />`;
    else if (sub === "lock") body = html`<${AppLockScreen} back=${back} lockCfg=${lockCfg} setLockCfg=${setLockCfg} toast=${toast} userName=${state.prefs.name} />`;
    else if (sub === "data") body = html`<${DataScreen} state=${state} replaceState=${replaceState} back=${back} toast=${toast} storeLabel=${store ? store.label : ""} />`;
    else body = html`<${MoreScreen} go=${go} state=${state} today=${today} />`;

    let sheetEl = null;
    const close = () => setSheet(null);
    if (sheet && sheet.type === "journey")
      sheetEl = html`<${JourneySheet} journey=${sheet.item} state=${state} today=${today} onClose=${close}
        onSave=${(j) => { upsert("journeys", j); close(); toast("Journey saved"); }} onDelete=${(id) => { remove("journeys", id); close(); toast("Journey deleted"); }} />`;
    if (sheet && sheet.type === "day")
      sheetEl = html`<${DaySheet} state=${state} iso=${sheet.iso} today=${today} onClose=${close} setAttendance=${setAttendance} addItem=${addItem} openJourney=${openJourney} />`;
    if (sheet && sheet.type === "confirm")
      sheetEl = html`<${ConfirmSheet} state=${state} days=${sheet.days} today=${today} setAttendance=${setAttendance} onClose=${close} />`;
    if (sheet && sheet.type === "family")
      sheetEl = html`<${FamilySheet} item=${sheet.item} today=${today} onClose=${close} onSave=${(f) => { upsert("family", f); close(); toast("Availability saved"); }} onDelete=${(id) => { remove("family", id); close(); }} />`;
    if (sheet && sheet.type === "policy")
      sheetEl = html`<${PolicySheet} item=${sheet.item} onClose=${close} onSave=${(p) => { upsert("policies", p); close(); toast("Rule saved"); }} onDelete=${(id) => { remove("policies", id); close(); }} />`;
    if (sheet && sheet.type === "item")
      sheetEl = html`<${ItemSheet} item=${sheet.item} onClose=${close} onSave=${(i) => { upsert("calendar", i); close(); toast("Saved"); }} onDelete=${(id) => { remove("calendar", id); close(); }} />`;

    const TABS = [["today", I.today, "Today"], ["plan", I.plan, "Plan"], ["calendar", I.cal, "Calendar"], ["travel", I.travel, "Travel"], ["more", I.more, "More"]];
    return html`<div class="app">
      <header class="topbar"><div class="brand"><${BrandMark} />LifeSync</div>
        <div class="row" style="gap:8px"><span class=${"save-state" + (saveErr ? " err" : "")} role="status">${saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved" : saveErr ? saveStatus : ""}</span>
        ${lockCfg ? html`<button class="icon-btn help-btn" aria-label="Lock now" title="Lock now" onClick=${() => setLocked(true)}>${I.lock}</button>` : null}
        <button class="icon-btn help-btn" aria-label="Help" onClick=${() => openHelp("")}>${I.help}</button></div></header>
      <main>${body}</main>
      <footer class=${"credit-card app-credit" + (tab === "more" && !sub ? " full" : "")}>
        <${Signature} compact=${!(tab === "more" && !sub)} />
        ${tab === "more" && !sub ? html`<span class="tiny muted">LifeSync · version ${(window.LSHelp && LSHelp.version) || ""}</span>` : null}
      </footer>
      ${state.meta.setupDone ? html`<nav class="tabbar" aria-label="Main"><div class="tabbar-inner">
        ${TABS.map(([k, icon, label]) => html`<button class="tab" aria-current=${tab === k ? "page" : null} onClick=${() => go(k)}>${icon}<span>${label}</span>${k === "travel" && badge ? html`<span class="badge" aria-label=${badge + " urgent"}>${badge}</span>` : null}</button>`)}
      </div></nav>` : null}
      ${sheetEl}
      ${help !== null ? html`<${HelpWindow} section=${help} onClose=${() => setHelp(null)} />` : null}
      ${toastMsg ? html`<div class="toast" role="status">${toastMsg}</div>` : null}
      ${hiddenCover ? html`<div class="privacy-cover" aria-hidden="true"></div>` : null}
    </div>`;
  }

  render(html`<${App} />`, document.getElementById("app"));
})();
