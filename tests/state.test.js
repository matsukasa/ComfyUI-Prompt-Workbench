import assert from "node:assert/strict";
import test from "node:test";
import { createTag, outputPrompt } from "../web/prompt_parser.js";
import { exportEditorState, parseImportedState } from "../web/settings.js";

test("editor state round-trips disabled tags and positive/negative separation", () => {
  const state = {
    activeSide: "negative",
    positive: [createTag("masterpiece"), createTag("draft", { enabled: false })],
    negative: [createTag("low quality")],
    settings: { weightStep: 0.1, outputLanguage: "en" },
  };
  const restored = parseImportedState(exportEditorState(state));
  assert.equal(restored.positive[1].enabled, false);
  assert.equal(outputPrompt(restored.positive), "masterpiece");
  assert.equal(outputPrompt(restored.negative), "low quality");
  assert.equal(restored.activeSide, "negative");
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
