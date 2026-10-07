import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parseMarkdown } from "../src/render/index.js";
import { validateDoc, formatError } from "../src/render/schema/index.js";
import { validate, normalize, render, arcLevels, entities, isBio } from "../src/render/diagrams/tokens.js";

/** Diagnostics for one fence body, message text only. */
const errs = (data) => {
  const out = [];
  validate(out, { data, line: 1 }, "t.md");
  return out.map((e) => e.message);
};
const draw = (data) => render({ data: normalize(data) });

const CAT = ["The", "cat", "sat", "on", "the", "mat", "."];
const PARSE = [
  { from: 2, to: 1, label: "nsubj" }, { from: 1, to: 0, label: "det" }, { from: 2, to: 5, label: "obl" },
  { from: 5, to: 3, label: "case" }, { from: 5, to: 4, label: "det" }, { from: 2, to: 6, label: "punct" },
];

test("the example document validates clean", () => {
  const file = fileURLToPath(new URL("../examples/diagrams/tokens.md", import.meta.url));
  const { doc, errors } = parseMarkdown(readFileSync(file, "utf8"), { file });
  assert.deepEqual(errors, []);
  assert.deepEqual(validateDoc(doc, { file }).map(formatError), []);
});

test("validate never throws on junk and picks exactly one mode", () => {
  for (const junk of [null, 3, "x", [], [null], { tokens: [null] }, { rows: [null, null] }, { tokens: ["a"], arcs: [null] },
    { tokens: ["a"], tags: null }, { tokens: ["a"], tags: { X: [null] } }, { rows: [{ tokens: ["a"] }, { tokens: ["b"] }], links: [null] }]) {
    assert.ok(errs(junk).length > 0, JSON.stringify(junk));
  }
  assert.deepEqual(errs({}), ["/tokens expected an array of token strings, got nothing"]);
  assert.deepEqual(errs({ tokens: ["a"], rows: [] }), ["expected tokens or rows, not both; rows is the two-row alignment mode"]);
  assert.deepEqual(errs({ tokens: ["a"], links: [] }), ["/links links need rows (alignment mode); a single row uses arcs"]);
  assert.deepEqual(errs({ tokens: [] }), ["/tokens expected an array of token strings, got an empty array"]);
  assert.deepEqual(errs({ tokens: ["a", " "] }), ['/tokens/1 expected a token string, got " "']);
  assert.deepEqual(errs({ tokens: ["a"], arc: [] }),
    ['/arc unknown key "arc"; keys: title note compact tokens arcs root weights tags spans rows links']);
});

test("every collection is capped and a tripped cap stops the cascade", () => {
  assert.deepEqual(errs({ tokens: Array(65).fill("a") }), ["/tokens expected at most 64 tokens, got 65"]);
  assert.deepEqual(errs({ tokens: ["a", "b"], arcs: Array(129).fill({ from: 0, to: 1 }) }), ["/arcs expected at most 128 arcs, got 129"]);
  assert.deepEqual(errs({ tokens: ["a"], spans: Array(65).fill({ from: 0, to: 0 }) }), ["/spans expected at most 64 spans, got 65"]);
  const tags = Object.fromEntries(Array.from({ length: 7 }, (_, i) => ["T" + i, ["x"]]));
  assert.deepEqual(errs({ tokens: ["a"], tags }), ["/tags expected at most 6 tag rows, got 7"]);
  const rows = [{ tokens: ["a"] }, { tokens: ["b"] }];
  assert.deepEqual(errs({ rows, links: Array(513).fill([0, 0]) }), ["/links expected at most 512 links, got 513"]);
  assert.deepEqual(errs({ tokens: ["x".repeat(41)] }), ["/tokens/0 expected at most 40 characters, got 41"]);
});

