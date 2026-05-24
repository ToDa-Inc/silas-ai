#!/usr/bin/env node
/**
 * check-remotion-spec-drift.js
 *
 * Until the Remotion spec is promoted to a proper workspace package (see
 * silas-content-system/docs/remotion-spec-shared.md), the Next.js Player and
 * the Remotion CLI render must hand-sync their copies of remotion-spec/.
 * Any drift here makes the preview lie about what the rendered MP4 will
 * actually look like, which is one of the highest-impact UX bugs we can
 * ship.
 *
 * This script fails (non-zero exit) when:
 *   1. A file exists in one tree but not the other.
 *   2. A shared file differs except for the documented "mirror" comment on
 *      line 2 (which is allowed to point at the *other* directory).
 *
 * Wire as a pre-commit hook or CI step:
 *     node scripts/check-remotion-spec-drift.js
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PLAYER_DIR = path.join(ROOT, "content-machine/src/remotion-spec");
const CLI_DIR = path.join(ROOT, "video-production/broll-caption-editor/src/remotion-spec");

const IGNORED_FILES = new Set([
  // Tests live with the Player tree only — CLI doesn't ship a test runner.
  "activeLayers.test.ts",
]);

function listFiles(dir, prefix = "") {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.join(prefix, entry.name);
    if (IGNORED_FILES.has(entry.name)) continue;
    if (entry.isDirectory()) {
      out.push(...listFiles(path.join(dir, entry.name), rel));
    } else if (entry.isFile()) {
      out.push(rel);
    }
  }
  return out.sort();
}

function readNormalized(p) {
  // The mirror comment on line 2 intentionally differs per file (each points
  // at its sibling). Strip a single ``/* Mirror: ... */`` comment so the
  // rest of the file is compared byte-exact.
  const raw = fs.readFileSync(p, "utf8");
  return raw.replace(/^\/\* Mirror:[^*]*\*\/\s*\n/m, "");
}

function main() {
  if (!fs.existsSync(PLAYER_DIR) || !fs.existsSync(CLI_DIR)) {
    console.error("remotion-spec drift checker: one of the directories is missing.");
    console.error("  Player:", PLAYER_DIR);
    console.error("  CLI:   ", CLI_DIR);
    process.exit(2);
  }

  const playerFiles = new Set(listFiles(PLAYER_DIR));
  const cliFiles = new Set(listFiles(CLI_DIR));

  const errors = [];

  for (const f of playerFiles) {
    if (!cliFiles.has(f)) errors.push(`missing in CLI:   ${f}`);
  }
  for (const f of cliFiles) {
    if (!playerFiles.has(f)) errors.push(`missing in Player: ${f}`);
  }

  for (const f of playerFiles) {
    if (!cliFiles.has(f)) continue;
    const a = readNormalized(path.join(PLAYER_DIR, f));
    const b = readNormalized(path.join(CLI_DIR, f));
    if (a !== b) errors.push(`drift: ${f}`);
  }

  if (errors.length > 0) {
    console.error("remotion-spec drift detected:");
    for (const e of errors) console.error("  -", e);
    console.error("");
    console.error("Fix: bring both trees back in sync, or promote remotion-spec");
    console.error("to a workspace package (see docs/remotion-spec-shared.md).");
    process.exit(1);
  }

  console.log("remotion-spec: Player and CLI trees are in sync.");
}

main();
