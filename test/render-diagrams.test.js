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

test("round 3: chart x is capped, tiny x spans keep distinct ticks, paths are capped", () => {
  const long = one("chart lines", { x: Array.from({ length: 1001 }, (_, i) => i + 1), series: [{ name: "s", values: Array(1001).fill(1) }] });
  assert.ok(long.errors.some((e) => e.message.startsWith("/x expected at most 1000")));
  assert.ok(one("topology", { kind: "complete", size: 16, path: Array.from({ length: 129 }, (_, i) => (i % 2 ? 15 : 14)) })
    .errors.some((e) => e.message.startsWith("/path")));

  const tiny = one("chart lines", { x: [-2e-9, -1e-9], series: [{ name: "s", values: [1, 2] }] });
  assert.equal(tiny.errors.length, 0);
  const xTicks = [...tiny.html.matchAll(/class="tick tick-x"[^>]*>([^<]*)</g)].map((m) => m[1]);
  assert.ok(xTicks.length >= 2 && new Set(xTicks).size === xTicks.length, `distinct x ticks, got ${xTicks}`);
});

test("diagram markup is only cached inside one render() call", async () => {
  const { renderBlock } = await import("../src/render/index.js");
  const r = one("layers", { items: [{ label: "ORIGINAL" }] });
  const block = r.doc.blocks.find((b) => b.type === "layers");
  block.data.items[0].label = "CHANGED";
  assert.match(renderBlock(block), /CHANGED/);
});

test("a heatmap with a very long row label keeps positive cell widths", () => {
  const r = one("chart heatmap", { rows: ["x".repeat(200), "b"], cols: ["c0", "c1"], values: [[1, 2], [3, 4]] });
  assert.equal(r.errors.length, 0);
  assert.doesNotMatch(r.html, /width="-/);
});

test("charts share the per-figure budget, and heatmap cells fit their printed values", () => {
  const labels = Array.from({ length: 1000 }, (_, i) => "l" + i);
  const big = one("chart lines", { labels, series: Array.from({ length: 5 }, (_, k) => ({ name: "s" + k, values: labels.map((_, i) => i + k) })) });
  assert.equal(big.errors.length, 1);
  assert.equal(big.errors[0].line, 7);
  assert.match(big.errors[0].message, /^renders to \d+ KB; one figure may take 320 KB/);

  const dec = one("chart heatmap", { decimals: 6, rows: ["a"], cols: ["a", "b", "c"], values: [[0.123456, 0.654321, 0.999999]] });
  const cells = [...dec.html.matchAll(/<rect x="([\d.]+)" y="[\d.]+" width="([\d.]+)" height="34"/g)].map((m) => [Number(m[1]), Number(m[2])]);
  assert.equal(cells.length, 3);
  for (const [, w] of cells) assert.ok(w >= 8 * 11 * 0.56, `cell ${w} wide is narrower than "0.123456"`);
  for (let i = 1; i < cells.length; i++) assert.ok(cells[i][0] >= cells[i - 1][0] + cells[i - 1][1], "cells overlap");
});

test("flat scatter rejects negative points; heatmap cells make room for their headers", () => {
  assert.ok(one("chart scatter", { points: [{ x: -1, y: 1 }, { x: 1, y: 1 }] }).errors.some((e) => e.message.startsWith("/points/0/x expected 0 or more")));
  const cols = Array.from({ length: 40 }, (_, i) => "c" + i);
  const hm = one("chart heatmap", { rows: ["a"], cols, values: [cols.map((_, i) => i % 7)] });
  const xs = [...hm.html.matchAll(/<text x="([\d.]+)"[^>]*class="tick tick-x">c/g)].map((m) => Number(m[1]));
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i] - xs[i - 1] >= 3 * 12 * 0.56, `headers ${i - 1} and ${i} overprint`);
});
