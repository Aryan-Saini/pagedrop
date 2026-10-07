import test from "node:test";
import assert from "node:assert/strict";

import { validate, normalize, render, slots, seedOf, FULL, KEEP } from "../src/render/diagrams/nn.js";

/** Diagnostics for one fence body, message text only. */
const errs = (data) => {
  const out = [];
  validate(out, { data, line: 1 }, "t.md");
  return out.map((e) => e.message);
};
const draw = (data) => render({ data: normalize(data) });
const count = (html, re) => (html.match(re) ?? []).length;
const NEURON = /<circle [^>]*r="(9|11)"/g;

test("layers is 2 to 12 neuron counts from 1 to 1e6", () => {
  assert.deepEqual(errs({}), ["/layers expected 2 to 12 neuron counts, got nothing"]);
  assert.deepEqual(errs({ layers: [3] }), ["/layers expected 2 to 12 neuron counts, got 1"]);
  assert.deepEqual(errs({ layers: Array(13).fill(2) }), ["/layers expected at most 12 layers, got 13"]);
  assert.deepEqual(errs({ layers: [3, 0, 2.5, 2e6, "4"] }), [
    "/layers/1 expected a neuron count from 1 to 1000000, got 0",
    "/layers/2 expected a neuron count from 1 to 1000000, got 2.5",
    "/layers/3 expected a neuron count from 1 to 1000000, got 2000000",
    '/layers/4 expected a neuron count from 1 to 1000000, got "4"',
  ]);
  assert.deepEqual(errs({ layers: [2, 2], weight: true }),
    ['/weight unknown key "weight"; keys: title note compact layers inputs outputs names weights dropout tones']);
});

test("inputs, outputs, names and tones line up with the layers", () => {
  assert.deepEqual(errs({ layers: [3, 2], inputs: ["a", "b"] }), ["/inputs expected 3 labels to match /layers/0, got 2"]);
  assert.deepEqual(errs({ layers: [3, 2], outputs: ["a", 1] }), ["/outputs/1 expected a string, got 1"]);
  assert.deepEqual(errs({ layers: [784, 10], inputs: ["p0"] }),
    ["/inputs labels only fit a layer drawn in full (at most 12 neurons); /layers/0 has 784"]);
  assert.deepEqual(errs({ layers: [3, 2], names: ["in"] }), ["/names expected 2 entries to match /layers, got 1"]);
  assert.deepEqual(errs({ layers: [3, 2], names: ["in", "x".repeat(41)] }), ["/names/1 expected at most 40 characters, got 41"]);
  assert.deepEqual(errs({ layers: [3, 2], tones: ["", "blue"] }),
    ["/tones/1 expected one of good warn bad flat span c1 c2 c3 c4 c5 c6 c7 c8, got \"blue\""]);
  assert.deepEqual(errs({ layers: [3, 2], names: ["", ""], tones: ["c1", ""] }), []);
});

test("dropout pairs are in range and point at drawn neurons", () => {
  assert.deepEqual(errs({ layers: [3, 2], dropout: [[0, 1, 2], [0, "1"]] }), [
    "/dropout/0 expected a [layer, neuron] pair of integers, got an array of 3",
    '/dropout/1 expected a [layer, neuron] pair of integers, got an array of 2',
  ]);
  assert.deepEqual(errs({ layers: [3, 2], dropout: [[2, 0], [1, 2]] }), [
    "/dropout/0/0 expected a layer index from 0 to 1, got 2",
    "/dropout/1/1 expected a neuron index from 0 to 1 in layer 1, got 2",
  ]);
  assert.deepEqual(errs({ layers: [100, 2], dropout: [[0, 50], [0, 99]] }),
    ["/dropout/0/1 neuron 50 of layer 0 is hidden by the ellipsis; only the first 5 and last 5 are drawn"]);
  assert.deepEqual(errs({ layers: [3, 2], dropout: Array(65).fill([0, 0]) }), ["/dropout expected at most 64 dropped neurons, got 65"]);
});

test("normalize fills every optional key", () => {
  assert.deepEqual(normalize({ layers: [2, 1] }), {
    title: "", note: "", compact: false, layers: [2, 1], inputs: [], outputs: [], names: [], weights: false, dropout: [], tones: [],
  });
});

test("a full network draws every neuron and every edge", () => {
  const html = draw({ layers: [3, 4, 4, 2], inputs: ["x1", "x2", "x3"], outputs: ["y1", "y2"] });
  assert.equal(count(html, NEURON), 13);
  assert.equal(count(html, /<line /g), 3 * 4 + 4 * 4 + 4 * 2);
  assert.equal(count(html, />x\d</g), 3);
  // No layer collapsed, so no counts on top.
  assert.equal(count(html, />4</g), 0);
});

test("a wide layer collapses to its ends around an ellipsis and prints its true size", () => {
  assert.deepEqual(slots(FULL), Array.from({ length: FULL }, (_, i) => i));
  assert.deepEqual(slots(784), [0, 1, 2, 3, 4, -1, 779, 780, 781, 782, 783]);
  const html = draw({ layers: [784, 128, 64, 10] });
  const drawn = 2 * KEEP;
  assert.equal(count(html, NEURON), drawn * 3 + 10);
  assert.equal(count(html, /r="1.8"/g), 9);
  assert.equal(count(html, /<line /g), drawn * drawn + drawn * drawn + drawn * 10);
  for (const c of ["784", "128", "64", "10"]) assert.match(html, new RegExp(`>${c}<`));
});

test("dropout removes a neuron's edges; weights are seeded by the layer sizes", () => {
  const plain = draw({ layers: [3, 4, 2] });
  const dropped = draw({ layers: [3, 4, 2], dropout: [[1, 0]] });
  assert.equal(count(plain, /<line /g) - count(dropped, /<line /g), 3 + 2);
  assert.equal(count(dropped, /stroke-dasharray/g), 1);

  const w1 = draw({ layers: [3, 4, 2], weights: true });
  assert.equal(w1, draw({ layers: [3, 4, 2], weights: true }));
  assert.notEqual(seedOf([3, 4, 2]), seedOf([3, 4, 3]));
  const opacities = new Set([...w1.matchAll(/stroke-opacity="([^"]+)"/g)].map((m) => m[1]));
  assert.ok(opacities.size > 5, "weights vary edge opacity");
  // Dropping a neuron keeps every surviving edge's weight.
  const w2 = draw({ layers: [3, 4, 2], weights: true, dropout: [[1, 0]] });
  const edges = (h) => new Set([...h.matchAll(/<line [^>]+>/g)].map((m) => m[0]));
  const kept = edges(w2);
  assert.ok([...kept].every((e) => edges(w1).has(e)));
});

test("tones colour their layer", () => {
  const html = draw({ layers: [2, 2], tones: ["span", ""] });
  assert.equal(count(html, /stroke="#c98500" stroke-width="1.4"/g), 2);
});
