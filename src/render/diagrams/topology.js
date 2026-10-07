/**
 * `topology` fence: an interconnect placed from a kind and a size.
 *
 * The author names the network (`ring`, `mesh`, `hypercube`, ...) and how big
 * it is; this module generates the nodes, the links and the coordinates. An
 * optional `path` is a route through the network, drawn thick in the critical
 * path colour, and is checked hop by hop against the links that exist.
 *
 * Node indices: ring, line, star and complete count from 0 (a star's hub is 0);
 * mesh and torus are row-major (`r * side + c`); a hypercube node's index is
 * its binary address; a tree is numbered breadth first from the root.
 *
 * @module render/diagrams/topology
 */

import {
  Ctx, ptr, show, wantObject, wantArray, optionalString, optionalBoolean, optionalEnum, unknownKeys,
  tooMany,
} from "../schema/common.js";
import { INK, inkOf, n, text, svgOpen, figure, bounds, textW } from "./svg.js";

export const KINDS = /** @type {const} */ (["ring", "line", "mesh", "torus", "hypercube", "star", "complete", "tree"]);
export const LABELS = /** @type {const} */ (["index", "binary", "coords"]);

/** @typedef {typeof KINDS[number]} Kind */
/** @typedef {{ title: string, note: string, compact: boolean, kind: Kind, size: number, labels: typeof LABELS[number], path: number[] }} TopologyBody */

/** What `size` means per kind, and its range. */
const SIZE = /** @type {Record<Kind, { min: number, max: number, what: string }>} */ ({
  ring: { min: 2, max: 32, what: "a node count" },
  line: { min: 2, max: 32, what: "a node count" },
  star: { min: 2, max: 32, what: "a node count" },
  // Past 16 the n(n-1)/2 chords run through the nodes they skip.
  complete: { min: 2, max: 16, what: "a node count" },
  mesh: { min: 2, max: 8, what: "a side length" },
  torus: { min: 2, max: 8, what: "a side length" },
  hypercube: { min: 1, max: 4, what: "a dimension" },
  tree: { min: 1, max: 5, what: "a depth" },
});

const KEYS = ["title", "note", "compact", "kind", "size", "labels", "path"];

/** Hypercube link colour per differing bit. */
const BIT_TONES = ["c1", "c3", "c2", "c5"];

/** Validate a `topology` fence body. */
export function validate(errors, block, file) {
  const ctx = new Ctx(errors, file, block.line, "topology");
  if (!wantObject(ctx, block.data, "", "an object { kind, size }")) return;
  const body = /** @type {Record<string, unknown>} */ (block.data);

  optionalString(ctx, body.title, "/title");
  optionalString(ctx, body.note, "/note");
  optionalBoolean(ctx, body.compact, "/compact");
  unknownKeys(ctx, body, "", KEYS);

  if (body.kind === undefined) {
    ctx.at("/kind", `expected one of ${KINDS.join(" ")}, got nothing`);
    return;
  }
  if (!optionalEnum(ctx, body.kind, "/kind", KINDS)) return;
  const kind = /** @type {Kind} */ (body.kind);
  const range = SIZE[kind];
  const size = body.size;
  if (!Number.isInteger(size) || /** @type {number} */ (size) < range.min || /** @type {number} */ (size) > range.max) {
    ctx.at("/size", `expected ${range.what} from ${range.min} to ${range.max} for ${kind}, got ${show(size)}`);
    return;
  }

  if (optionalEnum(ctx, body.labels, "/labels", LABELS) && body.labels === "coords" && kind !== "mesh" && kind !== "torus") {
    ctx.at("/labels", `expected index or binary for ${kind}, got "coords"; coords are for mesh and torus`);
  }

  if (body.path === undefined) return;
  if (tooMany(ctx, body.path, "/path", 128, "hops") || !wantArray(ctx, body.path, "/path", "an array of node indices")) return;
  const path = /** @type {unknown[]} */ (body.path);
  if (path.length < 2) {
    ctx.at("/path", `expected at least two node indices, got ${path.length}`);
    return;
  }
  const net = build(kind, /** @type {number} */ (size));
  const count = net.nodes.length;
  let ok = true;
  path.forEach((v, i) => {
    if (!Number.isInteger(v) || /** @type {number} */ (v) < 0 || /** @type {number} */ (v) >= count) {
      ok = ctx.at(ptr("", "path", i), `expected a node index from 0 to ${count - 1}, got ${show(v)}`);
    }
  });
  if (!ok) return;
  const nodes = /** @type {number[]} */ (path);
  for (let i = 1; i < nodes.length; i++) {
    if (linkOf(net, nodes[i - 1], nodes[i]) < 0) {
      const near = neighbours(net, nodes[i - 1]);
      ctx.at(ptr("", "path", i), `node ${nodes[i]} is not linked to node ${nodes[i - 1]}; its neighbours: ${near.join(" ")}`);
    }
  }
}

