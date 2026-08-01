import assert from "node:assert/strict";
import test from "node:test";
import {
  adjustTagWeight,
  classifyTag,
  parsePrompt,
  serializePrompt,
  splitPrompt,
} from "../web/prompt_parser.js";

const values = (text) => parsePrompt(text).tags.map((tag) => tag.value);

test("parses ordinary comma-separated tags", () => {
  assert.deepEqual(values("1girl, solo"), ["1girl", "solo"]);
});

test("preserves nested brackets and explicit weight", () => {
  assert.deepEqual(values("(masterpiece:1.2), ((detailed eyes)), [background:0.8]"), [
    "(masterpiece:1.2)",
    "((detailed eyes))",
    "[background:0.8]",
  ]);
});

test("recognizes LoRA, LyCORIS, wildcard and dynamic prompt syntax", () => {
  assert.deepEqual(
    ["<lora:model_name:0.8>", "<lyco:model_name:1.0>", "__weather__", "{red|blue|green}"].map(classifyTag),
    ["lora", "lycoris", "wildcard", "dynamic"],
  );
});

test("does not split commas in brackets or quotes", () => {
  assert.deepEqual(values('(face, eyes:1.2), "red, blue", [a,{b,c}:0.8]'), [
    "(face, eyes:1.2)",
    '"red, blue"',
    "[a,{b,c}:0.8]",
  ]);
});

test("does not split escaped commas", () => {
  assert.deepEqual(values("red\\, blue, solo"), ["red\\, blue", "solo"]);
});

test("supports Japanese, newlines and full-width separators", () => {
  assert.deepEqual(values("女の子，笑顔\n青い空、雲"), ["女の子", "笑顔", "青い空", "雲"]);
  assert.deepEqual(values("（赤, 青）, 「空, 雲」, 笑顔"), ["（赤, 青）", "「空, 雲」", "笑顔"]);
});

test("handles empty input, empty tags and trailing commas", () => {
  assert.deepEqual(values(""), []);
  const parsed = splitPrompt("a,,b,");
  assert.deepEqual(parsed.values, ["a", "", "b", ""]);
  assert.equal(parsed.trailingSeparator, true);
});

test("reports malformed brackets without throwing", () => {
  const parsed = splitPrompt("a, (b, c");
  assert.deepEqual(parsed.values, ["a", "(b, c"]);
  assert.equal(parsed.errors.length, 1);
});

test("handles a very long prompt", () => {
  const source = Array.from({ length: 5000 }, (_, index) => `tag_${index}`).join(", ");
  assert.equal(values(source).length, 5000);
});

test("parse serialize parse preserves order and meaningful structure", () => {
  const source = '1girl, (masterpiece:1.2), {red|blue}, "a,b", <lora:test:0.8>';
  const first = parsePrompt(source).tags;
  const second = parsePrompt(serializePrompt(first, { preserveEmpty: true })).tags;
  assert.deepEqual(second.map((tag) => tag.value), first.map((tag) => tag.value));
});

test("disabled tags are excluded from node output serialization", () => {
  const tags = parsePrompt("a, b, c").tags;
  tags[1].enabled = false;
  assert.equal(serializePrompt(tags), "a, c");
  assert.equal(serializePrompt(tags, { includeDisabled: true }), "a, b, c");
});

test("legacy null suffix becomes a visually disabled tag without displaying null", () => {
  const [tag] = parsePrompt("1girl null").tags;
  assert.equal(tag.value, "1girl");
  assert.equal(tag.enabled, false);
  assert.equal(serializePrompt([tag]), "");
  assert.equal(serializePrompt([tag], { includeDisabled: true }), "1girl");
});

test("weight adjustment is precise, bounded and preserves LoRA", () => {
  assert.equal(adjustTagWeight("detailed eyes", 0.05), "(detailed eyes:1.05)");
  assert.equal(adjustTagWeight("(detailed eyes:1.20)", 0.05), "(detailed eyes:1.25)");
  assert.equal(adjustTagWeight("[background:0.8]", -0.1), "[background:0.70]");
  assert.equal(adjustTagWeight("(x:2.0)", 0.25), "(x:2.00)");
  assert.equal(adjustTagWeight("<lora:model:0.8>", 0.25), "<lora:model:0.8>");
});
