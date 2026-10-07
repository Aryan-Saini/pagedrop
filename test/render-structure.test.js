import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parseMarkdown } from "../src/render/index.js";
import { validateDoc, formatError } from "../src/render/schema/index.js";
import { normalize, render } from "../src/render/diagrams/structure.js";

/** Every diagnostic for one `structure` fence; the fence opens on line 5. */
const errorsOf = (body) => {
  const md = `---\ntitle: T\n---\n\n\`\`\`structure\n${JSON.stringify(body)}\n\`\`\`\n`;
  const r = parseMarkdown(md, { file: "s.md" });
  assert.deepEqual(r.errors, []);
  return validateDoc(r.doc, { file: "s.md" }).map(formatError);
};

const draw = (body) => render({ type: "structure", line: 1, data: normalize(body) });
const count = (svg, re) => (svg.match(re) ?? []).length;

test("examples/diagrams/structure.md validates with zero errors", () => {
  const path = fileURLToPath(new URL("../examples/diagrams/structure.md", import.meta.url));
  const r = parseMarkdown(readFileSync(path, "utf8"), { file: "structure.md" });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(validateDoc(r.doc, { file: "structure.md" }).map(formatError), []);
});

test("kind is required and picks the key set", () => {
  assert.deepEqual(errorsOf({ cells: [1] }), ["s.md:5 structure: /kind expected one of list array stack, got nothing"]);
  assert.deepEqual(errorsOf({ kind: "array", cells: [1], head: "h" }),
    ["s.md:5 structure: /head unknown key \"head\"; keys: title note compact kind cells pointers start"]);
  assert.deepEqual(errorsOf({ kind: "stack", cells: [] }), ["s.md:5 structure: /cells expected at least one cell, got an empty array"]);
});

test("cells: list cells are objects with a value; array cells may be bare values", () => {
  assert.deepEqual(errorsOf({ kind: "list", cells: [3, { label: "0x10" }, { v: [1] }] }), [
    "s.md:5 structure: /cells/0 expected a cell { v }, got 3",
    "s.md:5 structure: /cells/1/v expected a string or number, got nothing",
    "s.md:5 structure: /cells/2/v expected a string or number, got an array of 1",
  ]);
  assert.deepEqual(errorsOf({ kind: "array", cells: [1, "x", true, { v: 2, tone: "blue" }] }), [
    "s.md:5 structure: /cells/2 expected a string or number, got true",
    "s.md:5 structure: /cells/3/tone expected one of good warn bad flat span c1 c2 c3 c4 c5 c6 c7 c8, got \"blue\"",
  ]);
});

test("indices must land on a cell, counted from start for pointers", () => {
  assert.deepEqual(errorsOf({ kind: "list", cells: [{ v: 1 }, { v: 2 }], cycle: 2 }),
    ["s.md:5 structure: /cycle expected an index 0..1, got 2"]);
  assert.deepEqual(errorsOf({ kind: "array", start: 1, cells: [4, 5, 6], pointers: [{ name: "i", at: 0 }, { name: "j", at: 3 }] }),
    ["s.md:5 structure: /pointers/0/at expected an index 1..3, got 0"]);
  assert.deepEqual(errorsOf({ kind: "array", cells: [4], pointers: [{ at: 0 }] }),
    ["s.md:5 structure: /pointers/0/name expected a pointer name, got nothing"]);
  assert.deepEqual(errorsOf({ kind: "array", cells: [4], start: 0.5 }), ["s.md:5 structure: /start expected an integer, got 0.5"]);
});

test("normalize fills defaults per kind", () => {
  const l = normalize({ kind: "list", cells: [{ v: 1 }] });
  assert.deepEqual([l.head, l.doubly, l.cycle, l.compact], ["", false, null, false]);
  assert.deepEqual(l.cells, [{ v: 1, label: "", tone: "" }]);
  const a = normalize({ kind: "array", cells: [7, { v: 8, tone: "c1" }] });
  assert.deepEqual(a.cells, [{ v: 7, tone: "" }, { v: 8, tone: "c1" }]);
  assert.deepEqual([a.start, a.pointers], [0, []]);
  assert.equal(normalize({ kind: "stack", cells: ["main()"] }).top, "");
});

test("a singly list draws one next arrow per link and a null mark at the end", () => {
  const svg = draw({ kind: "list", head: "head", cells: [{ v: 7 }, { v: 3 }, { v: 9 }] });
  // head arrow plus two links.
  assert.equal(count(svg, /marker-end=/g), 3);
  assert.equal(count(svg, /<rect /g), 3);
  // One slash: the last next field.
  assert.equal(count(svg, /stroke-width="1.4"\/>/g), 1);
});

test("a doubly list adds a prev arrow per link and null marks at both ends", () => {
  const svg = draw({ kind: "list", doubly: true, cells: [{ v: 1 }, { v: 2 }, { v: 3 }] });
  assert.equal(count(svg, /marker-end=/g), 4);
  assert.equal(count(svg, /stroke-width="1.4"\/>/g), 2);
});

test("a cycle replaces the null mark with a curved arrow back", () => {
  const svg = draw({ kind: "list", cycle: 0, cells: [{ v: 1 }, { v: 2 }] });
  assert.equal(count(svg, /stroke-width="1.4"\/>/g), 0);
  assert.equal(count(svg, /d="M[^"]* C[^"]*"[^>]*marker-end/g), 1);
});

test("array pointers at one index share an arrow and stack their names", () => {
  const svg = draw({
    kind: "array", start: 1, cells: [2, 1, 3, 8],
    pointers: [{ name: "i", at: 3 }, { name: "j", at: 3 }, { name: "pivot", at: 4, tone: "warn" }],
  });
  assert.equal(count(svg, /marker-end=/g), 2);
  // Printed indices start at 1.
  assert.match(svg, />1<\/text>/);
  assert.match(svg, />4<\/text>/);
  assert.doesNotMatch(svg, />0<\/text>/);
  const ys = ["i", "j"].map((name) => Number(new RegExp(`y="([\\d.]+)"[^>]*>${name}<`).exec(svg)?.[1]));
  assert.ok(ys[1] > ys[0], "j stacks under i");
});

test("a stack draws its cells top first with the top pointer on the first", () => {
  const svg = draw({ kind: "stack", top: "sp", cells: ["fib(1)", "fib(2)", "main()"] });
  const order = [...svg.matchAll(/>(fib\(\d\)|main\(\))</g)].map((m) => m[1]);
  assert.deepEqual(order, ["fib(1)", "fib(2)", "main()"]);
  assert.equal(count(svg, /marker-end=/g), 1);
  assert.match(svg, />sp</);
});
