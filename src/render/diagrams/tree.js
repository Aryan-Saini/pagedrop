/**
 * `tree` fence: any rooted tree, laid out by code from a one-line shorthand
 * (`Root(A,B(C,D))`) or nested node objects.
 *
 * Three layouts: `tidy` (d3 `tree()`, parent centred over its children),
 * `spine` (a Schwartz tree, parent directly above its first child) and
 * `leaves` (d3 `cluster()`, every leaf on the deepest row, for parse trees).
 * Breadth spacing comes from the measured size of each node and of whatever is
 * printed beside its edge, so labels never collide however lopsided the tree.
 *
 * A node may carry values flowing along its edge: `up` (child to parent, red)
 * and `down` (parent to child, blue), each optionally numbered by `step`. The
 * edge is then drawn as two bowed curves, one per direction, with a badge at
 * the sending end. `until` hides later steps without moving anything, so a
 * series of fences reads as snapshots of one computation.
 *
 * @module render/diagrams/tree
 */

import { hierarchy, tree as d3tree, cluster } from "d3-hierarchy";
import {
  Ctx, ptr, show, isObject, wantObject, wantArray, wantNonEmptyArray, optionalString, optionalBoolean,
  optionalEnum, unknownKeys,
} from "../schema/common.js";
import {
  INK, DIAGRAM_TONES, inkOf, markers, text, badge, clip, svgOpen, figure, bounds, textW, n,
} from "./svg.js";

export const SHAPES = /** @type {const} */ (["box", "round", "circle", "ellipse", "dot", "cells"]);
export const DIRS = /** @type {const} */ (["down", "up", "right", "left"]);
export const LAYOUTS = /** @type {const} */ (["tidy", "spine", "leaves"]);
export const ARROWS = /** @type {const} */ (["none", "toParent", "toChild"]);
export const MAX_NODES = 400;
export const MAX_DEPTH = 32;

const TOP_KEYS = ["title", "note", "compact", "tree", "dir", "layout", "shape", "mono", "arrows", "levels", "until"];
const NODE_KEYS = ["label", "children", "shape", "tone", "mono", "below", "belowTone", "edge", "cells", "up", "down"];

/** @typedef {typeof SHAPES[number]} Shape */
/** @typedef {typeof DIRS[number]} Dir */
/** A value on an edge. `step` 0 means unnumbered, which `until` never hides. */
/** @typedef {{ v: string, step: number }} Flow */
/**
 * A normalized node: every key present, shape and mono already resolved
 * against the tree-wide defaults.
 * @typedef {{
 *   label: string, children: TreeNode[], shape: Shape, tone: string, mono: boolean,
 *   below: string, belowTone: string, edge: string, cells: string[], up: Flow | null, down: Flow | null,
 * }} TreeNode
 */
/**
 * A normalized `tree` body. `until` 0 shows every step.
 * @typedef {{
 *   title: string, note: string, compact: boolean, tree: TreeNode, dir: Dir,
 *   layout: typeof LAYOUTS[number], shape: Shape, mono: boolean, arrows: typeof ARROWS[number],
 *   levels: string[], until: number,
 * }} TreeSpec
 */
/** What the shorthand parser produces: labels and structure only. */
/** @typedef {{ label: string, children: RawNode[] }} RawNode */

/* ------------------------------------------------------------------ shorthand */

class ShorthandError extends Error {}

/**
 * Parse `Label(Child,Child(Grand,Grand))` into nested `{ label, children }`.
 * Labels are trimmed and may hold anything but `(`, `)` and `,`; an empty
 * label is allowed. Errors name the 0-based character offset and what was
 * expected there.
 *
 * @param {string} src
 * @returns {{ node: RawNode, count: number, depth: number } | { error: string }}
 */
