/**
 * `sankey` fence: quantities flowing between stages.
 *
 * Layout is d3-sankey's, run at render time on validated input. d3-sankey
 * throws on a cycle or a dangling id, so both are caught here in `validate`
 * with a message that names the loop; `render` never sees a graph it cannot lay out.
 *
 * Nodes are left aligned: a drop-off sits in the column where it leaves, which
 * is how a funnel reads. Columns are placed by this module rather than spread
 * evenly, so each gap is exactly as wide as the labels that sit in it.
 *
 * @module render/diagrams/sankey
 */

import { sankey, sankeyLeft, sankeyLinkHorizontal } from "d3-sankey";
import {
  Ctx, ptr, show, wantObject, wantNonEmptyArray, wantNumber, wantText,
  optionalString, optionalBoolean, optionalEnum, wantFormat, unknownKeys,
} from "../schema/common.js";
import { formatter, SERIES } from "../charts.js";
import { DIAGRAM_TONES, esc, inkOf, n, svgOpen, figure, textW } from "./svg.js";

/** @typedef {{ id: string, label: string, tone: string }} SankeyNode */
/** @typedef {{ from: string, to: string, value: number }} SankeyLink */
/** @typedef {{ title: string, note: string, compact: boolean, format: string, nodes: SankeyNode[], links: SankeyLink[] }} SankeyBody */

const KEYS = ["title", "note", "compact", "format", "nodes", "links"];

/** Validate a `sankey` fence body. */
/** Size caps, and the value range that keeps d3's column sums finite and its scale sane. */
const MAX_NODES = 100, MAX_LINKS = 400, MIN_VALUE = 1e-9, MAX_VALUE = 1e15;

export function validate(errors, block, file) {
  const ctx = new Ctx(errors, file, block.line, "sankey");
  if (!wantObject(ctx, block.data, "", "an object { nodes, links }")) return;
  const body = /** @type {Record<string, unknown>} */ (block.data);

  optionalString(ctx, body.title, "/title");
  optionalString(ctx, body.note, "/note");
  optionalBoolean(ctx, body.compact, "/compact");
  wantFormat(ctx, body.format, "/format");
  unknownKeys(ctx, body, "", KEYS);

  /** @type {Set<string>} */ const ids = new Set();
  if (Array.isArray(body.nodes) && (body.nodes.length === 1 || body.nodes.length > MAX_NODES)) {
    ctx.at("/nodes", `expected 2 to ${MAX_NODES} nodes, got ${body.nodes.length}`);
    return; // checking links against ids that were never collected would only add noise
  } else if (wantNonEmptyArray(ctx, body.nodes, "/nodes", "at least two nodes")) {
    /** @type {unknown[]} */ (body.nodes).forEach((node, i) => {
      const np = ptr("", "nodes", i);
      if (!wantObject(ctx, node, np, "a node { id, label }")) return;
      if (wantText(ctx, node.id, ptr(np, "id"), "a node id")) {
        const id = /** @type {string} */ (node.id);
        if (ids.has(id)) ctx.at(ptr(np, "id"), `duplicate node id ${JSON.stringify(id)}; ids must be unique`);
        ids.add(id);
      }
      wantText(ctx, node.label, ptr(np, "label"), "a node label");
      optionalEnum(ctx, node.tone, ptr(np, "tone"), DIAGRAM_TONES);
      unknownKeys(ctx, node, np, ["id", "label", "tone"]);
    });
  }

  if (Array.isArray(body.links) && body.links.length > MAX_LINKS) {
    ctx.at("/links", `expected at most ${MAX_LINKS} links, got ${body.links.length}`);
    return;
  }
  if (!wantNonEmptyArray(ctx, body.links, "/links", "at least one link")) return;
  /** @type {Map<string, { to: string, at: number }[]>} */ const out = new Map();
  /** @type {Set<string>} */ const linked = new Set();
  let refsOk = true;
  /** @type {unknown[]} */ (body.links).forEach((link, i) => {
    const lp = ptr("", "links", i);
    if (!wantObject(ctx, link, lp, "a link { from, to, value }")) { refsOk = false; return; }
    let ok = true;
    for (const end of /** @type {const} */ (["from", "to"])) {
      if (!wantText(ctx, link[end], ptr(lp, end), "a node id")) { ok = false; continue; }
      if (!ids.has(/** @type {string} */ (link[end]))) {
        ok = ctx.at(ptr(lp, end), `no node with id ${show(link[end])}; ids: ${[...ids].join(" ")}`);
      }
    }
    if (wantNumber(ctx, link.value, ptr(lp, "value"))) {
      const v = /** @type {number} */ (link.value);
      if (v <= 0) ctx.at(ptr(lp, "value"), `expected a value > 0, got ${show(v)}`);
      else if (v < MIN_VALUE || v > MAX_VALUE) {
        ctx.at(ptr(lp, "value"), `expected a value from ${MIN_VALUE} to ${MAX_VALUE}, got ${show(v)}; rescale the units`);
      }
    }
    unknownKeys(ctx, link, lp, ["from", "to", "value"]);
    if (!ok) { refsOk = false; return; }
    const from = /** @type {string} */ (link.from), to = /** @type {string} */ (link.to);
    linked.add(from).add(to);
    if (from === to) {
      ctx.at(lp, `links ${JSON.stringify(from)} to itself; a sankey flows one way`);
      return;
    }
    out.set(from, [...(out.get(from) ?? []), { to, at: i }]);
  });
  if (!refsOk) return;

  const cycle = findCycle([...ids], out);
  if (cycle) {
    ctx.at(ptr("", "links", cycle.at), `closes a cycle ${cycle.ids.join(" -> ")}; a sankey flows one way, so cut one of these links`);
  }
  /** @type {unknown[]} */ (body.nodes).forEach((node, i) => {
    if (!node || typeof node !== "object") return; // already reported
    const id = /** @type {{ id: string }} */ (node).id;
    if (ids.has(id) && !linked.has(id)) ctx.at(ptr("", "nodes", i), `node ${JSON.stringify(id)} has no links; drop it or link it`);
  });
}

