// Keeps the in-app Help guide in step with the app. Runs before every publish.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const app = fs.readFileSync(path.join(root, "src/app.js"), "utf8");
const helpSrc = fs.readFileSync(path.join(root, "src/help.js"), "utf8");
global.self = global;
require("../src/help.js");
const H = global.LSHelp;
const decode = (s) => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
// Everything except the What's new history, which describes past versions on purpose.
const guide = H.sections.map((s) => s.title + " " + decode(s.body)).join("\n");

// Words and screen names the app no longer uses. When you rename or remove
// something, add the old name here so Help and the screens can't keep it.
const RETIRED = [
  { term: /Holidays & leave(?!,)/, why: "renamed to 'Holidays, leave & family'" },
  { term: /More → Family\b/, why: "the Family screen was removed; use Family time in Holidays, leave & family" },
  { term: /\bdaughters?\b/i, why: "the app no longer names a person; say 'family time'" },
  { term: /\bNext up\b/, why: "renamed to 'Upcoming journeys' / 'Action items'" },
  { term: /Most family time/, why: "the plan option is 'Most home time'" },
];

test("Help mentions only More tiles that exist in the app", () => {
  const tiles = [...app.matchAll(/\["[a-z]+", I\.[a-z]+, "([^"]+)"/g)].map((m) => m[1]);
  assert.ok(tiles.length >= 6, "couldn't read the More tiles from app.js");
  // Each "More → X" must start with a real tile name.
  const refs = [...guide.matchAll(/More → ([^\n]{0,60})/g)].map((m) => m[1]);
  const missing = refs.filter((r) => !tiles.some((t) => r.startsWith(t))).map((r) => r.slice(0, 30));
  assert.deepEqual(missing, [], `Help points to tiles that don't exist. Tiles are: ${tiles.join(" | ")}`);
});

test("Help and the app don't use retired names", () => {
  const problems = [];
  for (const r of RETIRED) {
    if (r.term.test(guide)) problems.push(`Help: ${r.term} (${r.why})`);
    // In app.js only check text shown to people: strings inside html`` templates.
    const shown = [...app.matchAll(/html`([\s\S]*?)`/g)].map((m) => m[1]).join("\n");
    if (r.term.test(shown)) problems.push(`App screens: ${r.term} (${r.why})`);
  }
  assert.deepEqual(problems, []);
});

test("every Help section has a title and body, and ids are unique", () => {
  const ids = H.sections.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const s of H.sections) assert.ok(s.title && decode(s.body).length > 40, s.id);
  assert.match(helpSrc, new RegExp(`version: "${JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version}"`));
});