test("arcs reference real, distinct tokens; weight only and always with weights: true", () => {
  const tokens = ["a", "b", "c"];
  assert.deepEqual(errs({ tokens, arcs: [{ from: 0, to: 3 }] }), ["/arcs/0/to expected a token index from 0 to 2, got 3"]);
  assert.deepEqual(errs({ tokens, arcs: [{ from: 1.5, to: 0 }] }), ["/arcs/0/from expected a token index from 0 to 2, got 1.5"]);
  assert.deepEqual(errs({ tokens, arcs: [{ from: 1, to: 1 }] }), ["/arcs/0 expected two different tokens, got from and to both 1"]);
  assert.deepEqual(errs({ tokens, arcs: [{ from: 0, to: 1, tone: "red" }] }),
    ["/arcs/0/tone expected one of good warn bad flat span c1 c2 c3 c4 c5 c6 c7 c8, got \"red\""]);
  assert.deepEqual(errs({ tokens, arcs: [{ from: 0, to: 1, weight: 0.5 }] }), ['/arcs/0/weight a weight needs "weights": true on the fence']);
  assert.deepEqual(errs({ tokens, weights: true, arcs: [{ from: 0, to: 1 }] }),
    ["/arcs/0/weight expected a weight from 0 to 1 (weights is true), got nothing"]);
  assert.deepEqual(errs({ tokens, weights: true, arcs: [{ from: 0, to: 1, weight: 1.2 }] }), ["/arcs/0/weight expected a weight from 0 to 1, got 1.2"]);
  assert.deepEqual(errs({ tokens, weights: true, arcs: [{ from: 0, to: 1, weight: 1e309 }] }), ["/arcs/0/weight expected a finite number, got Infinity"]);
  assert.deepEqual(errs({ tokens, root: 3 }), ["/root expected a token index from 0 to 2, got 3"]);
});

test("spans are ordered ranges; tag rows match the token count", () => {
  const tokens = ["a", "b", "c"];
  assert.deepEqual(errs({ tokens, spans: [{ from: 2, to: 1 }] }), ["/spans/0 expected from <= to, got from 2 and to 1"]);
  assert.deepEqual(errs({ tokens, tags: { POS: ["X", "Y"] } }), ["/tags/POS expected 3 tags to match tokens, got 2"]);
  assert.deepEqual(errs({ tokens, tags: { POS: ["X", 1, "Z"] } }), ["/tags/POS/1 expected string, got 1"]);
  assert.deepEqual(errs({ tokens, tags: { "": ["X", "Y", "Z"] } }), ['/tags/ expected a row name of 1 to 24 characters, got ""']);
  const nine = Array.from({ length: 9 }, (_, i) => "B-T" + i);
  assert.deepEqual(errs({ tokens: nine, tags: { NER: nine } }),
    ["/tags expected at most 8 entity types across BIO rows, got 9: T0 T1 T2 T3 T4 T5 T6 T7 T8"]);
});

test("alignment mode takes exactly two rows and in-range links", () => {
  const rows = [{ name: "src", tokens: ["a", "b"] }, { name: "tgt", tokens: ["c"] }];
  assert.deepEqual(errs({ rows: [rows[0]] }), ["/rows expected exactly 2 rows [{ name, tokens }], got 1"]);
  assert.deepEqual(errs({ rows, links: [[2, 0, 0.5]] }), ["/links/0/0 expected a token index into rows/0 from 0 to 1, got 2"]);
  assert.deepEqual(errs({ rows, links: [[0, 1]] }), ["/links/0/1 expected a token index into rows/1 from 0 to 0, got 1"]);
  assert.deepEqual(errs({ rows, links: [[0, 0, -0.1]] }), ["/links/0/2 expected a weight from 0 to 1, got -0.1"]);
  assert.deepEqual(errs({ rows, links: [[0]] }), ["/links/0 expected a link [i, j, weight] from rows/0 token i to rows/1 token j, got an array of 1"]);
  assert.deepEqual(errs({ rows, arcs: [] }), ["/arcs arcs needs tokens; rows (alignment mode) takes rows and links only"]);
  assert.deepEqual(errs({ rows, links: [[0, 0], [1, 0, 0.3]] }), []);
});

test("normalize fills empty collections and flags", () => {
  const d = normalize({ tokens: ["a"] });
  assert.deepEqual([d.arcs, d.spans, d.links, d.tags, d.weights, d.compact, d.title], [[], [], [], {}, false, false, ""]);
});

test("arc levels nest by span and stack crossing arcs", () => {
  const lv = (pairs) => arcLevels(pairs.map(([lo, hi], i) => ({ lo, hi, i })));
  // The cat parse: det, nsubj, case, det are one level; obl climbs over case and det; punct over obl.
  assert.deepEqual(lv(PARSE.map((a) => [Math.min(a.from, a.to), Math.max(a.from, a.to)])), [1, 1, 3, 2, 1, 4]);
  // Arcs that only share an end token sit side by side.
  assert.deepEqual(lv([[0, 1], [1, 2]]), [1, 1]);
  // A crossing pair cannot share a level.
  assert.deepEqual(lv([[0, 2], [1, 3]]), [1, 2]);
});

