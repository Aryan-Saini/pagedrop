/**
 * `tokens` fence: NLP drawn over a row of tokens.
 *
 * One row of mono token boxes, with everything else optional:
 *   arcs   dependency arcs above the row, arrowhead at the dependent (`to`), label on the arch
 *   root   a vertical arrow from above into one token
 *   weights  arcs become attention links: no arrowheads, width and opacity carry `weight`
 *   spans  brackets under the row (subword pieces merging into a word)
 *   tags   aligned rows under the row; a BIO row (B-X, I-X, O) draws a coloured bar per entity
 *
 * Alignment mode swaps `tokens` for exactly two `rows` and draws weighted `links` between them.
 *
 * Layout is computed: boxes are sized from their text, arc anchors are spread across each token
 * so arcs that share a token never share a leg, gaps widen until every arc and span label fits,
 * and arc heights come from a level assignment by span length (shorter spans lower, overlapping
 * arcs stacked one level up).
 *
 * @module render/diagrams/tokens
 */

import {
  Ctx, ptr, show, wantObject, wantArray, wantNonEmptyArray, wantNumber, wantString, wantText,
  optionalString, optionalBoolean, optionalEnum, unknownKeys, tooMany,
} from "../schema/common.js";
import { INK, DIAGRAM_TONES, inkOf, markers, n, text, svgOpen, figure, bounds, textW } from "./svg.js";

/**
 * @typedef {{ from: number, to: number, label?: string, tone?: string, weight?: number }} Arc
 * @typedef {{ from: number, to: number, label?: string, tone?: string }} Span
 * @typedef {{ name?: string, tokens: string[] }} Row
 * @typedef {{
 *   title: string, note: string, compact: boolean, weights: boolean,
 *   tokens?: string[], root?: number, arcs: Arc[], tags: Record<string, string[]>, spans: Span[],
 *   rows?: [Row, Row], links: ([number, number] | [number, number, number])[],
 * }} TokensBody
 */

const KEYS = ["title", "note", "compact", "tokens", "arcs", "root", "weights", "tags", "spans", "rows", "links"];
const ARC_KEYS = ["from", "to", "label", "tone", "weight"];
const SPAN_KEYS = ["from", "to", "label", "tone"];
const ROW_ONLY = ["arcs", "root", "weights", "tags", "spans"];

const MAX_TOKENS = 64, MAX_ARCS = 128, MAX_SPANS = 64, MAX_TAG_ROWS = 6, MAX_LINKS = 512, MAX_TYPES = 8;
const MAX_TOKEN_LEN = 40, MAX_LABEL_LEN = 40, MAX_TAG_LEN = 24;

/** A BIO tag: `B-PER`, `I-ORG`. The capture is the entity type. */
const BIO = /^[BI]-(.+)$/;

/* ------------------------------------------------------------------ validation */

/** Optional string of at most `max` characters. */
function optionalLabel(ctx, v, pointer, max = MAX_LABEL_LEN) {
  if (v === undefined) return true;
  if (!wantString(ctx, v, pointer)) return false;
  if (v.length > max) return ctx.at(pointer, `expected at most ${max} characters, got ${v.length}`);
  return true;
}

/** An integer index into a row of `count` tokens. `into` names the row in the message. */
function wantIndex(ctx, v, pointer, count, into = "") {
  if (Number.isInteger(v) && v >= 0 && v < count) return true;
  return ctx.at(pointer, `expected a token index${into} from 0 to ${count - 1}, got ${show(v)}`);
}

/** A weight in 0..1. */
function wantUnit(ctx, v, pointer) {
  if (!wantNumber(ctx, v, pointer)) return false;
  if (v >= 0 && v <= 1) return true;
  return ctx.at(pointer, `expected a weight from 0 to 1, got ${show(v)}`);
}

/**
 * A row of token strings. Returns its length when the array itself is usable for index
 * checks (elements may still be bad), or -1 when it is not.
 */
function tokenRow(ctx, v, pointer) {
  if (tooMany(ctx, v, pointer, MAX_TOKENS, "tokens")) return -1;
  if (!wantNonEmptyArray(ctx, v, pointer, "an array of token strings")) return -1;
  /** @type {unknown[]} */ (v).forEach((t, i) => {
    const p = ptr(pointer, i);
    if (!wantText(ctx, t, p, "a token string")) return;
    if (/** @type {string} */ (t).length > MAX_TOKEN_LEN) ctx.at(p, `expected at most ${MAX_TOKEN_LEN} characters, got ${/** @type {string} */ (t).length}`);
  });
  return /** @type {unknown[]} */ (v).length;
}

