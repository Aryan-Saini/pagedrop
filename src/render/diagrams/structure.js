/**
 * `structure` fence: pointer data structures drawn the textbook way.
 *
 *   list    [value | next] cells chained by arrows; `doubly` adds prev arrows,
 *           `cycle` bends the last next pointer back to an earlier cell
 *   array   a row of cells with printed indices and named pointers underneath
 *   stack   a column of cells, top first, with an optional top pointer
 *
 * Values print in the code face; cells size themselves from `textW()`.
 *
 * @module render/diagrams/structure
 */

import {
  Ctx, ptr, show, wantObject, wantArray, wantNonEmptyArray, wantText, isObject,
  optionalString, optionalBoolean, optionalEnum, unknownKeys,
  tooMany,
} from "../schema/common.js";
import { DIAGRAM_TONES, INK, inkOf, markers, text, svgOpen, figure, bounds, textW, n } from "./svg.js";

const KINDS = /** @type {const} */ (["list", "array", "stack"]);

/** Keys each kind accepts on the body. */
const KEYS = {
  list: ["title", "note", "compact", "kind", "cells", "head", "doubly", "cycle"],
  array: ["title", "note", "compact", "kind", "cells", "pointers", "start"],
  stack: ["title", "note", "compact", "kind", "cells", "top"],
};

/**
 * @typedef {string | number} Value
 * @typedef {{ v: Value, label: string, tone: string }} ListCell
 * @typedef {{ v: Value, tone: string }} Cell
 * @typedef {{ name: string, at: number, tone: string }} Pointer
 * @typedef {{ title: string, note: string, compact: boolean }} Common
 * @typedef {Common & { kind: "list", cells: ListCell[], head: string, doubly: boolean, cycle: number | null }} ListBody
 * @typedef {Common & { kind: "array", cells: Cell[], pointers: Pointer[], start: number }} ArrayBody
 * @typedef {Common & { kind: "stack", cells: Cell[], top: string }} StackBody
 * @typedef {ListBody | ArrayBody | StackBody} StructureBody
 */

/* ------------------------------------------------------------------ schema */

const isValue = (/** @type {unknown} */ v) => typeof v === "string" || (typeof v === "number" && Number.isFinite(v));

/** A cell value: a string or a finite number. */
function wantValue(/** @type {Ctx} */ ctx, /** @type {unknown} */ v, /** @type {string} */ pointer) {
  return isValue(v) || ctx.at(pointer, `expected a string or number, got ${show(v)}`);
}

/** An integer in `lo..hi`, the range named back when it misses. */
function wantIndex(/** @type {Ctx} */ ctx, /** @type {unknown} */ v, /** @type {string} */ pointer, /** @type {number} */ lo, /** @type {number} */ hi) {
  if (Number.isInteger(v) && /** @type {number} */ (v) >= lo && /** @type {number} */ (v) <= hi) return true;
  return ctx.at(pointer, `expected an index ${lo}..${hi}, got ${show(v)}`);
}

/**
 * `{ kind: "list" | "array" | "stack", cells, ... }`. Each kind has its own key
 * set; indices (`cycle`, a pointer's `at`) must land on a real cell.
 */
/** A structure is one row (or column) of cells; past this it no longer fits a page. */
const MAX_CELLS = 64;

