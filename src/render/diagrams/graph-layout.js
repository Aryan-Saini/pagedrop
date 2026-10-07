/**
 * Layered layout for the `graph` fence (Sugiyama-lite), kept free of SVG so it
 * can be tested on its own. Everything here works in two abstract axes: `main`
 * runs from layer to layer, `cross` runs along a layer. `graph.js` maps them to
 * x and y for `dir: "down"` or `dir: "right"`.
 *
 *   rank()   back edges by DFS, then longest-path layers, honouring pinned ranks
 *   place()  dummy points for long edges, barycenter ordering, groups, cross positions
 *
 * Every step is deterministic: ties fall back to input order.
 *
 * @module render/diagrams/graph-layout
 */

/**
 * @typedef {{ from: string, to: string, back?: boolean }} RankEdge
 * A pinned node whose incoming edges need a later layer than its pin: `need` is
 * the earliest rank the edge from `via` allows.
 * @typedef {{ id: string, rank: number, need: number, via: string }} RankConflict
 */

/**
 * Find back edges and assign layers.
 *
 * `pins` maps a node id to a rank the author fixed. An edge between two pinned
 * nodes takes its direction from the pins: forward when the rank grows, back
 * when it falls, and `flat` (drawn across one layer) when the ranks are equal.
 *
 * Every other edge goes through cycle breaking. DFS runs from each node in input
 * order; an edge into a node still on the stack is a back edge and is reversed
 * for layering. An edge with the `back` hint is reversed too, unless reversing
 * it would close a cycle (then the hint is wrong and the edge stays forward).
 * Of an a->b, b->a pair with no hint, the one listed second is hinted back, so
 * input order says which way is forward. Self-loops must be filtered out first.
 *
 * Layers are longest-path, with pinned nodes held at their pin. A pin earlier
 * than its predecessors allow is a conflict, reported rather than honoured; so
 * is a cycle that pins forbid breaking (`cyclic`). Empty layers are dropped, so
 * pins order layers rather than number them.
 *
 * @param {string[]} ids node ids in input order
 * @param {RankEdge[]} edges
 * @param {Map<string, number>} [pins]
 * @returns {{ layer: Map<string, number>, back: boolean[], flat: boolean[], conflicts: RankConflict[], cyclic: boolean }}
 */