export function parseShorthand(src) {
  if (src.trim() === "") return { error: `expected a shorthand like "Root(A,B(C,D))", got an empty string` };
  let i = 0, count = 0, depth = 0;
  const got = () => (i < src.length ? JSON.stringify(src[i]) : "end of text");
  const skipSpace = () => { while (i < src.length && /\s/.test(src[i])) i++; };

  /** @returns {RawNode} */
  const node = (/** @type {number} */ d) => {
    if (d > MAX_DEPTH) throw new ShorthandError(`expected at most ${MAX_DEPTH} levels of nesting, got deeper at offset ${i}`);
    if (++count > MAX_NODES) throw new ShorthandError(`expected at most ${MAX_NODES} nodes, got more by offset ${i}; split the tree across several fences`);
    depth = Math.max(depth, d);
    const start = i;
    while (i < src.length && !"(),".includes(src[i])) i++;
    const label = src.slice(start, i).trim();
    /** @type {RawNode[]} */
    const children = [];
    if (src[i] === "(") {
      const open = i++;
      skipSpace();
      if (src[i] === ")") {
        throw new ShorthandError(`expected a child at offset ${i}, got ")"; "${label}()" is an empty child list, drop the "()" to make a leaf`);
      }
      children.push(node(d + 1));
      while (src[i] === ",") { i++; children.push(node(d + 1)); }
      if (src[i] !== ")") {
        const unclosed = i >= src.length ? `; the "(" at offset ${open} is never closed` : "";
        throw new ShorthandError(`expected "," or ")" at offset ${i}, got ${got()}${unclosed}`);
      }
      i++;
      skipSpace();
    }
    return { label, children };
  };

  try {
    const root = node(0);
    skipSpace();
    if (i < src.length) {
      if (src[i] === ")") throw new ShorthandError(`unexpected ")" at offset ${i}; it closes no "("`);
      const hint = src[i] === "," ? `; a tree has one root, so wrap siblings in a parent like "root(A,B)"` : "";
      throw new ShorthandError(`expected end of text at offset ${i}, got ${got()}${hint}`);
    }
    return { node: root, count, depth };
  } catch (e) {
    if (e instanceof ShorthandError) return { error: e.message };
    throw e;
  }
}

/* ------------------------------------------------------------------ validation */

/** A label-like scalar: a string or a finite number. */
const isScalar = (v) => typeof v === "string" || (typeof v === "number" && Number.isFinite(v));
const isPositiveInt = (v) => Number.isInteger(v) && /** @type {number} */ (v) > 0;

/** `up` / `down`: a string, a number, or `{ v, step }`. */
function checkFlow(ctx, v, pointer) {
  if (v === undefined || isScalar(v)) return;
  if (!isObject(v)) {
    ctx.at(pointer, `expected a string, a number or { "v": value, "step": n }, got ${show(v)}`);
    return;
  }
  if (!isScalar(v.v)) ctx.at(ptr(pointer, "v"), `expected a string or a number, got ${show(v.v)}`);
  if (v.step !== undefined && !isPositiveInt(v.step)) ctx.at(ptr(pointer, "step"), `expected a positive integer, got ${show(v.step)}`);
  unknownKeys(ctx, v, pointer, ["v", "step"]);
}

/**
 * Validate one node object and its subtree. `shape` is the tree-wide default,
 * needed to decide whether `cells` is required here.
 */
function checkNode(ctx, node, pointer, depth, shape) {
  if (!wantObject(ctx, node, pointer, "a node object { label, children }")) return;
  if (node.label !== undefined && !isScalar(node.label)) {
    ctx.at(ptr(pointer, "label"), `expected a string or a number, got ${show(node.label)}`);
  }
  optionalEnum(ctx, node.shape, ptr(pointer, "shape"), SHAPES);
  optionalEnum(ctx, node.tone, ptr(pointer, "tone"), DIAGRAM_TONES);
  optionalEnum(ctx, node.belowTone, ptr(pointer, "belowTone"), DIAGRAM_TONES);
  optionalBoolean(ctx, node.mono, ptr(pointer, "mono"));
  optionalString(ctx, node.below, ptr(pointer, "below"));
  optionalString(ctx, node.edge, ptr(pointer, "edge"));
  checkFlow(ctx, node.up, ptr(pointer, "up"));
  checkFlow(ctx, node.down, ptr(pointer, "down"));
  unknownKeys(ctx, node, pointer, NODE_KEYS);

  if (depth === 0) {
    if (node.down !== undefined) ctx.at(ptr(pointer, "down"), `the root has no parent to receive a value from; use "up" for the tree's output`);
    if (node.edge !== undefined) ctx.at(ptr(pointer, "edge"), `the root has no edge to its parent to label`);
  }

  const own = typeof node.shape === "string" && SHAPES.includes(/** @type {Shape} */ (node.shape)) ? node.shape : shape;
  if (own === "cells") {
    if (node.cells === undefined) ctx.at(ptr(pointer, "cells"), `expected an array of values for shape "cells", got nothing`);
  } else if (node.cells !== undefined) {
    ctx.at(ptr(pointer, "cells"), `only applies to shape "cells"; this node's shape is "${own}"`);
  }
  if (node.cells !== undefined && wantNonEmptyArray(ctx, node.cells, ptr(pointer, "cells"), "at least one cell value")) {
    /** @type {unknown[]} */ (node.cells).forEach((c, i) => {
      if (!isScalar(c)) ctx.at(ptr(pointer, "cells", i), `expected a string or a number, got ${show(c)}`);
    });
  }

  if (node.children === undefined) return;
  if (!wantArray(ctx, node.children, ptr(pointer, "children"), "an array of child nodes")) return;
  if (depth >= MAX_DEPTH && node.children.length) {
    ctx.at(ptr(pointer, "children"), `expected at most ${MAX_DEPTH} levels of nesting, got deeper; a tree that deep will not fit on a page`);
    return;
  }
  node.children.forEach((c, i) => checkNode(ctx, c, ptr(pointer, "children", i), depth + 1, shape));
}