/**
 * The first cycle a depth-first search meets, as the ids around it (first id
 * repeated at the end) and the index of the link that closes it.
 * @param {string[]} ids @param {Map<string, { to: string, at: number }[]>} out
 */
function findCycle(ids, out) {
  /** @type {Map<string, number>} 1 = on the stack, 2 = done */
  const state = new Map();
  /** @type {string[]} */ const stack = [];
  /** @returns {{ ids: string[], at: number } | null} */
  const visit = (id) => {
    state.set(id, 1);
    stack.push(id);
    for (const { to, at } of out.get(id) ?? []) {
      if (state.get(to) === 1) return { ids: [...stack.slice(stack.indexOf(to)), to], at };
      if (!state.has(to)) {
        const found = visit(to);
        if (found) return found;
      }
    }
    stack.pop();
    state.set(id, 2);
    return null;
  };
  for (const id of ids) {
    if (state.has(id)) continue;
    const found = visit(id);
    if (found) return found;
  }
  return null;
}

/** Fill defaults on a validated body. */
export function normalize(data) {
  return {
    title: "", note: "", compact: false, format: "compact", ...data,
    nodes: data.nodes.map((/** @type {SankeyNode} */ node) => ({ tone: "", ...node })),
  };
}

const NODE_W = 12;
const NODE_PAD = 24;
const LABEL = 13, VALUE = 11.5;

/** Render a validated, normalized `sankey` block. */
export function render(block) {
  const d = /** @type {SankeyBody} */ (block.data);
  const fmt = formatter(d.format);
  const colors = d.nodes.map((node, i) => inkOf(node.tone, SERIES[i % SERIES.length]));
  const colorOf = new Map(d.nodes.map((node, i) => [node.id, colors[i]]));

  /** @param {number} height */
  const layout = (height) => sankey()
    .nodeId((/** @type {{ id: string }} */ node) => node.id)
    .nodeAlign(sankeyLeft)
    .nodeWidth(NODE_W)
    .nodePadding(NODE_PAD)
    .extent([[0, 0], [1000, height]])({
      nodes: d.nodes.map((node) => ({ ...node })),
      links: d.links.map((l) => ({ source: l.from, target: l.to, value: l.value })),
    });

  // A first pass finds the columns and totals. Gaps are sized from the labels;
  // the height follows the busiest column and keeps a wide chart from going flat.
  const probe = layout(400);
  const layers = Math.max(...probe.nodes.map((node) => node.layer)) + 1;
  const labelW = (node) => textW(node.label, LABEL) + 6 + textW(fmt(node.value), VALUE);
  const inLayer = (k) => probe.nodes.filter((node) => node.layer === k);
  const widest = (k) => Math.max(0, ...inLayer(k).map(labelW));
  /** @type {number[]} */ const colX = [0];
  for (let k = 1; k < layers; k++) {
    // Columns before the last label to their right; the last labels to its left.
    const room = widest(k - 1) + (k === layers - 1 ? widest(k) + 16 : 0);
    colX.push(colX[k - 1] + NODE_W + Math.max(90, room + 24));
  }
  const W = colX[layers - 1] + NODE_W;
  const busiest = Math.max(...Array.from({ length: layers }, (_, k) => inLayer(k).length));
  const H = Math.round(Math.max(160, busiest * 58, W * 0.36));
  const graph = layout(H);
  for (const node of graph.nodes) {
    node.x0 = colX[node.layer];
    node.x1 = node.x0 + NODE_W;
  }

  const path = sankeyLinkHorizontal();
  let body = "";
  for (const link of graph.links) {
    const color = colorOf.get(link.source.id);
    body += `<path d="${path(link)}" fill="none" stroke="${color}" stroke-opacity="0.35" stroke-width="${n(Math.max(1, link.width))}">` +
      `<title>${esc(link.source.label)} → ${esc(link.target.label)}: ${esc(fmt(link.value))}</title></path>`;
  }
  for (const node of graph.nodes) {
    const color = colorOf.get(node.id);
    body += `<rect x="${n(node.x0)}" y="${n(node.y0)}" width="${NODE_W}" height="${n(Math.max(1, node.y1 - node.y0))}" fill="${color}">` +
      `<title>${esc(node.label)}: ${esc(fmt(node.value))}</title></rect>`;
    const last = node.layer === layers - 1;
    const x = last ? node.x0 - 6 : node.x1 + 6;
    const y = (node.y0 + node.y1) / 2 + 4.5;
    body += `<text x="${n(x)}" y="${n(y)}" class="node-label" style="text-anchor:${last ? "end" : "start"}">` +
      `${esc(node.label)}<tspan dx="6" style="font-family:var(--mono);font-size:${VALUE}px">${esc(fmt(node.value))}</tspan></text>`;
  }

  // Validation guarantees a link, so there are always at least two columns.
  const box = { x: -8, y: -10, w: W + 16, h: H + 20 };
  const label = d.title || "sankey diagram";
  return figure(svgOpen(box, { label, compact: d.compact }) + body + "</svg>", d.title, d.note);
}
