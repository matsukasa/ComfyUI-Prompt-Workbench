import assert from "node:assert/strict";
import test from "node:test";
import { cleanTranslation, getTagDisplayText } from "../web/prompt_editor.js";

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
