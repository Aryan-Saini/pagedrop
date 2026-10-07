import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parseMarkdown } from "../src/render/index.js";
import { validateDoc, formatError } from "../src/render/schema/index.js";
import { validate, normalize, render, build } from "../src/render/diagrams/topology.js";
import { INK, inkOf } from "../src/render/diagrams/svg.js";

/** Diagnostics for one fence body, message text only. */
const errs = (data) => {
  const out = [];
  validate(out, { data, line: 1 }, "t.md");
  return out.map((e) => e.message);
};

const draw = (body) => render({ data: normalize(body) });

test("the example document validates clean", () => {
  const file = fileURLToPath(new URL("../examples/diagrams/topology.md", import.meta.url));
  const { doc, errors } = parseMarkdown(readFileSync(file, "utf8"), { file });
  assert.deepEqual(errors, []);
  assert.deepEqual(validateDoc(doc, { file }).map(formatError), []);
});

test("kind and size are checked against each other", () => {
  assert.deepEqual(errs({ size: 4 }), ["/kind expected one of ring line mesh torus hypercube star complete tree, got nothing"]);
  assert.deepEqual(errs({ kind: "fattree", size: 4 }), ['/kind expected one of ring line mesh torus hypercube star complete tree, got "fattree"']);
  assert.deepEqual(errs({ kind: "hypercube", size: 5 }), ["/size expected a dimension from 1 to 4 for hypercube, got 5"]);
  assert.deepEqual(errs({ kind: "mesh", size: 9 }), ["/size expected a side length from 2 to 8 for mesh, got 9"]);
  assert.deepEqual(errs({ kind: "complete", size: 17 }), ["/size expected a node count from 2 to 16 for complete, got 17"]);
  assert.deepEqual(errs({ kind: "ring" }), ["/size expected a node count from 2 to 32 for ring, got nothing"]);
  assert.deepEqual(errs({ kind: "ring", size: 4, labels: "coords" }),
    ['/labels expected index or binary for ring, got "coords"; coords are for mesh and torus']);
});

test("a path must step along links", () => {
  assert.deepEqual(errs({ kind: "hypercube", size: 3, path: [0, 1, 3, 7] }), []);
  assert.deepEqual(errs({ kind: "hypercube", size: 3, path: [0, 3] }), ["/path/1 node 3 is not linked to node 0; its neighbours: 1 2 4"]);
  assert.deepEqual(errs({ kind: "ring", size: 4, path: [0, 4] }), ["/path/1 expected a node index from 0 to 3, got 4"]);
  assert.deepEqual(errs({ kind: "ring", size: 4, path: [0] }), ["/path expected at least two node indices, got 1"]);
  // A torus wraparound is a link; a mesh has none.
  assert.deepEqual(errs({ kind: "torus", size: 4, path: [0, 3] }), []);
  assert.deepEqual(errs({ kind: "mesh", size: 4, path: [0, 3] }), ["/path/1 node 3 is not linked to node 0; its neighbours: 1 4"]);
});

test("normalize picks labels by kind", () => {
  assert.equal(normalize({ kind: "hypercube", size: 3 }).labels, "binary");
  assert.equal(normalize({ kind: "torus", size: 3 }).labels, "coords");
  assert.equal(normalize({ kind: "ring", size: 3 }).labels, "index");
  assert.equal(normalize({ kind: "ring", size: 3, labels: "binary" }).labels, "binary");
  assert.deepEqual(normalize({ kind: "ring", size: 3 }).path, []);
});

test("build() makes the right number of nodes and links", () => {
  const count = (kind, size) => {
    const net = build(kind, size);
    return [net.nodes.length, net.links.length];
  };
  assert.deepEqual(count("ring", 8), [8, 8]);
  assert.deepEqual(count("line", 6), [6, 5]);
  assert.deepEqual(count("star", 6), [6, 5]);
  assert.deepEqual(count("complete", 5), [5, 10]);
  assert.deepEqual(count("mesh", 4), [16, 24]);
  assert.deepEqual(count("torus", 4), [16, 32]);
  assert.deepEqual(count("hypercube", 3), [8, 12]);
  assert.deepEqual(count("hypercube", 4), [16, 32]);
  assert.deepEqual(count("tree", 3), [15, 14]);
});

test("hypercube links take the colour of the bit that differs; a route is span coloured", () => {
  const html = draw({ kind: "hypercube", size: 3, path: [0, 1, 3, 7] });
  const strokes = [...html.matchAll(/<line [^>]*stroke="([^"]+)"/g)].map((m) => m[1]);
  const tally = (c) => strokes.filter((s) => s === c).length;
  assert.equal(tally(INK.span), 3);
  // Bit 0 has 4 links, one of them on the route; bits 1 and 2 likewise.
  assert.equal(tally(inkOf("c1")), 3);
  assert.equal(tally(inkOf("c3")), 3);
  assert.equal(tally(inkOf("c2")), 3);
  assert.equal((html.match(new RegExp(`<circle [^>]*stroke="${INK.span}"`, "g")) ?? []).length, 4);
  assert.ok(html.includes(">011<"));
});

test("torus wraparounds are dashed loops; a mesh has none", () => {
  assert.equal((draw({ kind: "torus", size: 4 }).match(/stroke-dasharray/g) ?? []).length, 8);
  assert.equal((draw({ kind: "mesh", size: 4 }).match(/stroke-dasharray/g) ?? []).length, 0);
  assert.ok(draw({ kind: "mesh", size: 3 }).includes(">2,1<"));
});

/** Distance from point p to segment ab. */
function segDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

test("no straight link passes through a node it does not join", () => {
  const cases = [["ring", 32], ["line", 32], ["star", 32], ["complete", 5], ["complete", 16], ["mesh", 8], ["torus", 8], ["hypercube", 3], ["hypercube", 4], ["tree", 5]];
  for (const [kind, size] of cases) {
    const html = draw({ kind, size });
    const nodes = [...html.matchAll(/<circle cx="([^"]+)" cy="([^"]+)" r="([^"]+)"/g)].map((m) => ({ x: +m[1], y: +m[2], r: +m[3] }));
    const links = [...html.matchAll(/<line x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"/g)]
      .map((m) => [{ x: +m[1], y: +m[2] }, { x: +m[3], y: +m[4] }]);
    for (const [a, b] of links) {
      for (const p of nodes) {
        const end = (q) => Math.hypot(q.x - p.x, q.y - p.y) < 0.5;
        if (end(a) || end(b)) continue;
        assert.ok(segDist(p, a, b) > p.r + 2, `${kind} ${size}: link passes through node at ${p.x},${p.y}`);
      }
    }
    // Nodes never overlap one another.
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
      assert.ok(d > nodes[i].r + nodes[j].r + 4, `${kind} ${size}: nodes ${i} and ${j} overlap`);
    }
  }
});
