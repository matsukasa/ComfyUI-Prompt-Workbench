import assert from "node:assert/strict";
import test from "node:test";
import { compileBlacklist, matchesBlacklist } from "../web/prompt_parser.js";

test("supports exact, case-insensitive, substring and regex rules", () => {
  const rules = compileBlacklist([
    { mode: "exact", pattern: "bad" },
    { mode: "iexact", pattern: "NOISY" },
    { mode: "contains", pattern: "artifact" },
    { mode: "regex", pattern: "^water(mark)?$" },
  ]);
  assert.equal(matchesBlacklist("bad", rules), true);
  assert.equal(matchesBlacklist("noisy", rules), true);
  assert.equal(matchesBlacklist("jpeg artifact", rules), true);
  assert.equal(matchesBlacklist("watermark", rules), true);
  assert.equal(matchesBlacklist("good", rules), false);
});

test("invalid and suspicious regex rules do not execute", () => {
  const invalid = compileBlacklist([{ mode: "regex", pattern: "[" }]);
  const nested = compileBlacklist([{ mode: "regex", pattern: "(a+)+$" }]);
  assert.ok(invalid[0].error);
  assert.ok(nested[0].error);
  assert.equal(matchesBlacklist("aaaa", nested), false);
});
