import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parseMarkdown } from "../src/render/index.js";
import { validateDoc, formatError } from "../src/render/schema/index.js";
import { normalize, render } from "../src/render/diagrams/graph.js";
import { rank, place, spread, crossings } from "../src/render/diagrams/graph-layout.js";

/** Every diagnostic for one `graph` fence; the fence opens on line 5. */
const errorsOf = (body) => {
  const md = `---\ntitle: T\n---\n\n\`\`\`graph\n${JSON.stringify(body)}\n\`\`\`\n`;
  const r = parseMarkdown(md, { file: "g.md" });
  assert.deepEqual(r.errors, []);
  return validateDoc(r.doc, { file: "g.md" }).map(formatError);
};

const draw = (body) => render({ type: "graph", line: 1, data: normalize(body) });
const count = (svg, re) => (svg.match(re) ?? []).length;

test("examples/diagrams/graph.md validates with zero errors", () => {
  const path = fileURLToPath(new URL("../examples/diagrams/graph.md", import.meta.url));
  const r = parseMarkdown(readFileSync(path, "utf8"), { file: "graph.md" });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(validateDoc(r.doc, { file: "graph.md" }).map(formatError), []);
});

test("validation names what it expected for each bad input", () => {
  assert.deepEqual(errorsOf([]), ["g.md:5 graph: expected an object { nodes, edges }, got an array of 0"]);
  assert.deepEqual(errorsOf({ nodes: [] }), ["g.md:5 graph: /nodes expected at least one node, got an empty array"]);
  assert.deepEqual(errorsOf({ nodes: [{ id: "a" }], dir: "up" }), ["g.md:5 graph: /dir expected one of down right, got \"up\""]);
  assert.deepEqual(errorsOf({ nodes: [{ id: "a" }, { id: "a" }] }),
    ["g.md:5 graph: /nodes/1/id duplicate node id \"a\"; ids must be unique"]);
  assert.deepEqual(errorsOf({ nodes: [{ id: "a", shape: "hex", tone: "red" }] }), [
    "g.md:5 graph: /nodes/0/shape expected one of box round circle double dot diamond, got \"hex\"",
    "g.md:5 graph: /nodes/0/tone expected one of good warn bad flat span c1 c2 c3 c4 c5 c6 c7 c8, got \"red\"",
  ]);
  assert.deepEqual(errorsOf({ nodes: [{ id: "a", x: 3 }], edges: [], colour: 1 }), [
    "g.md:5 graph: /colour unknown key \"colour\"; keys: title note compact dir nodes edges",
    "g.md:5 graph: /nodes/0/x unknown key \"x\"; keys: id label shape tone start side mono",
  ]);
});

test("edges must name real nodes, and the error lists the ids", () => {
  assert.deepEqual(errorsOf({ nodes: [{ id: "a" }, { id: "b" }], edges: [{ from: "a", to: "c" }] }),
    ["g.md:5 graph: /edges/0/to no node with id \"c\"; ids: a b"]);
  assert.deepEqual(errorsOf({ nodes: [{ id: "a" }], edges: [{ from: "a", to: "a", step: 0 }, { from: "a", to: "a", step: 1.5 }] }), [
    "g.md:5 graph: /edges/0/step expected a positive integer, got 0",
    "g.md:5 graph: /edges/1/step expected a positive integer, got 1.5",
  ]);
});

test("normalize fills node and edge defaults; a label defaults to the id", () => {
  const g = normalize({ nodes: [{ id: "a" }, { id: "b", label: "B" }], edges: [{ from: "a", to: "b" }] });
  assert.equal(g.dir, "down");
  assert.equal(g.compact, false);
  assert.deepEqual(g.nodes[0], { id: "a", label: "a", shape: "box", tone: "", start: false, side: "", mono: false });
  assert.equal(g.nodes[1].label, "B");
  assert.deepEqual(g.edges[0], { from: "a", to: "b", label: "", tone: "", dashed: false, step: 0, back: false });
  assert.deepEqual(normalize({ nodes: [{ id: "a" }] }).edges, []);
});

test("rank: DFS in input order marks the edge closing a cycle, and layers by longest path", () => {
  const { layer, back } = rank(["a", "b", "c", "d"], [
    { from: "a", to: "b" }, { from: "b", to: "c" }, { from: "c", to: "a" }, { from: "a", to: "c" }, { from: "c", to: "d" },
  ]);
  assert.deepEqual(back, [false, false, true, false, false]);
  assert.deepEqual(["a", "b", "c", "d"].map((id) => layer.get(id)), [0, 1, 2, 3]);
});

test("rank: the back hint reverses an edge unless that would close a cycle", () => {
  // y -> m and m -> y: the hint picks which one points backwards.
  const hinted = rank(["m", "y"], [{ from: "m", to: "y", back: true }, { from: "y", to: "m" }]);
  assert.deepEqual(hinted.back, [true, false]);
  assert.equal(hinted.layer.get("y"), 0);
  assert.equal(hinted.layer.get("m"), 1);
  // A hint on the only path between two nodes cannot point backwards.
  const wrong = rank(["a", "b", "c"], [{ from: "a", to: "b" }, { from: "b", to: "c" }, { from: "a", to: "c", back: true }]);
  assert.deepEqual(wrong.back, [false, false, false]);
});

