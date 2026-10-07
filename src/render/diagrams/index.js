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
