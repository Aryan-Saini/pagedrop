/**
 * `pipeline` fence: a rows x time-steps grid. The classic use is a CPU
 * pipeline diagram (one row per instruction, one column per cycle), but any
 * per-step schedule fits: workers x steps of a reduction, stages x ticks.
 *
 * Body:
 *   { title?, note?, compact?, cycles?, stall? = "stall",
 *     rows: [{ label, start? = 0, cells: [string | null] }] }
 *
 * Each distinct cell text takes a series colour in order of first appearance.
 * Cycle numbers print 1-based across the top; `start` is the 0-based column.
 *
 * @module render/diagrams/pipeline
 */

import {
  Ctx, ptr, show, wantObject, wantNonEmptyArray, wantText, optionalString, optionalBoolean,
  unknownKeys, seriesCap,
} from "../schema/common.js";
import { INK, inkOf, text, svgOpen, figure, textW, n } from "./svg.js";

/**
 * @typedef {{ label: string, start: number, cells: (string | null)[] }} Row
 * @typedef {{ title: string, note: string, compact: boolean, cycles: number, stall: string, rows: Row[] }} PipelineData
 */

const isCount = (v, min) => Number.isInteger(v) && v >= min;

/** Validate a `pipeline` fence body. */
export function validate(errors, block, file) {
  const ctx = new Ctx(errors, file, block.line, "pipeline");
  if (!wantObject(ctx, block.data, "", "an object { rows }")) return;
  const body = /** @type {Record<string, any>} */ (block.data);
  optionalString(ctx, body.title, "/title");
  optionalString(ctx, body.note, "/note");
  optionalBoolean(ctx, body.compact, "/compact");
  unknownKeys(ctx, body, "", ["title", "note", "compact", "cycles", "stall", "rows"]);
  if (body.stall !== undefined) wantText(ctx, body.stall, "/stall", "a non-empty string");
  const stall = typeof body.stall === "string" ? body.stall : "stall";

  let end = 0;
  /** @type {Set<string>} */
  const texts = new Set();
  if (wantNonEmptyArray(ctx, body.rows, "/rows", "at least one row")) {
    body.rows.forEach((row, i) => {
      const rp = ptr("", "rows", i);
      if (!wantObject(ctx, row, rp, "a row { label, cells }")) return;
      unknownKeys(ctx, row, rp, ["label", "start", "cells"]);
      wantText(ctx, row.label, ptr(rp, "label"), "a row label");
      const startOk = row.start === undefined || isCount(row.start, 0);
      if (!startOk) ctx.at(ptr(rp, "start"), `expected a whole number >= 0, got ${show(row.start)}`);
      if (!wantNonEmptyArray(ctx, row.cells, ptr(rp, "cells"), "at least one cell")) return;
      row.cells.forEach((c, k) => {
        if (c === null) return;
        if (typeof c !== "string" || c.trim() === "") {
          ctx.at(ptr(rp, "cells", k), `expected a non-empty string or null, got ${show(c)}`);
          return;
        }
        if (c !== stall) texts.add(c);
      });
      if (startOk) end = Math.max(end, (row.start ?? 0) + row.cells.length);
    });
  }
  seriesCap(ctx, texts.size, "/rows", "distinct cell texts");

  if (body.cycles !== undefined) {
    if (!isCount(body.cycles, 1)) ctx.at("/cycles", `expected a whole number >= 1, got ${show(body.cycles)}`);
    else if (body.cycles < end) ctx.at("/cycles", `expected at least ${end} to fit every row, got ${body.cycles}`);
  }
}

/**
 * Fill defaults on a validated body.
 * @returns {PipelineData}
 */
export function normalize(data) {
  const rows = data.rows.map((r) => ({ label: r.label, start: r.start ?? 0, cells: r.cells }));
  return {
    title: data.title ?? "",
    note: data.note ?? "",
    compact: data.compact ?? false,
    stall: data.stall ?? "stall",
    cycles: data.cycles ?? Math.max(...rows.map((r) => r.start + r.cells.length)),
    rows,
  };
}

const CELL_SIZE = 11, LABEL_SIZE = 12, ROW_H = 30, TOP = 24;

/**
 * Cell text -> colour, by first appearance in reading order.
 * @param {PipelineData} d
 */
export function cellColors(d) {
  /** @type {Map<string, string>} */
  const colors = new Map();
  for (const r of d.rows) {
    for (const c of r.cells) {
      if (c === null || c === d.stall || colors.has(c)) continue;
      colors.set(c, inkOf(`c${colors.size + 1}`, INK.rule));
    }
  }
  return colors;
}

/**
 * Render a validated, normalized `pipeline` block.
 * @param {{ data: PipelineData }} block
 */
export function render(block) {
  const d = block.data;
  const colors = cellColors(d);
  const left = Math.max(...d.rows.map((r) => textW(r.label, LABEL_SIZE, true))) + 16;
  const cw = Math.max(40, ...[...colors.keys()].map((c) => textW(c, CELL_SIZE, true) + 14));
  const bad = inkOf("bad", INK.rule);

  let body = "";
  for (let c = 0; c < d.cycles; c++) {
    body += text(left + c * cw + cw / 2, 14, c + 1, { mono: true, size: CELL_SIZE });
  }
  d.rows.forEach((r, i) => {
    const y = TOP + i * ROW_H;
    body += text(0, y + ROW_H / 2 + 4, r.label, { mono: true, size: LABEL_SIZE, anchor: "start" });
    r.cells.forEach((s, k) => {
      if (s === null) return;
      const x = left + (r.start + k) * cw;
      const rect = `x="${n(x + 1.5)}" y="${n(y + 2)}" width="${n(cw - 3)}" height="${ROW_H - 4}" rx="4"`;
      if (s === d.stall) {
        body += `<rect ${rect} fill="none" stroke="${bad}" stroke-width="1.2" stroke-dasharray="3 2"/>`;
        body += `<circle cx="${n(x + cw / 2)}" cy="${n(y + ROW_H / 2)}" r="2.2" fill="${bad}"/>`;
        return;
      }
      const col = /** @type {string} */ (colors.get(s));
      body += `<rect ${rect} fill="${col}" fill-opacity="0.18" stroke="${col}" stroke-width="1.2"/>`;
      body += text(x + cw / 2, y + ROW_H / 2 + 4, s, { mono: true, size: CELL_SIZE });
    });
  });

  const W = left + d.cycles * cw;
  const box = { x: -4, y: 0, w: W + 8, h: TOP + d.rows.length * ROW_H + 4 };
  const label = d.title || `pipeline grid, ${d.rows.length} rows by ${d.cycles} steps`;
  return figure(svgOpen(box, { label, compact: d.compact }) + body + "</svg>", d.title, d.note);
}