/** Fill defaults on a validated body. */
export function normalize(data) {
  const labels = data.labels ?? (data.kind === "hypercube" ? "binary" : data.kind === "mesh" || data.kind === "torus" ? "coords" : "index");
  return { title: "", note: "", compact: false, path: [], ...data, labels };
}

/* ------------------------------------------------------------------ structure */

/**
 * A link. `bit` is the differing address bit on a hypercube; `wrap` marks a
 * torus wraparound (`row` or `col`) along with the row or column it closes.
 * @typedef {{ a: number, b: number, bit?: number, wrap?: "row" | "col", lane?: number }} Link
 */

/** @typedef {{ nodes: { x: number, y: number }[], links: Link[], side: number, bits: number }} Net */

/**
 * Nodes and links for a kind and a size, before any geometry. Coordinates are
 * in units: callers multiply by a spacing chosen from the label width.
 * @param {Kind} kind @param {number} size
 * @returns {Net}
 */
export function build(kind, size) {
  /** @type {{ x: number, y: number }[]} */ const nodes = [];
  /** @type {Link[]} */ const links = [];
  const ring = (count, from = 0) => {
    for (let i = 0; i < count; i++) {
      const t = (2 * Math.PI * i) / count;
      nodes[from + i] = { x: Math.sin(t), y: -Math.cos(t) };
    }
  };
  let side = 0, bits = 0;
  switch (kind) {
    case "ring":
      ring(size);
      for (let i = 0; i < size; i++) if (size > 2 || i === 0) links.push({ a: i, b: (i + 1) % size });
      break;
    case "line":
      for (let i = 0; i < size; i++) nodes.push({ x: i, y: 0 });
      for (let i = 1; i < size; i++) links.push({ a: i - 1, b: i });
      break;
    case "star":
      nodes.push({ x: 0, y: 0 });
      ring(size - 1, 1);
      for (let i = 1; i < size; i++) links.push({ a: 0, b: i });
      break;
    case "complete":
      ring(size);
      for (let i = 0; i < size; i++) for (let j = i + 1; j < size; j++) links.push({ a: i, b: j });
      break;
    case "mesh":
    case "torus":
      side = size;
      for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) nodes.push({ x: c, y: r });
      for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
        const i = r * size + c;
        if (c + 1 < size) links.push({ a: i, b: i + 1 });
        if (r + 1 < size) links.push({ a: i, b: i + size });
      }
      // A side of two already links both ends; the wrap would double the edge.
      if (kind === "torus" && size > 2) {
        for (let k = 0; k < size; k++) {
          links.push({ a: k * size, b: k * size + size - 1, wrap: "row", lane: k });
          links.push({ a: k, b: k + size * (size - 1), wrap: "col", lane: k });
        }
      }
      break;
    case "hypercube": {
      bits = size;
      // Bit 0 steps right, bit 1 steps down, bit 2 steps up and to the right
      // (the back face), bit 3 places a second 3-cube beside the first. The
      // 4-cube offsets were searched for the widest gap between any node and
      // a link that does not touch it.
      const step = size === 4
        ? [[1, 0], [0, 1], [0.3, -0.42], [2, 0.5]]
        : [[1, 0], [0, 1], [0.48, -0.48]];
      for (let i = 0; i < 2 ** size; i++) {
        let x = 0, y = 0;
        for (let b = 0; b < size; b++) if (i & (1 << b)) { x += step[b][0]; y += step[b][1]; }
        nodes.push({ x, y });
      }
      for (let i = 0; i < nodes.length; i++) for (let b = 0; b < size; b++) {
        const j = i ^ (1 << b);
        if (j > i) links.push({ a: i, b: j, bit: b });
      }
      break;
    }
    case "tree": {
      // Leaves sit one unit apart; every parent centres over its two children.
      const count = 2 ** (size + 1) - 1;
      const leaves = 2 ** size;
      for (let i = 0; i < count; i++) {
        const level = Math.floor(Math.log2(i + 1));
        const at = i + 1 - 2 ** level;
        const span = leaves / 2 ** level;
        nodes.push({ x: at * span + (span - 1) / 2, y: level });
        if (i > 0) links.push({ a: Math.floor((i - 1) / 2), b: i });
      }
      break;
    }
  }
  return { nodes, links, side, bits };
}

