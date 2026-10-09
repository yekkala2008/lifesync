# LifeSync

A personal planner for office days in Bengaluru, home in Hyderabad, and time with family. It works out where you should be each day so you meet your work-from-office rules with fewer trips, tracks your train/bus bookings, and produces a monthly PDF report.

It is an installable web app (PWA): one codebase, free to host, no app store, and it updates itself when you push to GitHub.

## Install on your phone

1. Put this folder in a GitHub repository (for example `lifesync`) and push to `main`.
2. In the repository on GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. The included workflow runs the tests, builds the app and publishes it. When it finishes (Actions tab, about a minute), the site is at `https://<your-username>.github.io/lifesync/`.
4. Open that address on your phone:
   - **Android (Chrome):** menu ⋮ → **Install app** (or **Add to Home screen**).
   - **iPhone (Safari):** Share → **Add to Home Screen**.

LifeSync then opens full-screen from its icon and works offline.

**Your data stays on your phone** (browser storage). Use **More → Backup & data → Save backup** now and then, and **Restore from backup** to move to a new phone. Uninstalling the app or clearing the browser's site data deletes it.

**Reminders:** a web app can't reliably alert you when it's closed, especially on iPhone. Open a journey and tap **Booking reminder** or **Departure in calendar** to put it in Google Calendar, and your phone's calendar does the alerting.

## Updating the app

Edit files in `src/`, **update the in-app help in `src/help.js`** (affected sections plus a `whatsNew` entry), bump `version` in both `package.json` and `src/help.js` (this also refreshes the offline cache), commit and push. The build fails if the help version doesn't match, so stale help can't be published. See `CLAUDE.md`. The workflow redeploys; the installed app picks up the new version the next time it opens with a connection.

## Run it on your computer

```bash
npm install
npm test          # planning and compliance tests
npm run build     # writes dist/pages (installable app) and dist/lifesync.html (single file)
npx serve dist/pages
```

Works the same on Windows. No Docker needed, but `docker run --rm -p 8080:80 -v %cd%/dist/pages:/usr/share/nginx/html:ro nginx` serves it if you prefer.

## How it's built

| File | What it does |
| --- | --- |
| `src/engine.js` | All planning and compliance logic. Pure functions, no UI, unit-tested. |
| `src/store.js` | Saving: browser storage on the phone, or your Claude account when opened as a Claude artifact. |
| `src/app.js` | The screens (Preact + htm, no build step). |
| `src/help.js` | The in-app Help guide (tap **?**). Updated with every functional change. |
| `src/styles.css` | Colours, type and layout. Bengaluru is green, Hyderabad is ochre throughout. |
| `test/engine.test.js` | Tests for rules, date boundaries, replanning and compliance (`node --test`). |
| `build.mjs` | Produces both outputs. |

### Planning

The planner looks at every day of the month and decides where you are (Bengaluru or Hyderabad) and, on Bengaluru working days, whether you go to the office. Journeys are overnight, between two days.

**Hard rules (never traded away):** monthly and weekly minimums, fixed office weekdays, required on-site dates, fixed WFH weekdays, holidays, leave and work trips, must-attend events, booked, waitlisted or completed journeys, and no-travel dates. Weekday holidays are spent at home in Hyderabad, and office-closed days (Holidays & leave → type "Office closed (work from home)") are worked from home in Hyderabad, unless a ticket or must-attend event says otherwise (both switchable in Rules → Travel). If these can't all be met, the app lists which ones conflict instead of guessing.

**Preferences (weighted, adjustable in Rules → Planning priorities):** fewer trips, time with your daughter when she's free in Bengaluru, weekends and weekdays at home, avoiding very short stays, travelling on preferred days.

It produces three plans (Balanced, Fewest trips, Most family time), drops duplicates, lists each plan's suggested travel dates with a book-by date (every trip is overnight: leave in the evening, arrive next morning), explains each, and asks you to choose when they really differ. Tap any suggested trip to move it to another evening, keep it, or skip travel that evening; the month re-plans around your change, or explains which rule it would break. Trips you set are saved as "Your date" and stay fixed in later replans. Nothing is saved, booked or cancelled until you confirm.

Mid-month, days already past stay as they were. Only days you **log** as Office count as completed; a planned day never counts. If the days left can't reach a minimum, you get the best possible plan plus a warning.

### Counting rules to confirm with your company

These are settings, not assumptions baked into code (**More → Rules & preferences → How days are counted**):

- Do public holidays reduce the number of office days you need? (default: yes, proportionally, rounded up)
- Do office-closed days (e.g. wellness days, you still work from home) reduce it? (default: yes)
- Does leave? (default: yes)
- Do work trips count as office days? (default: no)
- Weeks split across two months: prorate, full, or none? (default: prorate)

## Known limits

- No live ticket availability. You record bookings yourself; the app reminds you about booking windows, waitlists and departures. The "booking opens" window is a setting because operators change it.
- Family availability is entered manually. Calendar import isn't built yet.
- Data lives on one device unless you restore a backup elsewhere. Cloud sync can be added later (for example a free Supabase or Firebase tier) if you want it on two devices.
- Not yet matched to Namiclad's design. Once Namiclad's code is reachable, its colours, type and navigation patterns can be applied through `src/styles.css` and the tab bar in `src/app.js`.

## What's next

- Align the look and navigation with Namiclad.
- Optional Google Calendar sync for holidays, leave and your daughter's shared calendar (with permission).
- Optional cloud sync.
