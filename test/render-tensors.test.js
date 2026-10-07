import test from "node:test";
import assert from "node:assert/strict";

import { validate, normalize, render, shapeOf, side, depth } from "../src/render/diagrams/tensors.js";

/** Diagnostics for one fence body, message text only. */
const errs = (data) => {
  const out = [];
  validate(out, { data, line: 1 }, "t.md");
  return out.map((e) => e.message);
};
const draw = (data) => render({ data: normalize(data) });
const count = (html, re) => (html.match(re) ?? []).length;

test("stages are 1 to 12 objects with 1 to 3 integer dims", () => {
  assert.deepEqual(errs({}), ["/stages expected at least one stage { dims }, got nothing"]);
  assert.deepEqual(errs({ stages: Array(13).fill({ dims: [1] }) }), ["/stages expected at most 12 stages, got 13"]);
  assert.deepEqual(errs({ stages: [null, { dims: [] }, { dims: [1, 2, 3, 4] }, { dims: [0, 1.5, 2e6] }] }), [
    "/stages/0 expected a stage { dims, op, label }, got null",
    "/stages/1/dims expected 1 to 3 dims, e.g. [56, 56, 64], got an empty array",
    "/stages/2/dims expected at most 3 dims, got 4",
    "/stages/3/dims/0 expected an integer from 1 to 1000000, got 0",
    "/stages/3/dims/1 expected an integer from 1 to 1000000, got 1.5",
    "/stages/3/dims/2 expected an integer from 1 to 1000000, got 2000000",
  ]);
});

test("op labels the arrow into a stage, so the first stage has none", () => {
  assert.deepEqual(errs({ stages: [{ dims: [4], op: "in" }] }),
    ["/stages/0/op the first stage has no arrow into it; put the input's name in label"]);
  assert.deepEqual(errs({ stages: [{ dims: [4] }, { dims: [2], op: "x".repeat(25), label: 3, size: 1 }] }), [
    '/stages/1/size unknown key "size"; keys: dims op label',
    "/stages/1/op expected at most 24 characters, got 25",
    "/stages/1/label expected a string, got 3",
  ]);
});

test("normalize defaults op and label to empty", () => {
  assert.deepEqual(normalize({ stages: [{ dims: [3] }] }), {
    title: "", note: "", compact: false, stages: [{ dims: [3], op: "", label: "" }],
  });
});

test("drawn sizes grow with log2 of each dim", () => {
  assert.ok(side(224) - side(112) === side(14) - side(7));
  assert.ok(depth(512) > depth(64) && depth(64) > depth(3));
  const box = shapeOf([7, 14, 512]);
  assert.equal(box.w, side(14));
  assert.equal(box.h, side(7));
  assert.ok(box.dx > 0 && box.dy < 0);
  assert.deepEqual(shapeOf([28, 28]).dx, 0);
  assert.equal(shapeOf([1000]).w, 9);
});

test("3-D stages draw three faces, 2-D one, 1-D a bar; arrows join each pair", () => {
  const html = draw({ stages: [{ dims: [224, 224, 3] }, { op: "patchify", dims: [196, 768] }, { op: "fc", dims: [1000] }] });
  assert.equal(count(html, /<rect /g), 3);
  assert.equal(count(html, /<path d="M[^"]*Z"/g), 2);
  assert.equal(count(html, /marker-end=/g), 2);
  assert.match(html, />224x224x3</);
  assert.match(html, />196x768</);
  assert.match(html, />patchify</);
  assert.doesNotMatch(html, /NaN|Infinity/);
});

test("long ops wrap and widen the gap between stages instead of overlapping", () => {
  const xs = (html) => [...html.matchAll(/<rect x="([^"]+)"/g)].map((m) => Number(m[1]));
  const short = xs(draw({ stages: [{ dims: [8, 8, 8] }, { op: "fc", dims: [8, 8, 8] }] }));
  const long = xs(draw({ stages: [{ dims: [8, 8, 8] }, { op: "depthwise-separable", dims: [8, 8, 8] }] }));
  assert.ok(long[1] - long[0] > short[1] - short[0]);
  const wrapped = draw({ stages: [{ dims: [4] }, { op: "conv 3x3 /2", dims: [4] }] });
  assert.match(wrapped, />conv</);
  assert.match(wrapped, />3x3 \/2</);
});