export function validate(errors, block, file) {
  const ctx = new Ctx(errors, file, block.line, "structure");
  if (!wantObject(ctx, block.data, "", "an object { kind, cells }")) return;
  const body = /** @type {Record<string, unknown>} */ (block.data);

  optionalString(ctx, body.title, "/title");
  optionalString(ctx, body.note, "/note");
  optionalBoolean(ctx, body.compact, "/compact");
  const kind = /** @type {typeof KINDS[number]} */ (body.kind);
  if (!KINDS.includes(kind)) {
    ctx.at("/kind", `expected one of ${KINDS.join(" ")}, got ${show(body.kind)}`);
    return;
  }
  unknownKeys(ctx, body, "", KEYS[kind]);

  if (Array.isArray(body.cells) && body.cells.length > MAX_CELLS) {
    ctx.at("/cells", `expected at most ${MAX_CELLS} cells, got ${body.cells.length}`);
    return;
  }
  const cells = wantNonEmptyArray(ctx, body.cells, "/cells", "at least one cell") ? /** @type {unknown[]} */ (body.cells) : null;
  cells?.forEach((cell, i) => {
    const cp = ptr("", "cells", i);
    if (kind !== "list" && !isObject(cell)) {
      wantValue(ctx, cell, cp);
      return;
    }
    if (!wantObject(ctx, cell, cp, kind === "list" ? "a cell { v }" : "a value or a cell { v }")) return;
    wantValue(ctx, cell.v, ptr(cp, "v"));
    optionalEnum(ctx, cell.tone, ptr(cp, "tone"), DIAGRAM_TONES);
    if (kind === "list") optionalString(ctx, cell.label, ptr(cp, "label"));
    unknownKeys(ctx, cell, cp, kind === "list" ? ["v", "label", "tone"] : ["v", "tone"]);
  });
  const last = cells ? cells.length - 1 : Infinity;

  if (kind === "list") {
    if (body.head !== undefined) wantText(ctx, body.head, "/head", "a pointer name");
    optionalBoolean(ctx, body.doubly, "/doubly");
    if (body.cycle !== undefined && body.cycle !== null) wantIndex(ctx, body.cycle, "/cycle", 0, last);
  } else if (kind === "array") {
    const start = body.start ?? 0;
    if (!Number.isInteger(start) || Math.abs(start) > 1e9) ctx.at("/start", `expected an integer within ±1e9, got ${show(body.start)}`);
    if (body.pointers !== undefined && !tooMany(ctx, body.pointers, "/pointers", 64, "pointers") && wantArray(ctx, body.pointers, "/pointers", "an array of pointers")) {
      /** @type {unknown[]} */ (body.pointers).forEach((p, i) => {
        const pp = ptr("", "pointers", i);
        if (!wantObject(ctx, p, pp, "a pointer { name, at }")) return;
        wantText(ctx, p.name, ptr(pp, "name"), "a pointer name");
        if (Number.isInteger(start) && Math.abs(start) <= 1e9) wantIndex(ctx, p.at, ptr(pp, "at"), /** @type {number} */ (start), /** @type {number} */ (start) + last);
        optionalEnum(ctx, p.tone, ptr(pp, "tone"), DIAGRAM_TONES);
        unknownKeys(ctx, p, pp, ["name", "at", "tone"]);
      });
    }
  } else if (body.top !== undefined) {
    wantText(ctx, body.top, "/top", "a pointer name");
  }
}

/**
 * Fill defaults on a validated body. Bare array and stack values become
 * `{ v, tone: "" }`; `cycle: null` means the list ends in a null mark.
 * @returns {StructureBody}
 */
export function normalize(data) {
  const base = { title: "", note: "", compact: false, ...data };
  const cell = (c) => (isObject(c) ? { tone: "", ...c } : { v: c, tone: "" });
  switch (data.kind) {
    case "list":
      return { head: "", doubly: false, cycle: null, ...base, cells: data.cells.map((c) => ({ label: "", tone: "", ...c })) };
    case "array":
      return {
        start: 0, ...base, cells: data.cells.map(cell),
        pointers: (data.pointers ?? []).map((p) => ({ tone: "", ...p })),
      };
    default:
      return { top: "", ...base, cells: data.cells.map(cell) };
  }
}

/* ------------------------------------------------------------------ render */

/** @typedef {{ x0: number, y0: number, x1: number, y1: number }} Box */

const H = 34;        // cell height
const PTR = 24;      // width of a pointer field in a list cell
const LINK = 38;     // gap a next arrow spans between list cells
const FONT = 13;     // value size, code face

const valueW = (/** @type {Value} */ v, min = 36) => Math.max(min, textW(v, FONT, true) + 20);
const value = (/** @type {number} */ x, /** @type {number} */ y, /** @type {Value} */ v) =>
  text(x, y + 4.5, v, { cls: "node-label", mono: true });