/** True when a tag row is BIO: every tag is B-X, I-X, O or empty, and at least one is B-X or I-X. */
export function isBio(/** @type {unknown[]} */ row) {
  let any = false;
  for (const v of row) {
    if (typeof v !== "string") return false;
    if (BIO.test(v)) any = true;
    else if (v !== "O" && v !== "") return false;
  }
  return any;
}

/** `from`/`to` pair on an arc or span; returns true when both are valid indices. */
function endpoints(ctx, o, p, count) {
  const a = wantIndex(ctx, o.from, ptr(p, "from"), count);
  const b = wantIndex(ctx, o.to, ptr(p, "to"), count);
  return a && b;
}

/** Validate a `tokens` fence body. */
export function validate(errors, block, file) {
  const ctx = new Ctx(errors, file, block.line, "tokens");
  if (!wantObject(ctx, block.data, "", "an object { tokens } or { rows, links }")) return;
  const body = /** @type {Record<string, unknown>} */ (block.data);

  optionalString(ctx, body.title, "/title");
  optionalString(ctx, body.note, "/note");
  optionalBoolean(ctx, body.compact, "/compact");
  unknownKeys(ctx, body, "", KEYS);

  if (body.tokens !== undefined && body.rows !== undefined) {
    ctx.at("", "expected tokens or rows, not both; rows is the two-row alignment mode");
    return;
  }
  if (body.rows !== undefined) {
    validateAlignment(ctx, body);
    return;
  }
  if (body.links !== undefined) ctx.at("/links", "links need rows (alignment mode); a single row uses arcs");
  optionalBoolean(ctx, body.weights, "/weights");

  const count = tokenRow(ctx, body.tokens, "/tokens");
  if (count < 0) return;
  const weights = body.weights === true;

  if (body.root !== undefined) wantIndex(ctx, body.root, "/root", count);

  if (!tooMany(ctx, body.arcs, "/arcs", MAX_ARCS, "arcs") && body.arcs !== undefined &&
      wantArray(ctx, body.arcs, "/arcs", "an array of arcs { from, to, label }")) {
    /** @type {unknown[]} */ (body.arcs).forEach((a, i) => {
      const p = ptr("/arcs", i);
      if (!wantObject(ctx, a, p, "an arc { from, to, label }")) return;
      unknownKeys(ctx, a, p, ARC_KEYS);
      if (endpoints(ctx, a, p, count) && a.from === a.to) {
        ctx.at(p, `expected two different tokens, got from and to both ${a.from}`);
      }
      optionalLabel(ctx, a.label, ptr(p, "label"));
      optionalEnum(ctx, a.tone, ptr(p, "tone"), DIAGRAM_TONES);
      if (weights) {
        if (a.weight === undefined) ctx.at(ptr(p, "weight"), "expected a weight from 0 to 1 (weights is true), got nothing");
        else wantUnit(ctx, a.weight, ptr(p, "weight"));
      } else if (a.weight !== undefined) {
        ctx.at(ptr(p, "weight"), 'a weight needs "weights": true on the fence');
      }
    });
  }

  if (!tooMany(ctx, body.spans, "/spans", MAX_SPANS, "spans") && body.spans !== undefined &&
      wantArray(ctx, body.spans, "/spans", "an array of spans { from, to, label }")) {
    /** @type {unknown[]} */ (body.spans).forEach((s, i) => {
      const p = ptr("/spans", i);
      if (!wantObject(ctx, s, p, "a span { from, to, label }")) return;
      unknownKeys(ctx, s, p, SPAN_KEYS);
      if (endpoints(ctx, s, p, count) && s.from > s.to) {
        ctx.at(p, `expected from <= to, got from ${s.from} and to ${s.to}`);
      }
      optionalLabel(ctx, s.label, ptr(p, "label"));
      optionalEnum(ctx, s.tone, ptr(p, "tone"), DIAGRAM_TONES);
    });
  }

  if (body.tags !== undefined && wantObject(ctx, body.tags, "/tags", 'an object of tag rows, e.g. {"POS": [...]}')) {
    const tags = /** @type {Record<string, unknown>} */ (body.tags);
    const names = Object.keys(tags);
    if (names.length > MAX_TAG_ROWS) {
      ctx.at("/tags", `expected at most ${MAX_TAG_ROWS} tag rows, got ${names.length}`);
      return;
    }
    /** @type {Set<string>} */ const types = new Set();
    for (const name of names) {
      const p = ptr("/tags", name);
      if (name.trim() === "" || name.length > MAX_TAG_LEN) {
        ctx.at(p, `expected a row name of 1 to ${MAX_TAG_LEN} characters, got ${show(name)}`);
      }
      const row = tags[name];
      if (!wantArray(ctx, row, p, `${count} tags to match tokens`)) continue;
      if (row.length !== count) {
        ctx.at(p, `expected ${count} tags to match tokens, got ${row.length}`);
        continue;
      }
      row.forEach((v, i) => { if (wantString(ctx, v, ptr(p, i))) optionalLabel(ctx, v, ptr(p, i), MAX_TAG_LEN); });
      if (isBio(row)) for (const v of row) types.add(BIO.exec(/** @type {string} */ (v))?.[1] ?? "");
    }
    types.delete("");
    if (types.size > MAX_TYPES) {
      ctx.at("/tags", `expected at most ${MAX_TYPES} entity types across BIO rows, got ${types.size}: ${[...types].join(" ")}`);
    }
  }
}