/** Node count and depth of a raw node object, stopping early past the caps. */
function measureRaw(node, depth = 0) {
  let count = 1, max = depth;
  if (depth < MAX_DEPTH && isObject(node) && Array.isArray(node.children)) {
    for (const c of node.children) {
      const sub = measureRaw(c, depth + 1);
      count += sub.count;
      max = Math.max(max, sub.depth);
      if (count > MAX_NODES) break;
    }
  }
  return { count, depth: max };
}

/** Validate a `tree` fence body, collecting every problem in one pass. */
export function validate(errors, block, file) {
  const ctx = new Ctx(errors, file, block.line, "tree");
  if (!wantObject(ctx, block.data, "", "an object { tree }")) return;
  const body = /** @type {Record<string, unknown>} */ (block.data);

  optionalString(ctx, body.title, "/title");
  optionalString(ctx, body.note, "/note");
  optionalBoolean(ctx, body.compact, "/compact");
  optionalBoolean(ctx, body.mono, "/mono");
  optionalEnum(ctx, body.dir, "/dir", DIRS);
  optionalEnum(ctx, body.layout, "/layout", LAYOUTS);
  optionalEnum(ctx, body.shape, "/shape", SHAPES);
  optionalEnum(ctx, body.arrows, "/arrows", ARROWS);
  if (body.until !== undefined && !isPositiveInt(body.until)) ctx.at("/until", `expected a positive integer step, got ${show(body.until)}`);
  unknownKeys(ctx, body, "", TOP_KEYS);

  const shape = typeof body.shape === "string" && SHAPES.includes(/** @type {Shape} */ (body.shape)) ? body.shape : "box";
  /** @type {number | null} */
  let depth = null;
  if (typeof body.tree === "string") {
    const parsed = parseShorthand(body.tree);
    if ("error" in parsed) ctx.at("/tree", parsed.error);
    else if (shape === "cells") ctx.at("/shape", `"cells" needs per-node cells, which the shorthand cannot carry; write the tree as node objects`);
    else depth = parsed.depth;
  } else if (isObject(body.tree)) {
    const size = measureRaw(body.tree);
    if (size.count > MAX_NODES) {
      ctx.at("/tree", `expected at most ${MAX_NODES} nodes, got more; split the tree across several fences`);
    } else {
      checkNode(ctx, body.tree, "/tree", 0, shape);
      depth = size.depth;
    }
  } else {
    ctx.at("/tree", `expected a shorthand string like "Root(A,B)" or a node object { label, children }, got ${show(body.tree)}`);
  }

  if (body.levels !== undefined && wantArray(ctx, body.levels, "/levels", "an array of strings, one per depth")) {
    const levels = /** @type {unknown[]} */ (body.levels);
    levels.forEach((s, i) => {
      if (typeof s !== "string") ctx.at(ptr("/levels", i), `expected a string, got ${show(s)}`);
    });
    if (depth !== null && levels.length > depth + 1) {
      ctx.at("/levels", `expected at most ${depth + 1} ${depth === 0 ? "level" : "levels"} (one per depth, the tree is ${depth} deep), got ${levels.length}`);
    }
  }
}

/* ------------------------------------------------------------------ normalize */

/** @returns {Flow | null} */
function normFlow(v) {
  if (v === undefined || v === null) return null;
  if (isObject(v)) return { v: String(v.v ?? ""), step: typeof v.step === "number" ? v.step : 0 };
  return { v: String(v), step: 0 };
}

