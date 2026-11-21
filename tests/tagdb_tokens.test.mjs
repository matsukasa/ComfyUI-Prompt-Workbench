import test from "node:test";
import assert from "node:assert/strict";
import { promptTokenAt, shouldSearchTagDb, tagDbKey } from "../web/tagdb.js";

test("promptTokenAt returns the tag being typed", () => {
  assert.deepEqual(promptTokenAt("1girl, long ha", 14), { start: 7, end: 14, text: "long ha" });
  assert.deepEqual(promptTokenAt("(long ha", 8), { start: 1, end: 8, text: "long ha" });
  assert.deepEqual(promptTokenAt("a,\nblue", 7), { start: 3, end: 7, text: "blue" });
  assert.equal(promptTokenAt("long hair, solo", 4).text, "long");
});

test("shouldSearchTagDb skips prompt syntax and single latin letters", () => {
  assert.equal(shouldSearchTagDb("l"), false);
  assert.equal(shouldSearchTagDb("lo"), true);
  assert.equal(shouldSearchTagDb("虎"), true);
  assert.equal(shouldSearchTagDb("<lora:x"), false);
  assert.equal(shouldSearchTagDb("long hair:1.2"), false);
  assert.equal(shouldSearchTagDb("{a|b"), false);
  assert.equal(shouldSearchTagDb("  "), false);
});

test("tagDbKey treats underscores and spaces alike", () => {
  assert.equal(tagDbKey("Long_Hair"), "long hair");
  assert.equal(tagDbKey(" long  hair "), "long hair");
});
