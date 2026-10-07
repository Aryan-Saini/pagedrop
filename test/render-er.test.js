import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parseMarkdown } from "../src/render/index.js";
import { validateDoc, formatError } from "../src/render/schema/index.js";
import { validate, normalize, render, place } from "../src/render/diagrams/er.js";

/** Diagnostics for one fence body, message text only. */
const errs = (data) => {
  const out = [];
  validate(out, { data, line: 1 }, "t.md");
  return out.map((e) => e.message);
};

const users = { name: "users", fields: [{ name: "id", type: "uuid", key: "pk" }, ["email", "text"]] };
const posts = { name: "posts", fields: [{ name: "id", type: "uuid", key: "pk" }, { name: "user_id", type: "uuid", key: "fk" }] };

test("the example document validates clean", () => {
  const file = fileURLToPath(new URL("../examples/diagrams/er.md", import.meta.url));
  const { doc, errors } = parseMarkdown(readFileSync(file, "utf8"), { file });
  assert.deepEqual(errors, []);
  assert.deepEqual(validateDoc(doc, { file }).map(formatError), []);
});

test("entities and fields are checked", () => {
  assert.deepEqual(errs({ entities: [users, users] }), ['/entities/1/name duplicate table "users"; a link addresses a table by name']);
  assert.deepEqual(errs({ entities: [{ name: "t", fields: [["id"]] }] }), ["/entities/0/fields/0 expected [name, type], got an array of 1"]);
  assert.deepEqual(errs({ entities: [{ name: "t", fields: [{ name: "id", type: "int", key: "uk" }] }] }),
    ['/entities/0/fields/0/key expected one of pk fk, got "uk"']);
  assert.deepEqual(errs({ entities: [{ name: "t", fields: [["id", "int"], ["id", "text"]] }] }),
    ['/entities/0/fields/1 duplicate field "id" in "t"']);
});

test("link references must name real tables and fields, listing the valid ones", () => {
  const e = (from, to, card) => errs({ entities: [users, posts], links: [{ from, to, ...(card ? { card } : {}) }] });
  assert.deepEqual(e("posts.user_id", "users.id"), []);
  assert.deepEqual(e("post.user_id", "users.id"), ['/links/0/from no table named "post"; tables: users posts']);
  assert.deepEqual(e("posts.user_id", "users.uid"), ['/links/0/to no field "uid" in "users"; fields: id email']);
  assert.deepEqual(e("posts", "users.id"), ['/links/0/from expected "table.field", got "posts"']);
  assert.deepEqual(e("posts.user_id", "users.id", "many"), ['/links/0/card expected a cardinality like "N:1" or "1:1", got "many"']);
});

test("normalize turns tuples into fields and splits references", () => {
  const d = normalize({ entities: [users, posts], links: [{ from: "posts.user_id", to: "users.id" }] });
  assert.deepEqual(d.entities[0].fields[1], { name: "email", type: "text", key: "" });
  assert.deepEqual(d.links[0], { from: { table: "posts", field: "user_id" }, to: { table: "users", field: "id" }, card: "N:1" });
});

test("place wraps after three per row", () => {
  const ents = ["a", "b", "c", "d"].map((name) => ({ name, fields: [["id", "int"]] }));
  const { at } = place(normalize({ entities: ents }));
  assert.deepEqual(["a", "b", "c", "d"].map((k) => [at.get(k)?.row, at.get(k)?.col]), [[0, 0], [0, 1], [0, 2], [1, 0]]);
});

test("render: a box per table, a path per link, cards at both ends, keys tagged", () => {
  const html = render({ data: normalize({ entities: [users, posts], links: [{ from: "posts.user_id", to: "users.id", card: "N:1" }] }) });
  assert.equal((html.match(/<rect /g) ?? []).length, 2);
  assert.equal((html.match(/<path /g) ?? []).length, 1);
  assert.ok(html.includes(">N</text>") && html.includes(">1</text>"));
  assert.equal((html.match(/>PK</g) ?? []).length, 2);
  assert.equal((html.match(/>FK</g) ?? []).length, 1);
});

test("a link two columns apart routes above the grid, never through the middle box", () => {
  const ents = ["a", "b", "c"].map((name) => ({ name, fields: [["id", "int"], ["ref", "int"]] }));
  const d = normalize({ entities: ents, links: [{ from: "a.ref", to: "c.id" }] });
  const { at } = place(d);
  const html = render({ data: d });
  const path = /<path d="([^"]+)"/.exec(html)?.[1] ?? "";
  const ys = [...path.matchAll(/[\d.-]+,([\d.-]+)/g)].map((m) => Number(m[1]));
  const vs = [...path.matchAll(/V([\d.-]+)/g)].map((m) => Number(m[1]));
  // Its horizontal run sits above every box.
  assert.ok(Math.min(...ys, ...vs) < Math.min(...[...at.values()].map((p) => p.y)));
  // It leaves a on its left side and enters c on its right side.
  const b = /** @type {any} */ (at.get("c"));
  assert.ok(path.startsWith(`M${at.get("a")?.x},`));
  assert.ok(path.endsWith(`H${b.x + b.w}`));
});
