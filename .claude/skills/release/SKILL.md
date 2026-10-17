---
name: release
description: The checklist for shipping any change to LifeSync, from branch to pull request. Use whenever you change the app (code, screens, rules, Help or styles), or when the user asks to release, ship, publish or open a PR.
argument-hint: "[what the change is]"
allowed-tools: Bash(npm test) Bash(npm run build) Bash(npm ci) Bash(git status *) Bash(git diff *) Bash(git log *) Bash(git branch *) Bash(git fetch *) Bash(git pull *) Bash(git switch *)
---

# Ship a LifeSync change

Follow every step, in order, for: $ARGUMENTS

`main` is protected. Nothing reaches the live app except through a pull request whose **test** check passes. Never push to `main`, never force-push, and never merge a PR unless the user asks you to.

## 1. Start from an up-to-date branch
- `git switch main && git pull`
- `git switch -c <type>/<short-name>`, with type `feature`, `fix`, `ui`, `docs` or `chore` (for example `fix/booking-reminder-date`).

## 2. Make the change
- Planning and compliance logic goes in `src/engine.js`. Keep it pure, and add or update a test in `test/engine.test.js` for every rule change.
- Screens go in `src/app.js` and styles in `src/styles.css`.
- Hard rules: never book, cancel or change tickets automatically; never count a planned office day as completed; never share office days, PNRs or costs in anything meant for other people.

## 3. Update Help (`src/help.js`) for every change the user can see
- Edit the affected sections. Name buttons and screens **exactly** as they appear, in bold.
- Add a `whatsNew` entry at the top for the new version, written for the user, not for developers.
- If you **rename or remove** a screen, tile, button or term: search `src/help.js` and `src/app.js` for every mention and update them all, then add the old name to `RETIRED` in `test/help.test.js`.

## 4. Bump the version
- Patch (0.13.0 → 0.13.1) for fixes and small visual changes; minor (0.13.x → 0.14.0) for new features.
- `npm version <x.y.z> --no-git-tag-version`, then set the same `version` and today's `updated` date in `src/help.js`.
- Docs-only or tooling-only changes (README, `.claude/`, workflows) don't need a version bump or a Help entry.

## 5. "Plan may be out of date" check
- If you changed `inputsFingerprint` in `src/engine.js`, bump `FP_VERSION` and add the new hash to `KNOWN` in `test/fingerprint.test.js` (the failing test prints it). Saved plans are then re-checked once after the update instead of all being flagged.

## 6. Test and build
- `npm test` must pass. A hook also runs it before every commit and blocks the commit if it fails.
- `npm run build` must pass. It refuses to build if the Help version or its `whatsNew` entry doesn't match `package.json`.

## 7. Check against the user's real data shape
The user's phone holds data saved by the version currently on `main`. Make sure it still works:
- If a browser is available (Playwright with Chromium), build `main` in a separate git worktree, open it, use **Explore with example data**, copy its `localStorage` (keys start with `lifesync.v1.`) into the new build, and check: no false "plan may be out of date", existing trips and plans look the same, and there are no console errors. Then try the new feature end to end and take screenshots.
- If no browser is available (for example on Windows without Playwright), run `npm start`, and tell the user exactly what to check on the Network address from their phone before merging.

## 8. Commit, push and open the PR
- Commit with a clear subject (`v0.14.0: <what changed>`) and a body listing what changed for the user, Help changes, and how it was tested.
- `git push -u origin <branch>`.
- Open a pull request into `main`: with `gh pr create` if it works, or the GitHub API, or else give the user the **Compare & pull request** link. The description covers: what changed (for the user), existing data, Help, and how it was tested.
- Wait for the **test** check to pass and tell the user. Send screenshots if you have them.

## 9. After the user merges
- The **Test and publish LifeSync** workflow publishes the app in about a minute.
- Tell the user to open LifeSync on their phone with a connection, then close and reopen it, and check **More** shows the new version.
- Remind them to tap **Delete branch** on the merged PR.
