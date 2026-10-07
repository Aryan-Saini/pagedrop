import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DIAGRAM_FENCES } from "../src/render/diagrams/names.js";

import { render } from "../src/render/index.js";
import { svgOpen } from "../src/render/diagrams/svg.js";

const doc = (...fences) =>
  `---\ntitle: Rows\n---\n\nLead.\n\n${fences.map((f) => "```tree\n" + JSON.stringify(f) + "\n```").join("\n\n")}\n`;

test("consecutive compact diagrams share one row; a lone one does not", () => {
  const two = render(doc({ tree: "A(B,C)", compact: true }, { tree: "D(E,F)", compact: true }, { tree: "G(H)" }));
  assert.equal(two.errors.length, 0);
  assert.equal(two.html.match(/class="fig-row"/g)?.length, 1);
  const row = two.html.slice(two.html.indexOf('class="fig-row"'));
  assert.equal(row.slice(0, row.indexOf("</div>\n")).match(/<figure/g)?.length, 2);

  const one = render(doc({ tree: "A(B,C)", compact: true }, { tree: "G(H)" }));
  assert.equal(one.html.includes('class="fig-row"'), false);
});

test("svgOpen drops the 520px floor for diagrams narrower than it", () => {
  assert.match(svgOpen({ x: 0, y: 0, w: 200, h: 100 }, { label: "s" }), /class="chart diagram compact"/);
  assert.match(svgOpen({ x: 0, y: 0, w: 600, h: 100 }, { label: "w" }), /class="chart diagram"/);
  assert.match(svgOpen({ x: 0, y: 0, w: 600, h: 100 }, { label: "c", compact: true }), /compact/);
});

/** Render one fence body; `info` is the fence's info string. */
const one = (info, body) =>
  render(`---\ntitle: X\n---\n\nLead.\n\n\`\`\`${info}\n${JSON.stringify(body)}\n\`\`\`\n`);

test("malformed bodies report errors instead of throwing, for every diagram fence", () => {
  const bad = [{}, [], { nodes: "x", edges: "x", lanes: "x", rows: "x", items: "x", entities: "x", links: "x", cells: "x" },
    { kind: "list", cells: [null] }, { lanes: [{ name: "a", segs: "x" }], msgs: [1] }, { entities: [{ name: "t", fields: "x" }] }];
  for (const fence of DIAGRAM_FENCES) {
    for (const body of bad) {
      const r = one(fence, body);
      assert.ok(r.errors.length > 0, `${fence} ${JSON.stringify(body)} should be rejected`);
      assert.equal(r.html, null);
    }
  }
});

test("inputs that used to crash, hang or emit NaN are rejected with a pointer", () => {
  const chain = Array.from({ length: 600 }, (_, i) => ({ id: String(i) }));
  const cases = [
    ["pipeline", { cycles: 1e308, rows: [{ label: "a", cells: ["IF"] }] }, "/cycles"],
    ["pipeline", { rows: [{ label: "a", start: 1e6, cells: ["IF"] }] }, "/rows"],
    ["sankey", { nodes: [{ id: "a", label: "a" }, { id: "b", label: "b" }, null], links: [{ from: "a", to: "b", value: 1 }] }, "/nodes/2"],
    ["sankey", { nodes: [{ id: "a", label: "a" }, { id: "b", label: "b" }], links: [{ from: "a", to: "b", value: 1e-310 }] }, "/links/0/value"],
    ["sankey", { nodes: [{ id: "a", label: "a" }, { id: "b", label: "b" }], links: [{ from: "a", to: "b", value: 1e308 }] }, "/links/0/value"],
    ["graph", { nodes: [{ id: "a" }, { id: "\u00000:0" }] }, "/nodes/1/id"],
    ["graph", { nodes: chain, edges: chain.slice(1).map((n, i) => ({ from: String(i), to: n.id })) }, "/nodes"],
    ["chart lines", { labels: ["a", "b"], series: [{ name: "s", values: [1e308, 1e308] }], yScale: "log10" }, "/series/0/values/0"],
    ["chart lines", { labels: ["a", "b"], series: [{ name: "s", values: [1, 2] }], yScale: "log10", zeroFloor: true }, "/zeroFloor"],
    ["lanes", { lanes: [{ name: "a", segs: [{ from: -1e308, to: 1e308 }] }] }, "/lanes/0/segs/0"],
    ["lanes", { lanes: [{ name: "a", segs: [{ from: 0, to: 5e-324 }] }] }, "/lanes"],
    ["lanes", { lanes: [{ name: "x".repeat(130), segs: [{ from: 0, to: 1 }] }] }, "/lanes/0/name"],
    ["er", { entities: [{ name: "a.b", fields: [["id", "int"]] }] }, "/entities/0/name"],
  ];
  for (const [info, body, pointer] of cases) {
    const r = one(info, body);
    assert.ok(r.errors.some((e) => e.message.startsWith(pointer)), `${info}: expected an error at ${pointer}, got ${JSON.stringify(r.errors.map((e) => e.message))}`);
  }
});

