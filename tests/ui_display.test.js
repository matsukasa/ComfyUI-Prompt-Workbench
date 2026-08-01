import assert from "node:assert/strict";
import test from "node:test";
import { appendPresentChildren, cleanTranslation, getTagDisplayText } from "../web/prompt_editor.js";

test("tag button never displays null tokens from a composite translation", () => {
  const tag = { value: "1girl", translation: "1girl null", translatedTo: "ja" };
  assert.equal(cleanTranslation(tag.translation), "1girl");
  assert.deepEqual(
    getTagDisplayText(tag, { translationDisplay: "local", localLanguage: "ja" }),
    { primary: "1girl", secondary: "" },
  );
  assert.deepEqual(
    getTagDisplayText(tag, { translationDisplay: "both", localLanguage: "ja" }),
    { primary: "1girl", secondary: "" },
  );
});

test("tag button never displays a standalone null translation", () => {
  const tag = { value: "1girl", translation: "null", translatedTo: "ja" };
  assert.deepEqual(
    getTagDisplayText(tag, { translationDisplay: "local", localLanguage: "ja" }),
    { primary: "1girl", secondary: "" },
  );
});

test("missing optional tag controls never append literal null text", () => {
  const appended = [];
  const parent = { append: (...children) => appended.push(...children) };
  appendPresentChildren(parent, "1girl", null, undefined);
  assert.deepEqual(appended, ["1girl"]);
});