/** Alignment mode: exactly two rows of tokens and `[i, j, weight]` links between them. */
function validateAlignment(ctx, body) {
  for (const key of ROW_ONLY) {
    if (body[key] !== undefined) ctx.at(ptr("", key), `${key} needs tokens; rows (alignment mode) takes rows and links only`);
  }
  if (!wantArray(ctx, body.rows, "/rows", "exactly 2 rows [{ name, tokens }]")) return;
  const rows = /** @type {unknown[]} */ (body.rows);
  if (rows.length !== 2) {
    ctx.at("/rows", `expected exactly 2 rows [{ name, tokens }], got ${rows.length}`);
    return;
  }
  const counts = rows.map((r, i) => {
    const p = ptr("/rows", i);
    if (!wantObject(ctx, r, p, "a row { name, tokens }")) return -1;
    unknownKeys(ctx, r, p, ["name", "tokens"]);
    optionalLabel(ctx, r.name, ptr(p, "name"), MAX_TAG_LEN);
    return tokenRow(ctx, r.tokens, ptr(p, "tokens"));
  });
  if (body.links === undefined) return;
  if (tooMany(ctx, body.links, "/links", MAX_LINKS, "links")) return;
  if (!wantArray(ctx, body.links, "/links", "an array of links [i, j, weight]")) return;
  /** @type {unknown[]} */ (body.links).forEach((l, k) => {
    const p = ptr("/links", k);
    if (!Array.isArray(l) || (l.length !== 2 && l.length !== 3)) {
      ctx.at(p, `expected a link [i, j, weight] from rows/0 token i to rows/1 token j, got ${show(l)}`);
      return;
    }
    if (counts[0] > 0) wantIndex(ctx, l[0], ptr(p, 0), counts[0], " into rows/0");
    if (counts[1] > 0) wantIndex(ctx, l[1], ptr(p, 1), counts[1], " into rows/1");
    if (l.length === 3) wantUnit(ctx, l[2], ptr(p, 2));
  });
}

/** Fill defaults on a validated body. */
export function normalize(data) {
  return { title: "", note: "", compact: false, weights: false, arcs: [], tags: {}, spans: [], links: [], ...data };
}

/* ------------------------------------------------------------------ layout */

const FS = 13;        // token text size
const PADX = 9;       // text inset inside a token box
const H = 28;         // token box height
const GAP = 10;       // minimum gap between token boxes
const SLOT = 10;      // minimum spacing between arc anchors on one token
const R = 5;          // arch corner radius
const BASE = 22;      // level 1 arch height above the row
const STEP = 18;      // extra height per level
const LABEL = 11;     // arc and span label size (mono)
const TAG = 11.5;     // tag text size (mono)