test("rank: a source sits just above its nearest successor", () => {
  const { layer } = rank(["x", "m", "z", "add"], [{ from: "x", to: "m" }, { from: "m", to: "add" }, { from: "z", to: "add" }]);
  assert.equal(layer.get("z"), layer.get("add") - 1);
  assert.equal(layer.get("x"), 0);
});

test("spread keeps the minimum gaps and otherwise stays at the wanted spots", () => {
  assert.deepEqual(spread([0, 100, 200], [10, 10]), [0, 100, 200]);
  // Three items wanting one spot spread evenly around it.
  assert.deepEqual(spread([50, 50, 50], [20, 20]), [30, 50, 70]);
  const xs = spread([5, 0, 3, 40], [12, 30, 8]);
  [12, 30, 8].forEach((m, i) => assert.ok(xs[i + 1] - xs[i] >= m - 1e-9));
});

test("place never lets two items in a layer overlap, and long edges get one dummy per skipped layer", () => {
  const ids = ["libc", "zlib", "nghttp2", "pcre2", "openssl", "libcurl", "git"];
  const forward = [
    ["libc", "zlib"], ["libc", "nghttp2"], ["libc", "pcre2"], ["libc", "openssl"], ["zlib", "openssl"],
    ["zlib", "libcurl"], ["zlib", "git"], ["openssl", "libcurl"], ["nghttp2", "libcurl"], ["libcurl", "git"], ["pcre2", "git"],
  ].map(([from, to]) => ({ from, to }));
  const { layer } = rank(ids, forward);
  const nodes = ids.map((id, i) => ({ id, lo: 20 + i * 3, hi: 30 + i * 5 }));
  const { layers, cross, chains } = place(nodes, layer, forward);
  const ext = new Map(nodes.map((d) => [d.id, d]));
  for (const keys of layers) {
    for (let i = 1; i < keys.length; i++) {
      const a = ext.get(keys[i - 1]), b = ext.get(keys[i]);
      const need = (a?.hi ?? 0) + (b?.lo ?? 0) + (a && b ? 30 : 20);
      assert.ok(cross.get(keys[i]) - cross.get(keys[i - 1]) >= need - 1e-6, `${keys[i - 1]} and ${keys[i]} overlap`);
    }
  }
  forward.forEach((e, i) => assert.equal(chains[i].length, layer.get(e.to) - layer.get(e.from) - 1));
});

test("crossings counts swapped pairs between adjacent layers", () => {
  const down = new Map([["a", ["d"]], ["b", ["c"]]]);
  assert.equal(crossings([["a", "b"], ["c", "d"]], down), 1);
  assert.equal(crossings([["a", "b"], ["d", "c"]], down), 0);
});

test("render merges parallel edges into one arrow with joined labels", () => {
  const svg = draw({
    dir: "right",
    nodes: [{ id: "q0", shape: "circle", start: true }, { id: "q1", shape: "double" }],
    edges: [{ from: "q0", to: "q1", label: "a" }, { from: "q0", to: "q1", label: "b" }, { from: "q1", to: "q1", label: "a" }],
  });
  assert.match(svg, />a, b</);
  // One merged edge, one self-loop, one start arrow.
  assert.equal(count(svg, /marker-end=/g), 3);
  // A double state is two concentric circles; q0 is one.
  assert.equal(count(svg, /<circle /g), 3);
});

test("render draws a 2-cycle as two bowed curves and a longer cycle as one dashed outer loop", () => {
  const svg = draw({
    nodes: [{ id: "a" }, { id: "b" }, { id: "c" }],
    edges: [{ from: "a", to: "b" }, { from: "b", to: "a" }, { from: "b", to: "c" }, { from: "c", to: "a", label: "retry" }],
  });
  // Bowed curves are single quadratics; the outer loop is a rounded polyline.
  assert.equal(count(svg, /d="M[\d.,-]+ Q[\d.,-]+ [\d.,-]+"/g), 2);
  assert.equal(count(svg, /stroke-dasharray/g), 1);
  assert.match(svg, />retry</);
});

test("render: step badges, span tone and markers per colour", () => {
  const svg = draw({
    nodes: [{ id: "a", tone: "span" }, { id: "b", tone: "span" }, { id: "c" }],
    edges: [{ from: "a", to: "b", tone: "span", step: 1 }, { from: "a", to: "c", step: 2, label: "x" }],
  });
  // Two badges: a disc plus its number each.
  assert.equal(count(svg, /r="8.5"/g), 2);
  assert.equal(count(svg, /stroke-width="2.4"/g), 3);
  // One marker for the span colour, one for the neutral arrow.
  assert.equal(count(svg, /<marker /g), 2);
  assert.match(svg, /^<figure class="fig">/);
});

test("render: long edges route through their dummy points as one smooth path", () => {
  const svg = draw({
    nodes: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }],
    edges: [{ from: "a", to: "b" }, { from: "b", to: "c" }, { from: "c", to: "d" }, { from: "a", to: "d" }],
  });
  assert.equal(count(svg, /<path d="M[^"]* C/g), 1);
  assert.equal(count(svg, /<rect /g), 4);
});