/**
 * Fill every node key. Defensive about shape because `render()` in the CLI
 * normalizes even when validation failed; it must not throw on bad input.
 * @returns {TreeNode}
 */
function normNode(raw, shape, mono, depth = 0) {
  const o = isObject(raw) ? raw : {};
  const kids = Array.isArray(o.children) && depth < MAX_DEPTH ? o.children : [];
  return {
    label: o.label === undefined ? "" : String(o.label),
    children: kids.map((c) => normNode(c, shape, mono, depth + 1)),
    shape: /** @type {Shape} */ (o.shape ?? shape),
    tone: typeof o.tone === "string" ? o.tone : "",
    mono: typeof o.mono === "boolean" ? o.mono : mono,
    below: typeof o.below === "string" ? o.below : "",
    belowTone: typeof o.belowTone === "string" ? o.belowTone : "",
    edge: typeof o.edge === "string" ? o.edge : "",
    cells: Array.isArray(o.cells) ? o.cells.map(String) : [],
    up: normFlow(o.up),
    down: normFlow(o.down),
  };
}

/**
 * Fill defaults and expand the shorthand into node objects.
 * @returns {TreeSpec}
 */
export function normalize(data) {
  const shape = data.shape ?? "box";
  const mono = data.mono ?? false;
  const parsed = typeof data.tree === "string" ? parseShorthand(data.tree) : null;
  const raw = parsed ? ("node" in parsed ? parsed.node : {}) : data.tree;
  return {
    title: data.title ?? "",
    note: data.note ?? "",
    compact: data.compact ?? false,
    tree: normNode(raw, shape, mono),
    dir: data.dir ?? "down",
    layout: data.layout ?? "tidy",
    shape,
    mono,
    arrows: data.arrows ?? "none",
    levels: Array.isArray(data.levels) ? data.levels : [],
    until: data.until ?? 0,
  };
}

/* ------------------------------------------------------------------ layout */

const LABEL_PX = 13, MONO_PX = 12, SMALL_PX = 11.5;
const BELOW_H = 20;      // room under a node for its `below` line
const VALUE_OFF = 15;    // value label distance from its edge, clear of the curve and its badge
const VALUE_AT = 0.68;   // value labels sit this far along the edge toward the child
const BADGE_AT = 0.2;    // step badges sit this far from the sending end
const OUT_LEN = 28;      // the root's output arrow

/**
 * A node placed on the page. `b` is its breadth coordinate (across siblings),
 * `row` its index along the depth axis; `x`/`y` are filled in last.
 * @typedef {{
 *   n: TreeNode, parent: Placed | null, kids: Placed[], first: boolean, depth: number, row: number,
 *   w: number, h: number, labelW: number, belowW: number, b: number, x: number, y: number,
 * }} Placed
 */

const labelPx = (nd) => (nd.mono ? MONO_PX : LABEL_PX);
const cellW = (nd) => Math.max(22, ...nd.cells.map((c) => textW(c, MONO_PX, true) + 10));

/** Outline size of a node, from its shape and label. */
function measure(nd) {
  const tw = nd.label === "" ? 0 : textW(nd.label, labelPx(nd), nd.mono);
  switch (nd.shape) {
    case "dot": return { w: 8, h: 8, labelW: tw };
    case "circle": { const d = Math.max(30, tw + 14); return { w: d, h: d, labelW: tw }; }
    case "ellipse": return { w: Math.max(46, tw + 26), h: 26, labelW: tw };
    case "cells": return { w: 16 + (tw ? tw + 10 : 0) + nd.cells.length * cellW(nd), h: 32, labelW: tw };
    default: return { w: Math.max(40, tw + 22), h: 30, labelW: tw };
  }
}

/** Widest value label on a node's edge, or 0 when nothing flows along it. */
const flowW = (nd) => Math.max(0, ...[nd.up, nd.down].map((f) => (f ? textW(f.v, SMALL_PX) : 0)));
const hasFlow = (nd) => Boolean(nd.up || nd.down);

/**
 * Half the room a node needs across the breadth axis: its outline, its
 * `below` line and, for a dot, the label printed beside it.
 */
function halfBreadth(p, vertical) {
  if (!vertical) return p.h / 2 + (p.n.below ? BELOW_H : 0);
  const dotLabel = p.n.shape === "dot" && p.labelW ? 2 * (p.labelW + 10) : 0;
  return Math.max(p.w, p.belowW + 6, dotLabel) / 2;
}