/**
 * Arc levels: process arcs by span length (shorter first) and put each one level above
 * every placed arc it overlaps. Arcs that only share an end token sit side by side, since
 * their anchors are spread across that token. Deterministic for a given arc list.
 * @param {{ lo: number, hi: number, i: number }[]} arcs
 * @returns {number[]} level per arc, in input order, starting at 1
 */
export function arcLevels(arcs) {
  const order = [...arcs].sort((a, b) => (a.hi - a.lo) - (b.hi - b.lo) || a.lo - b.lo || a.i - b.i);
  /** @type {number[]} */ const level = new Array(arcs.length).fill(1);
  /** @type {typeof arcs} */ const placed = [];
  for (const a of order) {
    let l = 1;
    for (const b of placed) if (b.lo < a.hi && a.lo < b.hi && level[b.i] >= l) l = level[b.i] + 1;
    level[a.i] = l;
    placed.push(a);
  }
  return level;
}

/** Entities in a BIO row: B-X opens one, I-X continues a run of the same type, anything else closes it. */
export function entities(/** @type {string[]} */ row) {
  /** @type {{ lo: number, hi: number, type: string }[]} */ const out = [];
  row.forEach((v, i) => {
    const m = BIO.exec(v);
    if (!m) return;
    const last = out.at(-1);
    if (v[0] === "I" && last && last.hi === i - 1 && last.type === m[1]) last.hi = i;
    else out.push({ lo: i, hi: i, type: m[1] });
  });
  return out;
}

/** Stroke width and opacity for a weight in 0..1. */
const weightStroke = (w) => ({ width: 0.8 + 3.2 * w, opacity: 0.25 + 0.75 * w });

/** A token box with its text. */
function box(x, y, w, t) {
  return `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${H}" rx="5" fill="${INK.fill}" stroke="${INK.box}" stroke-width="1.4"/>` +
    text(x + w / 2, y + H / 2 + 4.5, t, { cls: "node-label", mono: true, size: FS });
}


/** An arc label centred on an arch top at height `y`, on a black plate that cuts the line behind it. */
function arcLabel(x, y, t) {
  const w = textW(t, LABEL, true) + 6;
  return `<rect x="${n(x - w / 2)}" y="${n(y - 6.5)}" width="${n(w)}" height="13" fill="#000"/>` +
    text(x, y + 3.8, t, { mono: true, size: LABEL });
}

/** Render a validated, normalized `tokens` block. */
export function render(block) {
  const d = /** @type {TokensBody} */ (block.data);
  return d.rows ? renderAlignment(d) : renderRow(d);
}

