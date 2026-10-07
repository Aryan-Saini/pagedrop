/**
 * `er` fence: tables with typed fields, and the references between them.
 *
 * Body:
 *   { title?, note?, compact?,
 *     entities: [{ name, fields: [[name, type] | { name, type, key?: "pk" | "fk" }] }],
 *     links?: [{ from: "table.field", to: "table.field", card? = "N:1" }] }
 *
 * Entities sit in a grid, up to three per row. A link joins the exact field
 * rows it names: neighbouring columns meet across the gap between them, one
 * column loops out to its right, and anything further apart runs around the
 * outside of the grid so it never crosses a box.
 *
 * @module render/diagrams/er
 */

import {
  Ctx, ptr, show, wantObject, wantArray, wantNonEmptyArray, wantText, optionalString, optionalBoolean,
  optionalEnum, unknownKeys,
} from "../schema/common.js";
import { INK, inkOf, text, svgOpen, figure, bounds, textW, n } from "./svg.js";

export const KEYS = /** @type {const} */ (["pk", "fk"]);

/**
 * @typedef {{ name: string, type: string, key: "" | typeof KEYS[number] }} Field
 * @typedef {{ name: string, fields: Field[] }} Entity
 * @typedef {{ from: { table: string, field: string }, to: { table: string, field: string }, card: string }} Link
 * @typedef {{ title: string, note: string, compact: boolean, entities: Entity[], links: Link[] }} ErData
 */

const CARD = /^[^:\s]+:[^:\s]+$/;

/** Validate an `er` fence body. */
export function validate(errors, block, file) {
  const ctx = new Ctx(errors, file, block.line, "er");
  if (!wantObject(ctx, block.data, "", "an object { entities, links }")) return;
  const body = /** @type {Record<string, any>} */ (block.data);
  optionalString(ctx, body.title, "/title");
  optionalString(ctx, body.note, "/note");
  optionalBoolean(ctx, body.compact, "/compact");
  unknownKeys(ctx, body, "", ["title", "note", "compact", "entities", "links"]);

  /** table name -> its field names */
  /** @type {Map<string, string[]>} */
  const tables = new Map();
  if (wantNonEmptyArray(ctx, body.entities, "/entities", "at least one entity")) {
    body.entities.forEach((e, i) => {
      const ep = ptr("", "entities", i);
      if (!wantObject(ctx, e, ep, "an entity { name, fields }")) return;
      unknownKeys(ctx, e, ep, ["name", "fields"]);
      /** @type {string[]} */
      const names = [];
      if (wantText(ctx, e.name, ptr(ep, "name"), "a table name")) {
        if (tables.has(e.name)) ctx.at(ptr(ep, "name"), `duplicate table ${show(e.name)}; a link addresses a table by name`);
        else tables.set(e.name, names);
      }
      if (!wantNonEmptyArray(ctx, e.fields, ptr(ep, "fields"), "at least one field")) return;
      e.fields.forEach((f, k) => {
        const fp = ptr(ep, "fields", k);
        let name;
        if (Array.isArray(f)) {
          if (f.length !== 2) {
            ctx.at(fp, `expected [name, type], got an array of ${f.length}`);
            return;
          }
          if (wantText(ctx, f[0], ptr(fp, 0), "a field name")) name = f[0];
          wantText(ctx, f[1], ptr(fp, 1), "a field type");
        } else if (wantObject(ctx, f, fp, "[name, type] or { name, type, key }")) {
          unknownKeys(ctx, f, fp, ["name", "type", "key"]);
          if (wantText(ctx, f.name, ptr(fp, "name"), "a field name")) name = f.name;
          wantText(ctx, f.type, ptr(fp, "type"), "a field type");
          optionalEnum(ctx, f.key, ptr(fp, "key"), KEYS);
        }
        if (name === undefined) return;
        if (names.includes(name)) ctx.at(fp, `duplicate field ${show(name)} in ${show(e.name)}`);
        else names.push(name);
      });
    });
  }

  if (body.links === undefined || !wantArray(ctx, body.links, "/links", "an array of links")) return;
  body.links.forEach((l, i) => {
    const lp = ptr("", "links", i);
    if (!wantObject(ctx, l, lp, "a link { from, to, card }")) return;
    unknownKeys(ctx, l, lp, ["from", "to", "card"]);
    if (l.card !== undefined && !(typeof l.card === "string" && CARD.test(l.card))) {
      ctx.at(ptr(lp, "card"), `expected a cardinality like "N:1" or "1:1", got ${show(l.card)}`);
    }
    for (const end of /** @type {const} */ (["from", "to"])) {
      const p = ptr(lp, end);
      const ref = l[end];
      const dot = typeof ref === "string" ? ref.indexOf(".") : -1;
      if (dot <= 0 || dot === ref.length - 1) {
        ctx.at(p, `expected "table.field", got ${show(ref)}`);
        continue;
      }
      const table = ref.slice(0, dot), field = ref.slice(dot + 1);
      const fields = tables.get(table);
      if (!fields) ctx.at(p, `no table named ${show(table)}; tables: ${[...tables.keys()].join(" ")}`);
      else if (!fields.includes(field)) ctx.at(p, `no field ${show(field)} in ${show(table)}; fields: ${fields.join(" ")}`);
    }
  });
}

