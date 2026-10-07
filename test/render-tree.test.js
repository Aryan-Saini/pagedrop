import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { render as renderDoc } from "../src/render/index.js";
import {
  validate, normalize, render, parseShorthand, layoutTree, MAX_NODES,
} from "../src/render/diagrams/tree.js";

/** Every diagnostic message for one fence body. */
const problems = (data) => {
  const errors = [];
  validate(errors, { data, line: 1 }, "t.md");
  return errors.map((e) => e.message);
};

/** Assert a body validates clean. */
const clean = (data) => assert.deepEqual(problems(data), []);

/** Normalize then render, the way the block renderer does. */
const draw = (data) => render({ data: normalize(data) });

const count = (svg, re) => (svg.match(re) ?? []).length;

/** The scan from the example doc: a value on every edge, numbered by step. */
const scan = (extra = {}) => {
  const leaf = (cells, up, down, below) => ({
    shape: "cells", cells, up: { v: up, step: 1 }, down: { v: down, step: 4 }, below, belowTone: "good",
  });
  return {
    shape: "circle", levels: ["", "", "scan results"], ...extra,
    tree: { children: [
      { up: { v: 5, step: 2 }, down: { v: 0, step: 3 }, children: [leaf([2, 1], 3, 0, "0 2"), leaf([3, -1], 2, 3, "3 6")] },
      { up: { v: 9, step: 2 }, down: { v: 5, step: 3 }, children: [leaf([4, 2], 6, 5, "5 9"), leaf([-2, 5], 3, 11, "11 9")] },
    ] },
  };
};

/* ------------------------------------------------------------------ shorthand */

test("shorthand parses nested labels, trimming and keeping punctuation", () => {
  const r = parseShorthand(" P1 root 1..4 ( x < 3 , a=b+1(c) ) ");
  assert.ok("node" in r);
  assert.deepEqual(r.node, {
    label: "P1 root 1..4",
    children: [{ label: "x < 3", children: [] }, { label: "a=b+1", children: [{ label: "c", children: [] }] }],
  });
  assert.equal(r.count, 4);
  assert.equal(r.depth, 2);
  // An unlabeled root is allowed.
  assert.deepEqual(parseShorthand("(a,b)"), {
    node: { label: "", children: [{ label: "a", children: [] }, { label: "b", children: [] }] }, count: 3, depth: 1,
  });
});

test("shorthand errors name the offset and what was expected", () => {
  const err = (src) => /** @type {{ error: string }} */ (parseShorthand(src)).error;
  assert.equal(err("A(B,C"), `expected "," or ")" at offset 5, got end of text; the "(" at offset 1 is never closed`);
  assert.equal(err("A(B)C"), `expected end of text at offset 4, got "C"`);
  assert.equal(err("A(B))"), `unexpected ")" at offset 4; it closes no "("`);
  assert.equal(err("A,B"), `expected end of text at offset 1, got ","; a tree has one root, so wrap siblings in a parent like "root(A,B)"`);
  assert.equal(err("A(B( ))"), `expected a child at offset 5, got ")"; "B()" is an empty child list, drop the "()" to make a leaf`);
  assert.equal(err("A(B(C)D)"), `expected "," or ")" at offset 6, got "D"`);
  assert.match(err("   "), /got an empty string/);
  assert.match(err("a(".repeat(40) + "b" + ")".repeat(40)), /at most 32 levels/);
  assert.match(err(`r(${Array(MAX_NODES).fill("x").join(",")})`), /at most 400 nodes/);
});

/* ------------------------------------------------------------------ validation */

test("valid bodies pass, shorthand and node objects alike", () => {
  clean({ tree: "A(B,C)", dir: "right", layout: "leaves", shape: "ellipse", arrows: "toChild", mono: true, compact: true, levels: ["root", "kids"] });
  clean(scan({ until: 2, title: "Scan", note: "n" }));
  clean({ tree: { label: 1, up: { v: 14, step: 5 }, children: [{ label: "a", edge: "yes", tone: "c3", below: "W0", belowTone: "good", mono: false }] } });
});

test("a malformed shorthand is reported at /tree", () => {
  assert.deepEqual(problems({ tree: "A(B" }), [`/tree expected "," or ")" at offset 3, got end of text; the "(" at offset 1 is never closed`]);
});

test("unknown keys are rejected at every level", () => {
  assert.deepEqual(problems({ tree: { label: "r", colour: "red", children: [{ up: { v: 1, at: 2 } }] }, wide: true }), [
    `/wide unknown key "wide"; keys: title note compact tree dir layout shape mono arrows levels until`,
    `/tree/colour unknown key "colour"; keys: label children shape tone mono below belowTone edge cells up down`,
    `/tree/children/0/up/at unknown key "at"; keys: v step`,
  ]);
});