export function rank(ids, edges, pins = new Map()) {
  /** How pins decide an edge: not at all, forward, reversed, or within one layer. */
  const kind = edges.map((e) => {
    const a = pins.get(e.from), b = pins.get(e.to);
    if (a === undefined || b === undefined) return "free";
    return a === b ? "flat" : a < b ? "fwd" : "rev";
  });
  const flat = kind.map((k) => k === "flat");
  const first = new Map();
  edges.forEach((e, i) => { if (!first.has(`${e.from}\u0000${e.to}`)) first.set(`${e.from}\u0000${e.to}`, i); });
  const hinted = edges.map((e, i) => {
    if (kind[i] !== "free") return false;
    if (e.back) return true;
    const j = first.get(`${e.to}\u0000${e.from}`);
    return j !== undefined && j < i && kind[j] === "free" && !edges[j].back;
  });

  /** DFS sees every unhinted edge (pinned ones in their pinned direction), so cycles through pins are found too. */
  /** @type {Map<string, [number, string][]>} */
  const out = new Map(ids.map((id) => [id, []]));
  edges.forEach((e, i) => {
    if (hinted[i]) return;
    if (kind[i] === "rev") out.get(e.to)?.push([i, e.from]);
    else out.get(e.from)?.push([i, e.to]);
  });
  const back = edges.map((_, i) => kind[i] === "rev");
  /** @type {Map<string, 1 | 2>} */
  const state = new Map();
  const dfs = (/** @type {string} */ id) => {
    state.set(id, 1);
    for (const [i, to] of out.get(id) ?? []) {
      // Only a free edge can be turned round; one fixed by pins stays, and the layering reports the cycle.
      if (state.get(to) === 1) { if (kind[i] === "free") back[i] = true; } else if (!state.has(to)) dfs(to);
    }
    state.set(id, 2);
  };
  for (const id of ids) if (!state.has(id)) dfs(id);

  // The layering DAG: forward edges as given, back edges reversed, flat edges left out.
  /** @type {Map<string, string[]>} */
  const preds = new Map(ids.map((id) => [id, []]));
  /** @type {Map<string, string[]>} */
  const succ = new Map(ids.map((id) => [id, []]));
  const link = (/** @type {string} */ a, /** @type {string} */ b) => {
    succ.get(a)?.push(b);
    preds.get(b)?.push(a);
  };
  edges.forEach((e, i) => {
    if (hinted[i] || flat[i]) return;
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
    if (!hinted[i]) return;
    // Reversed it runs to -> from, which is a cycle exactly when from already reaches to.
    if (reaches(e.from, e.to)) link(e.from, e.to);
    else { back[i] = true; link(e.to, e.from); }
  });

  /** @type {Map<string, number>} */
  const layer = new Map();
  /** @type {RankConflict[]} */
  const conflicts = [];
  const visiting = new Set();
  let cyclic = false;
  const depth = (/** @type {string} */ id) => {
    const known = layer.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) { cyclic = true; return 0; }
    visiting.add(id);
    let d = 0, via = "";
    for (const p of preds.get(id) ?? []) {
      const v = depth(p) + 1;
      if (v > d) { d = v; via = p; }
    }
    visiting.delete(id);
    const pin = pins.get(id);
    if (pin !== undefined) {
      if (d > pin) conflicts.push({ id, rank: pin, need: d, via });
      d = pin;
    }
    layer.set(id, d);
    return d;
  };
  ids.forEach(depth);
  // A source sits right above its nearest successor rather than on layer 0, so
  // an input that feeds only a late node does not drag a long edge behind it.
  for (const id of ids) {
    const ss = succ.get(id) ?? [];
    if (pins.has(id) || (preds.get(id) ?? []).length || !ss.length) continue;
    let near = Infinity;
    for (const s of ss) near = Math.min(near, /** @type {number} */ (layer.get(s)));
    layer.set(id, Math.max(0, near - 1));
  }
  const used = [...new Set(layer.values())].sort((a, b) => a - b);
  const index = new Map(used.map((v, i) => [v, i]));
  for (const [id, l] of layer) layer.set(id, /** @type {number} */ (index.get(l)));
  return { layer, back, flat, conflicts, cyclic };
}

/**
 * One thing that takes room in a layer. `lo` and `hi` are how far it reaches
 * before and after its centre along the cross axis (decorations included).
 * @typedef {{ key: string, layer: number, lo: number, hi: number, dummy: boolean }} Item
 */

/** Minimum clear space next to a dummy point in a layer. */
const DUMMY_GAP = 20;
/** How hard a long edge's dummy holds its spot against a node that wants it: barely. */
const DUMMY_WEIGHT = 0.001;

/** Dummy key for the k-th interior point of forward edge `i`. */
const dummyKey = (i, k) => `\u0000${i}:${k}`;

/**
 * A group as `place()` sees it: member ids, and the clear space its outline
 * needs before and after its members along the cross axis.
 * @typedef {{ members: string[], lo: number, hi: number }} PlaceGroup
 * @typedef {{ from: string, to: string, gap: number }} FlatEdge an edge within one layer, and the room it needs
 */

/**
 * Order every layer and give each item a cross position.
 *
 * Forward edges that span several layers get one dummy point per skipped layer,
 * so they route through gaps instead of across boxes. Ordering runs
 * alternating barycenter sweeps and keeps the arrangement with the fewest
 * crossings; then flat edges put their source first, and each group's members
 * close ranks, in the same left-to-right order on every layer. Positions start
 * packed and centred, then relax toward the mean of their neighbours while a
 * pool-adjacent-violators pass keeps every pair at least `lo + gap + hi` apart,
 * so boxes can never overlap. A node looks through a long edge to the node at
 * its far end, and dummies give way to nodes, so a skip edge never drags a
 * chain off line; fellow group members pull harder than outsiders. Last, each
 * long edge's dummies move together, to a straight line when one fits, and
 * anything not in a group is pushed out of the group's outline.
 *
 * @param {{ id: string, lo: number, hi: number }[]} nodes in input order
 * @param {Map<string, number>} layer from `rank()`
 * @param {{ from: string, to: string }[]} forward edges with layer(to) > layer(from)
 * @param {number} [nodeGap] minimum clear space between two nodes in a layer
 * @param {{ flat?: FlatEdge[], groups?: PlaceGroup[], room?: number[] }} [opts]
 *   `room[i]` is how far forward edge i's label reaches beside its dummies, for group outlines.
 * @returns {{ layers: string[][], cross: Map<string, number>, chains: string[][], straight: boolean[] }}
 *   `chains[i]` lists the dummy keys of `forward[i]` from source to target;
 *   `straight[i]` says its dummies lie on the straight line between its ends.
 */
