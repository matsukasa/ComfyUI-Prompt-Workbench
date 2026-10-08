import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { categoryBaseColor, categoryColorId, categoryPalette, defaultCategoryColor, majorCategory,
  sanitizeCategoryColors, tagCategoryIndex, categoryPromptKey } from "../web/category_colors.js";
import { buildTagLibrary, libraryToBundledCatalog } from "../web/tag_library.js";
import { buildTagSetLibrary } from "../web/tag_sets.js";
import { sanitizeSettings, sanitizeEditorState } from "../web/settings.js";
const catalog = JSON.parse(readFileSync(new URL("../data/tag_catalog.json", import.meta.url)));
const sets = JSON.parse(readFileSync(new URL("../data/tag_sets.json", import.meta.url)));

test("actual catalogue and set major IDs are stable, independent of ordering", () => {
  for (const [source, build, field] of [[catalog, buildTagLibrary, "tags"], [sets, buildTagSetLibrary, "sets"]]) {
    const library = build(source);
    const reordered = build({ ...source, major_categories: [...source.major_categories].reverse() });
    for (const item of library[field]) {
      const id = categoryColorId(majorCategory(library, item.categoryId));
      const other = reordered[field].find((candidate) => candidate.id === item.id);
      assert.equal(categoryColorId(majorCategory(reordered, other.categoryId)), id);
      assert.equal(defaultCategoryColor(id), defaultCategoryColor(categoryColorId(majorCategory(reordered, other.categoryId))));
    }
  }
});
test("unknown, aliases, underscore variations, ambiguous tags and cycles are safe", () => {
  const library = { categories: [{ id: "a", level: "large" }, { id: "b", level: "large" }],
    tags: [{ categoryId: "a", prompt: "long_hair", aliases: ["long hair alias"] }, { categoryId: "a", prompt: "shared" }, { categoryId: "b", prompt: "shared" }] };
  const index = tagCategoryIndex(library);
  assert.equal(index.get(categoryPromptKey(" LONG HAIR ")), "a");
  assert.equal(index.get("long hair alias"), "a");
  assert.equal(index.get("shared"), "");
  assert.equal(categoryColorId({ id: "whatever", ja: "未分類" }), "");
  assert.equal(majorCategory({ categories: [{ id: "x", parentId: "x" }] }, "x"), null);
  assert.equal(categoryBaseColor("", null), "#b2b9c0");
});
test("saved overrides round trip, corruption resets only that entry and defaults stay separate", () => {
  const colors = { overrides: { a: "#ABCDEF", b: "broken" }, unknown: "#010203" };
  const settings = sanitizeSettings({ weightStep: 0.25, categoryColors: colors });
  assert.deepEqual(settings.categoryColors, { overrides: { a: "#abcdef" }, unknown: "#010203" });
  assert.equal(settings.weightStep, 0.25);
  assert.deepEqual(sanitizeEditorState({ settings }).settings.categoryColors, settings.categoryColors);
  assert.equal(categoryBaseColor("b", settings.categoryColors), defaultCategoryColor("b"));
  assert.deepEqual(sanitizeCategoryColors(null), { overrides: {}, unknown: null });
  assert.equal(categoryBaseColor("new-id", settings.categoryColors), defaultCategoryColor("new-id"));
  assert.equal(JSON.stringify(libraryToBundledCatalog(buildTagLibrary(catalog), catalog)).includes('"categoryColors"'), false);
});
function luminance(color) {
  const values = [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
}
test("both themes preserve text contrast for extreme colours, defaults and hover states", () => {
  for (const color of ["#000000", "#ffffff", "#ff0000", "#00ff00", "#0000ff", "#ffff00", ...catalog.major_categories.map((major) => defaultCategoryColor(major.id))]) {
    for (const palette of Object.values(categoryPalette(color))) {
      for (const role of ["background", "hover"]) {
        const values = [luminance(palette.ink), luminance(palette[role])].sort((a, b) => b - a);
        assert.ok((values[0] + 0.05) / (values[1] + 0.05) >= 4.5, `${color} ${role}`);
      }
    }
  }
});
