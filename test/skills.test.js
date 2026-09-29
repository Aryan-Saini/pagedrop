import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { BUNDLE_DIR, MARKER, bundledSkills, installSkills, updateIfStale, writeState, bundleHash } from "../src/skills.js";

const tmp = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

/** A bundle of one skill, so a test can change it. */
function fakeBundle(text = "v1") {
  const dir = tmp("postplan-bundle-");
  fs.mkdirSync(path.join(dir, "demo"));
  fs.writeFileSync(path.join(dir, "demo", "SKILL.md"), text);
  return dir;
}

test("the package ships the four skills and nothing else", () => {
  assert.deepEqual(bundledSkills(), ["file-upload", "html-communication", "request-upload-link", "send-file-link"]);
});

test("install copies each skill with a marker, and replaces only what it installed", () => {
  const root = tmp("postplan-root-");
  fs.mkdirSync(path.join(root, "send-file-link"));
  fs.writeFileSync(path.join(root, "send-file-link", "SKILL.md"), "hand written");
  fs.symlinkSync(tmp("postplan-elsewhere-"), path.join(root, "file-upload"));

  const { installed, skipped } = installSkills({ roots: [root], version: "1.0.0" });
  assert.deepEqual(installed.map((d) => path.basename(d)), ["html-communication", "request-upload-link"]);
  assert.deepEqual(skipped.map((s) => path.basename(s.path)), ["file-upload", "send-file-link"]);
  assert.ok(fs.existsSync(path.join(root, "html-communication", MARKER)));
  assert.equal(fs.readFileSync(path.join(root, "send-file-link", "SKILL.md"), "utf8"), "hand written");

  const again = installSkills({ roots: [root], version: "1.0.1" });
  assert.equal(again.installed.length, 2, "its own folders are replaceable");
  const forced = installSkills({ roots: [root], version: "1.0.1", force: true });
  assert.equal(forced.installed.length, 4);
});

test("updateIfStale reinstalls only when the bundle changed", () => {
  const root = tmp("postplan-root-");
  const statePath = path.join(tmp("postplan-state-"), "skills.json");
  const bundleDir = fakeBundle("v1");
  assert.equal(updateIfStale({ statePath, version: "1", bundleDir }), null, "never installed");

  installSkills({ roots: [root], version: "1", bundleDir });
  writeState(statePath, { hash: bundleHash(bundleDir), version: "1", roots: [root] });
  assert.equal(updateIfStale({ statePath, version: "1", bundleDir }), null, "unchanged");

  fs.writeFileSync(path.join(bundleDir, "demo", "SKILL.md"), "v2");
  assert.deepEqual(updateIfStale({ statePath, version: "2", bundleDir }), [path.join(root, "demo", "SKILL.md")]);
  assert.equal(fs.readFileSync(path.join(root, "demo", "SKILL.md"), "utf8"), "v2");
  assert.equal(updateIfStale({ statePath, version: "2", bundleDir }), null, "recorded after updating");
});

test("any command refreshes stale skills and says so on stderr", async () => {
  const home = tmp("postplan-home-");
  const root = path.join(home, "skills");
  const run = (args) => promisify(execFile)("node", [path.resolve("bin/postplan.js"), ...args], {
    env: { ...process.env, HOME: home, POSTPLAN_NO_SKILL_UPDATE: "" }
  });
  await run(["skills", "install", "--dir", root]);
  const skill = path.join(root, "html-communication", "SKILL.md");
  fs.writeFileSync(skill, "stale");
  const state = path.join(home, ".postplan", "skills.json");
  fs.writeFileSync(state, JSON.stringify({ ...JSON.parse(fs.readFileSync(state, "utf8")), hash: "old" }));

  const { stdout, stderr } = await run(["render", path.join(tmp("postplan-doc-"), "missing.md")]).catch((e) => e);
  assert.equal(stdout, "");
  assert.match(stderr, /updated the installed skills/);
  assert.match(stderr, /Re-read the SKILL\.md/);
  assert.equal(fs.readFileSync(skill, "utf8"), fs.readFileSync(path.join(BUNDLE_DIR, "html-communication", "SKILL.md"), "utf8"));
});