/** Split a validated `table.field` reference at its first dot. */
const splitRef = (ref) => {
  const dot = ref.indexOf(".");
  return { table: ref.slice(0, dot), field: ref.slice(dot + 1) };
};

/**
 * Fill defaults on a validated body.
 * @returns {ErData}
 */
export function normalize(data) {
  return {
    title: data.title ?? "",
    note: data.note ?? "",
    compact: data.compact ?? false,
    entities: data.entities.map((e) => ({
      name: e.name,
      fields: e.fields.map((f) => Array.isArray(f)
        ? { name: f[0], type: f[1], key: "" }
        : { name: f.name, type: f.type, key: f.key ?? "" }),
    })),
    links: (data.links ?? []).map((l) => ({ from: splitRef(l.from), to: splitRef(l.to), card: l.card ?? "N:1" })),
  };
}

const PER_ROW = 3, HEAD = 30, RH = 22, PAD = 4, GX = 64, GY = 44;
const FIELD_SIZE = 11.5, TYPE_SIZE = 11, KEY_SIZE = 9.5, CARD_SIZE = 11;
/** Spacing between parallel routes in one channel. */
const LANE = 12;

/** @typedef {{ x: number, y: number, w: number, h: number, row: number, col: number, e: Entity }} Placed */

/**
 * Grid placement: up to three entities per row, every box the same width,
 * every grid row as tall as its tallest box.
 * @param {ErData} d
 */
export function place(d) {
  const keyed = d.entities.some((e) => e.fields.some((f) => f.key));
  const gutter = keyed ? 24 : 0;
  const bw = Math.max(180, ...d.entities.flatMap((e) => [
    textW(e.name) * 1.08 + 28,
    ...e.fields.map((f) => 12 + gutter + textW(f.name, FIELD_SIZE, true) + 20 + textW(f.type, TYPE_SIZE, true) + 12),
  ]));
  const heightOf = (e) => HEAD + e.fields.length * RH + PAD * 2;
  const rows = Math.ceil(d.entities.length / PER_ROW);
  const rowH = Array.from({ length: rows }, (_, r) =>
    Math.max(...d.entities.slice(r * PER_ROW, (r + 1) * PER_ROW).map(heightOf)));
  const rowY = rowH.map((_, r) => rowH.slice(0, r).reduce((s, h) => s + h + GY, 0));
  /** @type {Map<string, Placed>} */
  const at = new Map();
  d.entities.forEach((e, i) => {
    const row = Math.floor(i / PER_ROW), col = i % PER_ROW;
    at.set(e.name, { x: col * (bw + GX), y: rowY[row], w: bw, h: heightOf(e), row, col, e });
  });
  return { at, bw, gutter };
}

