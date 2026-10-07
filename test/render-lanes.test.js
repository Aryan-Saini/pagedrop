import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parseMarkdown } from "../src/render/index.js";
import { validateDoc, formatError } from "../src/render/schema/index.js";
import { validate, normalize, render } from "../src/render/diagrams/lanes.js";

/** Diagnostics for one fence body, message text only. */
const errs = (data) => {
  const out = [];
  validate(out, { data, line: 1 }, "t.md");
  return out.map((e) => e.message);
};

const lane = (name, segs) => ({ name, segs });
const seg = (from, to, extra = {}) => ({ from, to, ...extra });
const two = () => [lane("A", [seg(0, 4)]), lane("B", [seg(1, 5)])];

test("the example document validates clean", () => {
  const file = fileURLToPath(new URL("../examples/diagrams/lanes.md", import.meta.url));
  const { doc, errors } = parseMarkdown(readFileSync(file, "utf8"), { file });
  assert.deepEqual(errors, []);
  assert.deepEqual(validateDoc(doc, { file }).map(formatError), []);
});

test("a good body has nothing to say", () => {
  assert.deepEqual(errs({ lanes: two(), msgs: [{ from: { lane: "A", t: 1 }, to: { lane: "B", t: 2 }, label: "m", step: 1 }], axis: "t" }), []);
});

test("shape errors: missing lanes, unknown keys, bad state", () => {
  assert.deepEqual(errs({}), ["/lanes expected at least one lane, got nothing"]);
  assert.deepEqual(errs({ lanes: two(), colour: 1 }), ['/colour unknown key "colour"; keys: title note compact axis lanes msgs']);
  assert.deepEqual(errs({ lanes: [lane("A", [seg(0, 1, { state: "asleep" })])] }),
    ['/lanes/0/segs/0/state expected one of busy send recv blocked idle, got "asleep"']);
});

test("lane names must be unique", () => {
  assert.deepEqual(errs({ lanes: [lane("A", [seg(0, 1)]), lane("A", [seg(0, 1)])] }),
    ['/lanes/1/name duplicate lane name "A"; a message addresses a lane by name']);
});

test("segments need from < to and must not overlap within a lane", () => {
  assert.deepEqual(errs({ lanes: [lane("A", [seg(2, 2)])] }), ["/lanes/0/segs/0 expected from < to, got from 2 and to 2"]);
  assert.deepEqual(errs({ lanes: [lane("A", [seg(3, 6), seg(0, 4)])] }),
    ["/lanes/0/segs/0 overlaps segs/1 (0 to 4); segments in one lane must not overlap"]);
  // Touching ends are fine.
  assert.deepEqual(errs({ lanes: [lane("A", [seg(0, 3), seg(3, 6)])] }), []);
});

test("messages must name real lanes and stay inside the extent", () => {
  const m = (from, to) => ({ lanes: two(), msgs: [{ from, to }] });
  assert.deepEqual(errs(m({ lane: "A", t: 1 }, { lane: "C", t: 2 })), ['/msgs/0/to/lane no lane named "C"; lanes: A B']);
  assert.deepEqual(errs(m({ lane: "A", t: 1 }, { lane: "B", t: 9 })), ["/msgs/0/to/t expected a time from 0 to 5 (the lanes' extent), got 9"]);
  assert.deepEqual(errs(m({ lane: "A", t: 1 }, { lane: "A", t: 2 })), ['/msgs/0 expected two different lanes, got "A" at both ends']);
  assert.deepEqual(errs({ lanes: two(), msgs: [{ from: { lane: "A", t: 1 }, to: { lane: "B", t: 2 }, step: 0 }] }),
    ["/msgs/0/step expected a positive integer, got 0"]);
});

test("normalize fills state, labels, msgs and flags", () => {
  const d = normalize({ lanes: [lane("A", [seg(0, 1)])] });
  assert.deepEqual(d, {
    title: "", note: "", compact: false, axis: "",
    lanes: [{ name: "A", segs: [{ from: 0, to: 1, label: "", state: "busy" }] }], msgs: [],
  });
});

test("render draws one bar per segment, one arrow per message, and drops labels that do not fit", () => {
  const data = normalize({
    lanes: [
      lane("P1", [seg(0, 0.1, { label: "far too long to fit" }), seg(0.1, 10, { label: "busy", state: "send" })]),
      lane("P2", [seg(0, 10, { state: "blocked" })]),
    ],
    msgs: [{ from: { lane: "P1", t: 2 }, to: { lane: "P2", t: 8 }, label: "hello", step: 3 }],
  });
  const html = render({ data });
  assert.equal((html.match(/<rect /g) ?? []).length, 3);
  assert.equal((html.match(/marker-end=/g) ?? []).length, 1);
  assert.equal((html.match(/<circle /g) ?? []).length, 1, "the step badge");
  assert.ok(!html.includes("far too long"));
  assert.ok(html.includes(">busy<") && html.includes(">hello<"));
  // Send is green (c3), blocked is the bad red.
  assert.ok(html.includes('stroke="#199e70"'));
});

test("axis draws integer ticks across the extent", () => {
  const html = render({ data: normalize({ lanes: [lane("A", [seg(0, 4)])], axis: "time" }) });
  for (const t of [0, 1, 2, 3, 4]) assert.ok(html.includes(`>${t}</text>`), `tick ${t}`);
  assert.ok(html.includes(">time</text>"));
});

test("a segment label moves off a message that crosses its bar", () => {
  const data = normalize({
    lanes: [lane("A", [seg(0, 10)]), lane("B", [seg(0, 10, { label: "blocked" })]), lane("C", [seg(0, 10)])],
    msgs: [{ from: { lane: "A", t: 5 }, to: { lane: "C", t: 5 } }],
  });
  const html = render({ data });
  const labelX = Number(/<text x="([\d.]+)"[^>]*>blocked</.exec(html)?.[1]);
  const msgX = Number(/<path d="M([\d.]+),/.exec(html)?.[1]);
  // "blocked" is about 50px wide in mono 11.5px; its centre must clear the vertical message by half that.
  assert.ok(Math.abs(labelX - msgX) > 28, `label at ${labelX}, message at ${msgX}`);
});
