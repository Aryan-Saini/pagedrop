/**
 * The agent skills shipped in this package's `skills/` folder, and how they get
 * into an agent's skills directory and stay current.
 *
 * `postplan skills install` copies every bundled skill into each root and
 * records what it installed in `~/.postplan/skills.json`. Every later command
 * compares that record against the bundle it is running from (a content hash),
 * and on a mismatch reinstalls into the same roots. Skills always run the CLI
 * as `npx postplan-aryan@latest`, so a new release reaches the installed
 * SKILL.md files the next time any skill is used.
 *
 * A folder is only ever replaced if this installer wrote it (it holds the
 * marker file). Symlinks and hand-maintained skills of the same name are
 * skipped unless `force` is set.
 *
 * @module skills
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const BUNDLE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "skills");
export const MARKER = ".postplan-skill";

/** @typedef {{ hash: string, version: string, roots: string[] }} SkillsState */

/** Every file of every bundled skill, as `[relative path, absolute path]`, sorted. */
function bundleFiles(bundleDir = BUNDLE_DIR) {
  /** @type {[string, string][]} */
  const out = [];
  const walk = (dir, rel) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      const r = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(abs, r);
      else if (entry.isFile()) out.push([r, abs]);
    }
  };
  walk(bundleDir, "");
  return out.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

/** The bundled skill names: each top-level folder with a SKILL.md. */
export function bundledSkills(bundleDir = BUNDLE_DIR) {
  return fs
    .readdirSync(bundleDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(bundleDir, e.name, "SKILL.md")))
    .map((e) => e.name)
    .sort();
}

/** A hash of the bundle's paths and contents, so a release that changes no skill triggers no update. */
export function bundleHash(bundleDir = BUNDLE_DIR) {
  const hash = createHash("sha256");
  for (const [rel, abs] of bundleFiles(bundleDir)) hash.update(rel).update("\0").update(fs.readFileSync(abs)).update("\0");
  return hash.digest("hex");
}

/**
 * Where skills go when no `--dir` is given: `~/.claude/skills` for Claude Code
 * and `~/.agents/skills` for Codex and other harnesses that read it, each only
 * when that harness's home folder exists. With neither, `~/.agents/skills`.
 */
export function defaultRoots(home = os.homedir()) {
  const roots = [];
  if (fs.existsSync(path.join(home, ".claude"))) roots.push(path.join(home, ".claude", "skills"));
  if (fs.existsSync(path.join(home, ".agents")) || fs.existsSync(path.join(home, ".codex"))) {
    roots.push(path.join(home, ".agents", "skills"));
  }
  return roots.length ? roots : [path.join(home, ".agents", "skills")];
}

/**
 * Copy every bundled skill into each root.
 *
 * @param {{ roots: string[], version: string, force?: boolean, bundleDir?: string }} options
 * @returns {{ installed: string[], skipped: { path: string, reason: string }[] }}
 */
export function installSkills({ roots, version, force = false, bundleDir = BUNDLE_DIR }) {
  const installed = [];
  const skipped = [];
  for (const root of roots) {
    for (const name of bundledSkills(bundleDir)) {
      const dest = path.join(root, name);
      const stat = fs.lstatSync(dest, { throwIfNoEntry: false });
      if (stat && !force) {
        if (stat.isSymbolicLink()) {
          skipped.push({ path: dest, reason: "is a symlink" });
          continue;
        }
        if (!fs.existsSync(path.join(dest, MARKER))) {
          skipped.push({ path: dest, reason: "was not installed by postplan (use --force to replace it)" });
          continue;
        }
      }
      fs.rmSync(dest, { recursive: true, force: true });
      fs.cpSync(path.join(bundleDir, name), dest, { recursive: true });
      fs.writeFileSync(path.join(dest, MARKER), `Installed by postplan-aryan ${version}. Replaced on update.\n`);
      installed.push(dest);
    }
  }
  return { installed, skipped };
}

/** @returns {SkillsState | null} */
export function readState(statePath) {
  try {
    const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    return typeof state?.hash === "string" && Array.isArray(state.roots) ? state : null;
  } catch {
    return null;
  }
}

/** @param {string} statePath @param {SkillsState} state */
export function writeState(statePath, state) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

/**
 * Reinstall into the recorded roots when the bundle changed since the last
 * install. Returns the SKILL.md paths that were refreshed, or null when nothing
 * was installed before or nothing changed.
 *
 * @param {{ statePath: string, version: string, bundleDir?: string }} options
 */
export function updateIfStale({ statePath, version, bundleDir = BUNDLE_DIR }) {
  const state = readState(statePath);
  if (!state) return null;
  const hash = bundleHash(bundleDir);
  if (state.hash === hash) return null;
  const { installed } = installSkills({ roots: state.roots, version, bundleDir });
  writeState(statePath, { hash, version, roots: state.roots });
  return installed.map((dir) => path.join(dir, "SKILL.md"));
}
