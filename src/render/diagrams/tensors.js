/**
 * `tensors` fence: tensor shapes flowing through a network, left to right.
 *
 * Body:
 *   { title?, note?, compact?, stages: [{ dims: number[], op?, label? }] }
 *
 * A 3-D stage `[h, w, c]` is a pseudo-3D box: the front face is h by w and the
 * oblique depth is the channel count. A 2-D stage is the front face alone and a
 * 1-D stage is a thin vertical bar. Every drawn length grows with log2 of the
 * dimension, so 224x224x3 and 7x7x512 share a row. `op` labels the arrow into
 * its stage, so the first stage has none. The dims print under each shape.
 *
 * @module render/diagrams/tensors
 */

import {
  Ctx, ptr, show, wantObject, wantNonEmptyArray, wantArray, optionalString, optionalBoolean, unknownKeys, tooMany,
} from "../schema/common.js";
import { mix, SERIES } from "../charts.js";
import { INK, markers, text, svgOpen, figure, bounds, textW, n } from "./svg.js";

/**
 * @typedef {{ dims: number[], op: string, label: string }} Stage
 * @typedef {{ title: string, note: string, compact: boolean, stages: Stage[] }} TensorsData
 */

const KEYS = ["title", "note", "compact", "stages"];
const STAGE_KEYS = ["dims", "op", "label"];
const MAX_STAGES = 12, MAX_DIM = 1e6, MAX_TEXT = 24;

/** A string of at most MAX_TEXT characters, when present. */
function shortString(ctx, v, pointer) {
  if (v === undefined) return;
  if (typeof v !== "string") ctx.at(pointer, `expected a string, got ${show(v)}`);
  else if (v.length > MAX_TEXT) ctx.at(pointer, `expected at most ${MAX_TEXT} characters, got ${v.length}`);
}

/** Validate a `tensors` fence body. */
export function validate(errors, block, file) {
  const ctx = new Ctx(errors, file, block.line, "tensors");
  if (!wantObject(ctx, block.data, "", "an object { stages }")) return;
  const body = /** @type {Record<string, unknown>} */ (block.data);
  optionalString(ctx, body.title, "/title");
  optionalString(ctx, body.note, "/note");
  optionalBoolean(ctx, body.compact, "/compact");
  unknownKeys(ctx, body, "", KEYS);

  const { stages } = body;
  if (tooMany(ctx, stages, "/stages", MAX_STAGES, "stages")) return;
  if (!wantNonEmptyArray(ctx, stages, "/stages", "at least one stage { dims }")) return;
  stages.forEach((s, i) => {
    const sp = ptr("", "stages", i);
    if (!wantObject(ctx, s, sp, "a stage { dims, op, label }")) return;
    unknownKeys(ctx, s, sp, STAGE_KEYS);
    const dp = ptr(sp, "dims");
    if (!tooMany(ctx, s.dims, dp, 3, "dims") && wantArray(ctx, s.dims, dp, "1 to 3 dims, e.g. [56, 56, 64]")) {
      if (s.dims.length === 0) ctx.at(dp, "expected 1 to 3 dims, e.g. [56, 56, 64], got an empty array");
      s.dims.forEach((v, k) => {
        if (Number.isInteger(v) && /** @type {number} */ (v) >= 1 && /** @type {number} */ (v) <= MAX_DIM) return;
        ctx.at(ptr(dp, k), `expected an integer from 1 to ${MAX_DIM}, got ${show(v)}`);
      });
    }
    if (i === 0 && s.op !== undefined) {
      ctx.at(ptr(sp, "op"), "the first stage has no arrow into it; put the input's name in label");
    } else {
      shortString(ctx, s.op, ptr(sp, "op"));
    }
    shortString(ctx, s.label, ptr(sp, "label"));
  });
}

/**
 * Fill defaults on a validated body.
 * @returns {TensorsData}
 */
export function normalize(data) {
  return {
    title: data.title ?? "",
    note: data.note ?? "",
    compact: data.compact ?? false,
    stages: data.stages.map((s) => ({ dims: s.dims, op: s.op ?? "", label: s.label ?? "" })),
  };
}

/** Drawn length of a height, width or vector length: log2, so 7 and 224 both read. */
export const side = (v) => 5 + 5.5 * Math.log2(v);
/** Oblique depth drawn for a channel count. */
export const depth = (c) => 2 + 3 * Math.log2(c);

/** How a stage is drawn: front face w by h, oblique offset (dx, dy). */
export function shapeOf(dims) {
  if (dims.length === 1) return { w: 9, h: side(dims[0]), dx: 0, dy: 0 };
  const dep = dims.length === 3 ? depth(dims[2]) : 0;
  return { w: side(dims[1]), h: side(dims[0]), dx: dep * 0.75, dy: -dep * 0.5 };
}

