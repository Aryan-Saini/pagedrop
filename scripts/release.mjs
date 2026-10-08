#!/usr/bin/env node
/**
 * `pnpm release <patch|minor|major|x.y.z> [--otp=<code>]`
 *
 * Publishes one version of this repo under every name in NAMES. package.json
 * is `pagedrop`; the other names are made by packing once, unpacking a copy per
 * name and rewriting only `name` and `bin` in the copy. Every name ships the
 * same tarball contents and the repo never holds a second package.json, so the
 * packages cannot drift.
 *
 * Steps: check main is clean and equal to origin/main, run the tests, bump the
 * version, commit `chore(release): vX.Y.Z`, tag, push, then publish each name.
 * Rerunning with the version that is already in package.json skips the bump and
 * publishes only the names missing from the registry, so a publish that failed
 * halfway (EOTP, E403) is finished by running the same command again.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Every npm name this repo publishes under. The first is package.json's. */
const NAMES = ["pagedrop", "postplan-aryan"];

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const [bump, ...rest] = process.argv.slice(2);
const otp = rest.filter((arg) => arg.startsWith("--otp"));

if (!bump) fail("Usage: pnpm release <patch|minor|major|x.y.z> [--otp=<code>]");

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { cwd: root, encoding: "utf8", stdio: ["inherit", "pipe", "inherit"], ...opts }).trim();
const readPkg = () => JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

if (readPkg().name !== NAMES[0]) fail(`package.json name must be ${NAMES[0]}`);
if (run("git", ["status", "--porcelain"])) fail("Working tree is not clean.");
if (run("git", ["branch", "--show-current"]) !== "main") fail("Release from main.");
run("git", ["fetch", "origin", "main", "--tags"]);
if (run("git", ["rev-parse", "HEAD"]) !== run("git", ["rev-parse", "origin/main"])) {
  fail("main is not equal to origin/main. Pull or push first.");
}

let { version } = readPkg();
if (bump !== version) {
  run("npm", ["test"], { stdio: "inherit" });
  version = run("npm", ["version", bump, "--no-git-tag-version"]).replace(/^v/, "");
  run("git", ["commit", "-am", `chore(release): v${version}`]);
  run("git", ["tag", `v${version}`]);
  run("git", ["push", "origin", "main", `v${version}`], { stdio: "inherit" });
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pagedrop-release-"));
const tarball = path.join(tmp, run("npm", ["pack", "--pack-destination", tmp, "--silent"]).split("\n").pop());

for (const name of NAMES) {
  if (isPublished(name, version)) {
    console.log(`${name}@${version} is already on npm, skipping.`);
    continue;
  }
  const dir = path.join(tmp, name);
  fs.mkdirSync(dir);
  run("tar", ["-xzf", tarball, "-C", dir, "--strip-components=1"]);
  const pkgPath = path.join(dir, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const [binPath] = Object.values(pkg.bin);
  fs.writeFileSync(pkgPath, `${JSON.stringify({ ...pkg, name, bin: { [name]: binPath } }, null, 2)}\n`);
  run("npm", ["publish", ...otp], { cwd: dir, stdio: "inherit" });
  console.log(`Published ${name}@${version}`);
}

fs.rmSync(tmp, { recursive: true, force: true });

function isPublished(name, v) {
  try {
    return run("npm", ["view", `${name}@${v}`, "version"], { stdio: "pipe" }) === v;
  } catch {
    return false;
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
