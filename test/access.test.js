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