/** Greedy word wrap for an op label, so long ops stack instead of widening the gap. */
function wrap(s, max = 6) {
  /** @type {string[]} */ const lines = [];
  for (const word of s.split(/\s+/).filter(Boolean)) {
    const lastLine = lines[lines.length - 1];
    if (lastLine !== undefined && lastLine.length + 1 + word.length <= max) lines[lines.length - 1] = `${lastLine} ${word}`;
    else lines.push(word);
  }
  return lines;
}

const DIM_SIZE = 11, LABEL_SIZE = 11, OP_SIZE = 10.5, OP_LINE = 12;

/** Render a validated, normalized `tensors` block. */
export function render(block) {
  const d = /** @type {TensorsData} */ (block.data);
  const ink = SERIES[0];
  const edge = `stroke="${ink}" stroke-width="1" stroke-linejoin="round"`;
  const mk = markers();
  const items = d.stages.map((s) => {
    const shape = shapeOf(s.dims);
    const dims = s.dims.join("x");
    const tw = Math.max(textW(dims, DIM_SIZE, true), textW(s.label, LABEL_SIZE));
    const ops = wrap(s.op);
    let opW = 0;
    for (const l of ops) opW = Math.max(opW, textW(l, OP_SIZE, true));
    return { s, shape, dims, tw, ops, opW, sw: shape.w + shape.dx, cx: 0 };
  });

  // Centres left to right: shapes keep a gap wide enough for the op label, and
  // the text rows underneath never touch their neighbours.
  items.forEach((it, i) => {
    if (i === 0) return;
    const prev = items[i - 1];
    const gap = Math.max(24, it.opW + 10);
    it.cx = prev.cx + Math.max(prev.sw / 2 + gap + it.sw / 2, (prev.tw + it.tw) / 2 + 12);
  });

  let half = 0, rise = 0;
  for (const it of items) {
    half = Math.max(half, it.shape.h / 2);
    rise = Math.min(rise, -it.shape.h / 2 + it.shape.dy);
  }
  const dimsY = half + 17, labelY = dimsY + 15;

  let body = "";
  /** @type {{ x0: number, y0: number, x1: number, y1: number }[]} */
  const rects = [];
  items.forEach((it, i) => {
    const { w, h, dx, dy } = it.shape;
    const x = it.cx - it.sw / 2, y = -h / 2;
    body += `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${mix(ink, 0.24)}" ${edge}/>`;
    if (dx > 0) {
      body += `<path d="M${n(x)},${n(y)} L${n(x + dx)},${n(y + dy)} L${n(x + w + dx)},${n(y + dy)} L${n(x + w)},${n(y)} Z" fill="${mix(ink, 0.42)}" ${edge}/>`;
      body += `<path d="M${n(x + w)},${n(y)} L${n(x + w + dx)},${n(y + dy)} L${n(x + w + dx)},${n(y + h + dy)} L${n(x + w)},${n(y + h)} Z" fill="${mix(ink, 0.14)}" ${edge}/>`;
    }
    rects.push({ x0: Math.min(x, it.cx - it.tw / 2), y0: y + dy, x1: Math.max(x + it.sw, it.cx + it.tw / 2), y1: labelY });

    body += text(it.cx, dimsY, it.dims, { mono: true, size: DIM_SIZE });
    if (it.s.label) body += text(it.cx, labelY, it.s.label, { size: LABEL_SIZE });

    if (i === 0) return;
    const prev = items[i - 1];
    const x1 = prev.cx + prev.sw / 2 + 4, x2 = x - 4;
    body += `<line x1="${n(x1)}" y1="0" x2="${n(x2)}" y2="0" stroke="${INK.arrow}" stroke-width="1.4" marker-end="url(#${mk.id(INK.arrow)})"/>`;
    it.ops.forEach((l, k) => {
      const ly = -6 - (it.ops.length - 1 - k) * OP_LINE;
      body += text((x1 + x2) / 2, ly, l, { mono: true, size: OP_SIZE });
      rects.push({ x0: x1, y0: ly - OP_LINE, x1: x2, y1: 0 });
    });
  });
  rects.push({ x0: 0, y0: rise, x1: 0, y1: 0 });

  const label = d.title || `tensor shapes ${d.stages.map((s) => s.dims.join("x")).join(" to ")}`;
  return figure(svgOpen(bounds(rects, 8), { label, compact: d.compact, scroll: true }) + mk.defs() + body + "</svg>", d.title, d.note);
}
