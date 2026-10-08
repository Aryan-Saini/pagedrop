import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { render } from "../src/render/index.js";
import { validateChart, panelsOf } from "../src/render/schema/chart.js";
import { validateHtml } from "../src/html-policy.js";

/** Diagnostics for one chart body, as `block: message`. */
const errs = (kind, data) => {
  const out = [];
  validateChart(out, { kind, data, line: 1 }, "t.md");
  return out.map((e) => `${e.block}: ${e.message}`);
};
/** Render one chart fence as a whole document; `body` is the page without its stylesheet. */
const page = (kind, data) => {
  const out = render("# T\n\n```chart " + kind + "\n" + JSON.stringify(data) + "\n```\n", { file: "t.md" });
  return { ...out, body: out.html?.slice(out.html.indexOf("<body>")) ?? "" };
};

const PTS = (k) => [[1 * k, 30, "a"], [2 * k, 50, "b"], [4 * k, 40, "c"], [8 * k, 60, "d"]];
const SCATTER = {
  title: "Index vs cost", format: "int",
  series: [{ name: "One", points: PTS(1) }, { name: "Two", points: [[3, 35, "e"], [5, 55, "f"]] }],
  labels: true, pareto: "top-left", quadrant: "top-left",
  views: [{ label: "Cost" }, { label: "Speed", series: [{ name: "One", points: PTS(10) }, { name: "Two", points: [[30, 35], [50, 55]] }] }],
  controls: ["log-x", "labels", "pareto", "quadrant", "legend", "table"],
};

test("the example document renders, passes the HTML policy and draws finite geometry", () => {
  const file = fileURLToPath(new URL("../examples/chart-controls.md", import.meta.url));
  const out = render(readFileSync(file, "utf8"), { file });
  assert.deepEqual(out.errors, []);
  assert.ok(validateHtml(out.html, {}).ok);
  assert.doesNotMatch(out.html, /NaN|Infinity/);
});

test("panelsOf doubles each view per log toggle and drops the floor a log axis cannot reach", () => {
  const panels = panelsOf({ x: [1, 2], zeroFloor: true, views: [{ label: "A" }, { label: "B" }], controls: ["log-y"] });
  assert.deepEqual(panels.map((p) => `${p.v}${p.label}:${p.x}/${p.y}`), ["0A:/lin", "0A:/log", "1B:/lin", "1B:/log"]);
  assert.equal(panels[1].data.yScale, "log10");
  assert.equal("zeroFloor" in panels[1].data, false);
  assert.equal(panels[0].data.zeroFloor, true);
  // An axis authored as log flips to linear, and its default panel comes first.
  assert.deepEqual(panelsOf({ xScale: "log2", controls: ["log-x"] }).map((p) => [p.x, p.data.xScale]), [["log", "log2"], ["lin", "linear"]]);
});

test("views and controls reject malformed lists with one message each", () => {
  const bars = { labels: ["a", "b"], values: [1, 2] };
  assert.deepEqual(errs("bars", { ...bars, views: [{ label: "Only" }] }),
    ["chart bars: /views expected at least 2 views, got 1; one view is the chart itself"]);
  assert.deepEqual(errs("bars", { ...bars, views: [{ label: "A" }, { label: "A" }] }),
    ['chart bars: /views/1/label expected a label of its own, got "A" again']);
  assert.deepEqual(errs("bars", { ...bars, views: [{ label: "A" }, { label: "B", title: "x" }] }),
    ["chart bars: /views/1/title cannot change per view; every view shares the chart's title and frame"]);
  assert.deepEqual(errs("bars", { ...bars, controls: ["log-y"] }),
    ["chart bars: /controls/0 log-y is not available on chart bars; it works on lines, scatter"]);
  assert.deepEqual(errs("bars", { ...bars, controls: ["sort", "sort"] }), ["chart bars: /controls/1 sort is listed twice"]);
  assert.deepEqual(errs("share", { ...bars, controls: ["table"] }),
    ["chart share: /controls is not available on chart share; use bars for a switchable view"]);
  assert.deepEqual(errs("bars", { ...bars, views: [{ label: "A" }, { label: "B", colour: 1 }] }),
    ['chart bars: /views/1/colour unknown key "colour"; keys: label note format labels values']);
  for (const junk of [null, 3, "x", {}, [null], [{ label: 3 }]]) {
    assert.ok(errs("bars", { ...bars, views: junk }).length > 0, JSON.stringify(junk));
    assert.ok(errs("bars", { ...bars, controls: junk }).length > 0, JSON.stringify(junk));
  }
});

test("each panel is validated, labelled with its view and scales, and a shared fault is reported once", () => {
  const lines = { x: [1, 2, 3], series: [{ name: "s", values: [0, 1, 2] }], controls: ["log-y"] };
  assert.deepEqual(errs("lines", lines), ["chart lines (log y): /series/0/values/0 expected a value > 0 on the log10 y axis, got 0"]);
  const bad = { labels: ["a", "b"], values: [1, "x"], views: [{ label: "A" }, { label: "B" }] };
  assert.deepEqual(errs("bars", bad), ['chart bars: /values/1 expected number, got "x"']);
  assert.deepEqual(errs("bars", { labels: ["a", "b"], values: [1, 2], views: [{ label: "A" }, { label: "B", values: [1] }] }),
    ['chart bars (view "B"): /values expected 2 numbers to match labels, got 1']);
});

