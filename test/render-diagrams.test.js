import test from "node:test";
import assert from "node:assert/strict";

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
