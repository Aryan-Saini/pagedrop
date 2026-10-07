/**
 * `nn` fence: a fully connected network drawn as columns of neurons, every
 * pair of adjacent columns joined by edges.
 *
 * Body:
 *   { title?, note?, compact?, layers: number[], inputs?: string[], outputs?: string[],
 *     names?: string[], weights?: boolean, dropout?: [layer, neuron][], tones?: string[] }
 *
 * A layer wider than FULL neurons is drawn as its first and last KEEP neurons
 * with a vertical ellipsis between; once any layer collapses, every column
 * prints its true count on top. `weights: true` varies edge colour (sign),
 * opacity and width from a generator seeded by the layer sizes, so the same
 * network always draws the same "learned" weights. Dropped neurons are hollow,
 * dashed and lose every edge.
 *
 * @module render/diagrams/nn
 */

import {
  Ctx, ptr, show, wantObject, wantArray, optionalString, optionalBoolean, optionalEnum, unknownKeys, tooMany,
} from "../schema/common.js";
import { mix, SERIES } from "../charts.js";
import { DIAGRAM_TONES, INK, inkOf, text, svgOpen, figure, bounds, textW, n } from "./svg.js";

/**
 * @typedef {{
 *   title: string, note: string, compact: boolean, layers: number[], inputs: string[], outputs: string[],
 *   names: string[], weights: boolean, dropout: [number, number][], tones: string[],
 * }} NnData
 */

const KEYS = ["title", "note", "compact", "layers", "inputs", "outputs", "names", "weights", "dropout", "tones"];
const MIN_LAYERS = 2, MAX_LAYERS = 12;
const MAX_NEURONS = 1e6;
/** Layers up to this many neurons draw every one; wider ones collapse. */
export const FULL = 12;
/** Neurons kept at each end of a collapsed layer. */
export const KEEP = 5;
const MAX_DROPOUT = 64;
const MAX_LABEL = 24, MAX_NAME = 40;

/** True when neuron `i` of a layer of `count` is drawn (not hidden by the ellipsis). */
const shown = (count, i) => count <= FULL || i < KEEP || i >= count - KEEP;

/** A string of at most `max` characters; `""` is allowed. */
function shortString(ctx, v, pointer, max) {
  if (typeof v !== "string") return ctx.at(pointer, `expected a string, got ${show(v)}`);
  if (v.length > max) return ctx.at(pointer, `expected at most ${max} characters, got ${v.length}`);
  return true;
}

/**
 * Labels for the first or last layer. They sit beside each neuron, so the
 * layer has to be drawn in full and the counts have to line up.
 */
function endLabels(ctx, v, pointer, count, layerPtr) {
  if (v === undefined) return;
  if (count > FULL) {
    ctx.at(pointer, `labels only fit a layer drawn in full (at most ${FULL} neurons); ${layerPtr} has ${count}`);
    return;
  }
  if (tooMany(ctx, v, pointer, FULL, "labels") || !wantArray(ctx, v, pointer, "an array of neuron labels")) return;
  if (v.length !== count) {
    ctx.at(pointer, `expected ${count} labels to match ${layerPtr}, got ${v.length}`);
    return;
  }
  v.forEach((s, i) => shortString(ctx, s, ptr(pointer, i), MAX_LABEL));
}