/** Single-row mode: arcs above, spans and tag rows below. */
function renderRow(/** @type {TokensBody} */ d) {
  const toks = /** @type {string[]} */ (d.tokens);
  const N = toks.length;
  const mk = markers();

  // Arcs with their token range and anchor fraction on each end token.
  const arcs = d.arcs.map((a, i) => ({
    ...a, i, lo: Math.min(a.from, a.to), hi: Math.max(a.from, a.to), label: a.label ?? "", fLo: 0.5, fHi: 0.5, level: 1,
  }));
  /** @type {number[]} */ const anchors = new Array(N).fill(1);
  let rootFrac = 0.5;
  if (!d.weights) {
    // Per token, left to right: arcs to the left (short to long), the root arrow, arcs to the
    // right (long to short). That order keeps nested arcs from crossing each other's legs.
    /** @type {{ left: typeof arcs, right: typeof arcs }[]} */
    const at = Array.from({ length: N }, () => ({ left: [], right: [] }));
    for (const a of arcs) { at[a.lo].right.push(a); at[a.hi].left.push(a); }
    at.forEach(({ left, right }, t) => {
      const bySpan = (a, b) => (a.hi - a.lo) - (b.hi - b.lo) || a.i - b.i;
      const slots = [...left.sort(bySpan), ...(d.root === t ? ["root"] : []), ...right.sort(bySpan).reverse()];
      anchors[t] = slots.length;
      slots.forEach((s, k) => {
        const f = (k + 1) / (slots.length + 1);
        if (s === "root") rootFrac = f;
        else if (left.includes(s)) s.fHi = f;
        else s.fLo = f;
      });
    });
  }

  // BIO rows become entity bars; colours go to entity types by first appearance.
  const tagRows = Object.entries(d.tags).map(([name, values]) => ({ name, values, ents: isBio(values) ? entities(values) : null }));
  /** @type {Map<string, string>} */ const typeInk = new Map();
  for (const r of tagRows) for (const e of r.ents ?? []) if (!typeInk.has(e.type)) typeInk.set(e.type, inkOf(`c${typeInk.size + 1}`, INK.bright));

  // Column widths: token text, arc anchors, plain tags and single-token labels below.
  const w = toks.map((t, i) => {
    let v = Math.max(textW(t, FS, true) + 2 * PADX, (anchors[i] + 1) * SLOT);
    for (const r of tagRows) if (!r.ents) v = Math.max(v, textW(r.values[i], TAG, true) + 8);
    return v;
  });
  /** @type {{ lo: number, hi: number, need: number }[]} */ const below = [];
  for (const s of d.spans) if (s.label) below.push({ lo: s.from, hi: s.to, need: textW(s.label, LABEL + 0.5) + 8 });
  for (const r of tagRows) for (const e of r.ents ?? []) below.push({ lo: e.lo, hi: e.hi, need: textW(e.type, TAG, true) + 8 });
  for (const b of below) if (b.lo === b.hi) w[b.lo] = Math.max(w[b.lo], b.need);

  // Gaps widen until every arc label fits on its arch top and every multi-token label under its range.
  const gap = new Array(Math.max(0, N - 1)).fill(GAP);
  const widen = (lo, hi, have, need) => {
    for (let k = lo; k < hi; k++) have += gap[k];
    if (have < need) for (let k = lo; k < hi; k++) gap[k] += (need - have) / (hi - lo);
  };
  const inner = (lo, hi) => { let s = 0; for (let k = lo + 1; k < hi; k++) s += w[k]; return s; };
  const bySpanThenLo = (a, b) => (a.hi - a.lo) - (b.hi - b.lo) || a.lo - b.lo;
  for (const a of [...arcs].sort(bySpanThenLo)) {
    if (a.label) widen(a.lo, a.hi, (1 - a.fLo) * w[a.lo] + a.fHi * w[a.hi] + inner(a.lo, a.hi), textW(a.label, LABEL, true) + 2 * R + 12);
  }
  for (const b of below.sort(bySpanThenLo)) if (b.lo < b.hi) widen(b.lo, b.hi, w[b.lo] + w[b.hi] + inner(b.lo, b.hi), b.need);

  /** @type {number[]} */ const left = [];
  let x = 0;
  toks.forEach((_, i) => { left.push(x); x += w[i] + (gap[i] ?? 0); });
  const right = left[N - 1] + w[N - 1];
  const cx = (i) => left[i] + w[i] / 2;
  const ax = (i, f) => left[i] + f * w[i];

  /** @type {{ x0: number, y0: number, x1: number, y1: number }[]} */
  const rects = [{ x0: 0, y0: 0, x1: right, y1: H }];
  let body = "";

  // Arcs above the row.
  const levels = arcLevels(arcs);
  arcs.forEach((a, i) => { a.level = levels[i]; });
  const topOf = (level) => -(BASE + (level - 1) * STEP);
  let top = 0;
  for (const a of arcs) top = Math.min(top, topOf(a.level));
  const rootX = d.root === undefined ? 0 : ax(d.root, rootFrac);
  const rootTop = top - (arcs.length ? 22 : 30);
  const drawn = d.weights ? [...arcs].sort((a, b) => (a.weight ?? 1) - (b.weight ?? 1) || a.i - b.i) : arcs;
  let labels = "";
  for (const a of drawn) {
    const fromLo = a.from === a.lo;
    const xs = fromLo ? ax(a.lo, a.fLo) : ax(a.hi, a.fHi);
    const xe = fromLo ? ax(a.hi, a.fHi) : ax(a.lo, a.fLo);
    const yt = topOf(a.level);
    if (d.weights) {
      const color = inkOf(a.tone, INK.down);
      const s = weightStroke(a.weight ?? 1);
      const yc = yt / 0.75; // a cubic with both controls at yc peaks at 3/4 of it
      body += `<path d="M${n(xs)},0 C${n(xs)},${n(yc)} ${n(xe)},${n(yc)} ${n(xe)},0" fill="none" stroke="${color}" stroke-width="${n(s.width)}" stroke-opacity="${n(s.opacity)}"/>`;
      if (a.label) labels += arcLabel((xs + xe) / 2, yt, a.label);
      continue;
    }
    const color = inkOf(a.tone, INK.bright);
    const dir = xe > xs ? 1 : -1;
    const r = Math.min(R, Math.abs(xe - xs) / 2);
    body += `<path d="M${n(xs)},0 V${n(yt + r)} Q${n(xs)},${n(yt)} ${n(xs + dir * r)},${n(yt)} H${n(xe - dir * r)} ` +
      `Q${n(xe)},${n(yt)} ${n(xe)},${n(yt + r)} V-0.5" fill="none" stroke="${color}" stroke-width="1.4" marker-end="url(#${mk.id(color)})"/>`;
    if (a.label) labels += arcLabel(labelX(a, arcs, ax, d.root === undefined ? null : rootX), yt, a.label);
  }
  body += labels;
  if (arcs.length) rects.push({ x0: 0, y0: top - 8, x1: right, y1: 0 });
  if (d.root !== undefined) {
    const color = INK.bright;
    body += `<line x1="${n(rootX)}" y1="${n(rootTop)}" x2="${n(rootX)}" y2="-0.5" stroke="${color}" stroke-width="1.4" marker-end="url(#${mk.id(color)})"/>`;
    body += text(rootX, rootTop - 6, "root", { mono: true, size: LABEL });
    const half = textW("root", LABEL, true) / 2;
    rects.push({ x0: rootX - half, y0: rootTop - 18, x1: rootX + half, y1: 0 });
  }

  // Token boxes.
  toks.forEach((t, i) => { body += box(left[i], 0, w[i], t); });

  // Spans: brackets under the row, stacked when ranges or labels would overlap.
  let y = H + 8;
  if (d.spans.length) {
    /** @type {{ x0: number, x1: number }[][]} */ const lanes = [];
    const order = [...d.spans].sort((a, b) => a.from - b.from || a.to - b.to);
    for (const s of order) {
      const x0 = left[s.from] + 2, x1 = left[s.to] + w[s.to] - 2;
      const half = s.label ? textW(s.label, LABEL + 0.5) / 2 + 4 : 0;
      const mid = (x0 + x1) / 2;
      const ext = { x0: Math.min(x0, mid - half), x1: Math.max(x1, mid + half) };
      let lane = lanes.findIndex((l) => l.every((o) => ext.x1 < o.x0 || ext.x0 > o.x1));
      if (lane < 0) { lane = lanes.length; lanes.push([]); }
      lanes[lane].push(ext);
      const yy = y + lane * 30;
      const color = inkOf(s.tone, INK.bright);
      body += `<path d="M${n(x0)},${n(yy)} v6 H${n(x1)} v-6" fill="none" stroke="${color}" stroke-width="1.2"/>`;
      if (s.label) body += text(mid, yy + 20, s.label, { size: LABEL + 0.5 });
      rects.push({ x0: ext.x0, y0: yy, x1: ext.x1, y1: yy + 24 });
    }
    y += lanes.length * 30;
  }

  // Tag rows: names at the left, values centred under their token; BIO rows draw entity bars.
  for (const r of tagRows) {
    if (r.ents) {
      body += text(-10, y + 11, r.name, { anchor: "end" });
      for (const e of r.ents) {
        const x0 = left[e.lo] + 2, x1 = left[e.hi] + w[e.hi] - 2;
        body += `<rect x="${n(x0)}" y="${n(y + 4)}" width="${n(x1 - x0)}" height="4" rx="2" fill="${typeInk.get(e.type)}"/>`;
        body += text((x0 + x1) / 2, y + 22, e.type, { mono: true, size: TAG });
      }
      y += 30;
    } else {
      r.values.forEach((v, i) => { if (v) body += text(cx(i), y + 11, v, { mono: true, size: TAG }); });
      body += text(-10, y + 11, r.name, { anchor: "end" });
      y += 22;
    }
  }
  if (tagRows.length) {
    let nameW = 0;
    for (const r of tagRows) nameW = Math.max(nameW, textW(r.name, 11.5));
    rects.push({ x0: -10 - nameW, y0: H, x1: 0, y1: y - 4 });
  }

  const label = d.title || `${N} tokens`;
  return figure(svgOpen(bounds(rects, 6), { label, compact: d.compact, scroll: true }) + mk.defs() + body + "</svg>", d.title, d.note);
}