/**
 * Centre-to-centre breadth distance two neighbours on one row need. Edge
 * labels sit at their edge's midpoint, so two of them clear each other when
 * the nodes are twice their half widths apart; value labels sit at
 * `VALUE_AT`, beside the edge, with a badge beyond them.
 */
function separation(a, b, vertical) {
  let d = halfBreadth(a, vertical) + halfBreadth(b, vertical) + (a.parent === b.parent ? 16 : 26);
  if (a.n.edge || b.n.edge) {
    const half = (p) => (p.n.edge ? (vertical ? textW(p.n.edge, SMALL_PX) / 2 : 9) + 5 : 0);
    d = Math.max(d, 2 * (half(a) + half(b)));
  }
  if (hasFlow(a.n) || hasFlow(b.n)) {
    const room = (p) => (hasFlow(p.n) ? VALUE_OFF + 12 + (vertical ? flowW(p.n) : 12) : 0);
    d = Math.max(d, (room(a) + room(b) + 10) / VALUE_AT);
  }
  return d;
}

/** Build the placed-node tree with sizes; positions come later. */
function place(nd, parent, depth, first, out) {
  const { w, h, labelW } = measure(nd);
  /** @type {Placed} */
  const p = {
    n: nd, parent, kids: [], first, depth, row: depth, w, h, labelW,
    belowW: nd.below ? textW(nd.below, MONO_PX, true) : 0, b: 0, x: 0, y: 0,
  };
  out.push(p);
  nd.children.forEach((c, i) => p.kids.push(place(c, p, depth + 1, i === 0, out)));
  return p;
}

/**
 * Breadth positions for `spine`: every leaf starts a column, a parent joins
 * its first child's column, columns sit side by side.
 */
function spineBreadth(all, vertical) {
  /** @type {Placed[][]} */
  const cols = [];
  /** @returns {Placed[]} the column `p` ends up in */
  const visit = (p) => {
    if (!p.kids.length) { const col = [p]; cols.push(col); return col; }
    const col = p.kids.map(visit)[0];
    col.push(p);
    return col;
  };
  visit(all[0]);
  let at = 0;
  cols.forEach((col, i) => {
    if (i > 0) at += Math.max(...cols[i - 1].flatMap((a) => col.map((b) => separation(a, b, vertical))));
    for (const p of col) p.b = at;
  });
}

/**
 * Lay the tree out. Returns placed nodes (root first) with page coordinates,
 * whether depth runs down the page, and each row's position on the depth axis.
 * @param {TreeSpec} spec
 */
export function layoutTree(spec) {
  /** @type {Placed[]} */
  const all = [];
  const root = place(spec.tree, null, 0, true, all);
  const vertical = spec.dir === "down" || spec.dir === "up";

  if (!vertical) {
    // Sideways: a column of boxes reads better at one width, so equalize per depth.
    const widest = new Map();
    for (const p of all) if (p.n.shape === "box" || p.n.shape === "round") widest.set(p.depth, Math.max(widest.get(p.depth) ?? 0, p.w));
    for (const p of all) if (p.n.shape === "box" || p.n.shape === "round") p.w = /** @type {number} */ (widest.get(p.depth));
  }

  if (spec.layout === "spine") {
    spineBreadth(all, vertical);
  } else {
    const h = hierarchy(root, (p) => p.kids);
    const algo = spec.layout === "leaves" ? cluster() : d3tree();
    algo.nodeSize([1, 1]).separation((a, b) => separation(a.data, b.data, vertical))(h);
    h.each((hn) => { hn.data.b = /** @type {number} */ (hn.x); hn.data.row = Math.round(/** @type {number} */ (hn.y)); });
  }

  const rows = Math.max(...all.map((p) => p.row)) + 1;
  const inRow = (r) => all.filter((p) => p.row === r);
  /** Room between row r and r + 1, driven by what is drawn on the edges into r + 1. */
  const gap = (r) => {
    const next = inRow(r + 1);
    const edges = next.filter((p) => p.n.edge);
    const flows = next.some((p) => hasFlow(p.n));
    if (vertical) return flows ? 86 : edges.length ? 46 : 34;
    let g = edges.length ? Math.max(56, ...edges.map((p) => textW(p.n.edge, SMALL_PX) + 40)) : 56;
    if (flows) g = Math.max(g, 2 * Math.max(...next.map((p) => flowW(p.n))) + 90);
    return g;
  };

  /** @type {number[]} */
  const pos = [0];
  if (vertical) {
    const top = (r) => Math.max(...inRow(r).map((p) => p.h / 2));
    const bottom = (r) => Math.max(...inRow(r).map((p) => p.h / 2 + (p.n.below ? BELOW_H : 0)));
    for (let r = 0; r + 1 < rows; r++) {
      pos.push(spec.dir === "down"
        ? pos[r] + bottom(r) + gap(r) + top(r + 1)
        : pos[r] - top(r) - gap(r) - bottom(r + 1));
    }
  } else {
    const half = (r) => Math.max(...inRow(r).map((p) => Math.max(p.w, p.belowW) / 2));
    const levelW = (r) => (spec.levels[r] ? textW(spec.levels[r], SMALL_PX) : 0);
    for (let r = 0; r + 1 < rows; r++) {
      const step = Math.max(half(r) + gap(r) + half(r + 1), (levelW(r) + levelW(r + 1)) / 2 + 16);
      pos.push(pos[r] + (spec.dir === "right" ? step : -step));
    }
  }

  for (const p of all) {
    if (vertical) { p.x = p.b; p.y = pos[p.row]; } else { p.x = pos[p.row]; p.y = p.b; }
  }
  return { nodes: all, vertical, pos };
}

