import test from "node:test";
import assert from "node:assert/strict";

import { validate, normalize, render, formatScore } from "../src/render/diagrams/trellis.js";
import { INK } from "../src/render/diagrams/svg.js";

/** Diagnostics for one fence body, message text only. */
const errs = (data) => {
  const out = [];
  validate(out, { data, line: 1 }, "t.md");
  return out.map((e) => e.message);
};
const draw = (data) => render({ data: normalize(data) });
const count = (html, re) => (html.match(re) ?? []).length;
const ICE = { states: ["Hot", "Cold"], obs: ["3", "1", "3"] };

test("states are 2 to 8 labels and obs 1 to 16", () => {
  assert.deepEqual(errs({}), [
    "/states expected 2 to 8 states, got nothing",
    "/obs expected 1 to 16 observations, got nothing",
  ]);
  assert.deepEqual(errs({ states: ["a"], obs: [] }), [
    "/states expected 2 to 8 states, got 1",
    "/obs expected 1 to 16 observations, got 0",
  ]);
  assert.deepEqual(errs({ states: Array(9).fill("s"), obs: Array(17).fill("o") }), [
    "/states expected at most 8 states, got 9",
    "/obs expected at most 16 observations, got 17",
  ]);
  assert.deepEqual(errs({ states: ["a", ""], obs: [null] }), [
    '/states/1 expected a state, got ""',
    "/obs/0 expected an observation, got null",
  ]);
  assert.deepEqual(errs({ ...ICE, start: "x".repeat(17), transitions: "some" }), [
    "/transitions expected one of all path, got \"some\"",
    "/start expected a start label of at most 16 characters, got 17",
  ]);
});

test("scores are a states x obs matrix and path one in-range state per column", () => {
  assert.deepEqual(errs({ ...ICE, scores: [[1, 2, 3]] }), ["/scores expected 2 rows to match /states, got 1"]);
  assert.deepEqual(errs({ ...ICE, scores: [[1, 2], [1, 2, "3"]] }), [
    "/scores/0 expected 3 numbers to match /obs, got 2",
    '/scores/1/2 expected number, got "3"',
  ]);
  assert.deepEqual(errs({ ...ICE, scores: Array(9).fill([1, 2, 3]) }), ["/scores expected at most 8 rows, got 9"]);
  assert.deepEqual(errs({ ...ICE, path: [0, 2, -1, 0.5] }), [
    "/path expected 3 state indices to match /obs, got 4",
    "/path/1 expected a state index from 0 to 1, got 2",
    "/path/2 expected a state index from 0 to 1, got -1",
    "/path/3 expected a state index from 0 to 1, got 0.5",
  ]);
  assert.deepEqual(errs({ ...ICE, transitions: "path" }), ['/transitions "path" draws only the best path, so it needs a path']);
});

test("normalize defaults to every transition and no scores, path or start", () => {
  assert.deepEqual(normalize(ICE), {
    title: "", note: "", compact: false, ...ICE, start: "", scores: null, path: null, transitions: "all",
  });
});

test("scores print in at most 3 significant digits", () => {
  assert.equal(formatScore(0.0384), "0.0384");
  assert.equal(formatScore(0.00019), "1.9e-4");
  assert.equal(formatScore(-12.345), "-12.3");
  assert.equal(formatScore(123456), "1.23e5");
  assert.equal(formatScore(0), "0");
  assert.equal(formatScore(1e-300), "1e-300");
});

test("every transition is faint and the path is a strong chain", () => {
  const html = draw({ ...ICE, start: "π", scores: [[0.32, 0.0384, 0.0184], [0.02, 0.064, 0.0019]], path: [0, 1, 0] });
  const group = (stroke) => {
    const m = html.match(new RegExp(`<g stroke="${stroke}"[^>]*>(.*?)</g>`));
    return m ? count(m[1], /<line /g) : 0;
  };
  // 2 columns of 2x2 edges plus 2 start edges, 3 of them on the path.
  assert.equal(group(INK.line) + group(INK.span), 2 * 4 + 2);
  assert.equal(group(INK.span), 3);
  assert.equal(count(html, new RegExp(`<circle [^>]*stroke="${INK.span}"`, "g")), 3);
  assert.match(html, />0.0384</);
  assert.match(html, />π</);
});

test('transitions "path" draws only the path', () => {
  const html = draw({ ...ICE, path: [0, 0, 1], transitions: "path" });
  assert.equal(count(html, /<line /g), 2);
  assert.equal(count(html, /<circle /g), 6);
});