/** Index of the link joining `a` and `b`, or -1. */
function linkOf(net, a, b) {
  return net.links.findIndex((l) => (l.a === a && l.b === b) || (l.a === b && l.b === a));
}

/** Every node linked to `i`, ascending. */
function neighbours(net, i) {
  return net.links.flatMap((l) => (l.a === i ? [l.b] : l.b === i ? [l.a] : [])).sort((p, q) => p - q);
}

/** The text drawn inside node `i`. */
function labelOf(d, net, i) {
  if (d.labels === "coords") return `${Math.floor(i / net.side)},${i % net.side}`;
  if (d.labels === "binary") {
    const width = net.bits || Math.max(1, Math.ceil(Math.log2(net.nodes.length)));
    return i.toString(2).padStart(width, "0");
  }
  return String(i);
}

/* ------------------------------------------------------------------ geometry */

const LABEL = 11;   // label size inside a node
const WRAP = 9;     // spacing between nested torus wraparound loops

/**
 * Pixel spacing for one unit of `build()` coordinates, so neighbouring nodes
 * of radius `r` keep a clear gap whatever the label width.
 */
function unitFor(kind, size, r) {
  const chord = (count, floor) => Math.max(floor, (2 * r + 18) / (2 * Math.sin(Math.PI / count)));
  switch (kind) {
    case "ring": return chord(size, 56);
    // The chord that skips one node must clear it: R (1 - cos(2 pi / n)) > r + 4.
    case "complete": return Math.max(chord(size, 70), size > 3 ? (r + 6) / (1 - Math.cos((2 * Math.PI) / size)) : 0);
    case "star": return chord(Math.max(size - 1, 2), Math.max(76, 2 * r + 40));
    case "line": return 2 * r + 26;
    case "mesh": case "torus": return 2 * r + 34;
    case "hypercube": return size === 4 ? Math.max(125, 5 * r + 25) : Math.max(92, 2 * r + 60);
    case "tree": return 2 * r + 10;
  }
}

/**
 * The SVG path of a torus wraparound. Row wraps leave the right end, climb
 * over the top of the grid and come down the left side; column wraps leave
 * the bottom, run up the right side outside every row wrap and drop onto the
 * top node. Inner rows and right-hand columns take the inner lanes, so no two
 * loops of the same family cross.
 */