test("enums and scalars name what they expected", () => {
  assert.deepEqual(problems({ tree: { shape: "hexagon", tone: "pink", label: [1] }, dir: "sideways" }), [
    `/dir expected one of down up right left, got "sideways"`,
    `/tree/label expected a string or a number, got an array of 1`,
    `/tree/shape expected one of box round circle ellipse dot cells text, got "hexagon"`,
    `/tree/tone expected one of good warn bad flat span c1 c2 c3 c4 c5 c6 c7 c8, got "pink"`,
  ]);
  assert.deepEqual(problems({ tree: 7 }), [`/tree expected a shorthand string like "Root(A,B)" or a node object { label, children }, got 7`]);
});

test("cells go with shape cells, and only with it", () => {
  assert.deepEqual(problems({ tree: { shape: "cells" } }), [`/tree/cells expected an array of values for shape "cells", got nothing`]);
  assert.deepEqual(problems({ tree: { cells: [1] } }), [`/tree/cells only applies to shape "cells"; this node's shape is "box"`]);
  assert.deepEqual(problems({ shape: "cells", tree: { cells: [] } }), [`/tree/cells expected at least one cell value, got an empty array`]);
  assert.deepEqual(problems({ shape: "cells", tree: "A(B)" }), [`/shape "cells" needs per-node cells, which the shorthand cannot carry; write the tree as node objects`]);
});

test("steps and until are positive integers", () => {
  assert.deepEqual(problems({ tree: { children: [{ up: { v: 1, step: 0 }, down: { step: 1.5 } }] }, until: -1 }), [
    `/until expected a positive integer step, got -1`,
    `/tree/children/0/up/step expected a positive integer, got 0`,
    `/tree/children/0/down/v expected a string or a number, got nothing`,
    `/tree/children/0/down/step expected a positive integer, got 1.5`,
  ]);
  assert.deepEqual(problems({ tree: { children: [{ up: true }] } }), [`/tree/children/0/up expected a string, a number or { "v": value, "step": n }, got true`]);
});

test("the root takes no down value and no edge label", () => {
  assert.deepEqual(problems({ tree: { down: 1, edge: "x" } }), [
    `/tree/down the root has no parent to receive a value from; use "up" for the tree's output`,
    `/tree/edge the root has no edge to its parent to label`,
  ]);
});

test("levels cannot outnumber the tree's rows", () => {
  assert.deepEqual(problems({ tree: "A(B(C))", levels: ["a", "b", "c", "d"] }), [`/levels expected at most 3 levels (one per depth, the tree is 2 deep), got 4`]);
  assert.deepEqual(problems({ tree: "A", levels: [3] }), [`/levels/0 expected a string, got 3`]);
});

test("node count and depth are capped", () => {
  const wide = { children: Array.from({ length: MAX_NODES }, () => ({})) };
  assert.deepEqual(problems({ tree: wide }), [`/tree expected at most 400 nodes, got more; split the tree across several fences`]);
  let deep = {};
  for (let i = 0; i < 40; i++) deep = { children: [deep] };
  const msgs = problems({ tree: deep });
  assert.equal(msgs.length, 1);
  assert.match(msgs[0], /^\/tree(\/children\/0){32}\/children expected at most 32 levels of nesting/);
});

/* ------------------------------------------------------------------ normalize */

test("normalize fills defaults and resolves shape and mono per node", () => {
  const spec = normalize({ tree: "A(B)", shape: "ellipse", mono: true });
  assert.equal(spec.dir, "down");
  assert.equal(spec.layout, "tidy");
  assert.equal(spec.arrows, "none");
  assert.equal(spec.until, 0);
  assert.equal(spec.compact, false);
  assert.deepEqual(spec.levels, []);
  assert.deepEqual(spec.tree.children[0], {
    label: "B", children: [], shape: "ellipse", tone: "", mono: true, below: "", belowTone: "", edge: "", cells: [], up: null, down: null,
  });
  const flows = normalize({ tree: { label: 3, up: 7, children: [{ shape: "cells", cells: [1, "x"], down: { v: "go", step: 2 } }] } });
  assert.equal(flows.tree.label, "3");
  assert.deepEqual(flows.tree.up, { v: "7", step: 0 });
  assert.deepEqual(flows.tree.children[0].down, { v: "go", step: 2 });
  assert.deepEqual(flows.tree.children[0].cells, ["1", "x"]);
  assert.equal(flows.tree.children[0].shape, "cells");
});

test("normalize does not throw on a body that failed validation", () => {
  assert.doesNotThrow(() => normalize({ tree: "A(" }));
  assert.doesNotThrow(() => normalize({ tree: { children: "nope" } }));
});

/* ------------------------------------------------------------------ layout */

