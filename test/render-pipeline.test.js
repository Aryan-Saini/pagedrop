import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parseMarkdown } from "../src/render/index.js";
import { validateDoc, formatError } from "../src/render/schema/index.js";
import { validate, normalize, render, cellColors } from "../src/render/diagrams/pipeline.js";

/** Diagnostics for one fence body, message text only. */
const errs = (data) => {
  const out = [];
  validate(out, { data, line: 1 }, "t.md");
  return out.map((e) => e.message);
};

test("the example document validates clean", () => {
  const file = fileURLToPath(new URL("../examples/diagrams/pipeline.md", import.meta.url));
  const { doc, errors } = parseMarkdown(readFileSync(file, "utf8"), { file });
  assert.deepEqual(errors, []);
  assert.deepEqual(validateDoc(doc, { file }).map(formatError), []);
});

test("rows, cells and start are checked", () => {
  assert.deepEqual(errs({}), ["/rows expected at least one row, got nothing"]);
  assert.deepEqual(errs({ rows: [{ label: "a", cells: [] }] }), ["/rows/0/cells expected at least one cell, got an empty array"]);
  assert.deepEqual(errs({ rows: [{ label: "a", cells: ["IF", 3, ""] }] }), [
    "/rows/0/cells/1 expected a non-empty string or null, got 3",
    '/rows/0/cells/2 expected a non-empty string or null, got ""',
  ]);
  assert.deepEqual(errs({ rows: [{ label: "a", start: -1, cells: ["IF"] }] }), ["/rows/0/start expected a whole number >= 0, got -1"]);
  assert.deepEqual(errs({ rows: [{ label: "a", cells: ["IF"], tone: "c1" }] }), ['/rows/0/tone unknown key "tone"; keys: label start cells']);
});

test("cycles must fit every row", () => {
  assert.deepEqual(errs({ cycles: 3, rows: [{ label: "a", start: 1, cells: ["IF", "ID", "EX"] }] }),
    ["/cycles expected at least 4 to fit every row, got 3"]);
});

test("more than eight distinct cell texts is refused; the stall marker does not count", () => {
  const cells = ["a", "b", "c", "d", "e", "f", "g", "h"];
  assert.deepEqual(errs({ rows: [{ label: "r", cells: [...cells, "stall"] }] }), []);
  assert.equal(errs({ rows: [{ label: "r", cells: [...cells, "i"] }] }).length, 1);
  assert.match(errs({ rows: [{ label: "r", cells: [...cells, "i"] }] })[0], /^\/rows expected at most 8 distinct cell texts, got 9/);
});

test("normalize defaults start, stall and cycles", () => {
  const d = normalize({ rows: [{ label: "a", cells: ["IF", "ID"] }, { label: "b", start: 3, cells: ["IF"] }] });
  assert.equal(d.stall, "stall");
  assert.equal(d.cycles, 4);
  assert.equal(d.rows[0].start, 0);
  assert.equal(d.compact, false);
});

test("colours go by first appearance and skip the stall marker", () => {
  const d = normalize({ stall: "wait", rows: [{ label: "a", cells: ["wait", "EX", "IF"] }, { label: "b", cells: ["IF", "MEM"] }] });
  assert.deepEqual([...cellColors(d).keys()], ["EX", "IF", "MEM"]);
});

test("render: one header per cycle, one cell per non-null, stalls dashed with a dot", () => {
  const d = normalize({ cycles: 6, rows: [
    { label: "lw", cells: ["IF", "ID", "EX", "MEM", "WB"] },
    { label: "add", start: 1, cells: ["IF", null, "stall", "EX"] },
  ] });
  const html = render({ data: d });
  assert.equal((html.match(/<rect /g) ?? []).length, 8);
  assert.equal((html.match(/stroke-dasharray/g) ?? []).length, 1);
  assert.equal((html.match(/<circle /g) ?? []).length, 1);
  for (const c of [1, 2, 3, 4, 5, 6]) assert.ok(html.includes(`>${c}</text>`), `cycle ${c}`);
  assert.ok(!html.includes(">stall<"));
});