/** Validate a `nn` fence body. */
export function validate(errors, block, file) {
  const ctx = new Ctx(errors, file, block.line, "nn");
  if (!wantObject(ctx, block.data, "", "an object { layers }")) return;
  const body = /** @type {Record<string, unknown>} */ (block.data);
  optionalString(ctx, body.title, "/title");
  optionalString(ctx, body.note, "/note");
  optionalBoolean(ctx, body.compact, "/compact");
  optionalBoolean(ctx, body.weights, "/weights");
  unknownKeys(ctx, body, "", KEYS);

  const { layers } = body;
  if (tooMany(ctx, layers, "/layers", MAX_LAYERS, "layers")) return;
  if (!wantArray(ctx, layers, "/layers", `${MIN_LAYERS} to ${MAX_LAYERS} neuron counts`)) return;
  if (layers.length < MIN_LAYERS) {
    ctx.at("/layers", `expected ${MIN_LAYERS} to ${MAX_LAYERS} neuron counts, got ${layers.length}`);
    return;
  }
  let sizesOk = true;
  layers.forEach((c, i) => {
    if (Number.isInteger(c) && /** @type {number} */ (c) >= 1 && /** @type {number} */ (c) <= MAX_NEURONS) return;
    sizesOk = ctx.at(ptr("", "layers", i), `expected a neuron count from 1 to ${MAX_NEURONS}, got ${show(c)}`);
  });
  if (!sizesOk) return;
  const sizes = /** @type {number[]} */ (layers);
  const last = sizes.length - 1;

  endLabels(ctx, body.inputs, "/inputs", sizes[0], "/layers/0");
  endLabels(ctx, body.outputs, "/outputs", sizes[last], `/layers/${last}`);

  for (const [key, check] of /** @type {const} */ ([
    ["names", (s, p) => shortString(ctx, s, p, MAX_NAME)],
    ["tones", (s, p) => s === "" || optionalEnum(ctx, s, p, DIAGRAM_TONES)],
  ])) {
    const v = body[key], p = `/${key}`;
    if (v === undefined) continue;
    if (tooMany(ctx, v, p, MAX_LAYERS, key) || !wantArray(ctx, v, p, `one entry per layer`)) continue;
    if (v.length !== sizes.length) {
      ctx.at(p, `expected ${sizes.length} entries to match /layers, got ${v.length}`);
      continue;
    }
    v.forEach((s, i) => check(s, ptr(p, i)));
  }

  const { dropout } = body;
  if (dropout === undefined) return;
  if (tooMany(ctx, dropout, "/dropout", MAX_DROPOUT, "dropped neurons") ||
    !wantArray(ctx, dropout, "/dropout", "an array of [layer, neuron] pairs")) return;
  dropout.forEach((pair, k) => {
    const p = ptr("", "dropout", k);
    if (!Array.isArray(pair) || pair.length !== 2 || !pair.every(Number.isInteger)) {
      ctx.at(p, `expected a [layer, neuron] pair of integers, got ${show(pair)}`);
      return;
    }
    const [l, i] = /** @type {[number, number]} */ (pair);
    if (l < 0 || l > last) {
      ctx.at(ptr(p, 0), `expected a layer index from 0 to ${last}, got ${l}`);
    } else if (i < 0 || i >= sizes[l]) {
      ctx.at(ptr(p, 1), `expected a neuron index from 0 to ${sizes[l] - 1} in layer ${l}, got ${i}`);
    } else if (!shown(sizes[l], i)) {
      ctx.at(ptr(p, 1), `neuron ${i} of layer ${l} is hidden by the ellipsis; only the first ${KEEP} and last ${KEEP} are drawn`);
    }
  });
}

/**
 * Fill defaults on a validated body.
 * @returns {NnData}
 */
export function normalize(data) {
  return {
    title: "", note: "", compact: false, inputs: [], outputs: [], names: [], weights: false, dropout: [], tones: [],
    ...data,
  };
}

/** Deterministic generator in [0, 1). Same seed, same sequence, on every machine. */
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** Seed derived from the layer sizes, so a network keeps its weights across renders. */
export const seedOf = (sizes) => sizes.reduce((h, c) => (Math.imul(h, 31) + c) >>> 0, 7);

/**
 * Which neuron indices a layer draws, in order; `-1` marks the ellipsis slot.
 * @param {number} count @returns {number[]}
 */
export function slots(count) {
  if (count <= FULL) return Array.from({ length: count }, (_, i) => i);
  return [
    ...Array.from({ length: KEEP }, (_, i) => i), -1,
    ...Array.from({ length: KEEP }, (_, i) => count - KEEP + i),
  ];
}

