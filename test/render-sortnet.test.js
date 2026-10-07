import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parseMarkdown } from "../src/render/index.js";
import { validateDoc, formatError } from "../src/render/schema/index.js";
import { validate, normalize, render, run } from "../src/render/diagrams/sortnet.js";
import { INK } from "../src/render/diagrams/svg.js";

/** Diagnostics for one fence body, message text only. */
const errs = (data) => {
  const out = [];
  validate(out, { data, line: 1 }, "t.md");
  return out.map((e) => e.message);
};

const ODD = [[0, 1], [2, 3], [4, 5]], EVEN = [[1, 2], [3, 4]];
const TRANSPOSITION = [ODD, EVEN, ODD, EVEN, ODD, EVEN];
const BITONIC = [
  [[0, 1], [3, 2], [4, 5], [7, 6]],
  [[0, 2], [1, 3], [6, 4], [7, 5]],
  [[0, 1], [2, 3], [5, 4], [7, 6]],
  [[0, 4], [1, 5], [2, 6], [3, 7]],
  [[0, 2], [1, 3], [4, 6], [5, 7]],
  [[0, 1], [2, 3], [4, 5], [6, 7]],
];

test("the example document validates clean", () => {
  const file = fileURLToPath(new URL("../examples/diagrams/sortnet.md", import.meta.url));
  const { doc, errors } = parseMarkdown(readFileSync(file, "utf8"), { file });
  assert.deepEqual(errors, []);
  assert.deepEqual(validateDoc(doc, { file }).map(formatError), []);
});

test("inputs must be 2 to 32 numbers", () => {
  assert.deepEqual(errs({ inputs: [1], layers: [[[0, 1]]] }), ["/inputs expected 2 to 32 input numbers, got 1"]);
  assert.deepEqual(errs({ inputs: [1, "2"], layers: [[[0, 1]]] }), ['/inputs/1 expected number, got "2"']);
  assert.deepEqual(errs({ layers: [[[0, 1]]] }), ["/inputs expected 2 to 32 input numbers, got nothing"]);
});

test("comparators are pairs of distinct in-range wires, each wire once per layer", () => {
  const inputs = [3, 1, 2];
  assert.deepEqual(errs({ inputs, layers: [] }), ["/layers expected at least one layer of comparators, got an empty array"]);
  assert.deepEqual(errs({ inputs, layers: [[[0, 1, 2]]] }), ["/layers/0/0 expected a comparator [a, b] of two wire indices, got an array of 3"]);
  assert.deepEqual(errs({ inputs, layers: [[[0, 3]]] }), ["/layers/0/0/1 expected a wire index from 0 to 2, got 3"]);
  assert.deepEqual(errs({ inputs, layers: [[[0.5, 1]]] }), ["/layers/0/0/0 expected an integer wire index, got 0.5"]);
  assert.deepEqual(errs({ inputs, layers: [[[1, 1]]] }), ["/layers/0/0 expected two different wires, got [1, 1]"]);
  assert.deepEqual(errs({ inputs, layers: [[[0, 1]], [[0, 1], [1, 2]]] }),
    ["/layers/1/1 wire 1 is already compared by /layers/1/0; a wire appears at most once per layer"]);
  assert.deepEqual(errs({ inputs, layers: [[[0, 1]]], value: true }), ['/value unknown key "value"; keys: title note compact inputs layers values']);
});

test("normalize prints per-layer values by default", () => {
  const d = normalize({ inputs: [2, 1], layers: [[[0, 1]]] });
  assert.equal(d.values, true);
  assert.equal(d.compact, false);
  assert.equal(normalize({ inputs: [2, 1], layers: [[[0, 1]]], values: false }).values, false);
});

test("run() sorts with transposition and bitonic networks and honours descending comparators", () => {
  assert.deepEqual(run([5, 2, 6, 1, 4, 3], TRANSPOSITION).after.at(-1), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(run([7, 3, 6, 8, 1, 5, 2, 4], BITONIC).after.at(-1), [1, 2, 3, 4, 5, 6, 7, 8]);
  // [1, 0] leaves the minimum on wire 1, so it sorts descending.
  const r = run([1, 2], [[[1, 0]]]);
  assert.deepEqual(r.after[0], [2, 1]);
  assert.deepEqual(r.swapped, [[true]]);
  // Three rounds are not enough for four wires.
  assert.deepEqual(run([4, 3, 2.5, 1], [[[0, 1], [2, 3]], [[1, 2]], [[0, 1], [2, 3]]]).after.at(-1), [1, 3, 2.5, 4]);
});

test("render paints swapped comparators red and outputs green", () => {
  const data = normalize({ inputs: [5, 2, 6, 1, 4, 3], layers: TRANSPOSITION });
  const html = render({ data });
  const comparators = [...html.matchAll(/<line [^>]*stroke="([^"]+)" stroke-width="1.8"\/>/g)].map((m) => m[1]);
  assert.equal(comparators.length, 15);
  const swaps = run(data.inputs, data.layers).swapped.flat().filter(Boolean).length;
  assert.equal(comparators.filter((c) => c === INK.up).length, swaps);
  const outputs = [...html.matchAll(/style="fill:#0ca30c[^"]*">(\d+)</g)].map((m) => Number(m[1]));
  assert.deepEqual(outputs, [1, 2, 3, 4, 5, 6]);
  assert.equal((html.match(/>step \d+</g) ?? []).length, 6);
});

test("overlapping comparators in one layer get their own x; values: false drops the per-layer column", () => {
  const xs = (html) => new Set([...html.matchAll(/<line x1="([^"]+)"[^>]*stroke-width="1.8"/g)].map((m) => m[1]));
  const overlap = render({ data: normalize({ inputs: [4, 3, 2, 1], layers: [[[0, 2], [1, 3]]] }) });
  assert.equal(xs(overlap).size, 2);
  const apart = render({ data: normalize({ inputs: [4, 3, 2, 1], layers: [[[0, 1], [2, 3]]] }) });
  assert.equal(xs(apart).size, 1);
  const quiet = render({ data: normalize({ inputs: [4, 3, 2, 1], layers: [[[0, 1], [2, 3]]], values: false }) });
  // Inputs and outputs only: 4 + 4 numbers.
  assert.equal((quiet.match(/font-family:var\(--mono\)/g) ?? []).length, 8);
});

test("a descending comparator carries an arrowhead instead of its max dot", () => {
  const html = render({ data: normalize({ inputs: [1, 2, 3], layers: [[[2, 0]]] }) });
  assert.equal((html.match(/<path d="M/g) ?? []).length, 1);
  assert.equal((html.match(/<circle /g) ?? []).length, 1);
});
