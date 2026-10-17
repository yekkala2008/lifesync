# Working on LifeSync

## How changes ship

`main` is protected. Every change goes on a branch and through a pull request; the **test** check must pass before merging, and merging publishes the app. Never push to `main`, never force-push, and don't merge unless the user asks.

Use the **release** skill (`/release`, in `.claude/skills/release/`) for every change: it is the step-by-step checklist (branch, Help, version, FP_VERSION, tests, old-data check, PR). A hook (`.claude/hooks/test-before-commit.mjs`) runs `npm test` before each commit and blocks it if tests fail.

## Every functional change must update the in-app help

When you change what the app does or how it is used, in the same commit:

1. Edit the matching section(s) in `src/help.js`, or add a new section. Name buttons and screens exactly as they appear in the app, in bold.
2. Add a `whatsNew` entry at the top of the list for the new version, written for the user.
3. Bump `version` in `package.json` and set the same `version` in `src/help.js`.

`npm run build` fails if the help version or its `whatsNew` entry doesn't match `package.json`, so CI won't publish an app with stale help.

When you **rename or remove** a screen, tile, button or term:
- search `src/help.js` and `src/app.js` for every mention of the old name and update them all, not just the section you're editing;
- add the old name to `RETIRED` in `test/help.test.js`, so it can never come back.

`test/help.test.js` (run by `npm test` before every publish) fails if Help points to a **More →** tile that doesn't exist, or if Help or any screen still uses a retired name.

## Other rules

- Planning and compliance logic lives in `src/engine.js` and must stay pure and unit-tested (`npm test`). Add a test for every rule change.
- Never book, cancel or change tickets automatically, and never count a planned office day as completed.
- Bump `version` for every release; it also refreshes the offline cache on installed phones.
- If you change `inputsFingerprint` (what makes a plan "out of date"), bump `FP_VERSION` in `src/engine.js`. Saved plans are then re-checked once after the update instead of all being flagged. `test/fingerprint.test.js` fails if you forget.
- Test updates against data saved by the previous version, not only a fresh install.
