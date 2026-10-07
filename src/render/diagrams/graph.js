/**
 * `graph` fence: layered directed graphs. DAGs, work and span, dependency
 * graphs, state machines, automata and computation graphs all share it.
 *
 * Authors give nodes and edges only. `graph-layout.js` finds back edges and
 * layers, orders and spaces the nodes; this module sizes nodes, routes every
 * edge, and places labels where they cover no node, label or other edge.
 *
 * Edge kinds, by how they are drawn:
 *   forward   straight, or a smooth curve through dummy points when it skips layers
 *   bowed     a->b and b->a together: two curves bowed apart
 *   back      a dashed loop round the outer side of the drawing
 *   self      a small loop beside the node (right of it going down, above it going right)
 *
 * @module render/diagrams/graph
 */

import {
  Ctx, ptr, show, wantObject, wantArray, wantNonEmptyArray, wantText,
  optionalString, optionalBoolean, optionalEnum, unknownKeys,
} from "../schema/common.js";
import { DIAGRAM_TONES, INK, inkOf, markers, text, badge, clip, svgOpen, figure, bounds, textW, n } from "./svg.js";
import { rank, place } from "./graph-layout.js";

export const SHAPES = /** @type {const} */ (["box", "round", "circle", "double", "dot", "diamond"]);
const DIRS = /** @type {const} */ (["down", "right"]);

/**
 * @typedef {{ id: string, label: string, shape: typeof SHAPES[number], tone: string,
 *   start: boolean, side: string, mono: boolean }} GraphNode
 * @typedef {{ from: string, to: string, label: string, tone: string, dashed: boolean,
 *   step: number, back: boolean }} GraphEdge
 * @typedef {{ title: string, note: string, compact: boolean, dir: typeof DIRS[number],
 *   nodes: GraphNode[], edges: GraphEdge[] }} GraphBody
 */

/* ------------------------------------------------------------------ schema */

/** Layout cost grows with crossings between layers; past these a graph is unreadable anyway. */
export const MAX_NODES = 150, MAX_EDGES = 300;

/**
 * `{ nodes: [{ id, label?, shape?, tone?, start?, side?, mono? }], edges?: [{ from, to, ... }] }`.
 * Node ids are unique and every edge end must name one.
 */
export function validate(errors, block, file) {
  const ctx = new Ctx(errors, file, block.line, "graph");
  if (!wantObject(ctx, block.data, "", "an object { nodes, edges }")) return;
  const body = /** @type {Record<string, unknown>} */ (block.data);

  optionalString(ctx, body.title, "/title");
  optionalString(ctx, body.note, "/note");
  optionalBoolean(ctx, body.compact, "/compact");
  optionalEnum(ctx, body.dir, "/dir", DIRS);
  unknownKeys(ctx, body, "", ["title", "note", "compact", "dir", "nodes", "edges"]);

  /** @type {Set<string>} */
  const ids = new Set();
  if (Array.isArray(body.nodes) && body.nodes.length > MAX_NODES) {
    ctx.at("/nodes", `expected at most ${MAX_NODES} nodes, got ${body.nodes.length}; split the graph`);
  } else if (wantNonEmptyArray(ctx, body.nodes, "/nodes", "at least one node")) {
    /** @type {unknown[]} */ (body.nodes).forEach((node, i) => {
      const np = ptr("", "nodes", i);
      if (!wantObject(ctx, node, np, "a node { id }")) return;
      if (wantText(ctx, node.id, ptr(np, "id"), "a node id")) {
        const id = /** @type {string} */ (node.id);
        // Control characters are reserved: the layout keys its own dummy points and edge pairs with them.
        if (/[\u0000-\u001f]/.test(id)) ctx.at(ptr(np, "id"), `expected an id without control characters, got ${show(id)}`);
        if (ids.has(id)) ctx.at(ptr(np, "id"), `duplicate node id ${JSON.stringify(id)}; ids must be unique`);
        ids.add(id);
      }
      optionalString(ctx, node.label, ptr(np, "label"));
      optionalEnum(ctx, node.shape, ptr(np, "shape"), SHAPES);
      optionalEnum(ctx, node.tone, ptr(np, "tone"), DIAGRAM_TONES);
      optionalBoolean(ctx, node.start, ptr(np, "start"));
      optionalString(ctx, node.side, ptr(np, "side"));
      optionalBoolean(ctx, node.mono, ptr(np, "mono"));
      unknownKeys(ctx, node, np, ["id", "label", "shape", "tone", "start", "side", "mono"]);
    });
  }

  if (Array.isArray(body.edges) && body.edges.length > MAX_EDGES) {
    ctx.at("/edges", `expected at most ${MAX_EDGES} edges, got ${body.edges.length}; split the graph`);
  } else if (body.edges !== undefined && wantArray(ctx, body.edges, "/edges", "an array of edges")) {
    /** @type {unknown[]} */ (body.edges).forEach((edge, i) => {
      const ep = ptr("", "edges", i);
      if (!wantObject(ctx, edge, ep, "an edge { from, to }")) return;
      for (const end of /** @type {const} */ (["from", "to"])) {
        if (!wantText(ctx, edge[end], ptr(ep, end), "a node id")) continue;
        if (!ids.has(/** @type {string} */ (edge[end]))) {
          ctx.at(ptr(ep, end), `no node with id ${show(edge[end])}; ids: ${[...ids].join(" ")}`);
        }
      }
      optionalString(ctx, edge.label, ptr(ep, "label"));
      optionalEnum(ctx, edge.tone, ptr(ep, "tone"), DIAGRAM_TONES);
      optionalBoolean(ctx, edge.dashed, ptr(ep, "dashed"));
      optionalBoolean(ctx, edge.back, ptr(ep, "back"));
      if (edge.step !== undefined && !(Number.isInteger(edge.step) && /** @type {number} */ (edge.step) > 0)) {
        ctx.at(ptr(ep, "step"), `expected a positive integer, got ${show(edge.step)}`);
      }
      unknownKeys(ctx, edge, ep, ["from", "to", "label", "tone", "dashed", "step", "back"]);
    });
  }
}

