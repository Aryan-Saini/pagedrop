/**
 * `sortnet` fence: a sorting network that actually runs.
 *
 * Wires run left to right, one per input. Each layer is a set of comparators
 * `[a, b]` that fire in parallel: afterwards the smaller value sits on wire `a`
 * and the larger on wire `b`, so `[3, 1]` sorts descending between them. The
 * renderer pushes the inputs through every layer, paints the comparators that
 * swapped in red, and prints the outputs in green. It never claims the result
 * is sorted; the picture shows whether it is.
 *
 * @module render/diagrams/sortnet
 */

import {
  Ctx, ptr, show, wantObject, wantNonEmptyArray, numberArray,
  optionalString, optionalBoolean, unknownKeys,
  tooMany,
} from "../schema/common.js";
import { INK, inkOf, n, text, svgOpen, figure, bounds, textW } from "./svg.js";

/** @typedef {{ title: string, note: string, compact: boolean, inputs: number[], layers: [number, number][][], values: boolean }} SortnetBody */

const KEYS = ["title", "note", "compact", "inputs", "layers", "values"];
const MIN_WIRES = 2, MAX_WIRES = 32;

/** Validate a `sortnet` fence body. */
export function validate(errors, block, file) {
  const ctx = new Ctx(errors, file, block.line, "sortnet");
  if (!wantObject(ctx, block.data, "", "an object { inputs, layers }")) return;
  const body = /** @type {Record<string, unknown>} */ (block.data);

  optionalString(ctx, body.title, "/title");
  optionalString(ctx, body.note, "/note");
  optionalBoolean(ctx, body.compact, "/compact");
  optionalBoolean(ctx, body.values, "/values");
  unknownKeys(ctx, body, "", KEYS);

  let wires = -1;
  if (numberArray(ctx, body.inputs, "/inputs", `${MIN_WIRES} to ${MAX_WIRES} input numbers`)) {
    const count = /** @type {number[]} */ (body.inputs).length;
    if (count < MIN_WIRES || count > MAX_WIRES) {
      ctx.at("/inputs", `expected ${MIN_WIRES} to ${MAX_WIRES} input numbers, got ${count}`);
    } else {
      wires = count;
    }
  }

  if (tooMany(ctx, body.layers, "/layers", 64, "layers") || !wantNonEmptyArray(ctx, body.layers, "/layers", "at least one layer of comparators")) return;
  /** @type {unknown[]} */ (body.layers).forEach((layer, li) => {
    const lp = ptr("", "layers", li);
    if (!wantNonEmptyArray(ctx, layer, lp, "at least one comparator [a, b]")) return;
    /** @type {Map<number, number>} wire -> index of the comparator that already uses it */
    const used = new Map();
    /** @type {unknown[]} */ (layer).forEach((pair, ci) => {
      const cp = ptr(lp, ci);
      if (!Array.isArray(pair) || pair.length !== 2) {
        ctx.at(cp, `expected a comparator [a, b] of two wire indices, got ${show(pair)}`);
        return;
      }
      let ok = true;
      pair.forEach((w, k) => {
        if (!Number.isInteger(w)) {
          ok = ctx.at(ptr(cp, k), `expected an integer wire index, got ${show(w)}`);
        } else if (wires > 0 && (w < 0 || w >= wires)) {
          ok = ctx.at(ptr(cp, k), `expected a wire index from 0 to ${wires - 1}, got ${show(w)}`);
        }
      });
      if (!ok) return;
      const [a, b] = /** @type {[number, number]} */ (pair);
      if (a === b) {
        ctx.at(cp, `expected two different wires, got [${a}, ${b}]`);
        return;
      }
      for (const w of [a, b]) {
        const prior = used.get(w);
        if (prior !== undefined) {
          ctx.at(cp, `wire ${w} is already compared by ${ptr(lp, prior)}; a wire appears at most once per layer`);
        } else {
          used.set(w, ci);
        }
      }
    });
  });
}

/** Fill defaults on a validated body. */
export function normalize(data) {
  return { title: "", note: "", compact: false, values: true, ...data };
}

/**
 * Push `inputs` through `layers`. Returns the values after every layer and,
 * per layer, which comparators swapped.
 * @param {number[]} inputs @param {[number, number][][]} layers
 */
export function run(inputs, layers) {
  let vals = [...inputs];
  /** @type {number[][]} */ const after = [];
  /** @type {boolean[][]} */ const swapped = [];
  for (const layer of layers) {
    const next = [...vals];
    swapped.push(layer.map(([a, b]) => {
      if (vals[a] <= vals[b]) return false;
      next[a] = vals[b];
      next[b] = vals[a];
      return true;
    }));
    vals = next;
    after.push(vals);
  }
  return { after, swapped };
}

