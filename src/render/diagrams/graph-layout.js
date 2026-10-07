/**
 * Layered layout for the `graph` fence (Sugiyama-lite), kept free of SVG so it
 * can be tested on its own. Everything here works in two abstract axes: `main`
 * runs from layer to layer, `cross` runs along a layer. `graph.js` maps them to
 * x and y for `dir: "down"` or `dir: "right"`.
 *
 *   rank()   back edges by DFS, then longest-path layers
 *   place()  dummy points for long edges, barycenter ordering, cross positions
 *
 * Every step is deterministic: ties fall back to input order.
 *
 * @module render/diagrams/graph-layout
 */

/** @typedef {{ from: string, to: string, back?: boolean }} RankEdge */

/**
 * Find back edges and assign layers.
 *
 * DFS runs from each node in input order; an edge into a node still on the
 * stack is a back edge and is reversed for layering. An edge with the `back`
 * hint is reversed too, unless reversing it would close a cycle (then the hint
 * is wrong and the edge stays forward). Self-loops must be filtered out first.
 *
 * @param {string[]} ids node ids in input order
 * @param {RankEdge[]} edges
 * @returns {{ layer: Map<string, number>, back: boolean[] }}
 */
export function rank(ids, edges) {
  /** @type {Map<string, number[]>} */
  const out = new Map(ids.map((id) => [id, []]));
  edges.forEach((e, i) => { if (!e.back) out.get(e.from)?.push(i); });

  const back = edges.map(() => false);
  /** @type {Map<string, 1 | 2>} */
  const state = new Map();
  const dfs = (/** @type {string} */ id) => {
    state.set(id, 1);
    for (const i of out.get(id) ?? []) {
      const to = edges[i].to;
      if (state.get(to) === 1) back[i] = true;
      else if (!state.has(to)) dfs(to);
    }
    state.set(id, 2);
  };
  for (const id of ids) if (!state.has(id)) dfs(id);

  // The layering DAG: forward edges as given, back edges reversed.
  /** @type {Map<string, string[]>} */
  const preds = new Map(ids.map((id) => [id, []]));
  /** @type {Map<string, string[]>} */
  const succ = new Map(ids.map((id) => [id, []]));
  const link = (/** @type {string} */ a, /** @type {string} */ b) => {
    succ.get(a)?.push(b);
    preds.get(b)?.push(a);
  };
  edges.forEach((e, i) => {
    if (e.back) return;
    if (back[i]) link(e.to, e.from);
    else link(e.from, e.to);
  });
  const reaches = (/** @type {string} */ a, /** @type {string} */ b) => {
    const seen = new Set([a]);
    const stack = [a];
    while (stack.length) {
      const v = /** @type {string} */ (stack.pop());
      if (v === b) return true;
      for (const w of succ.get(v) ?? []) if (!seen.has(w)) { seen.add(w); stack.push(w); }
    }
    return false;
  };
  edges.forEach((e, i) => {
    if (!e.back) return;
    // Reversed it runs to -> from, which is a cycle exactly when from already reaches to.
    if (reaches(e.from, e.to)) link(e.from, e.to);
    else { back[i] = true; link(e.to, e.from); }
  });

  /** @type {Map<string, number>} */
  const layer = new Map();
  const depth = (/** @type {string} */ id) => {
    const known = layer.get(id);
    if (known !== undefined) return known;
    const ps = preds.get(id) ?? [];
    const d = ps.length ? Math.max(...ps.map(depth)) + 1 : 0;
    layer.set(id, d);
    return d;
  };
  ids.forEach(depth);
  // A source sits right above its nearest successor rather than on layer 0, so
  // an input that feeds only a late node does not drag a long edge behind it.
  for (const id of ids) {
    const ss = succ.get(id) ?? [];
    if (!(preds.get(id) ?? []).length && ss.length) layer.set(id, Math.min(...ss.map((s) => /** @type {number} */ (layer.get(s)))) - 1);
  }
  return { layer, back };
}

/**
 * One thing that takes room in a layer. `lo` and `hi` are how far it reaches
 * before and after its centre along the cross axis (decorations included).
 * @typedef {{ key: string, layer: number, lo: number, hi: number, dummy: boolean }} Item
 */

