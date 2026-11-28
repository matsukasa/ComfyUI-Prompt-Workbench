import assert from "node:assert/strict";
import test from "node:test";

import { PromptEditor, applySmartTranslationResult } from "../web/prompt_editor.js";
import { createTag, outputPrompt } from "../web/prompt_parser.js";
import { normalizeTranslationLanguage, sanitizeSettings } from "../web/settings.js";

test("Chinese translation language settings use canonical variant codes", () => {
  assert.equal(normalizeTranslationLanguage("zh"), "zh-CN");
  assert.equal(normalizeTranslationLanguage("zh-Hans"), "zh-CN");
  assert.equal(normalizeTranslationLanguage("zh-Hant"), "zh-TW");

  const simplified = sanitizeSettings({ outputLanguage: "zh", localLanguage: "zh-CN" });
  assert.equal(simplified.outputLanguage, "zh-CN");
  assert.equal(simplified.localLanguage, "zh-CN");

  const traditional = sanitizeSettings({ outputLanguage: "zh-TW", localLanguage: "zh-TW" });
  assert.equal(traditional.outputLanguage, "zh-TW");
  assert.equal(traditional.localLanguage, "zh-TW");
  assert.equal(sanitizeSettings({ outputLanguage: "ko" }).outputLanguage, "en");
});

test("Chinese translations preserve their exact target variant in prompt output", () => {
  const tag = createTag("(soft light:1.20)");
  assert.equal(applySmartTranslationResult(tag, "柔和光线", "zh-CN", "ja"), true);
  assert.equal(tag.translatedTo, "zh-CN");
  assert.equal(outputPrompt([tag], "zh-CN"), "(柔和光线:1.20)");

  const invalid = createTag("soft light");
  assert.equal(applySmartTranslationResult(invalid, "soft lighting", "zh-TW", "ja"), false);
  assert.equal(invalid.translation, "");
});

test("prompt translation canonicalizes Chinese before applying the selected variant", async () => {
  const calls = [];
  const editor = Object.assign(Object.create(PromptEditor.prototype), {
    tags: [createTag("柔和光线"), createTag("back")],
    settings: sanitizeSettings({
      outputLanguage: "zh-TW",
      localLanguage: "zh-TW",
      translationProvider: "local",
    }),
    api: {
      async fetchApi(_path, options) {
        const request = JSON.parse(options.body);
        calls.push({ target: request.target, texts: request.texts });
        const translations = request.target === "en"
          ? ["soft light"]
          : request.texts.map((text) => text === "soft light" ? "柔和光線" : "背部");
        return {
          ok: true,
          async json() {
            return { results: request.texts.map((source, index) => ({ source, translated: translations[index] })) };
          },
        };
      },
    },
    translationGeneration: 0,
    translationBusy: false,
    translationRequestId: 0,
    disposed: false,
    commitPromptBeforeAction() {},
    async loadExampleData() {},
    pushUndo() {},
    setStatus() {},
    applyBlacklist() {},
    syncToWidgets() {},
    render() {},
    persist() {},
  });

  await editor.translatePrompt();

  assert.deepEqual(calls, [
    { target: "en", texts: ["柔和光线"] },
    { target: "zh-TW", texts: ["soft light", "back"] },
  ]);
  assert.equal(editor.tags[0].value, "soft light");
  assert.equal(editor.tags[0].translation, "柔和光線");
  assert.equal(editor.tags[0].translatedTo, "zh-TW");
  assert.equal(editor.tags[1].translation, "背部");
  assert.equal(editor.tags[1].translatedTo, "zh-TW");
});

test("failed translations retry with their original target language", async () => {
  const calls = [];
  const editor = Object.assign(Object.create(PromptEditor.prototype), {
    tags: [
      createTag("a", { translationError: "failed", translationErrorTarget: "zh-CN" }),
      createTag("b", { translationError: "failed", translationErrorTarget: "zh-TW" }),
      createTag("c", { translationError: "failed", translationErrorTarget: "en" }),
    ],
    settings: sanitizeSettings({ localLanguage: "ja" }),
    setStatus() {},
    async translateIndexes(indexes, target) { calls.push({ indexes, target }); },
  });

  await editor.retryFailedTranslations();
  assert.deepEqual(calls, [
    { indexes: [0], target: "zh-CN" },
    { indexes: [1], target: "zh-TW" },
    { indexes: [2], target: "en" },
  ]);
});
