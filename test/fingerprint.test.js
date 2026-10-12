// Guard: changing how "plan may be out of date" is calculated must bump
// FP_VERSION in src/engine.js, so saved plans are re-checked after an update
// instead of all being flagged. If this fails: bump FP_VERSION, then put the
// printed hash next to the new version below.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const E = require("../src/engine.js");

const KNOWN = { 3: "0791023e2797f5e9" };

test("fingerprint calculation changes come with an FP_VERSION bump", () => {
  const s = fs.readFileSync(path.join(__dirname, "../src/engine.js"), "utf8");
  const a = s.indexOf("  function inputsFingerprint(");
  const b = s.indexOf("  /** Before/after summary", a);
  const hash = crypto.createHash("sha256").update(s.slice(a, b).replace(/\s+/g, " ")).digest("hex").slice(0, 16);
  assert.equal(KNOWN[E.FP_VERSION], hash, `inputsFingerprint changed. Bump FP_VERSION (now ${E.FP_VERSION}) and add { ${E.FP_VERSION + 1}: "${hash}" } to KNOWN.`);
});