/**
 * Fill defaults on a validated body. A node's label defaults to its id; `step: 0`
 * means no badge.
 * @returns {GraphBody}
 */
export function normalize(data) {
  return {
    title: "", note: "", compact: false, dir: "down", ...data,
    nodes: data.nodes.map((d) => ({ label: d.id, shape: "box", tone: "", start: false, side: "", mono: false, ...d })),
    edges: (data.edges ?? []).map((e) => ({ label: "", tone: "", dashed: false, step: 0, back: false, ...e })),
  };
}

/* ------------------------------------------------------------------ geometry */

/** @typedef {[number, number]} Pt */
/** @typedef {{ x0: number, y0: number, x1: number, y1: number }} Box */
/**
 * A node once placed. `ext` is how far it and its decorations (start arrow,
 * self-loop, side note) reach from its centre on each side.
 * @typedef {{ d: GraphNode, w: number, h: number, kind: "rect" | "ellipse" | "diamond",
 *   x: number, y: number, layer: number, loop: GraphEdge | undefined,
 *   ext: { l: number, r: number, t: number, b: number } }} Placed
 */
/**
 * A routed edge: a sampled polyline for placement and hit tests, which side of
 * travel its label may sit on (1 left, 0 either), and whether its label was
 * already put at a fixed spot (loops).
 * @typedef {{ e: GraphEdge, pts: Pt[], side: 0 | 1, fixed: boolean }} Route
 */

const START = 30;      // length of the entry arrow on a start state
const LOOP = 22;       // how far a self-loop reaches past the node
const LABEL_H = 14;    // edge-label box height
const BOW = 13;        // how far each curve of an a<->b pair bows out

const labelW = (/** @type {string} */ t) => textW(t, 11.5) + 4;
const font = (/** @type {GraphNode} */ d) => (d.mono ? 12 : 13);

/** Node size from its label and shape. Circles grow to fit their label. */
function sizeOf(/** @type {GraphNode} */ d) {
  const tw = textW(d.label, font(d), d.mono);
  switch (d.shape) {
    case "dot": return { w: 9, h: 9, kind: /** @type {const} */ ("ellipse") };
    case "circle": case "double": {
      const r = Math.max(40, tw + (d.shape === "double" ? 26 : 18));
      return { w: r, h: r, kind: /** @type {const} */ ("ellipse") };
    }
    case "diamond": return { w: Math.max(64, tw * 1.5 + 22), h: 46, kind: /** @type {const} */ ("diamond") };
    default: return { w: Math.max(44, tw + 26), h: 32, kind: /** @type {const} */ ("rect") };
  }
}

/** Where a ray from the node's centre toward (ux, uy) leaves its outline. */
function edgeOf(/** @type {Placed} */ p, /** @type {number} */ ux, /** @type {number} */ uy) {
  if (p.kind !== "diamond") return clip(p, ux, uy, p.kind);
  const len = Math.hypot(ux, uy) || 1;
  const t = 1 / (Math.abs(ux / len) / (p.w / 2) + Math.abs(uy / len) / (p.h / 2));
  return /** @type {Pt} */ ([p.x + (ux / len) * t, p.y + (uy / len) * t]);
}