/** Render a validated, normalized `nn` block. */
export function render(block) {
  const d = /** @type {NnData} */ (block.data);
  const cols = d.layers.map(slots);
  let maxSlots = 0;
  for (const c of cols) if (c.length > maxSlots) maxSlots = c.length;
  const dense = maxSlots > 8;
  const gy = dense ? 28 : 34, r = dense ? 9 : 11;
  let nameW = 0;
  for (const s of d.names) nameW = Math.max(nameW, textW(s, 11.5));
  const gx = Math.max(Math.min(130, 560 / (d.layers.length - 1)), 76, nameW + 14);
  const collapsed = d.layers.some((c) => c > FULL);
  const dropped = new Set(d.dropout.map(([l, i]) => `${l}:${i}`));

  /** @type {{ x: number, y: number, i: number, off: boolean, li: number }[][]} */
  const pos = cols.map((col, li) => col.map((i, k) => ({
    x: li * gx, y: (k - (col.length - 1) / 2) * gy, i, li, off: dropped.has(`${li}:${i}`),
  })));

  // Edges. Every pair draws its weight even when one end is dropped, so dropping
  // a neuron never reshuffles the weights of the edges that remain.
  const rand = rng(seedOf(d.layers));
  let edges = "";
  for (let li = 0; li < pos.length - 1; li++) {
    for (const a of pos[li]) {
      for (const b of pos[li + 1]) {
        if (a.i < 0 || b.i < 0) continue;
        const w = d.weights ? rand() * 2 - 1 : 0;
        if (a.off || b.off) continue;
        const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
        const ux = dx / len * (r + 1), uy = dy / len * (r + 1);
        const attrs = d.weights
          ? ` stroke="${w >= 0 ? SERIES[0] : SERIES[1]}" stroke-opacity="${n(0.12 + Math.abs(w) * 0.8)}" stroke-width="${n(0.6 + Math.abs(w) * 1.4)}"`
          : "";
        edges += `<line x1="${n(a.x + ux)}" y1="${n(a.y + uy)}" x2="${n(b.x - ux)}" y2="${n(b.y - uy)}"${attrs}/>`;
      }
    }
  }
  let body = d.weights ? `<g>${edges}</g>` : `<g stroke="${INK.bright}" stroke-opacity="${dense ? 0.22 : 0.32}">${edges}</g>`;

  let top = 0, bottom = 0;
  pos.forEach((col, li) => {
    const ink = inkOf(d.tones[li] ?? "", "");
    for (const p of col) {
      if (p.y - r < top) top = p.y - r;
      if (p.y + r > bottom) bottom = p.y + r;
      if (p.i < 0) {
        for (const dy of [-7, 0, 7]) body += `<circle cx="${n(p.x)}" cy="${n(p.y + dy)}" r="1.8" fill="${INK.bright}"/>`;
      } else if (p.off) {
        body += `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${r}" fill="${INK.fill}" stroke="${INK.arrow}" stroke-width="1.3" stroke-dasharray="3 2"/>`;
      } else {
        const fill = ink ? mix(ink, 0.3) : INK.fill;
        body += `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${r}" fill="${fill}" stroke="${ink || INK.bright}" stroke-width="1.4"/>`;
      }
    }
  });

  let inW = 0, outW = 0;
  const lastCol = pos[pos.length - 1];
  d.inputs.forEach((s, i) => {
    inW = Math.max(inW, textW(s, 12, true));
    body += text(-r - 8, pos[0][i].y + 4, s, { mono: true, size: 12, anchor: "end" });
  });
  d.outputs.forEach((s, i) => {
    outW = Math.max(outW, textW(s, 12, true));
    body += text(lastCol[0].x + r + 8, lastCol[i].y + 4, s, { mono: true, size: 12, anchor: "start" });
  });
  if (collapsed) {
    d.layers.forEach((c, li) => { body += text(li * gx, top - 9, c, { mono: true, size: 11.5 }); });
  }
  const named = d.names.some(Boolean);
  d.names.forEach((s, li) => { if (s) body += text(li * gx, bottom + 18, s, { size: 11.5 }); });

  const box = bounds([
    { x0: -r - (inW ? inW + 8 : 0), y0: top - (collapsed ? 22 : 0), x1: lastCol[0].x + r + (outW ? outW + 8 : 0), y1: bottom + (named ? 22 : 0) },
    ...d.names.map((s, li) => ({ x0: li * gx - textW(s, 11.5) / 2, y0: 0, x1: li * gx + textW(s, 11.5) / 2, y1: 0 })),
  ], 8);
  const label = d.title || `neural network ${d.layers.join("-")}`;
  return figure(svgOpen(box, { label, compact: d.compact }) + body + "</svg>", d.title, d.note);
}