/** Minimum clear space next to a dummy point in a layer. */
const DUMMY_GAP = 20;

/** Dummy key for the k-th interior point of forward edge `i`. */
const dummyKey = (i, k) => `\u0000${i}:${k}`;

/**
 * Order every layer and give each item a cross position.
 *
 * Forward edges that span several layers get one dummy point per skipped layer,
 * so they route through gaps instead of across boxes. Ordering runs
 * alternating barycenter sweeps and keeps the arrangement with the fewest
 * crossings. Positions start packed and centred, then relax toward the mean of
 * their neighbours while a pool-adjacent-violators pass keeps every pair at
 * least `lo + gap + hi` apart, so boxes can never overlap.
 *
 * @param {{ id: string, lo: number, hi: number }[]} nodes in input order
 * @param {Map<string, number>} layer from `rank()`
 * @param {{ from: string, to: string }[]} forward edges with layer(to) > layer(from)
 * @param {number} [nodeGap] minimum clear space between two nodes in a layer
 * @returns {{ layers: string[][], cross: Map<string, number>, chains: string[][] }}
 *   `chains[i]` lists the dummy keys of `forward[i]` from source to target.
 */
export function place(nodes, layer, forward, nodeGap = 30) {
  /** @type {Map<string, Item>} */
  const items = new Map();
  for (const d of nodes) {
    items.set(d.id, { key: d.id, layer: /** @type {number} */ (layer.get(d.id)), lo: d.lo, hi: d.hi, dummy: false });
  }
  const depth = Math.max(...[...items.values()].map((it) => it.layer)) + 1;
  /** @type {string[][]} */
  const layers = Array.from({ length: depth }, () => []);
  for (const it of items.values()) layers[it.layer].push(it.key);

  /** @type {Map<string, string[]>} */
  const up = new Map([...items.keys()].map((k) => [k, []]));
  /** @type {Map<string, string[]>} */
  const down = new Map([...items.keys()].map((k) => [k, []]));
  /** @type {string[][]} */
  const chains = forward.map((e, i) => {
    const a = /** @type {number} */ (layer.get(e.from)), b = /** @type {number} */ (layer.get(e.to));
    const keys = [];
    for (let l = a + 1; l < b; l++) {
      const key = dummyKey(i, l - a - 1);
      items.set(key, { key, layer: l, lo: 0, hi: 0, dummy: true });
      layers[l].push(key);
      up.set(key, []);
      down.set(key, []);
      keys.push(key);
    }
    const path = [e.from, ...keys, e.to];
    for (let k = 0; k + 1 < path.length; k++) {
      down.get(path[k])?.push(path[k + 1]);
      up.get(path[k + 1])?.push(path[k]);
    }
    return keys;
  });

  orderLayers(layers, up, down);

  /** @type {Map<string, number>} */
  const cross = new Map();
  const gap = (/** @type {Item} */ a, /** @type {Item} */ b) => (a.dummy || b.dummy ? DUMMY_GAP : nodeGap);
  for (const keys of layers) {
    let at = 0;
    keys.forEach((key, i) => {
      const it = /** @type {Item} */ (items.get(key));
      if (i > 0) {
        const prev = /** @type {Item} */ (items.get(keys[i - 1]));
        at += prev.hi + gap(prev, it) + it.lo;
      }
      cross.set(key, at);
    });
    const first = /** @type {Item} */ (items.get(keys[0])), last = /** @type {Item} */ (items.get(keys.at(-1) ?? ""));
    const mid = (-first.lo + /** @type {number} */ (cross.get(last.key)) + last.hi) / 2;
    for (const key of keys) cross.set(key, /** @type {number} */ (cross.get(key)) - mid);
  }

  /** Move one layer toward its neighbours' mean, keeping order and spacing. */
  const relax = (/** @type {string[]} */ keys, /** @type {(k: string) => string[]} */ neighbours) => {
    const want = keys.map((k) => {
      const ns = neighbours(k);
      if (!ns.length) return /** @type {number} */ (cross.get(k));
      return ns.reduce((s, m) => s + /** @type {number} */ (cross.get(m)), 0) / ns.length;
    });
    const its = keys.map((k) => /** @type {Item} */ (items.get(k)));
    const min = its.slice(1).map((it, i) => its[i].hi + gap(its[i], it) + it.lo);
    spread(want, min).forEach((x, i) => cross.set(keys[i], x));
  };
  const ups = (/** @type {string} */ k) => up.get(k) ?? [];
  const downs = (/** @type {string} */ k) => down.get(k) ?? [];
  for (let round = 0; round < 6; round++) {
    for (let l = 1; l < depth; l++) relax(layers[l], ups);
    for (let l = depth - 2; l >= 0; l--) relax(layers[l], downs);
  }
  for (const keys of layers) relax(keys, (k) => [...ups(k), ...downs(k)]);

  return { layers, cross, chains };
}

