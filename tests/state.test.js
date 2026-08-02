import assert from "node:assert/strict";
import test from "node:test";
import { createTag, outputPrompt } from "../web/prompt_parser.js";
import { exportEditorState, parseImportedState } from "../web/settings.js";

test("editor state round-trips disabled tags", () => {
  const state = {
    tags: [createTag("masterpiece"), createTag("draft", { enabled: false })],
    settings: { weightStep: 0.1, outputLanguage: "en" },
  };
  const restored = parseImportedState(exportEditorState(state));
  assert.equal(restored.tags[1].enabled, false);
  assert.equal(outputPrompt(restored.tags), "masterpiece");
});

test("translated output is used only when it matches selected output language", () => {
  const tag = createTag("傑作", { translation: "masterpiece", translatedTo: "en" });
  assert.equal(outputPrompt([tag], "en"), "masterpiece");
  assert.equal(outputPrompt([tag], "ja"), "傑作");
});

test("import rejects unsupported schema and oversized input", () => {
  assert.throws(() => parseImportedState('{"version":1}'), /Unsupported/);
  assert.throws(() => parseImportedState("x".repeat(1024 * 1024 + 1)), /1 MB/);
});

test("null-like translation text is hidden and never becomes prompt output", () => {
  const state = {
    tags: [createTag("loli", { translation: "loli null", translatedTo: "en" })],
    settings: { outputLanguage: "en" },
  };
  const restored = parseImportedState(exportEditorState(state));
  assert.equal(restored.tags[0].translation, "loli");
  assert.equal(outputPrompt(restored.tags, "en"), "loli");
});

test("translation display preference round-trips with editor state", () => {
  const state = {
    tags: [],
    settings: { translationDisplay: "both" },
  };
  const restored = parseImportedState(exportEditorState(state));
  assert.equal(restored.settings.translationDisplay, "both");
});

test("selected tag catalog filename round-trips without a path or extension", () => {
  const restored = parseImportedState(exportEditorState({
    tags: [],
    settings: { libraryFile: "私のタグ.json" },
  }));
  assert.equal(restored.settings.libraryFile, "私のタグ");
});

test("tag browser height round-trips and is clamped", () => {
  const tall = parseImportedState(exportEditorState({ tags: [], settings: { exampleListHeight: 360 } }));
  const oversized = parseImportedState(exportEditorState({ tags: [], settings: { exampleListHeight: 9999 } }));
  assert.equal(tall.settings.exampleListHeight, 360);
  assert.equal(oversized.settings.exampleListHeight, 520);
});

test("legacy editor state imports only the former positive prompt", () => {
  const restored = parseImportedState(JSON.stringify({
    schema: "prompt-all-in-one/editor-state",
    version: 1,
    state: { positive: [createTag("masterpiece")], negative: [createTag("low quality")] },
  }));
  assert.equal(outputPrompt(restored.tags), "masterpiece");
});

test("stored legacy null suffix migrates to disabled state", () => {
  const restored = parseImportedState(exportEditorState({
    tags: [{ value: "1girl null", enabled: true }],
  }));
  assert.equal(restored.tags[0].value, "1girl");
  assert.equal(restored.tags[0].enabled, false);
});