test("a wide lanes axis thins its ticks instead of drawing one per unit", () => {
  const r = one("lanes", { axis: "t", lanes: [{ name: "a", segs: [{ from: 0, to: 1e9 }] }] });
  assert.equal(r.errors.length, 0);
  assert.ok((r.html.match(/y2="[^"]+" stroke="#55554f"\/>/g)?.length ?? 0) < 40);
});

test("structure accepts an explicit null cycle and an empty pointer list", () => {
  assert.equal(one("structure", { kind: "list", cells: [{ v: 1 }], cycle: null }).errors.length, 0);
  assert.equal(one("structure", { kind: "array", cells: [1, 2], pointers: [] }).errors.length, 0);
});

test("every example diagram renders with finite geometry", () => {
  const dir = fileURLToPath(new URL("../examples/diagrams/", import.meta.url));
  for (const name of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
    const r = render(readFileSync(dir + name, "utf8"), { file: dir + name });
    assert.equal(r.errors.length, 0, `${name}: ${r.errors.map((e) => e.message).join("; ")}`);
    assert.doesNotMatch(r.html, /NaN|Infinity/, name);
  }
});

test("nested collections, extreme linear x and oversized figures are rejected at their fence", () => {
  const cases = [
    ["tree", { tree: { shape: "cells", cells: Array(33).fill(0) } }, "/tree/cells"],
    ["er", { entities: [{ name: "t", fields: Array.from({ length: 41 }, (_, j) => ["f" + j, "int"]) }] }, "/entities/0/fields"],
    ["lanes", { lanes: [{ name: "a", segs: Array.from({ length: 201 }, (_, i) => ({ from: i, to: i + 1 })) }] }, "/lanes/0/segs"],
    ["structure", { kind: "array", cells: [1, 2], start: 1e300 }, "/start"],
    ["pipeline", { rows: Array.from({ length: 30 }, (_, i) => ({ label: "r" + i, cells: Array(100).fill("IF") })) }, "/rows"],
    ["chart lines", { x: [1e-310, 2e-310], series: [{ name: "s", values: [1, 2] }] }, "/x"],
    ["chart lines", { x: [-1e308, 1e308], series: [{ name: "s", values: [1, 2] }] }, "/x/0"],
  ];
  for (const [info, body, pointer] of cases) {
    const r = one(info, body);
    assert.ok(r.errors.some((e) => e.message.startsWith(pointer)), `${info}: expected an error at ${pointer}, got ${JSON.stringify(r.errors.map((e) => e.message))}`);
  }
  // Over the cap, edges are not checked against ids that were never collected.
  const nodes = Array.from({ length: 151 }, (_, i) => ({ id: String(i) }));
  assert.equal(one("graph", { nodes, edges: [{ from: "0", to: "1" }] }).errors.length, 1);

  // A diagram over the per-figure budget is reported at its fence line, not as a page failure.
  const ns = Array.from({ length: 150 }, (_, i) => ({ id: "n" + i }));
  const edges = [...ns.slice(1).map((nd, i) => ({ from: "n" + i, to: nd.id })),
    ...Array.from({ length: 150 }, (_, k) => ({ from: "n" + (k % 75), to: "n" + ((k % 75) + 70 + (k % 5)), label: "edge " + k, step: (k % 9) + 1 }))];
  const big = one("graph", { dir: "right", nodes: ns, edges });
  assert.equal(big.errors.length, 1);
  assert.equal(big.errors[0].line, 7);
  assert.match(big.errors[0].message, /^renders to \d+ KB/);
});