function wrapPath(link, P, side, r) {
  const x0 = P[0].x, y0 = P[0].y, x1 = P[side - 1].x, y1 = P[side * side - 1].y;
  const first = r + 12;
  if (link.wrap === "row") {
    const o = first + /** @type {number} */ (link.lane) * WRAP;
    const L = P[link.a], R = P[link.b];
    return `M${n(R.x)},${n(R.y)} H${n(x1 + o)} V${n(y0 - o)} H${n(x0 - o)} V${n(L.y)} H${n(L.x)}`;
  }
  const o = first + side * WRAP + (side - 1 - /** @type {number} */ (link.lane)) * WRAP;
  const T = P[link.a], B = P[link.b];
  return `M${n(B.x)},${n(B.y)} V${n(y1 + o - side * WRAP)} H${n(x1 + o)} V${n(y0 - o)} H${n(T.x)} V${n(T.y)}`;
}

/** Render a validated, normalized `topology` block. */
export function render(block) {
  const d = /** @type {TopologyBody} */ (block.data);
  const net = build(d.kind, d.size);
  const labels = net.nodes.map((_, i) => labelOf(d, net, i));
  const r = Math.max(13, Math.max(...labels.map((l) => textW(l, LABEL, true))) / 2 + 6);
  const unit = unitFor(d.kind, d.size, r);
  const g = d.kind === "tree" ? { x: unit, y: Math.max(56, 2 * r + 30) } : { x: unit, y: unit };
  const P = net.nodes.map((p) => ({ x: p.x * g.x, y: p.y * g.y }));

  // The route, as the set of links and nodes it touches.
  const onPath = new Set();
  for (let i = 1; i < d.path.length; i++) onPath.add(linkOf(net, d.path[i - 1], d.path[i]));
  const pathNodes = new Set(d.path);

  const edges = net.links.map((l, li) => {
    const hot = onPath.has(li);
    const color = hot ? INK.span : l.bit !== undefined ? inkOf(BIT_TONES[l.bit], INK.rule) : INK.rule;
    const width = hot ? 4 : l.bit !== undefined ? 2 : 1.6;
    if (l.wrap) {
      const dash = hot ? "" : ` stroke-dasharray="4 3"`;
      return `<path d="${wrapPath(l, P, net.side, r)}" fill="none" stroke="${color}" stroke-width="${hot ? 3 : 1.3}"${dash} stroke-linejoin="round"/>`;
    }
    const p = P[l.a], q = P[l.b];
    return `<line x1="${n(p.x)}" y1="${n(p.y)}" x2="${n(q.x)}" y2="${n(q.y)}" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`;
  });
  // Hot links paint last so a route reads on top of everything it crosses.
  const order = net.links.map((_, i) => i).sort((a, b) => Number(onPath.has(a)) - Number(onPath.has(b)));
  let body = order.map((i) => edges[i]).join("");

  P.forEach((p, i) => {
    const hot = pathNodes.has(i);
    body += `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(r)}" fill="${INK.fill}" stroke="${hot ? INK.span : INK.rule}" stroke-width="${hot ? 2.6 : 1.5}"/>`;
    body += text(p.x, p.y + 4, labels[i], { cls: "node-label", mono: true, size: LABEL, halo: false });
  });

  // Torus loops need room: row wraps on the left and bottom lanes, both
  // families stacked above and to the right.
  const loops = d.kind === "torus" && d.size > 2;
  const near = loops ? r + 12 + (d.size - 1) * WRAP + 4 : r + 6;
  const far = loops ? r + 12 + (2 * d.size - 1) * WRAP + 4 : r + 6;
  const xs = P.map((p) => p.x), ys = P.map((p) => p.y);
  const box = bounds([{ x0: Math.min(...xs) - near, y0: Math.min(...ys) - far, x1: Math.max(...xs) + far, y1: Math.max(...ys) + near }], 2);
  const label = d.title || `${d.kind} topology`;
  return figure(svgOpen(box, { label, compact: d.compact }) + body + "</svg>", d.title, d.note);
}