/** True when two node outlines overlap. */
const overlap = (a, b) =>
  Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;

test("tidy layout keeps every node of a lopsided tree apart and parents above children", () => {
  const fib = (k) => (k < 2 ? `fib ${k}` : `fib ${k}(${fib(k - 1)},${fib(k - 2)})`);
  const { nodes } = layoutTree(normalize({ tree: fib(7) }));
  assert.equal(nodes.length, 41);
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) assert.ok(!overlap(nodes[i], nodes[j]), `${nodes[i].n.label} overlaps ${nodes[j].n.label}`);
  }
  for (const p of nodes) if (p.parent) assert.ok(p.y > p.parent.y);
});

test("dir flips the depth axis", () => {
  const ys = (dir) => layoutTree(normalize({ tree: "A(B(C))", dir })).nodes.map((p) => [p.x, p.y]);
  const down = ys("down"), up = ys("up"), right = ys("right"), left = ys("left");
  assert.ok(down[0][1] < down[2][1]);
  assert.ok(up[0][1] > up[2][1]);
  assert.ok(right[0][0] < right[2][0]);
  assert.ok(left[0][0] > left[2][0]);
});

test("spine puts a parent on its first child's column", () => {
  const { nodes } = layoutTree(normalize({ tree: "a(b(c,d),e(f,g))", layout: "spine" }));
  const at = Object.fromEntries(nodes.map((p) => [p.n.label, p]));
  assert.equal(at.a.x, at.b.x);
  assert.equal(at.b.x, at.c.x);
  assert.equal(at.e.x, at.f.x);
  assert.ok(at.d.x < at.e.x);
});

test("leaves layout puts every leaf on the deepest row and every constituent on its depth's row", () => {
  const { nodes, pos } = layoutTree(normalize({ tree: "S(NP(the,cat),VP(sat,PP(on,NP(the,mat))))", layout: "leaves" }));
  const leaves = nodes.filter((p) => !p.kids.length);
  assert.equal(new Set(leaves.map((p) => p.y)).size, 1);
  assert.equal(leaves[0].y, Math.max(...pos));
  for (const p of nodes.filter((q) => q.kids.length)) assert.equal(p.y, pos[p.depth], p.n.label);
  assert.deepEqual(leaves.map((p) => p.n.label), ["the", "cat", "sat", "on", "the", "mat"]);
  assert.deepEqual([...leaves].sort((a, b) => a.x - b.x).map((p) => p.n.label), ["the", "cat", "sat", "on", "the", "mat"]);
});

/* ------------------------------------------------------------------ render */

test("a plain tree draws one outline per node and one edge per child", () => {
  const svg = draw({ tree: "Tr1(Tr2(W0,W1),Tr3(W2,W3))", shape: "ellipse", title: "Procs", note: "n" });
  assert.equal(count(svg, /<ellipse /g), 7);
  assert.equal(count(svg, /<path d="M[^"]*" fill="none" stroke="#3a3a37"/g), 6);
  assert.equal(count(svg, /<marker /g), 0);
  assert.match(svg, /<figcaption class="fig-title">Procs<\/figcaption>/);
  assert.match(svg, /aria-label="Procs"/);
});

test("arrows add one marker per neutral edge, pointing the requested way", () => {
  const toChild = draw({ tree: "A(B,C)", arrows: "toChild" });
  assert.equal(count(toChild, /<marker /g), 1);
  assert.equal(count(toChild, /marker-end=/g), 2);
  // toParent reverses the path: it now starts at the child, below the parent.
  const firstY = (svg) => Number(/<path d="M[\d.-]+,([\d.-]+)[^"]*" fill="none"/.exec(svg)?.[1]);
  assert.ok(firstY(draw({ tree: "A(B,C)", arrows: "toParent" })) > firstY(toChild));
});

test("spine draws non-first edges in the down colour", () => {
  const svg = draw({ tree: "a(b(c,d),e(f,g))", layout: "spine" });
  assert.equal(count(svg, /stroke="#3987e5"/g), 3);
  assert.equal(count(svg, /stroke="#3a3a37"/g), 3);
});

test("values draw a red and a blue curve per edge, a badge per step, and the root's output", () => {
  const svg = draw(scan());
  assert.equal(count(svg, /<path d="M[^"]*Q[^"]*" fill="none" stroke="#e66767"/g), 6);
  assert.equal(count(svg, /<path d="M[^"]*Q[^"]*" fill="none" stroke="#3987e5"/g), 6);
  assert.equal(count(svg, /<circle [^>]*r="8.5"/g), 12);
  assert.match(svg, />scan results</);
  const out = draw({ tree: { label: "M", up: { v: 14, step: 5 }, children: [{ label: "W0", up: 14 }] } });
  assert.equal(count(out, /<circle [^>]*r="8.5"/g), 1);
  assert.match(out, />14<\/text>/);
});

test("until hides later steps without moving anything", () => {
  const all = draw(scan());
  const step1 = draw(scan({ until: 1 }));
  const step2 = draw(scan({ until: 2 }));
  assert.equal(count(step1, /<circle [^>]*r="8.5"/g), 4);
  assert.equal(count(step2, /<circle [^>]*r="8.5"/g), 6);
  // Same canvas and same node outlines in every snapshot.
  const viewBox = (svg) => /viewBox="([^"]+)"/.exec(svg)?.[1];
  const outlines = (svg) => svg.match(/<(rect|ellipse) [^>]*>/g);
  assert.equal(viewBox(step1), viewBox(all));
  assert.deepEqual(outlines(step1), outlines(all));
  // An edge whose values are all hidden still shows the structure as a plain line.
  assert.equal(count(step1, /stroke="#3a3a37"/g), 2);
});

