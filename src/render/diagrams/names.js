/**
 * Names of the fences in `render/diagrams`. Kept apart from the registry so the
 * IR can list them without importing every renderer.
 *
 * @module render/diagrams/names
 */
export const DIAGRAM_FENCES = /** @type {const} */ ([
  "tree", "graph", "structure", "lanes", "pipeline", "layers", "er", "sortnet", "topology", "sankey",
]);
