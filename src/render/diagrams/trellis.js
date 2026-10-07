/**
 * `trellis` fence: an HMM / Viterbi lattice. States run down the side,
 * observations across the top, one node per (state, observation).
 *
 * Body:
 *   { title?, note?, compact?, states: string[], obs: string[], start?: string,
 *     scores?: number[][], path?: number[], transitions?: "all" | "path" }
 *
 * `scores[state][column]` prints inside the nodes (3 significant digits).
 * `path` gives one state index per column; its nodes and edges are drawn in the
 * span colour. `transitions: "all"` (the default) also draws every edge between
 * adjacent columns faintly; `"path"` draws only the path. `start` adds a start
 * node on the left with edges into the first column.
 *
 * @module render/diagrams/trellis
 */

import {
  Ctx, ptr, show, wantObject, wantArray, wantNumber, optionalString, optionalBoolean, optionalEnum,
  unknownKeys, tooMany,
} from "../schema/common.js";
import { mix } from "../charts.js";
import { INK, text, svgOpen, figure, bounds, textW, n } from "./svg.js";

/**
 * @typedef {{
 *   title: string, note: string, compact: boolean, states: string[], obs: string[], start: string,
 *   scores: number[][] | null, path: number[] | null, transitions: "all" | "path",
 * }} TrellisData
 */

const KEYS = ["title", "note", "compact", "states", "obs", "start", "scores", "path", "transitions"];
export const TRANSITIONS = /** @type {const} */ (["all", "path"]);
const MIN_STATES = 2, MAX_STATES = 8, MAX_OBS = 16, MAX_TEXT = 16;

/** A non-empty label of at most MAX_TEXT characters. */
function label(ctx, v, pointer, noun) {
  const article = /^[aeiou]/.test(noun) ? "an" : "a";
  if (typeof v !== "string" || v.trim() === "") return ctx.at(pointer, `expected ${article} ${noun}, got ${show(v)}`);
  if (v.length > MAX_TEXT) return ctx.at(pointer, `expected ${article} ${noun} of at most ${MAX_TEXT} characters, got ${v.length}`);
  return true;
}

/**
 * An array of labels with a count between `min` and `max`.
 * @returns {number} the count when valid, -1 otherwise
 */
function labels(ctx, v, pointer, min, max, noun) {
  if (tooMany(ctx, v, pointer, max, `${noun}s`) || !wantArray(ctx, v, pointer, `${min} to ${max} ${noun}s`)) return -1;
  if (v.length < min) {
    ctx.at(pointer, `expected ${min} to ${max} ${noun}s, got ${v.length}`);
    return -1;
  }
  let ok = true;
  v.forEach((s, i) => { if (!label(ctx, s, ptr(pointer, i), noun)) ok = false; });
  return ok ? v.length : -1;
}

/** Validate a `trellis` fence body. */
export function validate(errors, block, file) {
  const ctx = new Ctx(errors, file, block.line, "trellis");
  if (!wantObject(ctx, block.data, "", "an object { states, obs }")) return;
  const body = /** @type {Record<string, unknown>} */ (block.data);
  optionalString(ctx, body.title, "/title");
  optionalString(ctx, body.note, "/note");
  optionalBoolean(ctx, body.compact, "/compact");
  optionalEnum(ctx, body.transitions, "/transitions", TRANSITIONS);
  if (body.start !== undefined) label(ctx, body.start, "/start", "start label");
  unknownKeys(ctx, body, "", KEYS);

  const S = labels(ctx, body.states, "/states", MIN_STATES, MAX_STATES, "state");
  const T = labels(ctx, body.obs, "/obs", 1, MAX_OBS, "observation");

  if (body.transitions === "path" && body.path === undefined) {
    ctx.at("/transitions", `"path" draws only the best path, so it needs a path`);
  }

  const { scores, path } = body;
  if (scores !== undefined && !tooMany(ctx, scores, "/scores", MAX_STATES, "rows") &&
    wantArray(ctx, scores, "/scores", "a states x obs matrix of numbers")) {
    if (S > 0 && scores.length !== S) ctx.at("/scores", `expected ${S} rows to match /states, got ${scores.length}`);
    scores.forEach((row, i) => {
      const rp = ptr("", "scores", i);
      if (tooMany(ctx, row, rp, MAX_OBS, "scores") || !wantArray(ctx, row, rp, "a row of numbers, one per observation")) return;
      if (T > 0 && row.length !== T) {
        ctx.at(rp, `expected ${T} numbers to match /obs, got ${row.length}`);
        return;
      }
      row.forEach((v, t) => wantNumber(ctx, v, ptr(rp, t)));
    });
  }

  if (path !== undefined && !tooMany(ctx, path, "/path", MAX_OBS, "steps") &&
    wantArray(ctx, path, "/path", "one state index per observation")) {
    if (T > 0 && path.length !== T) ctx.at("/path", `expected ${T} state indices to match /obs, got ${path.length}`);
    path.forEach((v, t) => {
      if (Number.isInteger(v) && (S < 0 || (/** @type {number} */ (v) >= 0 && /** @type {number} */ (v) < S))) return;
      ctx.at(ptr("", "path", t), S > 0
        ? `expected a state index from 0 to ${S - 1}, got ${show(v)}`
        : `expected a state index, got ${show(v)}`);
    });
  }
}

