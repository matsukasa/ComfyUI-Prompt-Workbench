import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTagLibrary,
  deleteCategoryEdit,
  deleteTagEdit,
  libraryToExampleData,
  libraryToStoredCatalog,
  reorderTagEdits,
  saveCategoryEdit,
  saveTagEdit,
} from "../web/tag_library.js";

const source = {
  categories: [{
    id: "01-001",
    parent: { en: "Person", ja: "人物" },
    label: { en: "Person / Clothing", ja: "人物 / 服装" },
    items: [
      { prompt: "red dress", translation: { ja: "赤いドレス" } },
      { prompt: "blue dress", translation: { ja: "青いドレス" } },
    ],
  }],
};

test("builds large, medium and small category levels", () => {
  const library = buildTagLibrary(source);
  assert.deepEqual(library.categories.map((item) => item.level), ["large", "medium", "small"]);
  assert.equal(library.tags.length, 2);
  assert.equal(libraryToExampleData(library).categories[0].label.ja, "人物 / 服装 / 一般");
});

test("adds and renames custom categories and tags as compact edits", () => {
  let edits = saveCategoryEdit({}, {
    id: "custom-medium", level: "medium", parentId: "large:person",
    en: "Pose", ja: "ポーズ", custom: true,
  });
  edits = saveCategoryEdit(edits, {
    id: "custom-small", level: "small", parentId: "custom-medium",
    en: "Standing", ja: "立ち姿", custom: true,
  });
  edits = saveTagEdit(edits, {
    id: "custom-tag", categoryId: "custom-small", prompt: "standing", ja: "立っている", custom: true,
  });
  const library = buildTagLibrary(source, edits);
  assert.equal(library.categories.find((item) => item.id === "custom-small").ja, "立ち姿");
  assert.equal(library.tags.find((item) => item.id === "custom-tag").prompt, "standing");
});

test("category deletion requires a destination and moves descendant tags", () => {
  const library = buildTagLibrary(source);
  const medium = library.categories.find((item) => item.level === "medium");
  const small = library.categories.find((item) => item.level === "small");
  let edits = saveCategoryEdit({}, {
    id: "destination", level: "small", parentId: medium.id,
    en: "Archive", ja: "移動先", custom: true,
  });
  assert.throws(() => deleteCategoryEdit(source, edits, small.id), /移動先/);
  edits = deleteCategoryEdit(source, edits, small.id, "destination");
  const updated = buildTagLibrary(source, edits);
  assert.equal(updated.tags.length, 2);
  assert.ok(updated.tags.every((tag) => tag.categoryId === "destination"));
});

test("tag deletion hides a built-in tag without copying the full library", () => {
  const tag = buildTagLibrary(source).tags[0];
  const edits = deleteTagEdit({}, tag);
  assert.equal(buildTagLibrary(source, edits).tags.length, 1);
  assert.equal(edits.tags.length, 1);
});

test("reorders tags within a small category and persists the display order", () => {
  const library = buildTagLibrary(source);
  const [first, second] = library.tags;
  const edits = reorderTagEdits({}, library.tags, second.id, first.id, "before");
  const reordered = buildTagLibrary(source, edits);
  assert.deepEqual(reordered.tags.map((tag) => tag.prompt), ["blue dress", "red dress"]);
  assert.deepEqual(reordered.tags.map((tag) => tag.order), [0, 1]);
});

test("normalizes the nested Danbooru catalog without exposing audit metadata", () => {
  const catalog = { major_categories: [{ id: "appearance", label_ja: "外見", medium_categories: [{
    id: "hair", label_ja: "髪", small_categories: [{
      id: "hair-style", label_ja: "髪型", tags: [
        { id: 10, name: "long_hair", translation_ja: "長い髪", post_count: 1000, aliases: ["longhair"], rank: 1 },
        { id: 11, name: "short_hair", post_count: 900, rank: 2 },
      ],
    }],
  }] }] };
  const library = buildTagLibrary(catalog);
  assert.deepEqual(library.categories.map((item) => item.ja), ["外見", "髪", "髪型"]);
  assert.deepEqual(library.tags.map((item) => item.prompt), ["long_hair", "short_hair"]);
  assert.equal(library.tags[0].ja, "長い髪");
  assert.equal(library.tags[0].postCount, 1000);
  assert.deepEqual(library.tags[0].aliases, ["longhair"]);
  assert.ok(library.tags.every((item) => !("post_count" in item) && !("rank" in item)));
});

test("drops obsolete built-in edits and moves orphaned custom tags to user-defined", () => {
  const catalog = { major_categories: [{ id: "new", label_ja: "新分類", medium_categories: [{
    id: "new-medium", label_ja: "中分類", small_categories: [{ id: "new-small", label_ja: "小分類", tags: [] }],
  }] }] };
  const edits = {
    categories: [{ id: "large:person", level: "large", parentId: "", en: "Old", ja: "旧分類", custom: false }],
    tags: [{ id: "custom-tag", categoryId: "small:old:general", prompt: "my_tag", ja: "独自", custom: true }],
  };
  const library = buildTagLibrary(catalog, edits);
  assert.equal(library.categories.some((item) => item.id === "large:person"), false);
  assert.equal(library.categories.some((item) => item.id === "custom:root" && item.ja === "ユーザー定義"), true);
  assert.equal(library.tags.find((item) => item.id === "custom-tag")?.categoryId, "custom:small");
});

test("stored catalog round-trip preserves hierarchy, order, and Japanese translations", () => {
  let edits = saveCategoryEdit({}, {
    id: "custom-small", level: "small", parentId: "medium:01-001",
    en: "Saved", ja: "保存済み", custom: true,
  });
  edits = saveTagEdit(edits, {
    id: "custom-tag", categoryId: "custom-small", prompt: "saved_tag", ja: "保存タグ", custom: true,
  });
  const original = buildTagLibrary(source, edits);
  const restored = buildTagLibrary(libraryToStoredCatalog(original));
  assert.deepEqual(
    restored.categories.map(({ id, level, parentId, en, ja }) => ({ id, level, parentId, en, ja })),
    original.categories.map(({ id, level, parentId, en, ja }) => ({ id, level, parentId, en, ja })),
  );
  assert.deepEqual(
    restored.tags.map(({ id, categoryId, prompt, ja, order }) => ({ id, categoryId, prompt, ja, order })),
    original.tags.map(({ id, categoryId, prompt, ja }, order) => ({ id, categoryId, prompt, ja, order })),
  );
});