test("controls need something to switch, and the panel count is capped", () => {
  assert.deepEqual(errs("scatter", { points: [{ x: 1, y: 1 }], controls: ["pareto"] }),
    ['chart scatter: /controls/0 pareto has nothing to toggle; give pareto a corner, e.g. "top-left"']);
  assert.deepEqual(errs("lines", { labels: ["a", "b"], series: [{ name: "s", values: [1, 2] }], controls: ["log-x"] }),
    ["chart lines: /controls/0 log-x needs a numeric x axis in every view; give x or series points"]);
  const two = { ...SCATTER, views: [SCATTER.views[0], { label: "Renamed", series: [{ name: "Uno", points: PTS(1) }, SCATTER.series[1]] }] };
  assert.deepEqual(errs("scatter", two),
    ["chart scatter: /controls/4 legend needs the same series names, in the same order, in every view; one legend switches them all"]);
  const six = Array.from({ length: 6 }, (_, i) => ({ label: `v${i}` }));
  assert.deepEqual(errs("scatter", { points: [{ x: 1, y: 1 }], views: six, controls: ["log-x"] }), []);
  assert.deepEqual(errs("scatter", { points: [{ x: 1, y: 1 }], views: six, controls: ["log-x", "log-y"] }),
    ["chart scatter: /controls draws 24 charts (every view times every log and sort state); at most 12, so drop a view or a toggle"]);
});

test("scatter annotations validate their corner and need labelled points", () => {
  assert.deepEqual(errs("scatter", { points: [{ x: 1, y: 1 }], pareto: "top" }),
    ["chart scatter: /pareto expected one of top-left top-right bottom-left bottom-right, got \"top\""]);
  assert.deepEqual(errs("scatter", { points: [{ x: 1, y: 1 }], labels: true }),
    ['chart scatter: /labels expected labelled points, got none; give flat points a label or series points a third element [x, y, "name"]']);
  assert.deepEqual(errs("scatter", { series: [{ name: "s", points: [[1, 2, 3]] }] }),
    ["chart scatter: /series/0/points/0/2 expected a point label, got 3"]);
  // Lines points stay pairs: a third element there is still an error.
  assert.ok(errs("lines", { series: [{ name: "s", points: [[1, 2, "a"], [2, 3]] }] }).length > 0);
});

test("a controlled chart draws one panel per state, wired to its inputs, and ships the chart script", () => {
  const { body: html, errors } = page("scatter", SCATTER);
  assert.deepEqual(errors, []);
  // 2 views x 2 x-scales, plus one table per view.
  assert.equal((html.match(/<div class="cv" data-v=/g) ?? []).length, 4);
  assert.equal((html.match(/<div class="cv" data-t /g) ?? []).length, 2);
  assert.match(html, /<input type="radio" class="ct" name="cx3" value="0" checked><span>Cost<\/span>/);
  assert.match(html, /class="co" data-k="log-x">/, "the authored x is linear, so Log x starts off");
  assert.match(html, /class="co" data-k="labels" checked>/);
  assert.match(html, /class="cl" value="1" checked>/);
  assert.match(html, /data-series="1"/);
  assert.match(html, /class="cx-reset" hidden/);
  assert.match(html, /details\.cx-set\[open\]/);
  // One shared legend: panels carry none of their own.
  assert.equal((html.match(/class="legend/g) ?? []).length, 1);
  assert.doesNotMatch(html, /NaN|Infinity/);
});

test("a plain chart is unchanged and a page without controls ships no script", () => {
  const { body: html } = page("bars", { labels: ["a", "b"], values: [1, 2] });
  assert.doesNotMatch(html, /<script>|class="cx/);
});

test("author text in tabs, legends and tables is escaped", () => {
  const evil = "<img src=x onerror=alert(1)>";
  const { html, errors } = page("scatter", {
    ...SCATTER, title: evil,
    series: [{ name: evil, points: [[1, 30, evil], [2, 50]] }, SCATTER.series[1]],
    views: [{ label: evil }, { label: "b", series: [{ name: evil, points: [[1, 3]] }, SCATTER.series[1]] }],
  });
  assert.deepEqual(errors, []);
  assert.doesNotMatch(html, /<img src=x/);
  assert.ok(validateHtml(html, {}).ok);
});

test("the Pareto frontier keeps only points no other beats toward the corner", () => {
  const { html } = page("scatter", { points: [{ x: 1, y: 1 }, { x: 2, y: 3 }, { x: 3, y: 2 }, { x: 4, y: 5 }], pareto: "top-left" });
  const pts = /class="k-pareto" points="([^"]+)"/.exec(html)?.[1].split(" ") ?? [];
  // (1,1), (2,3) and (4,5) each beat everything to their left; (3,2) is beaten by (2,3).
  assert.equal(pts.length, 3);
  // Toward the top right, (4, 5) beats every other point.
  const flipped = page("scatter", { points: [{ x: 1, y: 1 }, { x: 2, y: 3 }, { x: 3, y: 2 }, { x: 4, y: 5 }], pareto: "top-right" });
  assert.equal((/class="k-pareto" points="([^"]+)"/.exec(flipped.html)?.[1].split(" ") ?? []).length, 1);
});

test("sort draws a by-value twin of each panel", () => {
  const { body: html, errors } = page("bars", { labels: ["a", "b", "c"], values: [1, 3, 2], controls: ["sort"] });
  assert.deepEqual(errors, []);
  const val = html.slice(html.indexOf('data-o="val"'));
  assert.ok(val.indexOf(">b<") < val.indexOf(">c<") && val.indexOf(">c<") < val.indexOf(">a<"));
});
