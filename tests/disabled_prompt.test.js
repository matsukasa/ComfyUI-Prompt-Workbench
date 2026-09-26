import assert from "node:assert/strict";
import test from "node:test";
import { PromptEditor } from "../web/prompt_editor.js";
import { createTag } from "../web/prompt_parser.js";
import { sanitizeSettings } from "../web/settings.js";

const noop = () => {};
function editor(tags) {
  const result = Object.assign(Object.create(PromptEditor.prototype), {
    tags, settings: sanitizeSettings({ autoTranslate: false }),
    node: { properties: {}, widgets: [] }, widgets: { prompt: { value: "" } },
    undoStack: [], redoStack: [], promptDirty: false, trailingSeparator: false,
    translationGeneration: 0, promptTextarea: { value: "" },
    applyCustomColors: noop, renderTranslationControls: noop, renderBulk: noop,
    renderTags: noop, rebuildControls: noop, setStatus: noop,
  });
  result.syncToWidgets();
  result.render();
  return result;
}
function applyText(target, text) {
  target.promptTextarea.value = text;
  target.promptDirty = true;
  target.applyPromptText();
}

test("single and bulk toggles update the body and retain disabled rows", () => {
  const e = editor([createTag("cat"), createTag("dog"), createTag("bird")]);
  const ids = e.tags.map(tag => tag.id);
  e.toggleOne(1);
  assert.equal(e.promptTextarea.value, "cat, bird");
  assert.equal(e.widgets.prompt.value, "cat, bird,");
  assert.deepEqual(e.tags.map(tag => tag.id), ids);
  e.toggleOne(1);
  assert.equal(e.promptTextarea.value, "cat, dog, bird");
  e.tags.forEach(tag => { tag.selected = true; });
  e.bulkMutate(tag => { tag.enabled = false; });
  assert.equal(e.promptTextarea.value, "");
  assert.equal(e.widgets.prompt.value, "");
  assert.equal(e.tags.length, 3);
  e.bulkMutate(tag => { tag.enabled = true; });
  assert.equal(e.promptTextarea.value, "cat, dog, bird");
});

test("applying edited text retains disabled metadata and creates enabled same-name tags", () => {
  const hidden = createTag("(dog:1.20)", {
    enabled: false, selected: true, translation: "hound", translatedTo: "en", lineBreakAfter: 2,
  });
  const saved = structuredClone(hidden);
  const e = editor([createTag("cat"), hidden, createTag("bird")]);
  applyText(e, "cat, (dog:1.20), bird,");
  assert.deepEqual(e.tags.find(tag => tag.id === hidden.id), saved);
  const added = e.tags.find(tag => tag.value === hidden.value && tag.enabled);
  assert.ok(added);
  assert.notEqual(added.id, hidden.id);
  assert.equal(e.promptTextarea.value, "cat, (dog:1.20), bird,");
  applyText(e, "");
  assert.deepEqual(e.tags, [saved]);
  assert.equal(e.promptTextarea.value, "");
  e.toggleOne(0);
  assert.equal(e.promptTextarea.value, "(dog:1.20)\n\n");
});

test("disabled tags anchor to surviving following IDs after reordering and deletion", () => {
  const tags = [createTag("a"), createTag("hidden1", { enabled: false }),
    createTag("hidden2", { enabled: false }), createTag("b"),
    createTag("hidden3", { enabled: false }), createTag("c"),
    createTag("hidden4", { enabled: false })];
  const e = editor(tags);
  applyText(e, "c, a");
  assert.deepEqual(e.tags.map(tag => tag.value), ["hidden1", "hidden2", "hidden3", "c", "a", "hidden4"]);
  applyText(e, "new");
  assert.deepEqual(e.tags.map(tag => tag.value), ["new", "hidden1", "hidden2", "hidden3", "hidden4"]);
  assert.deepEqual(e.tags.slice(1).map(tag => tag.id), tags.filter(tag => !tag.enabled).map(tag => tag.id));
});

test("repeated enabled values retain their IDs without consuming a disabled same-name tag", () => {
  const a = createTag("cat"), hidden = createTag("cat", { enabled: false }), b = createTag("cat");
  const e = editor([a, hidden, b]);
  applyText(e, "cat, cat, dog");
  assert.deepEqual(e.tags.slice(0, 3).map(tag => tag.id), [a.id, hidden.id, b.id]);
  assert.equal(e.promptTextarea.value, "cat, cat, dog");
});

test("pending text is applied before toggling a hidden row by its ID", () => {
  const hidden = createTag("dog", { enabled: false });
  const e = editor([createTag("cat"), hidden, createTag("bird")]);
  e.promptTextarea.value = "bird, cat, fish";
  e.promptDirty = true;
  e.toggleOne(1);
  assert.equal(e.promptDirty, false);
  assert.equal(e.tags.find(tag => tag.id === hidden.id).enabled, true);
  assert.equal(e.promptTextarea.value, "dog, bird, cat, fish");
});

test("body line breaks, undo, redo and workflow restore preserve disabled tags", () => {
  const e = editor([createTag("cat", { lineBreakAfter: 1 }), createTag("dog"), createTag("bird")]);
  e.trailingSeparator = true;
  e.toggleOne(1);
  assert.equal(e.promptTextarea.value, "cat,\nbird,");
  applyText(e, "cat,\n\nbird, fish,");
  assert.equal(e.promptTextarea.value, "cat,\n\nbird, fish,");
  assert.equal(e.tags.find(tag => tag.value === "dog").enabled, false);
  e.undo();
  assert.equal(e.promptTextarea.value, "cat,\nbird,");
  e.undo();
  assert.equal(e.promptTextarea.value, "cat,\ndog, bird,");
  e.redo();
  e.redo();
  assert.equal(e.promptTextarea.value, "cat,\n\nbird, fish,");
  const restored = editor([]);
  restored.node.properties = JSON.parse(JSON.stringify(e.node.properties));
  restored.widgets.prompt.value = e.widgets.prompt.value;
  restored.restore();
  restored.render();
  assert.deepEqual(restored.tags.map(tag => [tag.id, tag.value, tag.enabled]), e.tags.map(tag => [tag.id, tag.value, tag.enabled]));
  assert.equal(restored.promptTextarea.value, e.promptTextarea.value);
});
