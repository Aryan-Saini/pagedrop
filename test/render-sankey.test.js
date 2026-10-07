import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parseMarkdown } from "../src/render/index.js";
import { validateDoc, formatError } from "../src/render/schema/index.js";
import { validate, normalize, render } from "../src/render/diagrams/sankey.js";
import { SERIES, TONE_INK } from "../src/render/charts.js";

/** Diagnostics for one fence body, message text only. */
const errs = (data) => {
  const out = [];
  validate(out, { data, line: 1 }, "t.md");
  return out.map((e) => e.message);
};

const nodes = (...ids) => ids.map((id) => ({ id, label: id.toUpperCase() }));

test("the example document validates clean", () => {
  const file = fileURLToPath(new URL("../examples/diagrams/sankey.md", import.meta.url));
  const { doc, errors } = parseMarkdown(readFileSync(file, "utf8"), { file });
  assert.deepEqual(errors, []);
  assert.deepEqual(validateDoc(doc, { file }).map(formatError), []);
});

test("links must name real nodes and carry a positive value", () => {
  assert.deepEqual(errs({ nodes: nodes("a", "b"), links: [{ from: "a", to: "c", value: 1 }] }),
    ['/links/0/to no node with id "c"; ids: a b']);
  assert.deepEqual(errs({ nodes: nodes("a", "b"), links: [{ from: "a", to: "b", value: 0 }] }),
    ["/links/0/value expected a value > 0, got 0"]);
  assert.deepEqual(errs({ nodes: nodes("a", "b"), links: [{ from: "a", to: "b" }] }),
    ["/links/0/value expected number, got nothing"]);
  assert.deepEqual(errs({ nodes: nodes("a", "a"), links: [{ from: "a", to: "a", value: 1 }] }),
    ['/nodes/1/id duplicate node id "a"; ids must be unique', '/links/0 links "a" to itself; a sankey flows one way']);
  assert.deepEqual(errs({ nodes: [{ id: "a", label: "A", tone: "pink" }, { id: "b", label: "B" }], links: [{ from: "a", to: "b", value: 1 }] }),
    ['/nodes/0/tone expected one of good warn bad flat span c1 c2 c3 c4 c5 c6 c7 c8, got "pink"']);
  assert.deepEqual(errs({ nodes: nodes("a", "b", "c"), links: [{ from: "a", to: "b", value: 1 }] }),
    ['/nodes/2 node "c" has no links; drop it or link it']);
  assert.deepEqual(errs({ nodes: nodes("a", "b"), links: [{ from: "a", to: "b", value: 1 }], format: "gb" }),
    ['/format expected one of int compact usd pct ms, got "gb"']);
});

test("a cycle is a diagnostic that names the loop, never a render-time throw", () => {
  const body = {
    nodes: nodes("a", "b", "c", "d"),
    links: [{ from: "a", to: "b", value: 3 }, { from: "b", to: "c", value: 2 }, { from: "c", to: "d", value: 1 }, { from: "c", to: "a", value: 1 }],
  };
  assert.deepEqual(errs(body), ["/links/3 closes a cycle a -> b -> c -> a; a sankey flows one way, so cut one of these links"]);
});

test("normalize fills tone, format and compact", () => {
  const d = normalize({ nodes: nodes("a", "b"), links: [{ from: "a", to: "b", value: 1 }] });
  assert.equal(d.format, "compact");
  assert.equal(d.compact, false);
  assert.deepEqual(d.nodes.map((node) => node.tone), ["", ""]);
});

const PIPE = {
  format: "int",
  nodes: [{ id: "in", label: "Ingress" }, { id: "api", label: "API" }, { id: "bad", label: "Rejected", tone: "bad" }, { id: "db", label: "DB" }],
  links: [{ from: "in", to: "api", value: 900 }, { from: "in", to: "bad", value: 100 }, { from: "api", to: "db", value: 900 }],
};

test("render draws one bar per node and one band per link, coloured by source", () => {
  const html = render({ data: normalize(PIPE) });
  assert.equal((html.match(/<rect /g) ?? []).length, 4);
  const bands = [...html.matchAll(/<path d="[^"]+" fill="none" stroke="([^"]+)" stroke-opacity="0.35"/g)].map((m) => m[1]);
  // Two bands leave Ingress (slot 1), one leaves API (slot 2).
  assert.deepEqual(bands, [SERIES[0], SERIES[0], SERIES[1]]);
  assert.ok(html.includes(`fill="${TONE_INK.bad}"`));
  // Totals are formatted with the fence's preset.
  assert.ok(html.includes(">1,000</tspan>"));
});

test("labels sit right of a node, left of it in the last column", () => {
  const html = render({ data: normalize(PIPE) });
  const anchor = (label) => html.match(new RegExp(`text-anchor:(start|end)">${label}<`))[1];
  assert.equal(anchor("Ingress"), "start");
  assert.equal(anchor("API"), "start");
  assert.equal(anchor("DB"), "end");
});

test("render is deterministic", () => {
  const strip = (s) => s.replace(/id="[^"]*"/g, "");
  assert.equal(strip(render({ data: normalize(PIPE) })), strip(render({ data: normalize(PIPE) })));
});
