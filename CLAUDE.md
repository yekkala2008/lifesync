# Working on LifeSync

## Every functional change must update the in-app help

When you change what the app does or how it is used, in the same commit:

1. Edit the matching section(s) in `src/help.js`, or add a new section. Name buttons and screens exactly as they appear in the app, in bold.
2. Add a `whatsNew` entry at the top of the list for the new version, written for the user.
3. Bump `version` in `package.json` and set the same `version` in `src/help.js`.

`npm run build` fails if the help version or its `whatsNew` entry doesn't match `package.json`, so CI won't publish an app with stale help.

## Other rules

- Planning and compliance logic lives in `src/engine.js` and must stay pure and unit-tested (`npm test`). Add a test for every rule change.
- Never book, cancel or change tickets automatically, and never count a planned office day as completed.
- Bump `version` for every release; it also refreshes the offline cache on installed phones.
