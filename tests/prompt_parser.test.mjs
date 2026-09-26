import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const parserSource = await readFile(new URL("../web/prompt_parser.js", import.meta.url), "utf8");
const { canonicalTagKey, findDuplicateKeys } = await import(
  `data:text/javascript;base64,${Buffer.from(parserSource).toString("base64")}`
);

test("canonicalTagKey removes balanced attention and explicit weights", () => {
  assert.equal(canonicalTagKey(" ((Cat:1.25)) "), "cat");
  assert.equal(canonicalTagKey("[CAT]"), "cat");
});

test("canonicalTagKey preserves delimiters that do not wrap the entire tag", () => {
  assert.equal(canonicalTagKey("(cat), (dog)"), "(cat), (dog)");
  assert.equal(canonicalTagKey("(cat), (dog:1.20)"), "(cat), (dog:1.20)");
});

test("duplicate detection does not collide wrapped lists with literal text", () => {
  const duplicates = findDuplicateKeys([
    { value: "(cat), (dog:1.20)" },
    { value: "cat), (dog" },
  ]);

  assert.deepEqual([...duplicates], []);
});
