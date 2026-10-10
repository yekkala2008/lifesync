// Invite-only gate: build writes only hashes; the right code opens it, others don't.
const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

test("build stores only hashes of access codes, and the gate accepts them", async () => {
  const root = path.join(__dirname, "..");
  execFileSync("node", ["build.mjs"], { cwd: root, env: { ...process.env, LIFESYNC_ACCESS_CODES: "Blue-Mango 2026, team-kite-81" }, stdio: "pipe" });
  const cfgText = fs.readFileSync(path.join(root, "dist/pages/access-config.js"), "utf8");
  assert.doesNotMatch(cfgText, /mango|kite/i);
  const store = {};
  global.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = v) };
  global.self = global; global.top = global; global.window = global;
  new Function(cfgText)();
  require("../src/access.js");
  assert.equal(LSAccess.needed(), true);
  assert.equal(await LSAccess.tryCode("wrong-code"), false);
  assert.equal(await LSAccess.tryCode(" blue-mango2026 "), true); // case and spaces don't matter
  assert.equal(LSAccess.needed(), false);
  // same codes rebuilt -> same hashes, so nobody is asked again after an update
  execFileSync("node", ["build.mjs"], { cwd: root, env: { ...process.env, LIFESYNC_ACCESS_CODES: "Blue-Mango 2026, team-kite-81" }, stdio: "pipe" });
  assert.equal(fs.readFileSync(path.join(root, "dist/pages/access-config.js"), "utf8"), cfgText);
  execFileSync("node", ["build.mjs"], { cwd: root, env: { ...process.env, LIFESYNC_ACCESS_CODES: "" }, stdio: "pipe" });
});

test("codes on separate lines or in quotes each work on their own", async () => {
  const root = path.join(__dirname, "..");
  const out = execFileSync("node", ["build.mjs"], { cwd: root, env: { ...process.env, LIFESYNC_ACCESS_CODES: '"Blue-Mango-2026"\nteam-kite-81;  \'green-lotus-77\'' }, stdio: "pipe" }).toString();
  assert.match(out, /invite-only with 3 access code\(s\): b…6 \(15 chars\), t…1 \(12 chars\), g…7 \(14 chars\)/);
  const cfgText = fs.readFileSync(path.join(root, "dist/pages/access-config.js"), "utf8");
  const store = {};
  global.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = v) };
  new Function(cfgText)();
  for (const c of ["blue-mango-2026", "TEAM-KITE-81", " green-lotus-77 ", '"green-lotus-77"']) assert.equal(await LSAccess.tryCode(c), true, c);
  assert.equal(await LSAccess.tryCode("blue-mango-2026team-kite-81"), false);
  execFileSync("node", ["build.mjs"], { cwd: root, env: { ...process.env, LIFESYNC_ACCESS_CODES: "" }, stdio: "pipe" });
});