test("a dependency parse draws one arrowed arch per arc, a root arrow and the tag row", () => {
  const html = draw({ tokens: CAT, arcs: PARSE, root: 2, tags: { POS: ["DET", "NOUN", "VERB", "ADP", "DET", "NOUN", "PUNCT"] } });
  assert.equal((html.match(/<rect [^>]*rx="5"/g) ?? []).length, 7);
  assert.equal((html.match(/<path d="M[^"]*" fill="none"[^>]*marker-end/g) ?? []).length, 6);
  assert.equal((html.match(/<line [^>]*marker-end/g) ?? []).length, 1);
  assert.match(html, />root</);
  for (const l of ["nsubj", "obl", "case", "punct"]) assert.match(html, new RegExp(`>${l}<`));
  assert.equal((html.match(/>PROPN<|>NOUN</g) ?? []).length, 2);
  assert.doesNotMatch(html, /NaN|Infinity/);

  // Arcs sharing a token leave it at different x, so no two legs coincide.
  const legs = [...html.matchAll(/<path d="M([\d.-]+),0 /g)].map((m) => m[1]);
  assert.equal(new Set(legs).size, legs.length);
});

test("weights mode drops arrowheads and scales stroke with weight", () => {
  const html = draw({ tokens: ["a", "b", "c"], weights: true, arcs: [{ from: 2, to: 0, weight: 1 }, { from: 2, to: 1, weight: 0 }] });
  assert.doesNotMatch(html, /marker-end/);
  const strokes = [...html.matchAll(/stroke-width="([\d.]+)" stroke-opacity="([\d.]+)"/g)].map((m) => [Number(m[1]), Number(m[2])]);
  // Lightest drawn first, so the heavy link sits on top.
  assert.deepEqual(strokes, [[0.8, 0.25], [4, 1]]);
});

test("BIO rows become one bar per entity, coloured by type in first-appearance order", () => {
  const ner = ["B-PER", "I-PER", "O", "B-ORG", "I-ORG", "B-PER"];
  assert.equal(isBio(ner), true);
  assert.equal(isBio(["NOUN", "B-X"]), false);
  assert.deepEqual(entities(ner), [{ lo: 0, hi: 1, type: "PER" }, { lo: 3, hi: 4, type: "ORG" }, { lo: 5, hi: 5, type: "PER" }]);
  // An I- tag after a different type opens a new entity.
  assert.deepEqual(entities(["B-PER", "I-ORG"]).length, 2);

  const html = draw({ tokens: ["Tim", "Cook", "met", "Open", "AI", "Sam"], tags: { NER: ner } });
  const bars = [...html.matchAll(/<rect [^>]*height="4" rx="2" fill="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(bars.length, 3);
  assert.equal(bars[0], bars[2]);
  assert.notEqual(bars[0], bars[1]);
  assert.equal((html.match(/>PER</g) ?? []).length, 2);
  assert.doesNotMatch(html, />B-PER<|>O</);
});

test("spans stack when they overlap and labels widen the gaps they need", () => {
  const html = draw({ tokens: ["a", "b", "c"], spans: [{ from: 0, to: 1, label: "ab" }, { from: 1, to: 2, label: "bc" }] });
  const ys = [...html.matchAll(/<path d="M[\d.]+,([\d.]+) v6/g)].map((m) => Number(m[1]));
  assert.equal(ys.length, 2);
  assert.notEqual(ys[0], ys[1]);

  // A long label on a one-token gap pushes the two tokens apart.
  const xOf = (h) => [...h.matchAll(/<rect x="([\d.]+)" y="0"/g)].map((m) => Number(m[1]));
  const plain = xOf(draw({ tokens: ["a", "b"], arcs: [{ from: 0, to: 1 }] }));
  const wide = xOf(draw({ tokens: ["a", "b"], arcs: [{ from: 0, to: 1, label: "a-very-long-relation" }] }));
  assert.ok(wide[1] - plain[1] > 100, `${plain} vs ${wide}`);
});

test("alignment mode draws both rows, names and one line per link", () => {
  const html = draw({
    rows: [{ name: "source", tokens: ["Das", "Haus"] }, { name: "target", tokens: ["the", "house", "."] }],
    links: [[0, 0, 0.9], [1, 1], [1, 2, 0.1]],
  });
  assert.equal((html.match(/<rect [^>]*rx="5"/g) ?? []).length, 5);
  assert.equal((html.match(/<line /g) ?? []).length, 3);
  assert.match(html, />source</);
  assert.match(html, /stroke-width="4" stroke-opacity="1"/);
});

test("long rows keep a min-width so they scroll instead of shrinking; compact opts out", () => {
  const tokens = Array.from({ length: 30 }, (_, i) => "token" + i);
  assert.match(draw({ tokens }), /style="min-width:\d+px;max-width/);
  assert.doesNotMatch(draw({ tokens, compact: true }), /min-width/);
  assert.doesNotMatch(draw({ tokens: ["a", "b"] }), /min-width/);
});
