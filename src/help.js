/*
 * LifeSync in-app help.
 *
 * RULE: every change to functionality updates this file in the same commit:
 *   1. edit or add the relevant section(s) below,
 *   2. add an entry to `whatsNew`,
 *   3. set `version` to the new package.json version.
 * The build refuses to run if `version` doesn't match package.json.
 *
 * Bodies are trusted HTML written here (no user input). Keep sentences short and
 * name buttons exactly as they appear in the app, in bold.
 */
(function (root) {
  "use strict";
  root.LSHelp = {
    version: "0.10.2",
    updated: "2026-10-10",

    whatsNew: [
      {
        version: "0.10.2",
        items: ["Access codes work however they're entered in the GitHub secret: separated by commas or new lines, with or without quotes."],
      },
      {
        version: "0.10.1",
        items: ["The gold signature now appears at the bottom of every screen."],
      },
      {
        version: "0.10.0",
        items: [
          "The signature is now Srinivas Yekkala's own handwriting in gold foil.",
          "Today offers to <b>set up App lock</b>, and once it's on, a lock button at the top locks LifeSync straight away.",
        ],
      },
      {
        version: "0.9.0",
        items: [
          "Set your <b>usual work-from-home days in Bengaluru</b> per month in Rules &amp; preferences; change any single month on the Plan screen.",
          "<b>Share LifeSync</b> (in More) with a ready-made invite message. The owner can make it invite-only with an access code.",
          "Signed: designed &amp; built by Srinivas Yekkala.",
        ],
      },
      {
        version: "0.8.0",
        items: [
          "Set <b>Work from home in Bengaluru</b> on the Plan screen. Every option plans those days on top of your office days.",
          "Plan options are now <b>Balanced</b> (always first, recommended), <b>Most home time</b> and <b>Fewest trips</b>.",
        ],
      },
      {
        version: "0.7.0",
        items: [
          "<b>App lock</b>: open LifeSync with your phone's fingerprint, face, PIN or pattern. Turn it on in <b>More → App lock</b>.",
        ],
      },
      {
        version: "0.6.0",
        items: [
          "Work from home in Bengaluru is fully supported: on any day there, log <b>Office</b> or <b>Home</b>. Only Office counts.",
          "Days in Hyderabad are logged as work from home automatically, so there's nothing to tap.",
          "<b>Confirm</b> several past office days at once from Today.",
          "If working from home leaves you short, Today offers an updated plan that fits in the missing office days.",
          "Compliance and the PDF show what actually happened: office, home in each city, leave. Going over or under the target shows as it is.",
          "Name your own office and home cities in <b>Rules &amp; preferences → Your places</b>. Your data is kept.",
        ],
      },
      {
        version: "0.5.0",
        items: [
          "This Help guide: tap <b>?</b> at the top of any screen, or <b>More → Help</b>.",
          "<b>How this works</b> links on Plan, Travel and Rules open the matching help section.",
        ],
      },
      {
        version: "0.4.0",
        items: [
          "New day type <b>Office closed (work from home)</b> for wellness days: no office, work from home in Hyderabad.",
          "<b>Review an updated plan</b> on Today now opens the updated options directly.",
        ],
      },
      {
        version: "0.3.0",
        items: [
          "Tap a suggested trip to move it, keep it, or skip travel that evening. The month re-plans around your change.",
          "Trips you set are marked <b>Your date</b> and stay fixed in later replans.",
          "Trips read as overnight journeys: <i>evening → arrive next day</i>.",
        ],
      },
      {
        version: "0.2.0",
        items: [
          "Weekday holidays are spent at home in Hyderabad.",
          "Each plan option lists its suggested travel dates with a book-by date.",
          "Completed trips are kept as fixed facts when planning.",
        ],
      },
    ],

    sections: [
      {
        id: "start",
        title: "Getting started",
        body: `
<p>LifeSync works out where you should be each day, Bengaluru or Hyderabad, so you meet your office rules with as few trips as possible and still get time with your daughter and family at home.</p>
<ol>
<li>On the welcome screen, enter your office city and home city (Bengaluru and Hyderabad by default), then your office days per month and per week. Only use <b>fixed office weekdays</b> if your company requires specific days, such as every Wednesday.</li>
<li>Add holidays, leave and office-closed days in <b>More → Holidays &amp; leave</b>.</li>
<li>Add your daughter's dates in <b>More → Family</b>.</li>
<li>Add tickets you have already booked in <b>Travel</b>, with status <b>Booked</b>.</li>
<li>Go to <b>Plan → Suggest plans</b>, pick one, and tap <b>Save plan</b>.</li>
</ol>
<p>To rename your cities later, or add their short codes and addresses, use <b>More → Rules &amp; preferences → Your places</b>. Renaming keeps all your data.</p>
<p class="tip">Want to look around first? On the welcome screen choose <b>Explore with example data</b>. Remove it later in <b>More → Backup &amp; data</b>.</p>`,
      },
      {
        id: "midmonth",
        title: "Starting in the middle of a month",
        body: `
<p>Tell LifeSync what has already happened before you ask for a plan, otherwise it assumes you haven't been to the office yet.</p>
<ol>
<li><b>More → Rules &amp; preferences → Travel → Start of month location</b>: where you were on the 1st.</li>
<li>Add this month's past holidays and leave too. They can reduce how many office days you need.</li>
<li>In <b>Travel</b>, add trips you've already made this month with status <b>Completed</b>.</li>
<li>In <b>Calendar</b>, tap each past day you were in the office and choose <b>Office</b>.</li>
<li>Then <b>Plan → Suggest plans</b>. It plans only the days left.</li>
</ol>
<p class="tip">If a week has already gone by without enough office days, the plan says so and makes the most of the remaining days.</p>`,
      },
      {
        id: "today",
        title: "Today and logging your days",
        body: `
<p><b>Today</b> shows where you should be, tonight's journey if any, booking actions, your office-day count and your daughter's upcoming dates.</p>
<p><b>In Bengaluru</b> you can work from the office or from home. Each day, tap <b>Office</b> or <b>Home</b> in <b>Log today</b>. Planning 12 office days doesn't stop you working from home on others.</p>
<p><b>In Hyderabad</b> the day is logged as <b>Home</b> automatically. Change it only for <b>Leave</b> or a <b>Work trip</b>.</p>
<p>Planned office days you haven't confirmed appear on Today as <b>… to confirm</b>. Tap <b>Confirm</b> to mark several at once. To change any other day, tap it in <b>Calendar</b>.</p>
<p>If you work from home on a planned office day and fall short, Today shows <b>On track for X of 12</b>. Tap <b>Review an updated plan</b> and LifeSync fits the missing days into the rest of the month.</p>
<p class="tip">Only days logged as <b>Office</b> count. Your real total shows as it is, whether that's above or below the target. In Calendar, <b>DONE</b> means office and an outlined <b>WFH</b> means you worked from home in Bengaluru.</p>`,
      },
      {
        id: "rules",
        title: "Office rules and how days are counted",
        body: `
<p>Set these in <b>More → Rules &amp; preferences</b>.</p>
<ul>
<li><b>Monthly minimum</b> / <b>Weekly minimum</b>: office days you need.</li>
<li><b>Fixed office weekdays</b>: days you must always be in the office. Every selected weekday becomes mandatory.</li>
<li><b>Fixed work-from-home weekdays</b>: days the office is never planned.</li>
<li><b>Required on-site date</b>: a single date you must be in the office.</li>
<li>Rules can have start and end dates for policy changes.</li>
</ul>
<p><b>How days are counted</b> decides whether holidays, office-closed days and leave reduce the number you need, whether work trips count as office days, and how weeks split across two months are handled. Match these to your company's policy.</p>
<p class="tip">Example: 12 a month, 21 working days, 2 holidays → 12 × 19 ÷ 21 = 10.9, rounded up to 11.</p>`,
      },
      {
        id: "days",
        title: "Holidays, office closed, leave and events",
        body: `
<p>Add these in <b>More → Holidays &amp; leave → Add</b>, or tap a day in <b>Calendar</b>.</p>
<ul>
<li><b>Holiday</b>: no work. Weekday holidays are spent at home in Hyderabad.</li>
<li><b>Office closed (work from home)</b>: for wellness days and similar. You work, but from home in Hyderabad. Shown as a dashed <b>WFH</b> in Calendar.</li>
<li><b>Leave</b>: your days off.</li>
<li><b>Event</b>: anything with a place. Tick <b>I must be there</b> and choose the city to pin you there that day.</li>
<li><b>Work trip</b>: travel for work; not an office day unless you choose otherwise in Rules.</li>
<li><b>No-travel date</b>: no journey will leave on that evening.</li>
</ul>
<p class="tip">To stop holidays or office-closed days pulling you to Hyderabad, untick them in <b>Rules &amp; preferences → Travel</b>.</p>`,
      },
      {
        id: "family",
        title: "Family availability",
        body: `
<p>In <b>More → Family</b>, add when your daughter is free in Bengaluru, marked <b>Available</b> or <b>Tentative</b>. Plans favour being in Bengaluru on those dates, and each plan shows how many of them it covers, for example <i>3/4 daughter days covered</i>.</p>
<p>You can also add someone in Hyderabad as <b>Unavailable / away</b>, and the planner won't count that weekend as home time.</p>
<p class="tip">Only dates and a status are stored, never what anyone is doing.</p>`,
      },
      {
        id: "plan",
        title: "Making a plan",
        body: `
<p>In <b>Plan</b>, pick the month. If you'd like to stay in Bengaluru on some days without going to the office, set <b>Work from home in Bengaluru</b> with <b>−</b> and <b>+</b>. Then tap <b>Suggest plans</b>. You get up to three options, always in this order:</p>
<ul>
<li><b>Balanced</b>: the recommended mix of office, home time, family and trips.</li>
<li><b>Most home time</b>: as many days in Hyderabad as your rules allow.</li>
<li><b>Fewest trips</b>: longer stays, fewer journeys.</li>
</ul>
<p>Every option plans your office days <b>and</b> at least the work-from-home days you set. If they can't both fit, you're told how many working days are left so you can lower the number. Options that come out identical are shown once.</p>
<p>Each option shows a strip of the month (green Bengaluru, ochre Hyderabad, dot = office day), the key numbers, its <b>Suggested travel</b> and a short explanation. Tap an option to select it, then <b>Use … plan</b>, check the summary and <b>Save plan</b>.</p>
<p><b>Every trip is overnight.</b> <i>Tue 20 Oct · evening → arrive Wed 21</i> means you leave Tuesday evening and arrive Wednesday morning.</p>
<p>Office rules always come first. If they can't all be met, the app lists which rules clash instead of guessing.</p>
<p>Set your <b>usual</b> number once in <b>More → Rules &amp; preferences → Work from home in Bengaluru</b>. Every month starts from it. Changing the number on the Plan screen applies to that month only; tap <b>Use usual</b> to go back.</p>
<p>The number is saved per month. Changing it after saving a plan shows <b>Your plan may be out of date</b>, with an updated plan to review.</p>
<p class="tip">To change how options are balanced, move the sliders in <b>Rules &amp; preferences → Planning priorities</b>.</p>`,
      },
      {
        id: "adjust",
        title: "Changing suggested travel dates",
        body: `
<ol>
<li>In <b>Plan</b>, tap <b>Change travel dates</b> (or <b>Suggest plans</b>).</li>
<li>Tap any trip in <b>Suggested travel</b>.</li>
<li>Choose <b>Move trip</b> to another evening, <b>Keep</b> it as it is, or <b>Don't travel that evening</b>.</li>
</ol>
<p>The month re-plans immediately around your change: office days, the return trip and the weekly and monthly checks. Your edits are listed under <b>Your changes</b>, with <b>Undo</b> and <b>Clear all</b>.</p>
<p>If a change would break a rule, such as clashing with a booked ticket, it's refused with the reason and your plan stays as it was.</p>
<p>When you <b>Save plan</b>, trips you set are marked <b>Your date</b> and stay fixed in future replans. No-travel evenings are saved in <b>Holidays &amp; leave</b>.</p>
<p class="tip">Changing a proposed trip's date in <b>Travel</b> also fixes it as <b>Your date</b>.</p>`,
      },
      {
        id: "travel",
        title: "Travel, bookings and reminders",
        body: `
<p>Saved plans add their trips to <b>Travel</b> as <b>Proposed</b>. When you book, open the trip and set:</p>
<ul>
<li><b>Booked and confirmed</b>, with times, train or operator, PNR and cost;</li>
<li><b>Waitlisted / not confirmed</b>, which keeps a warning until confirmed;</li>
<li><b>Travel completed</b> after the journey;</li>
<li><b>Changed / cancelled</b> if plans change.</li>
</ul>
<p><b>Booking due</b> appears once a trip is within your booking lead time (<b>Rules → Travel → Book this many days ahead</b>).</p>
<p><b>Phone reminders:</b> in a trip, tap <b>Booking reminder</b> or <b>Departure in calendar</b> to add it to Google Calendar. Your phone's calendar then alerts you even when LifeSync is closed.</p>
<p class="tip">LifeSync never books, cancels or changes tickets, and doesn't check live seat availability.</p>`,
      },
      {
        id: "changes",
        title: "When something changes",
        body: `
<p>If you add a holiday, change a rule, add your daughter's dates, or book a trip that isn't in the plan, <b>Today</b> shows <b>Your plan may be out of date</b>.</p>
<p>Tap <b>Review an updated plan</b> to see new options and a summary of what changes before anything is saved.</p>
<p class="tip">Booking or completing a trip that the plan already suggested doesn't trigger this.</p>`,
      },
      {
        id: "compliance",
        title: "Office-day compliance",
        body: `
<p><b>More → Compliance</b> shows, for each month and week: <b>required</b>, <b>planned</b> and <b>actual office</b> days, with a status. <b>What actually happened so far</b> breaks the month down into office, home in each city, leave and work trips.</p>
<ul>
<li><b>Met</b>: enough days logged.</li>
<li><b>On track</b>: logged plus remaining planned days will meet it.</li>
<li><b>At risk</b>: the current plan falls short.</li>
<li><b>Missed</b>: the period is over and it wasn't met.</li>
</ul>`,
      },
      {
        id: "reports",
        title: "Monthly PDF report",
        body: `
<p><b>More → Reports</b>: choose a month and tap <b>Create PDF</b>. It covers office attendance by week, journeys and their status, plan changes and anything outstanding. On your phone you can share it to WhatsApp or email.</p>`,
      },
      {
        id: "data",
        title: "Backup, install and updates",
        body: `
<p>Your data is stored on this phone only. Save a copy regularly with <b>More → Backup &amp; data → Save backup</b>. Use <b>Restore from backup</b> on a new phone.</p>
<p><b>Install:</b> open the app's address in Chrome → <b>⋮ → Install app</b> (iPhone: Safari → Share → <b>Add to Home Screen</b>).</p>
<p><b>Updates:</b> close and reopen LifeSync while online to get the latest version. Your data isn't affected.</p>
<p class="tip">Uninstalling the app or clearing Chrome's site data deletes your LifeSync data. Save a backup first.</p>`,
      },
      {
        id: "lock",
        title: "App lock",
        body: `
<p>App lock asks for your phone's own screen lock (fingerprint, face, PIN or pattern) whenever LifeSync opens.</p>
<ol>
<li>Open LifeSync from its home-screen icon.</li>
<li>Go to <b>More → App lock</b> and tap <b>Turn on App lock</b>.</li>
<li>Confirm with your fingerprint, face, PIN or pattern.</li>
<li>Save the <b>recovery code</b> it shows you somewhere outside LifeSync. It's shown only once.</li>
</ol>
<p>App lock is off until you turn it on. Today shows <b>Protect LifeSync with your fingerprint</b> until you set it up or tap <b>Not now</b>.</p>
<p>Once it's on, tap the <b>lock</b> button at the top of any screen to lock LifeSync immediately.</p>
<p>Choose when it locks again under <b>Lock again when I leave the app</b>: immediately, or after 1, 5 or 15 minutes away.</p>
<p><b>Can't unlock?</b> On the lock screen tap <b>Can't unlock?</b> and enter your recovery code. LifeSync opens and the lock is turned off; turn it on again in More → App lock.</p>
<p>To turn it off, go to <b>More → App lock → Turn off App lock</b>. It asks you to unlock first.</p>
<p class="tip">Your phone does the check and LifeSync never sees your fingerprint or PIN. The lock is set per phone and isn't part of backups. App lock works in the installed app, not when LifeSync is opened inside Claude.</p>`,
      },
      {
        id: "share",
        title: "Sharing LifeSync",
        body: `
<p>Open <b>More → Share LifeSync</b> to copy the link or a ready-made invite message. Everyone who opens it gets their own empty LifeSync; your data never leaves your phone.</p>
<p><b>Making it invite-only (owner):</b></p>
<ol>
<li>On GitHub, open the <b>lifesync</b> repository → <b>Settings → Secrets and variables → Actions</b>.</li>
<li>Tap <b>New repository secret</b>. Name: <b>LIFESYNC_ACCESS_CODES</b>. Value: one or more codes separated by commas or on separate lines, such as <i>blue-mango-2026, team-kite-81</i>. Use 8 characters or more.</li>
<li>Go to <b>Actions → Test and publish LifeSync → Run workflow</b>.</li>
</ol>
<p>From then on, new people see an <b>Invite only</b> screen and enter a code once per phone. You keep using it as normal on phones that already have access. To stop a code working, remove it from the secret and run the workflow again; phones that used it are asked for a new code.</p>
<p class="tip">Send the code separately from the link. The code keeps casual visitors out, but it isn't strong security: someone technical could get around it. For a real lock, ask about Cloudflare Access.</p>`,
      },
      {
        id: "faq",
        title: "Common questions",
        body: `
<p><b>Why does it want more office days than I expected?</b><br>Past office days you haven't logged count as not attended. Log them in <b>Calendar</b>. Also check <b>Fixed office weekdays</b>: every day selected there is mandatory.</p>
<p><b>Why does a trip show the day before a holiday?</b><br>Trips are overnight. Leaving the evening before puts you at home for the whole holiday.</p>
<p><b>The plan keeps me in Bengaluru on a holiday.</b><br>A booked ticket or a must-attend event in Bengaluru overrides the holiday-at-home setting.</p>
<p><b>It says no plan can meet my rules.</b><br>Read the listed reasons; usually two rules clash, or a fixed trip blocks the only possible days. Change one and try again.</p>
<p><b>Will renaming my cities delete anything?</b><br>No. Plans, trips and logged days stay; they just show the new names. Daughter dates and events set in the office city stay with the office city.</p>
<p><b>I can't find a setting.</b><br>Most settings are in <b>More → Rules &amp; preferences</b>; scroll down for <b>Travel</b> and <b>Planning priorities</b>.</p>`,
      },
    ],
  };
})(typeof self !== "undefined" ? self : this);