/**
 * Fill defaults on a validated body.
 * @returns {TrellisData}
 */
export function normalize(data) {
  return {
    title: data.title ?? "",
    note: data.note ?? "",
    compact: data.compact ?? false,
    states: data.states,
    obs: data.obs,
    start: data.start ?? "",
    scores: data.scores ?? null,
    path: data.path ?? null,
    transitions: data.transitions ?? "all",
  };
}

/**
 * A score in at most 3 significant digits: `0.0384`, `12.3`, `-4.1e-5`.
 * @param {number} v
 */
export function formatScore(v) {
  const a = Math.abs(v);
  if (a === 0) return "0";
  if (a >= 1e-3 && a < 1e5) return String(Number(v.toPrecision(3)));
  const [m, e] = v.toExponential(2).split("e");
  return `${Number(m)}e${Number(e)}`;
}

const SCORE_SIZE = 10.5, OBS_SIZE = 12.5, STATE_SIZE = 12;

/** Render a validated, normalized `trellis` block. */
export function render(block) {
  const d = /** @type {TrellisData} */ (block.data);
  const S = d.states.length, T = d.obs.length;
  const span = INK.span;

  /** @type {string[][] | null} */
  const shown = d.scores ? d.scores.map((row) => row.map(formatScore)) : null;
  let scoreW = 0;
  if (shown) for (const row of shown) for (const s of row) scoreW = Math.max(scoreW, textW(s, SCORE_SIZE, true));
  const r = shown ? Math.max(15, scoreW / 2 + 5) : 11;
  let obsW = 0;
  for (const o of d.obs) obsW = Math.max(obsW, textW(o, OBS_SIZE, true));
  const gx = Math.max(shown ? 88 : 64, obsW + 16, 2 * r + 44);
  const gy = Math.max(shown ? 52 : 40, 2 * r + 18);
  const X = (t) => t * gx, Y = (i) => i * gy;
  const on = (t, i) => d.path !== null && d.path[t] === i;

  /** A line between two nodes (or the start dot), trimmed to the circles. */
  const seg = (ax, ay, ar, bx, by) => {
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
    return `<line x1="${n(ax + dx / len * ar)}" y1="${n(ay + dy / len * ar)}" x2="${n(bx - dx / len * r)}" y2="${n(by - dy / len * r)}"/>`;
  };

  const sx = -(r + 48), sy = Y((S - 1) / 2);
  let faint = "", strong = "";
  for (let t = 0; t < T - 1; t++) {
    for (let i = 0; i < S; i++) {
      for (let j = 0; j < S; j++) {
        const hit = on(t, i) && on(t + 1, j);
        if (!hit && d.transitions === "path") continue;
        const line = seg(X(t), Y(i), r, X(t + 1), Y(j));
        if (hit) strong += line; else faint += line;
      }
    }
  }
  if (d.start) {
    for (let i = 0; i < S; i++) {
      if (on(0, i)) strong += seg(sx, sy, 5, X(0), Y(i));
      else if (d.transitions === "all") faint += seg(sx, sy, 5, X(0), Y(i));
    }
  }
  let body = "";
  if (faint) body += `<g stroke="${INK.line}" stroke-width="1">${faint}</g>`;
  if (strong) body += `<g stroke="${span}" stroke-width="2.6" stroke-linecap="round">${strong}</g>`;

  for (let t = 0; t < T; t++) {
    body += text(X(t), -r - 12, d.obs[t], { cls: "node-label", mono: true, size: OBS_SIZE });
    for (let i = 0; i < S; i++) {
      const hit = on(t, i);
      body += `<circle cx="${n(X(t))}" cy="${n(Y(i))}" r="${n(r)}" fill="${hit ? mix(span, 0.22) : INK.fill}" ` +
        `stroke="${hit ? span : INK.rule}" stroke-width="${hit ? 2 : 1.3}"/>`;
      if (shown) body += text(X(t), Y(i) + 3.8, shown[i][t], { mono: true, size: SCORE_SIZE, halo: false, weight: hit ? 600 : undefined });
    }
  }

  // The start label sits left of its dot, so state names move out past it.
  let stateRight = -r - 12;
  if (d.start) {
    const w = textW(d.start, 11);
    body += `<circle cx="${n(sx)}" cy="${n(sy)}" r="5" fill="${d.path ? span : INK.bright}"/>`;
    body += text(sx - 9, sy + 4, d.start, { size: 11, anchor: "end" });
    stateRight = sx - 9 - w - 16;
  }
  let stateW = 0;
  d.states.forEach((s, i) => {
    stateW = Math.max(stateW, textW(s, STATE_SIZE, true));
    body += text(stateRight, Y(i) + 4, s, { mono: true, size: STATE_SIZE, anchor: "end" });
  });

  const box = bounds([
    { x0: stateRight - stateW, y0: -r - 28, x1: X(T - 1) + Math.max(r, obsW / 2), y1: Y(S - 1) + r },
  ], 8);
  const aria = d.title || `trellis over ${S} states and ${T} observations`;
  return figure(svgOpen(box, { label: aria, compact: d.compact, scroll: true }) + body + "</svg>", d.title, d.note);
}