/** A cell outline. A toned cell gets its tone as outline and as a faint fill. */
const rect = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ w, /** @type {number} */ h, tone = "") => {
  const ink = inkOf(tone, INK.rule);
  const fill = tone ? `fill="${ink}" fill-opacity="0.18"` : `fill="${INK.fill}"`;
  return `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" ${fill} stroke="${ink}" stroke-width="1.5"/>`;
};
const arrow = (/** @type {string} */ d, /** @type {string} */ color, /** @type {string} */ id) =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.4" marker-end="url(#${id})"/>`;

/** Render a validated, normalized `structure` block. */
export function render(block) {
  const s = /** @type {StructureBody} */ (block.data);
  const mk = markers();
  const { body, rects } = s.kind === "list" ? list(s, mk) : s.kind === "array" ? array(s, mk) : stack(s, mk);
  const svg = svgOpen(bounds(rects, 10), { label: s.title || `${s.kind} structure`, compact: s.compact });
  return figure(svg + mk.defs() + body + "</svg>", s.title, s.note);
}

/**
 * A linked list. Each cell is `[value | next]`, or `[prev | value | next]` when
 * doubly linked; next arrows run along the top half, prev arrows along the bottom.
 * @param {ListBody} s @param {ReturnType<typeof markers>} mk
 */
function list(s, mk) {
  const ink = INK.bright, id = mk.id(ink);
  const fields = s.doubly ? 2 : 1;
  const nextY = s.doubly ? H / 2 - 6 : H / 2, prevY = H / 2 + 6;
  const headW = s.head ? textW(s.head, 12, true) : 0;
  let x = s.head ? headW + 40 : 0;
  const cells = s.cells.map((c) => {
    const vw = valueW(c.v);
    const cell = { c, x, vw, w: vw + PTR * fields };
    x += cell.w + LINK;
    return cell;
  });
  /** @type {Box[]} */
  const rects = [];
  let body = "";
  /** A slash through a pointer field: the null pointer. */
  const nil = (/** @type {number} */ fx) =>
    `<path d="M${n(fx + 5)},${n(H - 5)} L${n(fx + PTR - 5)},${n(5)}" stroke="${INK.rule}" stroke-width="1.4"/>`;
  const dot = (/** @type {number} */ cx, /** @type {number} */ cy) => `<circle cx="${n(cx)}" cy="${n(cy)}" r="3" fill="${ink}"/>`;

  if (s.head) {
    body += text(0, H / 2 + 4, s.head, { mono: true, size: 12, anchor: "start" });
    body += arrow(`M${n(headW + 6)},${n(H / 2)} L${n(cells[0].x - 1)},${n(H / 2)}`, ink, id);
    rects.push({ x0: 0, y0: 0, x1: headW, y1: H });
  }
  cells.forEach((cell, i) => {
    const { c, x: cx, vw, w } = cell;
    const vx = cx + (s.doubly ? PTR : 0), nx = vx + vw;
    const dividers = (s.doubly ? [vx, nx] : [nx]).map((dx) => `M${n(dx)},0 V${H}`).join(" ");
    body += rect(cx, 0, w, H, c.tone) + `<path d="${dividers}" stroke="${inkOf(c.tone, INK.rule)}" stroke-width="1.2"/>`;
    body += value(vx + vw / 2, H / 2, c.v);
    if (c.label) body += text(cx + w / 2, H + 16, c.label, { mono: true, size: 11 });
    rects.push({ x0: cx, y0: 0, x1: cx + w, y1: c.label ? H + 20 : H });

    const next = cells[i + 1];
    if (next) {
      body += dot(nx + PTR / 2, nextY) + arrow(`M${n(nx + PTR / 2)},${n(nextY)} L${n(next.x - 1)},${n(nextY)}`, ink, id);
    } else if (s.cycle === null) {
      body += nil(nx);
    } else {
      // Back up over the row and down into the target cell.
      const to = cells[s.cycle], tx = to.x + (s.doubly ? PTR : 0) + to.vw / 2, sx = nx + PTR / 2;
      body += dot(sx, nextY) + arrow(`M${n(sx)},${n(nextY)} C${n(sx + 40)},${n(-44)} ${n(tx)},${n(-44)} ${n(tx)},-1`, ink, id);
      rects.push({ x0: tx, y0: -36, x1: sx + 30, y1: 0 });
    }
    if (s.doubly) {
      if (i === 0) body += nil(cx);
      else {
        const prev = cells[i - 1];
        body += dot(cx + PTR / 2, prevY) + arrow(`M${n(cx + PTR / 2)},${n(prevY)} L${n(prev.x + prev.w + 1)},${n(prevY)}`, ink, id);
      }
    }
  });
  return { body, rects };
}

/**
 * An array: equal cells, indices above from `start`, pointers below. Several
 * pointers at one index stack their names under a single arrow, and a group
 * drops a row whenever its names would collide with the group to its left.
 * @param {ArrayBody} s @param {ReturnType<typeof markers>} mk
 */
function array(s, mk) {
  const cw = Math.max(...s.cells.map((c) => valueW(c.v)));
  let body = "", toned = "";
  s.cells.forEach((c, i) => {
    const x = i * cw;
    // Toned cells draw after plain ones so their outline is not painted over by a neighbour.
    if (c.tone) toned += rect(x, 0, cw, H, c.tone); else body += rect(x, 0, cw, H);
    toned += value(x + cw / 2, H / 2, c.v);
    toned += text(x + cw / 2, -8, s.start + i, { mono: true, size: 10.5 });
  });
  body += toned;
  /** @type {Box[]} */
  const rects = [{ x0: 0, y0: -20, x1: s.cells.length * cw, y1: H }];

  /** @type {Map<number, Pointer[]>} */
  const groups = new Map();
  for (const p of s.pointers) groups.set(p.at, [...(groups.get(p.at) ?? []), p]);
  const rowH = 15, top = H + 34;
  /** @type {Box[]} */
  const placed = [];
  for (const [at, ps] of [...groups].sort((a, b) => a[0] - b[0])) {
    const x = (at - s.start) * cw + cw / 2;
    const boxes = (/** @type {number} */ row) => ps.map((p, k) => {
      const w = textW(p.name, 12, true);
      const y = top + (row + k) * rowH;
      return { x0: x - w / 2 - 3, y0: y - 11, x1: x + w / 2 + 3, y1: y + 3 };
    });
    let row = 0;
    while (boxes(row).some((b) => placed.some((o) => b.x0 < o.x1 && o.x0 < b.x1 && b.y0 < o.y1 && o.y0 < b.y1))) row++;
    const color = inkOf(ps[0].tone, INK.bright);
    body += arrow(`M${n(x)},${n(top - 14 + row * rowH)} L${n(x)},${n(H + 3)}`, color, mk.id(color));
    ps.forEach((p, k) => { body += text(x, top + (row + k) * rowH, p.name, { mono: true, size: 12, color: inkOf(p.tone, INK.text) }); });
    placed.push(...boxes(row));
  }
  rects.push(...placed);
  return { body, rects };
}

/**
 * A stack drawn as a column, top cell first, with `top` pointing at it from the left.
 * @param {StackBody} s @param {ReturnType<typeof markers>} mk
 */
function stack(s, mk) {
  const w = Math.max(80, ...s.cells.map((c) => valueW(c.v) + 8)), h = 30;
  let body = "", toned = "";
  s.cells.forEach((c, i) => {
    const y = i * h;
    if (c.tone) toned += rect(0, y, w, h, c.tone); else body += rect(0, y, w, h);
    toned += value(w / 2, y + h / 2, c.v);
  });
  body += toned;
  /** @type {Box[]} */
  const rects = [{ x0: 0, y0: 0, x1: w, y1: s.cells.length * h }];
  if (s.top) {
    const tw = textW(s.top, 12, true);
    body += text(-34, h / 2 + 4, s.top, { mono: true, size: 12, anchor: "end" });
    body += arrow(`M-28,${n(h / 2)} L-3,${n(h / 2)}`, INK.bright, mk.id(INK.bright));
    rects.push({ x0: -34 - tw, y0: 0, x1: 0, y1: h });
  }
  return { body, rects };
}

