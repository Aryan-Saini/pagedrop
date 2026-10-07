import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parseMarkdown } from "../src/render/index.js";
import { validateDoc, formatError } from "../src/render/schema/index.js";
import { validate, normalize, render, widths } from "../src/render/diagrams/layers.js";

/** Diagnostics for one fence body, message text only. */
const errs = (data) => {
  const out = [];
  validate(out, { data, line: 1 }, "t.md");
  return out.map((e) => e.message);
};

test("the example document validates clean", () => {
  const file = fileURLToPath(new URL("../examples/diagrams/layers.md", import.meta.url));
  const { doc, errors } = parseMarkdown(readFileSync(file, "utf8"), { file });
  assert.deepEqual(errors, []);
  assert.deepEqual(validateDoc(doc, { file }).map(formatError), []);
});

test("items, shape and tone are checked", () => {
  assert.deepEqual(errs({ items: [] }), ["/items expected at least one layer, got an empty array"]);
  assert.deepEqual(errs({ shape: "cone", items: [{ label: "L1" }] }), ['/shape expected one of pyramid stack, got "cone"']);
  assert.deepEqual(errs({ items: [{ label: "L1", tone: "blue" }] }),
    ['/items/0/tone expected one of good warn bad flat span c1 c2 c3 c4 c5 c6 c7 c8, got "blue"']);
  assert.deepEqual(errs({ items: [{ label: "" }] }), ['/items/0/label expected a layer label, got ""']);
});

test("normalize cycles the default tone through c1..c8", () => {
  const d = normalize({ items: Array.from({ length: 10 }, (_, i) => ({ label: `L${i}` })) });
  assert.equal(d.shape, "pyramid");
  assert.deepEqual(d.items.map((it) => it.tone), ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "c1", "c2"]);
  assert.equal(normalize({ items: [{ label: "x", tone: "bad" }] }).items[0].tone, "bad");
});

test("a pyramid widens downward and fits every label; a stack is level", () => {
  const items = [{ label: "a very long top layer label indeed" }, { label: "mid" }, { label: "base" }];
  const ws = widths(normalize({ items }));
  assert.ok(ws[0] < ws[1] && ws[1] < ws[2]);
  assert.ok(ws[0] >= 34 * 13 * 0.56, "the long top label fits");
  const flat = widths(normalize({ shape: "stack", items }));
  assert.equal(new Set(flat).size, 1);
});

test("render draws one bar per layer and a note only where given", () => {
  const html = render({ data: normalize({ items: [{ label: "L1", note: "1 ns" }, { label: "L2" }, { label: "DRAM", note: "80 ns" }] }) });
  assert.equal((html.match(/<rect /g) ?? []).length, 3);
  assert.ok(html.includes(">1 ns<") && html.includes(">80 ns<"));
  assert.equal((html.match(/font-family:var\(--mono\)/g) ?? []).length, 2);
});