/* ------------------------------------------------------------------ drawing */

/** @typedef {{ x0: number, y0: number, x1: number, y1: number }} Rect */

/** Approximate box of a text run, for bounds and collision checks. */
function textRect(x, baseline, t, size, anchor = "middle", mono = false) {
  const w = textW(t, size, mono);
  const x0 = anchor === "start" ? x : anchor === "end" ? x - w : x - w / 2;
  return { x0, y0: baseline - size * 0.85, x1: x0 + w, y1: baseline + size * 0.25 };
}

const rectKind = (p) => (p.n.shape === "box" || p.n.shape === "round" || p.n.shape === "cells" ? "rect" : "ellipse");

/**
 * Where a ray from `p`'s centre toward (ux, uy) leaves it. A `below` line
 * counts as part of the node for rays heading down the page, so edges start
 * under the text rather than through it.
 * @returns {[number, number]}
 */
function exit(p, ux, uy) {
  if (p.n.below && uy > 0 && uy >= Math.abs(ux) * 0.3) {
    const w = Math.max(p.w, p.belowW + 6), h = p.h + BELOW_H;
    const [x, y] = clip({ x: p.x, y: p.y + BELOW_H / 2, w, h }, ux, uy, "rect");
    return [x, Math.max(y, p.y + p.h / 2 + 2)];
  }
  return clip(p, ux, uy, rectKind(p));
}

/** Node outline, label, cells and `below` line. */
function drawNode(p, rects) {
  const { n: nd, x, y, w, h } = p;
  const stroke = inkOf(nd.tone, INK.box);
  const mono = nd.mono, size = mono ? MONO_PX : undefined;
  let s = "";
  rects.push({ x0: x - w / 2, y0: y - h / 2, x1: x + w / 2, y1: y + h / 2 });
  if (nd.shape === "dot") {
    s += `<circle cx="${n(x)}" cy="${n(y)}" r="3.5" fill="${inkOf(nd.tone, INK.bright)}"/>`;
    if (nd.label) {
      s += text(x + 9, y + 4.5, nd.label, { cls: "node-label", mono, size, anchor: "start" });
      rects.push(textRect(x + 9, y + 4.5, nd.label, labelPx(nd), "start", mono));
    }
  } else if (nd.shape === "circle" || nd.shape === "ellipse") {
    s += `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(w / 2)}" ry="${n(h / 2)}" fill="${INK.fill}" stroke="${stroke}" stroke-width="1.5"/>`;
  } else {
    const rx = nd.shape === "box" ? 6 : h / 2;
    s += `<rect x="${n(x - w / 2)}" y="${n(y - h / 2)}" width="${n(w)}" height="${n(h)}" rx="${n(rx)}" fill="${INK.fill}" stroke="${stroke}" stroke-width="1.5"/>`;
  }
  if (nd.shape === "cells") {
    const cw = cellW(nd);
    let cx = x - w / 2 + 8;
    if (nd.label) {
      s += text(cx, y + 4.5, nd.label, { cls: "node-label", mono, size, anchor: "start" });
      cx += p.labelW + 10;
    }
    for (const c of nd.cells) {
      s += `<rect x="${n(cx)}" y="${n(y - 10)}" width="${n(cw)}" height="20" fill="none" stroke="${INK.rule}" stroke-width="1"/>`;
      s += text(cx + cw / 2, y + 4.5, c, { cls: "node-label", mono: true, size: MONO_PX });
      cx += cw;
    }
  } else if (nd.shape !== "dot" && nd.label) {
    s += text(x, y + 4.5, nd.label, { cls: "node-label", mono, size });
  }
  if (nd.below) {
    const by = y + h / 2 + 15;
    s += text(x, by, nd.below, { color: inkOf(nd.belowTone, INK.text), mono: true, size: MONO_PX });
    rects.push(textRect(x, by, nd.below, MONO_PX, "middle", true));
  }
  return s;
}