/** Smooth path through points (Catmull-Rom as cubic Beziers), plus a sampled polyline. */
function spline(/** @type {Pt[]} */ ps) {
  if (ps.length === 2) return { path: `M${n(ps[0][0])},${n(ps[0][1])} L${n(ps[1][0])},${n(ps[1][1])}`, pts: ps };
  let path = `M${n(ps[0][0])},${n(ps[0][1])}`;
  /** @type {Pt[]} */
  const pts = [ps[0]];
  for (let i = 0; i + 1 < ps.length; i++) {
    const p0 = ps[Math.max(0, i - 1)], p1 = ps[i], p2 = ps[i + 1], p3 = ps[Math.min(ps.length - 1, i + 2)];
    /** @type {Pt} */ const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    /** @type {Pt} */ const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    path += ` C${n(c1[0])},${n(c1[1])} ${n(c2[0])},${n(c2[1])} ${n(p2[0])},${n(p2[1])}`;
    pts.push(...cubic(p1, c1, c2, p2));
  }
  return { path, pts };
}

/** Eight samples along a cubic Bezier, excluding its start. */
function cubic(/** @type {Pt} */ a, /** @type {Pt} */ b, /** @type {Pt} */ c, /** @type {Pt} */ d) {
  /** @type {Pt[]} */
  const out = [];
  for (let k = 1; k <= 8; k++) {
    const t = k / 8, u = 1 - t;
    out.push([
      u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0],
      u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1],
    ]);
  }
  return out;
}

/** An orthogonal polyline with rounded corners. */
function rounded(/** @type {Pt[]} */ ps, r = 10) {
  let path = `M${n(ps[0][0])},${n(ps[0][1])}`;
  for (let i = 1; i + 1 < ps.length; i++) {
    const [px, py] = ps[i - 1], [x, y] = ps[i], [nx, ny] = ps[i + 1];
    const a = Math.min(r, Math.hypot(x - px, y - py) / 2), b = Math.min(r, Math.hypot(nx - x, ny - y) / 2);
    const ux = Math.sign(x - px), uy = Math.sign(y - py), vx = Math.sign(nx - x), vy = Math.sign(ny - y);
    path += ` L${n(x - ux * a)},${n(y - uy * a)} Q${n(x)},${n(y)} ${n(x + vx * b)},${n(y + vy * b)}`;
  }
  const last = ps[ps.length - 1];
  return path + ` L${n(last[0])},${n(last[1])}`;
}

/** Point and unit tangent at fraction `t` of a polyline's length. */
function along(/** @type {Pt[]} */ pts, /** @type {number} */ t) {
  const seg = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
  let left = seg.reduce((a, b) => a + b, 0) * t;
  for (let i = 0; i < seg.length; i++) {
    if (left <= seg[i] || i === seg.length - 1) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const f = seg[i] ? Math.min(1, left / seg[i]) : 0, len = seg[i] || 1;
      return { x: ax + (bx - ax) * f, y: ay + (by - ay) * f, tx: (bx - ax) / len, ty: (by - ay) / len };
    }
    left -= seg[i];
  }
  return { x: pts[0][0], y: pts[0][1], tx: 1, ty: 0 };
}