/**
 * Where an arc label sits on its arch top: as central as possible, clear of the legs of
 * higher arcs (and the root arrow) that pass down through this arch.
 * @param {{ lo: number, hi: number, fLo: number, fHi: number, level: number, label: string, i: number }} a
 * @param {typeof a[]} arcs
 * @param {(i: number, f: number) => number} ax
 * @param {number | null} rootX
 */
function labelX(a, arcs, ax, rootX) {
  const x0 = ax(a.lo, a.fLo) + R, x1 = ax(a.hi, a.fHi) - R;
  const mid = (x0 + x1) / 2, half = textW(a.label, LABEL, true) / 2 + 3;
  /** @type {number[]} */ const cuts = [];
  for (const b of arcs) {
    if (b.level <= a.level) continue;
    for (const x of [ax(b.lo, b.fLo), ax(b.hi, b.fHi)]) if (x > x0 && x < x1) cuts.push(x);
  }
  if (rootX !== null && rootX > x0 && rootX < x1) cuts.push(rootX);
  if (!cuts.length) return mid;
  cuts.sort((p, q) => p - q);
  // Free stretches between legs; pick the one that fits and lies nearest the middle, else the widest.
  const free = [];
  let s = x0;
  for (const c of cuts) { free.push([s, c - 3]); s = c + 3; }
  free.push([s, x1]);
  let best = free[0], bestScore = Infinity;
  for (const [p, q] of free) {
    const fits = q - p >= 2 * half;
    const at = fits ? Math.min(Math.max(mid, p + half), q - half) : (p + q) / 2;
    const score = fits ? Math.abs(at - mid) : 1e6 - (q - p);
    if (score < bestScore) { bestScore = score; best = [p, q]; }
  }
  const [p, q] = best;
  return q - p >= 2 * half ? Math.min(Math.max(mid, p + half), q - half) : (p + q) / 2;
}