/**
 * A value label beside an edge, pushed outward along the unit normal (ox, oy)
 * and anchored so the text grows away from the edge. On a slanted edge the
 * badge can sit level with the label, so the label steps further out until it
 * clears `avoid`.
 * @param {Rect | null} avoid
 */
function sideLabel(x, y, ox, oy, t, color, avoid) {
  /** @type {"start" | "end" | "middle"} */
  const anchor = Math.abs(ox) >= 0.4 ? (ox > 0 ? "start" : "end") : "middle";
  const at = (off) => {
    const lx = x + ox * off, ly = y + oy * off;
    const base = anchor === "middle" ? (oy > 0 ? ly + 10 : ly - 3) : ly + 4;
    return { lx, base, rect: textRect(lx, base, t, SMALL_PX, anchor) };
  };
  let off = VALUE_OFF, spot = at(off);
  while (avoid && hits(spot.rect, avoid) && off < VALUE_OFF + 16) spot = at(off += 2);
  return { svg: text(spot.lx, spot.base, t, { color, anchor: anchor === "middle" ? undefined : anchor }), rect: spot.rect };
}

/** True when two rects overlap. */
const hits = (/** @type {Rect} */ a, /** @type {Rect} */ b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/**
 * Render a validated, normalized `tree` block.
 * @param {{ data: TreeSpec }} block
 */
export function render(block) {
  const spec = block.data;
  const { nodes, vertical, pos } = layoutTree(spec);
  const mk = markers();
  const shown = (/** @type {Flow | null} */ f) => Boolean(f) && (spec.until === 0 || /** @type {Flow} */ (f).step <= spec.until);
  /** @type {Rect[]} */
  const rects = [];
  let edges = "", labels = "", badges = "";

  for (const c of nodes) {
    const p = c.parent;
    if (!p) continue;
    const dx = c.x - p.x, dy = c.y - p.y;
    const [x1, y1] = exit(p, dx, dy), [x2, y2] = exit(c, -dx, -dy);

    if (hasFlow(c.n)) {
      const len = Math.hypot(x2 - x1, y2 - y1) || 1;
      const nx = -(y2 - y1) / len, ny = (x2 - x1) / len;
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      const ax = x1 + (x2 - x1) * VALUE_AT, ay = y1 + (y2 - y1) * VALUE_AT;
      let drawn = false;
      for (const [f, side, color, up] of /** @type {const} */ ([[c.n.up, 1, INK.up, true], [c.n.down, -1, INK.down, false]])) {
        if (!f) continue;
        const ox = nx * side, oy = ny * side;
        const [fx, fy, tx, ty] = up ? [x2, y2, x1, y1] : [x1, y1, x2, y2];
        const bx = fx + (tx - fx) * BADGE_AT + ox * 10, by = fy + (ty - fy) * BADGE_AT + oy * 10;
        const disc = f.step ? { x0: bx - 9, y0: by - 9, x1: bx + 9, y1: by + 9 } : null;
        const label = sideLabel(ax, ay, ox, oy, f.v, color, disc);
        rects.push(label.rect);
        if (disc) rects.push(disc);
        if (!shown(f)) continue;
        drawn = true;
        edges += `<path d="M${n(fx)},${n(fy)} Q${n(mx + ox * 11)},${n(my + oy * 11)} ${n(tx)},${n(ty)}" fill="none" stroke="${color}" stroke-width="1.4" marker-end="url(#${mk.id(color)})"/>`;
        labels += label.svg;
        if (f.step) badges += badge(bx, by, f.step, color);
      }
      // Every value hidden by `until`: keep the structure readable with a plain edge.
      if (drawn) continue;
    }

    const color = spec.layout === "spine" && !c.first ? INK.down : INK.line;
    const head = color === INK.line ? INK.arrow : color;
    const marker = spec.arrows === "none" ? "" : ` marker-end="url(#${mk.id(head)})"`;
    let a = [x1, y1], b = [x2, y2];
    if (!vertical) {
      const side = spec.dir === "right" ? 1 : -1;
      a = [p.x + side * p.w / 2, p.y];
      b = [c.x - side * c.w / 2, c.y];
    }
    const [[sx, sy], [ex, ey]] = spec.arrows === "toParent" ? [b, a] : [a, b];
    const d = vertical || Math.abs(sy - ey) < 0.5
      ? `M${n(sx)},${n(sy)} L${n(ex)},${n(ey)}`
      : `M${n(sx)},${n(sy)} C${n((sx + ex) / 2)},${n(sy)} ${n((sx + ex) / 2)},${n(ey)} ${n(ex)},${n(ey)}`;
    edges += `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.5"${marker}/>`;

    if (c.n.edge) {
      // Down the page: centred on the edge, the halo cutting the line. Sideways: above the child end.
      const [lx, ly, anchor] = vertical
        ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 4, /** @type {const} */ ("middle")]
        : [b[0] - (spec.dir === "right" ? 10 : -10), b[1] - 6, /** @type {const} */ (spec.dir === "right" ? "end" : "start")];
      labels += text(lx, ly, c.n.edge, { anchor: anchor === "middle" ? undefined : anchor });
      rects.push(textRect(lx, ly, c.n.edge, SMALL_PX, anchor));
    }
  }

  // The root's `up` is the tree's output: a short red arrow pointing away from the children.
  const root = nodes[0], out = root.n.up;
  if (out) {
    const [ux, uy] = { down: [0, -1], up: [0, 1], right: [-1, 0], left: [1, 0] }[spec.dir];
    const [sx, sy] = clip(root, ux, uy, rectKind(root));
    const ex = sx + ux * OUT_LEN, ey = sy + uy * OUT_LEN;
    const mx = (sx + ex) / 2, my = (sy + ey) / 2;
    const [lx, ly, anchor] = vertical ? [sx + 8, my + 4, /** @type {const} */ ("start")] : [mx, my - 7, /** @type {const} */ ("middle")];
    const [bx, by] = vertical ? [sx - 13, sy + uy * 9] : [sx + ux * 9, sy + 14];
    rects.push(textRect(lx, ly, out.v, SMALL_PX, anchor), { x0: Math.min(sx, ex) - 4, y0: Math.min(sy, ey) - 4, x1: Math.max(sx, ex) + 4, y1: Math.max(sy, ey) + 4 });
    if (out.step) rects.push({ x0: bx - 9, y0: by - 9, x1: bx + 9, y1: by + 9 });
    if (shown(out)) {
      edges += `<path d="M${n(sx)},${n(sy)} L${n(ex)},${n(ey)}" fill="none" stroke="${INK.up}" stroke-width="1.5" marker-end="url(#${mk.id(INK.up)})"/>`;
      labels += text(lx, ly, out.v, { color: INK.up, anchor: anchor === "middle" ? undefined : anchor });
      if (out.step) badges += badge(bx, by, out.step, INK.up);
    }
  }

  let shapes = "";
  for (const p of nodes) shapes += drawNode(p, rects);

  // Level captions: right of each row, or under each column when sideways.
  let levels = "";
  if (spec.levels.some(Boolean)) {
    const right = Math.max(...rects.map((r) => r.x1)) + 24;
    const under = Math.max(...rects.map((r) => r.y1)) + 18;
    spec.levels.forEach((t, r) => {
      if (!t) return;
      const [x, y] = vertical ? [right, pos[r] + 4] : [pos[r], under];
      const anchor = vertical ? /** @type {const} */ ("start") : /** @type {const} */ ("middle");
      levels += text(x, y, t, { anchor: vertical ? "start" : undefined });
      rects.push(textRect(x, y, t, SMALL_PX, anchor));
    });
  }

  const box = bounds(rects, 12);
  const body = mk.defs() + edges + shapes + labels + levels + badges;
  return figure(`${svgOpen(box, { label: spec.title || "tree diagram", compact: spec.compact })}${body}</svg>`, spec.title, spec.note);
}