const overlaps = (/** @type {Box} */ a, /** @type {Box} */ b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const boxAt = (/** @type {number} */ cx, /** @type {number} */ cy, /** @type {number} */ w, /** @type {number} */ h) =>
  ({ x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2 });

/** Does segment p-q pass through box b? (Liang-Barsky.) */
function crossesBox(/** @type {Box} */ b, /** @type {Pt} */ p, /** @type {Pt} */ q) {
  let t0 = 0, t1 = 1;
  const dx = q[0] - p[0], dy = q[1] - p[1];
  for (const [pk, qk] of [[-dx, p[0] - b.x0], [dx, b.x1 - p[0]], [-dy, p[1] - b.y0], [dy, b.y1 - p[1]]]) {
    if (pk === 0) { if (qk < 0) return false; continue; }
    const r = qk / pk;
    if (pk < 0) t0 = Math.max(t0, r); else t1 = Math.min(t1, r);
    if (t0 > t1) return false;
  }
  return true;
}
const lineHits = (/** @type {Box} */ b, /** @type {Pt[]} */ pts) => pts.some((p, i) => i > 0 && crossesBox(b, pts[i - 1], p));

/* ------------------------------------------------------------------ render */

/** Render a validated, normalized `graph` block. */
export function render(block) {
  const g = /** @type {GraphBody} */ (block.data);
  return figure(draw(g), g.title, g.note);
}

/**
 * Merge parallel edges (same from and to) into one whose label lists them all,
 * the way an automaton writes `a, b` on a single arrow. Style comes from the first.
 * @param {GraphEdge[]} edges
 */
function merge(edges) {
  /** @type {Map<string, GraphEdge>} */
  const out = new Map();
  for (const e of edges) {
    const key = `${e.from}\u0000${e.to}`;
    const seen = out.get(key);
    if (!seen) out.set(key, { ...e });
    else if (e.label) seen.label = seen.label ? `${seen.label}, ${e.label}` : e.label;
  }
  return [...out.values()];
}

/** Lay out and draw the whole graph as an SVG string. */
function draw(/** @type {GraphBody} */ g) {
  const down = g.dir !== "right";
  const edges = merge(g.edges);
  const loopOf = new Map(edges.filter((e) => e.from === e.to).map((e) => [e.from, e]));
  const links = edges.filter((e) => e.from !== e.to);

  // A box that many edges meet gets wide enough to give each its own port.
  /** @type {Map<string, number>} */
  const degree = new Map();
  for (const e of links) for (const k of [`${e.from}>`, `${e.to}<`]) degree.set(k, (degree.get(k) ?? 0) + 1);
  /** @type {Map<string, Placed>} */
  const nodes = new Map(g.nodes.map((d) => {
    const s = sizeOf(d);
    const most = Math.max(degree.get(`${d.id}>`) ?? 0, degree.get(`${d.id}<`) ?? 0);
    if (down && s.kind === "rect") s.w = Math.max(s.w, 14 * (most - 1) + 28);
    const ext = { l: s.w / 2, r: s.w / 2, t: s.h / 2, b: s.h / 2 };
    if (d.start) ext.l += START;
    const loop = loopOf.get(d.id);
    if (loop && down) ext.r += LOOP + (loop.label ? 6 + labelW(loop.label) : 4);
    if (loop && !down) {
      ext.t += LOOP + (loop.label ? 6 + LABEL_H : 4);
      ext.l = Math.max(ext.l, labelW(loop.label) / 2);
      ext.r = Math.max(ext.r, labelW(loop.label) / 2);
    }
    if (d.side && down) ext.r += 8 + labelW(d.side);
    if (d.side && !down) {
      ext.b += 6 + LABEL_H;
      ext.l = Math.max(ext.l, labelW(d.side) / 2);
      ext.r = Math.max(ext.r, labelW(d.side) / 2);
    }
    return [d.id, { d, ...s, x: 0, y: 0, layer: 0, loop, ext }];
  }));
  const at = (/** @type {string} */ id) => /** @type {Placed} */ (nodes.get(id));
  // Cross axis runs along a layer, main axis from layer to layer.
  const crossLo = (/** @type {Placed} */ p) => (down ? p.ext.l : p.ext.t);
  const crossHi = (/** @type {Placed} */ p) => (down ? p.ext.r : p.ext.b);
  const mainLo = (/** @type {Placed} */ p) => (down ? p.ext.t : p.ext.l);
  const mainHi = (/** @type {Placed} */ p) => (down ? p.ext.b : p.ext.r);

  const { layer, back } = rank(g.nodes.map((d) => d.id), links);
  for (const p of nodes.values()) p.layer = /** @type {number} */ (layer.get(p.d.id));
  const forward = links.filter((_, i) => !back[i]);
  const backs = links.filter((_, i) => back[i]);
  // A back edge whose reverse is a forward edge is drawn as a bowed pair along the forward route.
  const fwdIndex = new Map(forward.map((e, i) => [`${e.from}\u0000${e.to}`, i]));
  /** @type {Map<number, GraphEdge>} */
  const partner = new Map();
  const loops = backs.filter((e) => {
    const i = fwdIndex.get(`${e.to}\u0000${e.from}`);
    if (i === undefined) return true;
    partner.set(i, e);
    return false;
  });

  // Going right, labels and badges stack above and below edges, so neighbours need more room.
  const worded = !down && links.some((e) => e.label || e.step);
  const { layers, cross, chains } = place(
    g.nodes.map((d) => ({ id: d.id, lo: crossLo(at(d.id)), hi: crossHi(at(d.id)) })), layer, forward, worded ? 64 : 30,
  );

  // Main-axis gaps: room for labels between layers.
  const depth = layers.length;
  const gaps = Array.from({ length: Math.max(0, depth - 1) }, () => (down ? 40 : 52));
  forward.forEach((e, i) => {
    const a = at(e.from).layer, b = at(e.to).layer;
    const mid = a + Math.floor((b - a - 1) / 2);
    const words = [e, partner.get(i)].filter((x) => x && (x.label || x.step));
    for (const x of /** @type {GraphEdge[]} */ (words)) {
      const room = down ? 52 : labelW(x.label) + 30 + (x.step && mid === a ? 24 : 0);
      gaps[mid] = Math.max(gaps[mid], room);
    }
  });
  const reach = layers.map((keys) => {
    const real = keys.filter((k) => nodes.has(k)).map(at);
    return { lo: Math.max(0, ...real.map(mainLo)), hi: Math.max(0, ...real.map(mainHi)) };
  });
  /** @type {number[]} */
  const mainAt = [];
  reach.forEach((r, l) => mainAt.push(l === 0 ? 0 : mainAt[l - 1] + reach[l - 1].hi + gaps[l - 1] + r.lo));

  const crossOf = (/** @type {Placed} */ p) => (down ? p.x : p.y);
  const mainOf = (/** @type {Placed} */ p) => (down ? p.y : p.x);
  /** Abstract (cross, main) to screen [x, y]. */
  const xy = (/** @type {number} */ c, /** @type {number} */ m) => /** @type {Pt} */ (down ? [c, m] : [m, c]);
  /** @type {Map<string, Pt>} */
  const dummy = new Map();
  /** Where a long edge enters and leaves each layer it passes, so it bends only in the gaps. @type {Map<string, Pt[]>} */
  const band = new Map();
  layers.forEach((keys, l) => keys.forEach((k) => {
    const c = /** @type {number} */ (cross.get(k));
    const p = nodes.get(k);
    if (p) [p.x, p.y] = xy(c, mainAt[l]);
    else {
      dummy.set(k, xy(c, mainAt[l]));
      band.set(k, reach[l].lo + reach[l].hi < 1 ? [xy(c, mainAt[l])] : [xy(c, mainAt[l] - reach[l].lo), xy(c, mainAt[l] + reach[l].hi)]);
    }
  }));

  const mk = markers();
  /** Stroke colour, arrow colour and width for an edge. */
  const inkFor = (/** @type {GraphEdge} */ e) => ({
    stroke: inkOf(e.tone, INK.line), arrow: inkOf(e.tone, INK.arrow), width: e.tone === "span" ? 2.4 : 1.5,
  });
  const stroke = (/** @type {GraphEdge} */ e, /** @type {string} */ d, dashed = e.dashed) => {
    const k = inkFor(e);
    return `<path d="${d}" fill="none" stroke="${k.stroke}" stroke-width="${k.width}"` +
      (dashed ? ` stroke-dasharray="5 3"` : "") + ` marker-end="url(#${mk.id(k.arrow)})"/>`;
  };

  /** @type {Route[]} */
  const routes = [];
  /** Labels that sit at fixed spots (loops, side notes): obstacles for the placer. @type {Box[]} */
  const fixed = [];
  let lines = "", words = "";

  // Forward edges, and their bowed partners.
  const vias = forward.map((_, i) => chains[i].flatMap((k) => /** @type {Pt[]} */ (band.get(k))));
  const ports = portsFor(forward, vias, partner, nodes, down);
  forward.forEach((e, i) => {
    const a = at(e.from), b = at(e.to), via = vias[i];
    const back = partner.get(i);
    const draws = back ? [{ e, from: a, to: b, via, bow: BOW }, { e: back, from: b, to: a, via: [...via].reverse(), bow: BOW }] :
      [{ e, from: a, to: b, via, bow: 0 }];
    for (const r of draws) {
      const route = bend(r.from, r.to, r.via, r.bow, ports.get(`${i}>`), ports.get(`${i}<`));
      lines += stroke(r.e, route.path);
      routes.push({ e: r.e, pts: route.pts, side: r.bow ? 1 : 0, fixed: false });
    }
  });

  // Back edges loop round the outside, nested when there are several on one side.
  const real = [...nodes.values()];
  /** Everything a loop has to clear, as cross extents per layer. */
  const extents = [...real.map((p) => ({ lo: crossOf(p) - crossLo(p), hi: crossOf(p) + crossHi(p), layer: p.layer })),
    ...[...dummy].map(([k, pt]) => ({ lo: pt[down ? 0 : 1], hi: pt[down ? 0 : 1], layer: layers.findIndex((ks) => ks.includes(k)) }))];
  const cs = real.map(crossOf);
  const middle = (Math.min(...cs) + Math.max(...cs)) / 2;
  const used = { [-1]: Infinity, [1]: -Infinity };
  /** Is `p` the outermost real node of its layer on side `s`? */
  const outer = (/** @type {Placed} */ p, /** @type {number} */ s) => {
    const row = layers[p.layer].filter((k) => nodes.has(k));
    return (s < 0 ? row[0] : row.at(-1)) === p.d.id;
  };
  /** Does `p` carry decorations on side `s` that a loop would cut through? */
  const busy = (/** @type {Placed} */ p, /** @type {number} */ s) =>
    (s < 0 ? crossLo(p) : crossHi(p)) > (down ? p.w : p.h) / 2 + 1;
  const sorted = [...loops].sort((x, y) => (at(x.from).layer - at(x.to).layer) - (at(y.from).layer - at(y.to).layer));
  for (const e of sorted) {
    const a = at(e.from), b = at(e.to);
    const rule = crossOf(a) < middle - 1 ? -1 : 1;
    const span = extents.filter((it) => it.layer >= b.layer && it.layer <= a.layer);
    // Long edges past either end on side s: the loop's short legs would cut across them.
    const beyond = (/** @type {number} */ s) => [a, b].reduce((sum, p) => sum + [...dummy].filter(([k, pt]) =>
      layers[p.layer].includes(k) && s * ((down ? pt[0] : pt[1]) - crossOf(p)) > 0).length, 0);
    const score = (/** @type {number} */ s) => (outer(a, s) ? 0 : 2) + (outer(b, s) ? 0 : 2) +
      (busy(a, s) ? 1 : 0) + (busy(b, s) ? 1 : 0) + Math.min(2, beyond(s)) + (s === rule ? 0 : 0.5);
    const s = score(-1) < score(1) ? -1 : 1;
    const edge = s < 0 ? Math.min(...span.map((it) => it.lo)) : Math.max(...span.map((it) => it.hi));
    const co = s < 0 ? Math.min(edge - 24, used[-1] - 14) : Math.max(edge + 24, used[1] + 14);
    const lw = e.label ? (down ? labelW(e.label) : LABEL_H) + 6 : 0;
    used[s] = co + s * lw;

    // Leave and enter from the outer side when nothing is in the way, else through the gap past the layer.
    const channel = (/** @type {Placed} */ p, /** @type {1 | -1} */ dir) => {
      const l = p.layer, half = dir > 0 ? reach[l].hi : reach[l].lo;
      const gap = dir > 0 ? (gaps[l] ?? 36) : (gaps[l - 1] ?? 36);
      return mainAt[l] + dir * (half + gap / 2);
    };
    /** @type {Pt[]} */
    let tail;
    if (outer(a, s) && !busy(a, s)) tail = [edgeOf(a, ...xy(s, 0)), xy(co, mainOf(a))];
    else {
      const m = channel(a, 1), c0 = crossOf(a) + s * (down ? a.w : a.h) / 4;
      tail = [xy(c0, mainOf(a) + (down ? a.h : a.w) / 2), xy(c0, m), xy(co, m)];
    }
    /** @type {Pt[]} */
    let head;
    if (outer(b, s) && !busy(b, s)) head = [xy(co, mainOf(b)), edgeOf(b, ...xy(s, 0))];
    else {
      const m = channel(b, -1), c0 = crossOf(b) + s * (down ? b.w : b.h) / 4;
      head = [xy(co, m), xy(c0, m), xy(c0, mainOf(b) - (down ? b.h : b.w) / 2)];
    }
    const pts = [...tail, ...head];
    lines += stroke(e, rounded(pts), true);
    routes.push({ e, pts, side: 0, fixed: true });
    if (e.label) {
      const m0 = down ? tail.at(-1)?.[1] : tail.at(-1)?.[0], m1 = down ? head[0][1] : head[0][0];
      const mid = (/** @type {number} */ (m0) + m1) / 2, w = labelW(e.label);
      const [x, y] = down ? [co + s * (6 + w / 2), mid] : [mid, co + s * (6 + LABEL_H / 2)];
      words += down ? text(co + s * 6, y + 4, e.label, { anchor: s < 0 ? "end" : "start" }) : text(x, y + 4, e.label);
      fixed.push(boxAt(x, y, w, LABEL_H));
    }
  }

  // Self-loops, start arrows and side notes.
  for (const p of nodes.values()) {
    if (p.loop) {
      const e = p.loop;
      const [p1, p2] = down ? [edgeOf(p, 1, -0.45), edgeOf(p, 1, 0.45)] : [edgeOf(p, -0.45, -1), edgeOf(p, 0.45, -1)];
      const c = LOOP / 0.75;
      /** @type {[Pt, Pt]} */
      const [c1, c2] = down ? [[p1[0] + c, p1[1] - 16], [p2[0] + c, p2[1] + 16]] : [[p1[0] - 16, p1[1] - c], [p2[0] + 16, p2[1] - c]];
      lines += stroke(e, `M${n(p1[0])},${n(p1[1])} C${n(c1[0])},${n(c1[1])} ${n(c2[0])},${n(c2[1])} ${n(p2[0])},${n(p2[1])}`);
      routes.push({ e, pts: [p1, ...cubic(p1, c1, c2, p2)], side: 0, fixed: true });
      if (e.label) {
        const w = labelW(e.label);
        const [x, y] = down ? [p1[0] + LOOP + 6 + w / 2, p.y] : [p.x, p1[1] - LOOP - 4 - LABEL_H / 2];
        words += down ? text(p1[0] + LOOP + 6, y + 4, e.label, { anchor: "start" }) : text(x, y + 4, e.label);
        fixed.push(boxAt(x, y, w, LABEL_H));
      }
    }
    if (p.d.start) {
      const [x2, y2] = edgeOf(p, -1, 0);
      lines += `<path d="M${n(x2 - START)},${n(y2)} L${n(x2)},${n(y2)}" stroke="${INK.arrow}" stroke-width="1.5" marker-end="url(#${mk.id(INK.arrow)})"/>`;
    }
    if (p.d.side) {
      const w = labelW(p.d.side);
      const [x, y] = down ? [p.x + p.ext.r - w / 2, p.y] : [p.x, p.y + p.h / 2 + 6 + LABEL_H / 2];
      words += down ? text(x - w / 2, y + 4, p.d.side, { anchor: "start" }) : text(x, y + 4, p.d.side);
      fixed.push(boxAt(x, y, w, LABEL_H));
    }
  }

  // Badges near the source end, then labels beside the midpoint, each where it covers the least.
  const solid = [...real.map((p) => boxAt(p.x, p.y, p.w + 6, p.h + 6)), ...fixed];
  /** @type {Box[]} */
  const taken = [];
  // Beside means straight across: right/left first going down, above/below first going right.
  /** @type {[number, number][]} */
  const dirs = down ? [[1, 0], [-1, 0], [0, -1], [0, 1]] : [[0, -1], [0, 1], [1, 0], [-1, 0]];
  const spot = (/** @type {Route} */ r, /** @type {number} */ w, /** @type {number} */ h, /** @type {number[]} */ ts) => {
    // Fallback when every candidate is ruled out: just beside the midpoint.
    const m = along(r.pts, 0.5);
    let best = { cost: Infinity, x: m.x + m.ty * (w / 2 + 6), y: m.y - m.tx * (h / 2 + 6), box: boxAt(0, 0, 0, 0) };
    best.box = boxAt(best.x, best.y, w, h);
    ts.forEach((t, ti) => {
      const p = along(r.pts, t);
      dirs.forEach(([dx, dy], di) => {
        // A bowed edge keeps its words on the side it bows to.
        if (r.side && (dx * p.ty - dy * p.tx) * r.side <= 0.2) return;
        // Distance that clears the line across the box's whole extent.
        const off = dx ? w / 2 + 5 + (h / 2) * Math.abs(p.tx / (p.ty || 1e-9)) : h / 2 + 4 + (w / 2) * Math.abs(p.ty / (p.tx || 1e-9));
        if (off > Math.max(w, h) + 40) return;
        const x = p.x + dx * off, y = p.y + dy * off, box = boxAt(x, y, w, h);
        let cost = ti * 3 + di * 2;
        for (const o of solid) if (overlaps(box, o)) cost += 1000;
        for (const o of taken) if (overlaps(box, o)) cost += 1000;
        for (const o of routes) if (lineHits(box, o.pts)) cost += o === r ? 120 : 80;
        if (cost < best.cost) best = { cost, x, y, box };
      });
    });
    taken.push(best.box);
    return best;
  };
  let marks = "";
  for (const r of routes) {
    if (!r.e.step) continue;
    const b = spot(r, 19, 19, [0.2, 0.28, 0.14, 0.36]);
    marks += badge(b.x, b.y, r.e.step, inkFor(r.e).arrow === INK.arrow ? INK.bright : inkFor(r.e).arrow);
  }
  for (const r of routes) {
    if (!r.e.label || r.fixed) continue;
    const w = labelW(r.e.label);
    const b = spot(r, w, LABEL_H, [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74]);
    words += text(b.x, b.y + 4, r.e.label);
  }

  let shapes = "";
  for (const p of real) shapes += node(p);

  const rects = [
    ...real.map((p) => ({ x0: p.x - p.ext.l, y0: p.y - p.ext.t, x1: p.x + p.ext.r, y1: p.y + p.ext.b })),
    ...routes.flatMap((r) => r.pts.map(([x, y]) => ({ x0: x, y0: y, x1: x, y1: y }))),
    ...fixed, ...taken,
  ];
  const box = bounds(rects, 10);
  return svgOpen(box, { label: g.title || "graph", compact: g.compact }) + mk.defs() + lines + shapes + marks + words + "</svg>";
}

/**
 * Spread the ends of forward edges along the facing side of box-like nodes, so
 * several edges into one box arrive side by side instead of on one point.
 * Ends are ordered by where the edge comes from, so spreading adds no crossings.
 * Keys are `${edge}>` for the source end and `${edge}<` for the target end.
 * @param {GraphEdge[]} forward @param {Pt[][]} vias @param {Map<number, GraphEdge>} partner
 * @param {Map<string, Placed>} nodes @param {boolean} down
 */
function portsFor(forward, vias, partner, nodes, down) {
  /** @type {Map<string, Pt>} */
  const ports = new Map();
  /** One side of one node and the edge ends that meet it. @type {Map<string, { p: Placed, sign: number, ends: { key: string, toward: Pt }[] }>} */
  const sides = new Map();
  forward.forEach((e, i) => {
    if (partner.has(i)) return;
    const a = /** @type {Placed} */ (nodes.get(e.from)), b = /** @type {Placed} */ (nodes.get(e.to));
    const after = vias[i][0] ?? [b.x, b.y], before = vias[i].at(-1) ?? [a.x, a.y];
    for (const [p, key, toward, sign] of /** @type {const} */ ([[a, `${i}>`, after, 1], [b, `${i}<`, before, -1]])) {
      if (p.kind !== "rect") continue;
      const side = sides.get(`${sign}\u0000${p.d.id}`) ?? { p, sign, ends: [] };
      side.ends.push({ key, toward });
      sides.set(`${sign}\u0000${p.d.id}`, side);
    }
  });
  for (const { p, sign, ends } of sides.values()) {
    const room = down ? p.w - 16 : p.h - 10;
    const step = ends.length > 1 ? Math.min(down ? 14 : 9, room / (ends.length - 1)) : 0;
    ends.sort((u, v) => (down ? u.toward[0] - v.toward[0] : u.toward[1] - v.toward[1]));
    ends.forEach((end, j) => {
      const off = (j - (ends.length - 1) / 2) * step;
      ports.set(end.key, down ? [p.x + off, p.y + sign * p.h / 2] : [p.x + sign * p.w / 2, p.y + off]);
    });
  }
  return ports;
}

/**
 * Route between two nodes through optional dummy points. `bow` pushes the
 * route to the left of travel, so a->b and b->a separate.
 * `from` and `to` pin the end points to ports when the caller has spread them.
 * @param {Placed} a @param {Placed} b @param {Pt[]} via @param {number} bow
 * @param {Pt} [from] @param {Pt} [to]
 */
function bend(a, b, via, bow, from, to) {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  const nx = dy / len, ny = -dx / len;
  if (!via.length && bow) {
    /** @type {Pt} */
    const c = [(a.x + b.x) / 2 + nx * bow * 2, (a.y + b.y) / 2 + ny * bow * 2];
    const s = edgeOf(a, c[0] - a.x, c[1] - a.y), t = edgeOf(b, c[0] - b.x, c[1] - b.y);
    const path = `M${n(s[0])},${n(s[1])} Q${n(c[0])},${n(c[1])} ${n(t[0])},${n(t[1])}`;
    /** @type {Pt[]} */
    const pts = [s];
    for (let k = 1; k <= 8; k++) {
      const u = k / 8, v = 1 - u;
      pts.push([v * v * s[0] + 2 * v * u * c[0] + u * u * t[0], v * v * s[1] + 2 * v * u * c[1] + u * u * t[1]]);
    }
    return { path, pts };
  }
  const mid = via.map(([x, y]) => /** @type {Pt} */ ([x + nx * bow, y + ny * bow]));
  const first = mid[0] ?? [b.x, b.y], last = mid.at(-1) ?? [a.x, a.y];
  const s = from ?? edgeOf(a, first[0] - a.x, first[1] - a.y), t = to ?? edgeOf(b, last[0] - b.x, last[1] - b.y);
  return spline([s, ...mid, t]);
}

/** One node's outline and label. */
function node(/** @type {Placed} */ p) {
  const { d, x, y, w, h } = p;
  const color = inkOf(d.tone, INK.box), width = d.tone === "span" ? 2.4 : 1.5;
  const outline = `fill="${INK.fill}" stroke="${color}" stroke-width="${width}"`;
  let out;
  switch (d.shape) {
    case "dot":
      return `<circle cx="${n(x)}" cy="${n(y)}" r="4.5" fill="${inkOf(d.tone, INK.bright)}"/>`;
    case "circle": case "double":
      out = `<circle cx="${n(x)}" cy="${n(y)}" r="${n(w / 2)}" ${outline}/>`;
      if (d.shape === "double") out += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(w / 2 - 4)}" fill="none" stroke="${color}" stroke-width="1.2"/>`;
      break;
    case "diamond":
      out = `<path d="M${n(x)},${n(y - h / 2)} L${n(x + w / 2)},${n(y)} L${n(x)},${n(y + h / 2)} L${n(x - w / 2)},${n(y)} Z" ${outline}/>`;
      break;
    default:
      out = `<rect x="${n(x - w / 2)}" y="${n(y - h / 2)}" width="${n(w)}" height="${n(h)}" rx="${d.shape === "round" ? n(h / 2) : 6}" ${outline}/>`;
  }
  return out + text(x, y + 4.5, d.label, { cls: "node-label", mono: d.mono, size: d.mono ? 12 : undefined });
}