export function place(nodes, layer, forward, nodeGap = 30, opts = {}) {
  const { flat = [], groups = [], room = [] } = opts;
  /** @type {Map<string, Item>} */
  const items = new Map();
  let depth = 0;
  for (const d of nodes) {
    const l = /** @type {number} */ (layer.get(d.id));
    items.set(d.id, { key: d.id, layer: l, lo: d.lo, hi: d.hi, dummy: false });
    depth = Math.max(depth, l + 1);
  }
  /** @type {string[][]} */
  const layers = Array.from({ length: depth }, () => []);
  for (const it of items.values()) layers[it.layer].push(it.key);

  /** @type {Map<string, string[]>} */
  const up = new Map([...items.keys()].map((k) => [k, []]));
  /** @type {Map<string, string[]>} */
  const down = new Map([...items.keys()].map((k) => [k, []]));
  /** Which forward edge each dummy belongs to. @type {Map<string, number>} */
  const chainOf = new Map();
  /** @type {string[][]} */
  const chains = forward.map((e, i) => {
    const a = /** @type {number} */ (layer.get(e.from)), b = /** @type {number} */ (layer.get(e.to));
    const keys = [];
    for (let l = a + 1; l < b; l++) {
      const key = dummyKey(i, l - a - 1);
      items.set(key, { key, layer: l, lo: 0, hi: 0, dummy: true });
      chainOf.set(key, i);
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
  if (flat.length) keepFlat(layers, flat);
  /** @type {Map<string, number>} */
  const groupOf = new Map();
  groups.forEach((g, gi) => { for (const id of g.members) groupOf.set(id, gi); });
  if (groups.length) keepGroups(layers, groupOf);

  /** Room each flat edge asks for between its two ends. */
  /** @type {Map<string, number>} */
  const pairGap = new Map();
  for (const f of flat) {
    for (const k of [`${f.from}\u0000${f.to}`, `${f.to}\u0000${f.from}`]) pairGap.set(k, Math.max(pairGap.get(k) ?? 0, f.gap));
  }
  const gap = (/** @type {Item} */ a, /** @type {Item} */ b) =>
    (a.dummy || b.dummy ? DUMMY_GAP : Math.max(nodeGap, pairGap.get(`${a.key}\u0000${b.key}`) ?? 0));
  /** Least centre distance between neighbours `a` then `b` in one layer. */
  const apart = (/** @type {Item} */ a, /** @type {Item} */ b) => a.hi + gap(a, b) + b.lo;
  const item = (/** @type {string} */ k) => /** @type {Item} */ (items.get(k));
  const at = (/** @type {string} */ k) => /** @type {number} */ (cross.get(k));

  /** @type {Map<string, number>} */
  const cross = new Map();
  for (const keys of layers) {
    if (!keys.length) continue;
    let pos = 0;
    keys.forEach((key, i) => {
      if (i > 0) pos += apart(item(keys[i - 1]), item(key));
      cross.set(key, pos);
    });
    const mid = (-item(keys[0]).lo + at(keys[keys.length - 1]) + item(keys[keys.length - 1]).hi) / 2;
    for (const key of keys) cross.set(key, at(key) - mid);
  }

  /** The far end of the long edge a dummy belongs to, seen from node `k`. */
  const far = (/** @type {string} */ m, /** @type {string} */ k) => {
    const e = forward[/** @type {number} */ (chainOf.get(m))];
    return e.from === k ? e.to : e.from;
  };
  /** Move one layer toward its neighbours' mean, keeping order and spacing. */
  const relax = (/** @type {string[]} */ keys, /** @type {(k: string) => string[]} */ neighbours) => {
    if (!keys.length) return;
    const want = keys.map((k) => {
      let ns = neighbours(k);
      // A node looks through a long edge to the node at its other end, so a
      // skip edge's dummy beside a chain never drags the chain sideways.
      if (!item(k).dummy) ns = ns.map((m) => (item(m).dummy ? far(m, k) : m));
      if (!ns.length) return at(k);
      // Fellow members of a group pull harder, so a group stands as one column.
      const g = groupOf.get(k);
      let sum = 0, mass = 0;
      for (const m of ns) {
        const w = g !== undefined && groupOf.get(m) === g ? 3 : 1;
        sum += at(m) * w;
        mass += w;
      }
      return sum / mass;
    });
    const min = keys.slice(1).map((k, i) => apart(item(keys[i]), item(k)));
    spread(want, min, keys.map((k) => (item(k).dummy ? DUMMY_WEIGHT : 1))).forEach((x, i) => cross.set(keys[i], x));
  };
  const ups = (/** @type {string} */ k) => up.get(k) ?? [];
  const downs = (/** @type {string} */ k) => down.get(k) ?? [];
  for (let round = 0; round < 6; round++) {
    for (let l = 1; l < depth; l++) relax(layers[l], ups);
    for (let l = depth - 2; l >= 0; l--) relax(layers[l], downs);
  }
  for (const keys of layers) relax(keys, (k) => [...ups(k), ...downs(k)]);

  const where = new Map(layers.flatMap((keys, l) => keys.map((k, i) => [k, { l, i }])));
  /** How far `key` may move without crowding its neighbours in the layer. */
  const slack = (/** @type {string} */ key) => {
    const { l, i } = /** @type {{ l: number, i: number }} */ (where.get(key));
    const keys = layers[l], it = item(key);
    const lo = i > 0 ? at(keys[i - 1]) + apart(item(keys[i - 1]), it) : -Infinity;
    const hi = i + 1 < keys.length ? at(keys[i + 1]) - apart(it, item(keys[i + 1])) : Infinity;
    return { lo, hi };
  };
  const straight = chains.map((keys, i) => (keys.length ? straighten(keys, forward[i], at, slack, (k, x) => cross.set(k, x)) : true));

  if (groups.length) {
    const owner = new Map(groupOf);
    forward.forEach((e, i) => {
      const o = groupOf.get(e.from) ?? groupOf.get(e.to);
      if (o !== undefined) for (const k of chains[i]) owner.set(k, o);
    });
    for (let round = 0; round < 4; round++) {
      let moved = false;
      groups.forEach((g, gi) => { if (clearGroup(groups, gi, layers, items, cross, groupOf, owner, chains, forward, room, apart)) moved = true; });
      if (!moved) break;
    }
  }
  return { layers, cross, chains, straight };
}

/**
 * Move one long edge's dummies together. A straight line from end to end wins
 * when every dummy has room for it; failing that, one shared cross position (a
 * straight run with a bend at each end) as near the ends' midpoint as fits;
 * failing that, the straight line clamped into each dummy's room. Each dummy
 * stays inside its own slack, so no layer's spacing breaks.
 * @param {string[]} keys @param {{ from: string, to: string }} e
 * @param {(k: string) => number} at @param {(k: string) => { lo: number, hi: number }} slack
 * @param {(k: string, x: number) => void} set
 * @returns {boolean} whether the edge is now a straight line
 */
function straighten(keys, e, at, slack, set) {
  const a = at(e.from), b = at(e.to), steps = keys.length + 1;
  const room = keys.map(slack);
  const line = keys.map((_, j) => a + ((b - a) * (j + 1)) / steps);
  if (line.every((x, j) => x >= room[j].lo - 1e-6 && x <= room[j].hi + 1e-6)) {
    keys.forEach((k, j) => set(k, line[j]));
    return true;
  }
  let lo = -Infinity, hi = Infinity;
  for (const r of room) { lo = Math.max(lo, r.lo); hi = Math.min(hi, r.hi); }
  if (lo <= hi) {
    const x = Math.min(hi, Math.max(lo, (a + b) / 2));
    for (const k of keys) set(k, x);
  } else {
    keys.forEach((k, j) => set(k, Math.min(room[j].hi, Math.max(room[j].lo, line[j]))));
  }
  return false;
}

/**
 * Push everything that is not part of group `gi` out of its outline, layer by
 * layer, keeping each layer's order and spacing. The outline spans the members
 * and, within the members' layers, the dummies of long edges that touch a
 * member, padded by the group's `lo` and `hi`. A member of another group keeps
 * that group's padding clear too, so outlines never overlap. Returns whether anything moved.
 * @param {PlaceGroup[]} groups @param {number} gi @param {string[][]} layers @param {Map<string, Item>} items
 * @param {Map<string, number>} cross @param {Map<string, number>} groupOf
 * @param {Map<string, number>} owner the group whose outline each key sits in: a member's own, a dummy's edge's
 * @param {string[][]} chains
 * @param {{ from: string, to: string }[]} forward @param {number[]} room
 * @param {(a: Item, b: Item) => number} apart
 */
function clearGroup(groups, gi, layers, items, cross, groupOf, owner, chains, forward, room, apart) {
  const g = groups[gi];
  const item = (/** @type {string} */ k) => /** @type {Item} */ (items.get(k));
  /** Padding an outsider brings on side `s`: its group's outline, if it has one. */
  const pad = (/** @type {string} */ k, /** @type {"lo" | "hi"} */ s) => {
    const o = owner.get(k);
    return o === undefined || o === gi ? 0 : groups[o][s];
  };
  const at = (/** @type {string} */ k) => /** @type {number} */ (cross.get(k));
  /** Keys inside the outline, with how far past their own extent they reach (a long edge's label). */
  const inside = new Map(g.members.map((id) => [id, 0]));
  forward.forEach((e, i) => {
    if (groupOf.get(e.from) === gi || groupOf.get(e.to) === gi) for (const k of chains[i]) inside.set(k, room[i] ?? 0);
  });
  let l0 = Infinity, l1 = -Infinity;
  for (const id of g.members) { l0 = Math.min(l0, item(id).layer); l1 = Math.max(l1, item(id).layer); }
  let lo = Infinity, hi = -Infinity;
  for (const [k, extra] of inside) {
    const it = item(k);
    if (it.layer < l0 || it.layer > l1) continue;
    lo = Math.min(lo, at(k) - it.lo - extra);
    hi = Math.max(hi, at(k) + it.hi + extra);
  }
  lo -= g.lo;
  hi += g.hi;
  let moved = false;
  for (let l = l0; l <= l1; l++) {
    const keys = layers[l];
    let first = keys.findIndex((k) => inside.has(k)), last = -1;
    for (let i = keys.length - 1; i >= 0; i--) if (inside.has(keys[i])) { last = i; break; }
    if (first < 0) {
      first = keys.findIndex((k) => at(k) >= (lo + hi) / 2);
      if (first < 0) first = keys.length;
      last = first - 1;
    }
    for (let i = first - 1; i >= 0; i--) {
      const it = item(keys[i]);
      const max = i === first - 1 ? lo - it.hi - pad(keys[i], "hi") : at(keys[i + 1]) - apart(it, item(keys[i + 1]));
      if (at(keys[i]) > max + 1e-6) { cross.set(keys[i], max); moved = true; }
    }
    for (let i = last + 1; i < keys.length; i++) {
      const it = item(keys[i]);
      const min = i === last + 1 ? hi + it.lo + pad(keys[i], "lo") : at(keys[i - 1]) + apart(item(keys[i - 1]), it);
      if (at(keys[i]) < min - 1e-6) { cross.set(keys[i], min); moved = true; }
    }
  }
  return moved;
}

/**
 * Within each layer, put every flat edge's source before its target where the
 * edges allow it, disturbing the crossing-minimised order as little as possible
 * (Kahn's algorithm, always taking the earliest ready item). A cycle of flat
 * edges keeps its current order.
 * @param {string[][]} layers @param {FlatEdge[]} flat
 */
function keepFlat(layers, flat) {
  layers.forEach((keys, l) => {
    const at = new Map(keys.map((k, i) => [k, i]));
    const edges = flat.filter((f) => at.has(f.from) && at.has(f.to));
    if (!edges.length) return;
    /** @type {Map<string, number>} */
    const need = new Map(keys.map((k) => [k, 0]));
    for (const f of edges) need.set(f.to, /** @type {number} */ (need.get(f.to)) + 1);
    const left = new Set(keys);
    /** @type {string[]} */
    const out = [];
    while (left.size) {
      let pick = "";
      for (const k of keys) if (left.has(k) && need.get(k) === 0) { pick = k; break; }
      if (!pick) pick = /** @type {string} */ (keys.find((k) => left.has(k)));
      left.delete(pick);
      out.push(pick);
      for (const f of edges) if (f.from === pick && left.has(f.to)) need.set(f.to, /** @type {number} */ (need.get(f.to)) - 1);
    }
    layers[l] = out;
  });
}

/**
 * Make each group's members contiguous in every layer, and keep groups in one
 * left-to-right order across layers, so their outlines cannot interleave. A
 * group's block sits where its members' mean index was; groups are ranked by
 * their members' mean relative position over all layers.
 * @param {string[][]} layers @param {Map<string, number>} groupOf
 */
function keepGroups(layers, groupOf) {
  /** @type {Map<number, { sum: number, count: number }>} */
  const mean = new Map();
  for (const keys of layers) {
    keys.forEach((k, i) => {
      const g = groupOf.get(k);
      if (g === undefined) return;
      const m = mean.get(g) ?? { sum: 0, count: 0 };
      m.sum += (i + 0.5) / keys.length;
      m.count++;
      mean.set(g, m);
    });
  }
  const order = [...mean.keys()].sort((a, b) => {
    const ma = /** @type {{ sum: number, count: number }} */ (mean.get(a)), mb = /** @type {{ sum: number, count: number }} */ (mean.get(b));
    return ma.sum / ma.count - mb.sum / mb.count || a - b;
  });
  const rankOf = new Map(order.map((g, i) => [g, i]));
  layers.forEach((keys, l) => {
    /** @type {Map<number, number[]>} */
    const slots = new Map();
    keys.forEach((k, i) => {
      const g = groupOf.get(k);
      if (g !== undefined) slots.set(g, [...(slots.get(g) ?? []), i]);
    });
    if (!slots.size) return;
    // Each block is keyed by its members' mean index; ties go to the block, then group rank.
    const blocks = [...slots].map(([g, is]) => ({ g, key: is.reduce((s, i) => s + i, 0) / is.length, members: is.map((i) => keys[i]) }));
    const keyed = blocks.map((b) => b.key).sort((a, b) => a - b);
    blocks.sort((a, b) => /** @type {number} */ (rankOf.get(a.g)) - /** @type {number} */ (rankOf.get(b.g)));
    blocks.forEach((b, i) => { b.key = keyed[i]; });
    const rest = keys.map((k, i) => ({ k, i })).filter(({ k }) => !groupOf.has(k));
    /** @type {{ key: number, tie: number, ks: string[] }[]} */
    const parts = [
      ...rest.map(({ k, i }) => ({ key: i, tie: 1, ks: [k] })),
      ...blocks.map((b) => ({ key: b.key, tie: 0, ks: b.members })),
    ];
    parts.sort((a, b) => a.key - b.key || a.tie - b.tie);
    layers[l] = parts.flatMap((p) => p.ks);
  });
}

/**
 * Positions as close to `want` as possible (weighted least squares) such that
 * `x[i + 1] - x[i] >= min[i]`. Shifting by the running minimum turns this into
 * isotonic regression, which pool-adjacent-violators solves exactly. A light
 * item gives way to a heavy one when both want the same spot.
 * @param {number[]} want @param {number[]} min @param {number[]} [weight] all 1 when omitted
 */
export function spread(want, min, weight) {
  const offset = [0];
  for (const m of min) offset.push(/** @type {number} */ (offset.at(-1)) + m);
  /** @type {{ sum: number, mass: number, count: number }[]} */
  const blocks = [];
  want.forEach((w, i) => {
    const m = weight?.[i] ?? 1;
    blocks.push({ sum: (w - offset[i]) * m, mass: m, count: 1 });
    while (blocks.length > 1) {
      const b = /** @type {{ sum: number, mass: number, count: number }} */ (blocks.at(-1)), a = blocks[blocks.length - 2];
      if (a.sum / a.mass <= b.sum / b.mass) break;
      a.sum += b.sum;
      a.mass += b.mass;
      a.count += b.count;
      blocks.pop();
    }
  });
  const out = [];
  for (const b of blocks) for (let k = 0; k < b.count; k++) out.push(b.sum / b.mass + offset[out.length]);
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