/** Alignment mode: two token rows, centred on each other, with weighted links between them. */
function renderAlignment(/** @type {TokensBody} */ d) {
  const rows = /** @type {[Row, Row]} */ (d.rows);
  const GAP_Y = 90;
  const placed = rows.map((r) => {
    let x = 0;
    const cells = r.tokens.map((t) => {
      const w = textW(t, FS, true) + 2 * PADX;
      const c = { t, x, w };
      x += w + GAP;
      return c;
    });
    return { cells, width: x - GAP };
  });
  const width = Math.max(placed[0].width, placed[1].width);
  for (const p of placed) {
    const off = (width - p.width) / 2;
    for (const c of p.cells) c.x += off;
  }
  const ys = [0, H + GAP_Y];
  const [a, b] = placed.map((p) => p.cells);
  let body = "";
  const links = [...d.links].sort((p, q) => (p[2] ?? 1) - (q[2] ?? 1));
  for (const [i, j, wt = 1] of links) {
    const s = weightStroke(wt);
    body += `<line x1="${n(a[i].x + a[i].w / 2)}" y1="${H}" x2="${n(b[j].x + b[j].w / 2)}" y2="${ys[1]}" ` +
      `stroke="${INK.down}" stroke-width="${n(s.width)}" stroke-opacity="${n(s.opacity)}"/>`;
  }
  /** @type {{ x0: number, y0: number, x1: number, y1: number }[]} */
  const rects = [{ x0: 0, y0: 0, x1: width, y1: ys[1] + H }];
  placed.forEach((p, r) => {
    for (const c of p.cells) body += box(c.x, ys[r], c.w, c.t);
    const name = rows[r].name;
    if (name) {
      body += text(-12, ys[r] + H / 2 + 4, name, { anchor: "end" });
      rects.push({ x0: -12 - textW(name, 11.5), y0: ys[r], x1: 0, y1: ys[r] + H });
    }
  });
  const label = d.title || `alignment of ${a.length} to ${b.length} tokens`;
  return figure(svgOpen(bounds(rects, 6), { label, compact: d.compact, scroll: true }) + body + "</svg>", d.title, d.note);
}