/**
 * Positions as close to `want` as possible (least squares) such that
 * `x[i + 1] - x[i] >= min[i]`. Shifting by the running minimum turns this into
 * isotonic regression, which pool-adjacent-violators solves exactly.
 * @param {number[]} want @param {number[]} min
 */
export function spread(want, min) {
  const offset = [0];
  for (const m of min) offset.push(/** @type {number} */ (offset.at(-1)) + m);
  /** @type {{ sum: number, count: number }[]} */
  const blocks = [];
  want.forEach((w, i) => {
    blocks.push({ sum: w - offset[i], count: 1 });
    while (blocks.length > 1) {
      const b = /** @type {{ sum: number, count: number }} */ (blocks.at(-1)), a = blocks[blocks.length - 2];
      if (a.sum / a.count <= b.sum / b.count) break;
      a.sum += b.sum;
      a.count += b.count;
      blocks.pop();
    }
  });
  const out = [];
  for (const b of blocks) for (let k = 0; k < b.count; k++) out.push(b.sum / b.count + offset[out.length]);
  return out;
}

/**
 * Barycenter crossing reduction, in place. Items without neighbours on the
 * reference side keep their slot; the rest are re-sorted among themselves with
 * their current position as the tiebreak, so input order survives ties.
 * @param {string[][]} layers @param {Map<string, string[]>} up @param {Map<string, string[]>} down
 */
function orderLayers(layers, up, down) {
  const sweep = (/** @type {number} */ l, /** @type {Map<string, string[]>} */ side, /** @type {string[]} */ ref) => {
    const at = new Map(ref.map((k, i) => [k, i]));
    const keys = layers[l];
    const movable = keys.map((k, i) => ({ k, i, ns: side.get(k) ?? [] })).filter((m) => m.ns.length);
    const bc = new Map(movable.map((m) => [m.k, m.ns.reduce((s, n) => s + at.get(n), 0) / m.ns.length]));
    const slots = movable.map((m) => m.i);
    const sorted = [...movable].sort((a, b) => bc.get(a.k) - bc.get(b.k) || a.i - b.i);
    sorted.forEach((m, j) => { keys[slots[j]] = m.k; });
  };
  let best = layers.map((l) => [...l]);
  let fewest = crossings(layers, down);
  for (let round = 0; round < 8 && fewest > 0; round++) {
    for (let l = 1; l < layers.length; l++) sweep(l, up, layers[l - 1]);
    for (let l = layers.length - 2; l >= 0; l--) sweep(l, down, layers[l + 1]);
    const c = crossings(layers, down);
    if (c < fewest) { fewest = c; best = layers.map((l) => [...l]); }
  }
  best.forEach((keys, l) => { layers[l] = keys; });
}

/**
 * Edge crossings between adjacent layers.
 * @param {string[][]} layers @param {Map<string, string[]>} down
 */
export function crossings(layers, down) {
  let total = 0;
  for (let l = 0; l + 1 < layers.length; l++) {
    const at = new Map(layers[l + 1].map((k, i) => [k, i]));
    /** @type {[number, number][]} */
    const segs = [];
    layers[l].forEach((k, i) => { for (const m of down.get(k) ?? []) segs.push([i, /** @type {number} */ (at.get(m))]); });
    for (let a = 0; a < segs.length; a++) {
      for (let b = a + 1; b < segs.length; b++) {
        if ((segs[a][0] - segs[b][0]) * (segs[a][1] - segs[b][1]) < 0) total++;
      }
    }
  }
  return total;
}
