import test from "node:test";
import assert from "node:assert/strict";
import { sortExampleTags } from "../web/tag_library.js";
import { sortTagSets, tagSetUsageKey } from "../web/tag_sets.js";
import { sanitizeEditorState, sanitizeSettings } from "../web/settings.js";

test("tag sort preserves the source and orders popularity and names stably", () => {
  const tags = [
    { prompt: "zebra", postCount: 4 },
    { prompt: "Tag10", postCount: 7 },
    { prompt: "tag2", postCount: 7 },
    { prompt: "alpha" },
    { prompt: "zero", postCount: 0 },
  ];
  const names = (items) => items.map((item) => item.prompt);
  assert.deepEqual(names(sortExampleTags(tags)), ["zebra", "Tag10", "tag2", "alpha", "zero"]);
  assert.deepEqual(names(sortExampleTags(tags, "popular")), ["Tag10", "tag2", "zebra", "zero", "alpha"]);
  assert.deepEqual(names(sortExampleTags(tags, "alphabetical")), ["alpha", "tag2", "Tag10", "zebra", "zero"]);
  assert.equal(tags[0].prompt, "zebra");
});

test("tag set usage sort is file-specific and preserves ties and source order", () => {
  const sets = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  const usage = { [tagSetUsageKey("one", "c")]: 2, [tagSetUsageKey("one", "b")]: 2,
    [tagSetUsageKey("two", "a")]: 9 };
  assert.deepEqual(sortTagSets(sets, "popular", usage, "one").map((item) => item.id), ["b", "c", "a", "d"]);
  assert.deepEqual(sortTagSets(sets, "default", usage, "one"), sets);
  assert.deepEqual(sets.map((item) => item.id), ["a", "b", "c", "d"]);
});

test("sort preferences and usage survive state restoration with invalid values handled", () => {
  const usageKey = tagSetUsageKey("file", "set");
  const settings = sanitizeSettings({ exampleSortOrder: "alphabetical", tagSetSortOrder: "popular",
    tagSetUsage: { [usageKey]: 3, negative: -1, fractional: 1.5, huge: 999999999 } });
  assert.deepEqual(sanitizeEditorState({ settings }).settings.tagSetUsage, { [usageKey]: 3, huge: 1000000 });
  assert.equal(sanitizeEditorState({ settings }).settings.exampleSortOrder, "alphabetical");
  assert.equal(sanitizeEditorState({ settings }).settings.tagSetSortOrder, "popular");
  const fallback = sanitizeSettings({ exampleSortOrder: "bad", tagSetSortOrder: "alphabetical", tagSetUsage: [] });
  assert.equal(fallback.exampleSortOrder, "default");
  assert.equal(fallback.tagSetSortOrder, "default");
  assert.deepEqual(fallback.tagSetUsage, {});
});
