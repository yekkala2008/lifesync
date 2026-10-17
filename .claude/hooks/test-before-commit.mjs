// Claude Code hook: runs before Claude makes a git commit in this repo.
// If `npm test` fails, the commit is blocked (exit 2) and Claude sees why.
// Runs on Windows, macOS and Linux (plain Node, no shell tools needed).
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

let input = {};
try {
  input = JSON.parse(readFileSync(0, "utf8") || "{}");
} catch (e) {
  /* no input: run the tests anyway */
}
const cmd = String((input.tool_input && input.tool_input.command) || "");
// The settings only call this for `git commit`, but double-check so other git commands are never slowed down.
if (cmd && !/\bgit\b[\s\S]*\bcommit\b/.test(cmd)) process.exit(0);

const dir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const win = process.platform === "win32";
const r = spawnSync(win ? "npm.cmd" : "npm", ["test"], { cwd: dir, encoding: "utf8", shell: win });
if (r.status === 0) process.exit(0);

const out = `${r.stdout || ""}\n${r.stderr || ""}`;
const failed = out
  .split(/\r?\n/)
  .filter((l) => /^\s*(not ok|✖)/.test(l))
  .slice(0, 15)
  .join("\n");
process.stderr.write(
  "Commit blocked: npm test failed. Fix the failing tests, then commit again.\n" +
    (failed || out.slice(-1500) || String(r.error || "npm test could not run")) +
    "\n"
);
process.exit(2);
