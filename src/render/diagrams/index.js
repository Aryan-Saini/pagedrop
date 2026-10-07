/**
 * Registry of the diagram fences that live in this directory.
 *
 * Each module exports the same three functions, so the parser, the validator,
 * `normalize` and the block renderer all dispatch through this one table rather
 * than growing a case per fence:
 *
 *   validate(errors, block, file)  push every problem; never throw
 *   normalize(data)                fill defaults; only called once validation passed
 *   render(block)                  return a `<figure class="fig">` string
 *
 * `flow` and `sequence` predate this directory and stay in `diagram.js`.
 *
 * @module render/diagrams
 */

import * as tree from "./tree.js";
import * as graph from "./graph.js";
import * as structure from "./structure.js";
import * as lanes from "./lanes.js";
import * as pipeline from "./pipeline.js";
import * as layers from "./layers.js";
import * as er from "./er.js";
import * as sortnet from "./sortnet.js";
import * as topology from "./topology.js";
import * as sankey from "./sankey.js";

/**
 * @typedef {{
 *   validate: (errors: import("../ir.js").RenderError[], block: any, file: string) => void,
 *   normalize: (data: any) => any,
 *   render: (block: any) => string,
 * }} DiagramModule
 */

/** Fence name -> module. Insertion order is the order the docs list them in. */
export const DIAGRAMS = /** @type {Record<string, DiagramModule>} */ ({
  tree, graph, structure, lanes, pipeline, layers, er, sortnet, topology, sankey,
});

export { DIAGRAM_FENCES } from "./names.js";

/**
 * Bytes one diagram may take. The whole page is capped at 512 KB by the upload
 * policy; a figure over this budget is reported at its own fence instead of as a
 * page-level failure that names no block.
 */
export const FIGURE_BUDGET = 320 * 1024;

/** Markup drawn during the current `withDiagramCache` call, by block identity. */
let drawn = /** @type {Map<object, string> | null} */ (null);

/**
 * Run `fn` with diagram markup cached by block, so the size check in `render()`
 * and the page body draw each diagram once. Outside it nothing is cached, so a
 * caller that edits a block and renders it again always gets fresh markup.
 * @template T @param {() => T} fn @returns {T}
 */
export function withDiagramCache(fn) {
  drawn = new Map();
  try {
    return fn();
  } finally {
    drawn = null;
  }
}

/** @param {{ type: string, data: unknown }} block */
export function renderDiagram(block) {
  let html = drawn?.get(block);
  if (html === undefined) {
    html = DIAGRAMS[block.type].render(block);
    drawn?.set(block, html);
  }
  return html;
}
