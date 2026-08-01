import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTagLibrary,
  deleteCategoryEdit,
  deleteTagEdit,
  libraryToExampleData,
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
