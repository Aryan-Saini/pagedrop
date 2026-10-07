/**
 * `layers` fence: a vertical stack of named layers, top to bottom, each with an
 * optional note printed to its right (memory hierarchy with latencies, a
 * network stack, an architecture's tiers).
 *
 * Body:
 *   { title?, note?, compact?, shape? = "pyramid" | "stack",
 *     items: [{ label, note?, tone? }] }
 *
 * `pyramid` widens each layer downward; `stack` keeps them equal. A layer's
 * colour is its tone, or the next series slot (c1..c8, cycling) when it has none.
 *
 * @module render/diagrams/layers
 */

import {
  Ctx, ptr, wantObject, wantNonEmptyArray, wantText, optionalString, optionalBoolean, optionalEnum,
  unknownKeys,
} from "../schema/common.js";
import { DIAGRAM_TONES, INK, inkOf, text, svgOpen, figure, textW, n } from "./svg.js";

export const SHAPES = /** @type {const} */ (["pyramid", "stack"]);

/**
 * @typedef {{ label: string, note: string, tone: string }} Item
 * @typedef {{ title: string, note: string, compact: boolean, shape: typeof SHAPES[number], items: Item[] }} LayersData
 */

/** Validate a `layers` fence body. */
export function validate(errors, block, file) {
  const ctx = new Ctx(errors, file, block.line, "layers");
  if (!wantObject(ctx, block.data, "", "an object { items }")) return;
  const body = /** @type {Record<string, any>} */ (block.data);
  optionalString(ctx, body.title, "/title");
  optionalString(ctx, body.note, "/note");
  optionalBoolean(ctx, body.compact, "/compact");
  optionalEnum(ctx, body.shape, "/shape", SHAPES);
  unknownKeys(ctx, body, "", ["title", "note", "compact", "shape", "items"]);
  if (!wantNonEmptyArray(ctx, body.items, "/items", "at least one layer")) return;
  body.items.forEach((it, i) => {
    const ip = ptr("", "items", i);
    if (!wantObject(ctx, it, ip, "a layer { label, note, tone }")) return;
    unknownKeys(ctx, it, ip, ["label", "note", "tone"]);
    wantText(ctx, it.label, ptr(ip, "label"), "a layer label");
    optionalString(ctx, it.note, ptr(ip, "note"));
    optionalEnum(ctx, it.tone, ptr(ip, "tone"), DIAGRAM_TONES);
  });
}

/**
 * Fill defaults on a validated body.
 * @returns {LayersData}
 */
export function normalize(data) {
  return {
    title: data.title ?? "",
    note: data.note ?? "",
    compact: data.compact ?? false,
    shape: data.shape ?? "pyramid",
    items: data.items.map((it, i) => ({ label: it.label, note: it.note ?? "", tone: it.tone ?? `c${(i % 8) + 1}` })),
  };
}

const ROW_H = 36, GAP = 6, MIN_W = 140, MAX_W = 360, NOTE_SIZE = 12;

/**
 * Width of each layer. A pyramid grows linearly from the top width to the
 * bottom width; both ends stretch until every label fits its own row.
 * @param {LayersData} d
 */
export function widths(d) {
  const need = d.items.map((it) => textW(it.label) + 28);
  const bottom = Math.max(MAX_W, ...need);
  if (d.shape === "stack" || d.items.length === 1) return d.items.map(() => bottom);
  const last = d.items.length - 1;
  let top = MIN_W;
  need.forEach((w, i) => {
    const f = i / last;
    if (f < 1) top = Math.max(top, (w - bottom * f) / (1 - f));
  });
  return d.items.map((_, i) => top + ((bottom - top) * i) / last);
}

/**
 * Render a validated, normalized `layers` block.
 * @param {{ data: LayersData }} block
 */
export function render(block) {
  const d = block.data;
  const ws = widths(d);
  const full = Math.max(...ws);
  let body = "";
  d.items.forEach((it, i) => {
    const w = ws[i], x = (full - w) / 2, y = i * (ROW_H + GAP);
    const col = inkOf(it.tone, INK.rule);
    body += `<rect x="${n(x)}" y="${y}" width="${n(w)}" height="${ROW_H}" rx="6" fill="${col}" fill-opacity="0.14" stroke="${col}" stroke-width="1.4"/>`;
    body += text(full / 2, y + ROW_H / 2 + 4.5, it.label, { cls: "node-label" });
    if (it.note) body += text(full + 18, y + ROW_H / 2 + 4, it.note, { mono: true, size: NOTE_SIZE, anchor: "start" });
  });
  const noteW = Math.max(0, ...d.items.map((it) => (it.note ? textW(it.note, NOTE_SIZE, true) + 18 : 0)));
  const W = full + noteW, H = d.items.length * (ROW_H + GAP) - GAP;
  const box = { x: -4, y: -4, w: W + 8, h: H + 8 };
  const label = d.title || `layers: ${d.items.map((it) => it.label).join(", ")}`;
  return figure(svgOpen(box, { label, compact: d.compact }) + body + "</svg>", d.title, d.note);
}