/** Vertical centre of a field row. */
const rowMid = (p, field) => p.y + HEAD + PAD + p.e.fields.findIndex((f) => f.name === field) * RH + RH / 2;

/**
 * Render a validated, normalized `er` block.
 * @param {{ data: ErData }} block
 */
export function render(block) {
  const d = block.data;
  const { at, bw, gutter } = place(d);
  const typeInk = inkOf("c7", INK.text);
  const pkInk = inkOf("c4", INK.text), fkInk = inkOf("c1", INK.text);

  /** @type {{ x0: number, y0: number, x1: number, y1: number }[]} */
  const extent = [...at.values()].map((p) => ({ x0: p.x, y0: p.y, x1: p.x + p.w, y1: p.y + p.h }));
  let body = "";
  for (const p of at.values()) {
    body += `<rect x="${n(p.x)}" y="${n(p.y)}" width="${n(p.w)}" height="${n(p.h)}" rx="6" fill="${INK.fill}" stroke="${INK.rule}" stroke-width="1.4"/>`;
    body += `<line x1="${n(p.x)}" y1="${n(p.y + HEAD)}" x2="${n(p.x + p.w)}" y2="${n(p.y + HEAD)}" stroke="${INK.rule}"/>`;
    body += text(p.x + 12, p.y + 20, p.e.name, { cls: "node-label", anchor: "start", weight: 600 });
    p.e.fields.forEach((f) => {
      const y = rowMid(p, f.name) + 4;
      if (f.key) body += text(p.x + 12, y - 0.5, f.key.toUpperCase(), { mono: true, size: KEY_SIZE, anchor: "start", weight: 700, color: f.key === "pk" ? pkInk : fkInk });
      body += text(p.x + 12 + gutter, y, f.name, { mono: true, size: FIELD_SIZE, anchor: "start" });
      body += text(p.x + p.w - 12, y, f.type, { mono: true, size: TYPE_SIZE, anchor: "end", color: typeInk });
    });
  }

  const lastCol = Math.min(PER_ROW, d.entities.length) - 1;
  const top = Math.min(...[...at.values()].map((p) => p.y));

  // Classify every link first: the outside routes have to clear the loops and labels on the outer sides.
  /** @type {Map<string, number>} */
  const loopCount = new Map();
  // The first column's outer side belongs to the outside routes when there are any.
  const outerFree = d.links.every((l) => Math.abs(/** @type {Placed} */ (at.get(l.from.table)).col - /** @type {Placed} */ (at.get(l.to.table)).col) < 2);
  const routes = d.links.map((l) => {
    const a = /** @type {Placed} */ (at.get(l.from.table)), b = /** @type {Placed} */ (at.get(l.to.table));
    const [ca, cb] = l.card.split(":");
    const r = { a, b, ya: rowMid(a, l.from.field), yb: rowMid(b, l.to.field), ca, cb, kind: "cross", side: 1, bulge: 0 };
    if (a.col === b.col) {
      // A loop goes out of the right side, or the free outer side of the first column.
      r.kind = "loop";
      r.side = a.col === 0 && lastCol > 0 && outerFree ? -1 : 1;
      const key = `${a.col}${r.side}`, k = loopCount.get(key) ?? 0;
      loopCount.set(key, k + 1);
      r.bulge = 44 + k * LANE * 1.4;
    } else if (Math.abs(a.col - b.col) > 1) r.kind = "out";
    return r;
  });
  const outs = routes.filter((r) => r.kind === "out");
  const reach = (col, side) => Math.max(0, ...routes.filter((r) => r.kind === "loop" && r.a.col === col && r.side === side).map((r) => r.bulge * 0.75));
  const cardW = Math.max(0, ...outs.flatMap((r) => [textW(r.ca, CARD_SIZE), textW(r.cb, CARD_SIZE)]));
  const leftClear = Math.max(reach(0, -1), cardW + 10) + 14;
  const rightClear = Math.max(reach(lastCol, 1), cardW + 10) + 14;

  let paths = "", cards = "";
  /** @type {Set<string>} */
  const placed = new Set();
  /**
   * A cardinality mark beside the box, pointing away from it. It sits on the
   * side of the line the route does not bend toward, so the curve never runs
   * through it. Two links sharing a port share its mark.
   */
  const card = (x, y, dir, label, bendsUp) => {
    const ty = bendsUp ? y + 13 : y - 5;
    const key = `${n(x)},${n(ty)},${dir},${label}`;
    if (placed.has(key)) return;
    placed.add(key);
    cards += text(x + dir * 7, ty, label, { size: CARD_SIZE, anchor: dir > 0 ? "start" : "end" });
    const w = textW(label, CARD_SIZE) + 7;
    extent.push({ x0: Math.min(x, x + dir * w), y0: ty - 11, x1: Math.max(x, x + dir * w), y1: ty + 2 });
  };

  let k = 0;
  for (const { a, b, ya, yb, ca, cb, kind, side, bulge } of routes) {
    let path;
    if (kind === "cross") {
      // Neighbouring columns: a smooth S across the gap between the facing sides.
      const dir = b.col > a.col ? 1 : -1;
      const x1 = dir > 0 ? a.x + a.w : a.x, x2 = dir > 0 ? b.x : b.x + b.w, mx = (x1 + x2) / 2;
      path = `M${n(x1)},${n(ya)} C${n(mx)},${n(ya)} ${n(mx)},${n(yb)} ${n(x2)},${n(yb)}`;
      card(x1, ya, dir, ca, yb < ya);
      card(x2, yb, -dir, cb, ya < yb);
    } else if (kind === "loop") {
      const x = side > 0 ? a.x + a.w : a.x, bx = x + side * bulge;
      path = `M${n(x)},${n(ya)} C${n(bx)},${n(ya)} ${n(bx)},${n(yb)} ${n(x)},${n(yb)}`;
      extent.push({ x0: Math.min(x, x + side * bulge * 0.75), y0: Math.min(ya, yb), x1: Math.max(x, x + side * bulge * 0.75), y1: Math.max(ya, yb) });
      card(x, ya, side, ca, yb < ya);
      card(x, yb, side, cb, ya < yb);
    } else {
      // Far apart: out the outer sides, over the top of the grid, and down again.
      const lo = a.col < b.col ? { p: a, y: ya } : { p: b, y: yb };
      const hi = a.col < b.col ? { p: b, y: yb } : { p: a, y: ya };
      const xl = -leftClear - k * LANE, xr = (lastCol + 1) * bw + lastCol * GX + rightClear + k * LANE;
      const yc = top - 18 - k * LANE, r = 8;
      k++;
      path = `M${n(lo.p.x)},${n(lo.y)} H${n(xl + r)} Q${n(xl)},${n(lo.y)} ${n(xl)},${n(lo.y - r)} V${n(yc + r)} ` +
        `Q${n(xl)},${n(yc)} ${n(xl + r)},${n(yc)} H${n(xr - r)} Q${n(xr)},${n(yc)} ${n(xr)},${n(yc + r)} ` +
        `V${n(hi.y - r)} Q${n(xr)},${n(hi.y)} ${n(xr - r)},${n(hi.y)} H${n(hi.p.x + hi.p.w)}`;
      extent.push({ x0: xl, y0: yc, x1: xr, y1: yc });
      const [cl, ch] = lo.p === a ? [ca, cb] : [cb, ca];
      card(lo.p.x, lo.y, -1, cl, true);
      card(hi.p.x + hi.p.w, hi.y, 1, ch, true);
    }
    paths += `<path d="${path}" fill="none" stroke="${INK.bright}" stroke-width="1.4"/>`;
  }

  const box = bounds(extent, 8);
  const label = d.title || `tables: ${d.entities.map((e) => e.name).join(", ")}`;
  return figure(svgOpen(box, { label, compact: d.compact }) + paths + body + cards + "</svg>", d.title, d.note);
}