/**
 * Give every comparator in a layer a sub-column so two that overlap vertically
 * never share an x. Greedy interval colouring, in authored order.
 * @param {[number, number][]} layer
 * @returns {{ slot: number[], slots: number }}
 */
function slots(layer) {
  /** @type {[number, number][][]} */ const cols = [];
  const slot = layer.map(([a, b]) => {
    const lo = Math.min(a, b), hi = Math.max(a, b);
    let s = cols.findIndex((c) => c.every(([l, h]) => hi < l || lo > h));
    if (s < 0) { s = cols.length; cols.push([]); }
    cols[s].push([lo, hi]);
    return s;
  });
  return { slot, slots: cols.length };
}

/** Values print as authored, trimmed of float noise. */
const fmt = (v) => String(Number(v.toPrecision(6)));

const ROW = 34;      // wire spacing
const SLOT = 14;     // sideways offset between overlapping comparators
const PAD = 16;      // gap before and after the comparators of a column
const VAL = 10.5;    // per-layer value size

/** Render a validated, normalized `sortnet` block. */
export function render(block) {
  const d = /** @type {SortnetBody} */ (block.data);
  const { after, swapped } = run(d.inputs, d.layers);
  const wires = d.inputs.length;
  const yOf = (i) => i * ROW;
  const good = inkOf("good", INK.bright);

  const inW = Math.max(...d.inputs.map((v) => textW(fmt(v), 12, true)));
  let body = "";
  let x = 0;
  /** @type {string[]} */ const cols = [];
  d.layers.forEach((layer, li) => {
    const { slot, slots: count } = slots(layer);
    const valW = d.values ? Math.max(...after[li].map((v) => textW(fmt(v), VAL, true))) + 8 : 0;
    const stepW = textW(`step ${li + 1}`, 11) + 10;
    const w = Math.max(PAD * 2 + (count - 1) * SLOT + valW, stepW);
    const cx0 = x + PAD;
    let col = "";
    layer.forEach(([a, b], ci) => {
      const cx = cx0 + slot[ci] * SLOT;
      const color = swapped[li][ci] ? INK.up : INK.bright;
      col += `<line x1="${n(cx)}" y1="${n(yOf(a))}" x2="${n(cx)}" y2="${n(yOf(b))}" stroke="${color}" stroke-width="1.8"/>`;
      col += `<circle cx="${n(cx)}" cy="${n(yOf(a))}" r="4" fill="${color}"/>`;
      // A descending comparator (min on the lower wire a) gets an arrowhead on
      // its max end b, which is the upper wire, pointing up.
      if (a > b) {
        const y = yOf(b);
        col += `<path d="M${n(cx - 5)},${n(y + 7)} L${n(cx)},${n(y - 2)} L${n(cx + 5)},${n(y + 7)} Z" fill="${color}"/>`;
      } else {
        col += `<circle cx="${n(cx)}" cy="${n(yOf(b))}" r="4" fill="${color}"/>`;
      }
    });
    if (d.values) {
      const vx = cx0 + (count - 1) * SLOT + 10;
      after[li].forEach((v, i) => {
        col += text(vx, yOf(i) - 5, fmt(v), { mono: true, size: VAL, anchor: "start" });
      });
    }
    col += text(x + w / 2, yOf(wires - 1) + 26, `step ${li + 1}`, { size: 11 });
    cols.push(col);
    x += w;
  });
  const end = x + 10;

  for (let i = 0; i < wires; i++) {
    body += `<line x1="-6" y1="${n(yOf(i))}" x2="${n(end)}" y2="${n(yOf(i))}" stroke="${INK.rule}" stroke-width="1.3"/>`;
    body += text(-12, yOf(i) + 4, fmt(d.inputs[i]), { mono: true, size: 12, anchor: "end" });
  }
  body += cols.join("");
  const out = after.at(-1) ?? d.inputs;
  const outW = Math.max(...out.map((v) => textW(fmt(v), 12, true)));
  out.forEach((v, i) => {
    body += text(end + 8, yOf(i) + 4, fmt(v), { mono: true, size: 12, anchor: "start", color: good, weight: 600 });
  });

  const box = bounds([{ x0: -12 - inW, y0: -14, x1: end + 8 + outW, y1: yOf(wires - 1) + 30 }], 6);
  const label = d.title || `sorting network on ${wires} wires`;
  return figure(svgOpen(box, { label, compact: d.compact }) + body + "</svg>", d.title, d.note);
}