/** Rough box of every value label and badge in a rendered SVG. */
function marks(svg) {
  const boxes = [];
  for (const m of svg.matchAll(/<text x="([\d.-]+)" y="([\d.-]+)" class="edge-label" style="fill:(#e66767|#3987e5)(?:;text-anchor:(start|end))?">([^<]*)<\/text>/g)) {
    const [x, y, w] = [Number(m[1]), Number(m[2]), m[5].length * 11.5 * 0.56];
    const x0 = m[4] === "start" ? x : m[4] === "end" ? x - w : x - w / 2;
    boxes.push({ what: `label ${m[5]}`, x0, x1: x0 + w, y0: y - 10, y1: y + 3 });
  }
  for (const m of svg.matchAll(/<circle cx="([\d.-]+)" cy="([\d.-]+)" r="8.5"/g)) {
    const [x, y] = [Number(m[1]), Number(m[2])];
    boxes.push({ what: `badge at ${x},${y}`, x0: x - 8.5, x1: x + 8.5, y0: y - 8.5, y1: y + 8.5 });
  }
  return boxes;
}

test("value labels and badges never collide in the scan or the broadcast", () => {
  const wtree = {
    shape: "circle",
    tree: { label: "M", up: { v: 14, step: 5 }, children: [0, 1].map((h) => ({
      down: { v: "go", step: 1 }, up: { v: 7, step: 4 },
      children: [0, 1].map((i) => ({ label: `W${2 * h + i}`, down: { v: "go", step: 2 }, up: { v: 3 + i, step: 3 } })),
    })) },
  };
  for (const body of [scan(), wtree]) {
    const boxes = marks(draw(body));
    assert.ok(boxes.length >= 12);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        const hit = a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
        assert.ok(!hit, `${a.what} collides with ${b.what}`);
      }
    }
  }
});

test("text nodes draw no outline, edges stop at the words, and a tone colours the label", () => {
  const svg = draw({ tree: "S(NP(cat),VP(sat))", shape: "text", layout: "leaves" });
  assert.equal(count(svg, /<rect |<ellipse |<circle /g), 0);
  assert.equal(count(svg, /class="node-label"/g), 5);
  const { nodes } = layoutTree(normalize({ tree: "S(NP(cat),VP(sat))", shape: "text" }));
  const [s, np] = nodes;
  // The edge from S to NP starts under S's words and ends above NP's: within a few pixels of each.
  const m = /<path d="M([\d.-]+),([\d.-]+) L([\d.-]+),([\d.-]+)"/.exec(draw({ tree: "S(NP(cat),VP(sat))", shape: "text" }));
  assert.ok(m);
  const [y1, y2] = [Number(m[2]), Number(m[4])];
  assert.ok(y1 > s.y + 6 && y1 <= s.y + 10, `starts at ${y1}`);
  assert.ok(y2 < np.y - 6 && y2 >= np.y - 10, `ends at ${y2}`);
  const toned = draw({ tree: { label: "NP", shape: "text", tone: "c1", children: [{ label: "cat", shape: "text" }] } });
  assert.match(toned, /style="fill:#3987e5">NP</);
});

test("cells draw one square per value inside a capsule", () => {
  const svg = draw({ tree: { label: "P0", shape: "cells", cells: [2, -1, 7] } });
  assert.equal(count(svg, /<rect [^>]*height="20" fill="none"/g), 3);
  assert.match(svg, />P0<\/text>/);
});

test("the example document renders with no errors", () => {
  const file = fileURLToPath(new URL("../examples/diagrams/tree.md", import.meta.url));
  const { html, errors } = renderDoc(readFileSync(file, "utf8"), { file });
  assert.deepEqual(errors, []);
  assert.equal(count(html ?? "", /<figure class="fig">/g), 13);
});
