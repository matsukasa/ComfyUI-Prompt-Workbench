import assert from "node:assert/strict";
import test from "node:test";
import {
  SECTION_HEADING_GROUPS,
  SECTION_TEMPLATES,
  buildStructuredOutputs,
  createSection,
  createTag,
  looksLikeStructuredPrompt,
  parseStructuredPrompt,
  serializeStructuredSectionBody,
} from "../web/prompt_parser.js";
import { PromptEditor } from "../web/prompt_editor.js";
import { sanitizeEditorState, sanitizeSettings } from "../web/settings.js";

const SAMPLE_STRUCTURED = `{
【任务与范式】
4:3横向画幅；真实光学中画幅室内暗调环境人像与唯美纯欲二次元Cosplay摄影美学（《Fate》阿尔托莉雅/Saber纯白礼服造型）；营造圣洁骑士气韵。

【构图与机位】
平视全身近景，纯正90度正侧面轮廓机位（面朝画面左侧）。

【可选负面提示词】
ANIME假发质感，悬空无支撑手势，手部扭曲崩坏。
}`;

test("looksLikeStructuredPrompt detects braced and headed prompts without false positives", () => {
  assert.equal(looksLikeStructuredPrompt(SAMPLE_STRUCTURED), true);
  assert.equal(looksLikeStructuredPrompt("## Subject\n1girl, solo"), true);
  assert.equal(looksLikeStructuredPrompt("1girl, solo, {red|blue}, [cat:0.8]"), false);
  assert.equal(looksLikeStructuredPrompt("[cat]"), false);
  assert.equal(looksLikeStructuredPrompt("【営業中】"), false);
  assert.equal(looksLikeStructuredPrompt("【重要】 cat, dog"), false);
  assert.equal(looksLikeStructuredPrompt("看板に\n【営業中】"), false);
  assert.equal(looksLikeStructuredPrompt("# comment line\n1girl, solo"), false);
  assert.equal(looksLikeStructuredPrompt("1girl, [cat], [dog], [cat:0.8], [red|blue]"), false);
  assert.equal(looksLikeStructuredPrompt("【任务与范式】, 4:3横向画幅, 【构图与机位】, 平视全身近景"), true);
  assert.equal(looksLikeStructuredPrompt("[Task & Paradigm], 4:3 horizontal frame, [Composition & Camera], eye-level shot"), true);
});

test("parseStructuredPrompt splits flattened single-line comma-separated 【】 headers", () => {
  const flattened = "【任务与范式】, 4:3横向画幅, 真实光学, 【构图与机位】, 平视全身近景, 【可选负面提示词】, ANIME假发质感";
  const parsed = parseStructuredPrompt(flattened);
  assert.equal(parsed.wrapBraces, false);
  assert.equal(parsed.sections.length, 3);
  assert.deepEqual(
    parsed.sections.map((section) => [section.title, section.role, section.tags.map((t) => t.value)]),
    [
      ["【任务与范式】", "positive", ["4:3横向画幅", "真实光学"]],
      ["【构图与机位】", "positive", ["平视全身近景"]],
      ["【可选负面提示词】", "negative", ["ANIME假发质感"]],
    ],
  );
});

test("parseStructuredPrompt supports English-translated [] and fullwidth ［］ section headers", () => {
  const translatedMultiline = `{
[Task & Paradigm]
4:3 horizontal frame, medium format portrait.

[Composition & Camera]
Eye-level full shot, 50mm lens.

[Optional Negative Prompts]
anime wig texture, extra fingers.
}`;
  const multi = parseStructuredPrompt(translatedMultiline);
  assert.equal(multi.wrapBraces, true);
  assert.equal(multi.sections.length, 3);
  assert.deepEqual(
    multi.sections.map((section) => [section.title, section.role]),
    [
      ["[Task & Paradigm]", "positive"],
      ["[Composition & Camera]", "positive"],
      ["[Optional Negative Prompts]", "negative"],
    ],
  );

  const translatedInline = "[Task & Paradigm], 4:3 horizontal frame, ［Composition & Camera］ eye-level shot, [Optional Negative], extra fingers";
  const inlineParsed = parseStructuredPrompt(translatedInline);
  assert.equal(inlineParsed.sections.length, 3);
  assert.deepEqual(
    inlineParsed.sections.map((section) => [section.title, section.role, section.tags.map((t) => t.value)]),
    [
      ["[Task & Paradigm]", "positive", ["4:3 horizontal frame"]],
      ["［Composition & Camera］", "positive", ["eye-level shot"]],
      ["[Optional Negative]", "negative", ["extra fingers"]],
    ],
  );
});

test("parseStructuredPrompt splits braced Chinese sections and preserves punctuation and negative role", () => {
  const parsed = parseStructuredPrompt(SAMPLE_STRUCTURED);
  assert.equal(parsed.wrapBraces, true);
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.sections.length, 3);
  assert.deepEqual(
    parsed.sections.map((section) => [section.title, section.role]),
    [
      ["【任务与范式】", "positive"],
      ["【构图与机位】", "positive"],
      ["【可选负面提示词】", "negative"],
    ],
  );
  assert.equal(
    serializeStructuredSectionBody(parsed.sections[0].tags),
    "4:3横向画幅；真实光学中画幅室内暗调环境人像与唯美纯欲二次元Cosplay摄影美学（《Fate》阿尔托莉雅/Saber纯白礼服造型）；营造圣洁骑士气韵。",
  );

  // Disabling one clause keeps surrounding CJK punctuation intact.
  parsed.sections[0].tags[1].enabled = false;
  assert.equal(
    serializeStructuredSectionBody(parsed.sections[0].tags),
    "4:3横向画幅；营造圣洁骑士气韵。",
  );
});

test("buildStructuredOutputs supports structured mode, braces, section enablement, and negative separation", () => {
  const parsed = parseStructuredPrompt(SAMPLE_STRUCTURED);
  const splitOut = buildStructuredOutputs(parsed.sections, {
    outputFormat: "structured",
    wrapBraces: true,
    includeNegativeInPrompt: false,
  });
  assert.ok(splitOut.prompt.startsWith("{\n【任务与范式】\n"));
  assert.ok(splitOut.prompt.includes("【构图与机位】\n"));
  assert.ok(!splitOut.prompt.includes("【可选负面提示词】"));
  assert.equal(splitOut.negative, "ANIME假发质感，悬空无支撑手势，手部扭曲崩坏。");

  const combinedOut = buildStructuredOutputs(parsed.sections, {
    outputFormat: "structured",
    wrapBraces: true,
    includeNegativeInPrompt: true,
  });
  assert.ok(combinedOut.prompt.includes("【可选负面提示词】\nANIME假发质感，悬空无支撑手势，手部扭曲崩坏。"));
  assert.equal(combinedOut.negative, "ANIME假发质感，悬空无支撑手势，手部扭曲崩坏。");

  parsed.sections[1].enabled = false;
  const disabledOut = buildStructuredOutputs(parsed.sections, {
    outputFormat: "structured",
    wrapBraces: false,
    includeNegativeInPrompt: false,
  });
  assert.ok(!disabledOut.prompt.includes("【构图与机位】"));

  const tagOut = buildStructuredOutputs(parsed.sections, {
    outputFormat: "tags",
  });
  assert.ok(tagOut.prompt.endsWith(","));
  assert.ok(tagOut.negative.endsWith(","));
});

test("sanitizeEditorState round-trips multi-section state and migrates legacy tags state", () => {
  const legacy = sanitizeEditorState({
    trailingSeparator: true,
    tags: [createTag("1girl"), createTag("solo")],
  });
  assert.equal(legacy.sections.length, 1);
  assert.equal(legacy.sections[0].tags.length, 2);
  assert.equal(legacy.outputFormat, "tags");

  const multi = sanitizeEditorState({
    outputFormat: "structured",
    wrapBraces: true,
    includeNegativeInPrompt: true,
    activeSectionId: "sec-2",
    sections: [
      createSection({ id: "sec-1", title: "【主体】", role: "positive", tags: [createTag("girl")] }),
      createSection({ id: "sec-2", title: "【负面】", role: "negative", tags: [createTag("bad hands")] }),
    ],
  });
  assert.equal(multi.sections.length, 2);
  assert.equal(multi.activeSectionId, "sec-2");
  assert.equal(multi.outputFormat, "structured");
  assert.equal(multi.wrapBraces, true);
  assert.equal(multi.includeNegativeInPrompt, true);
});

test("PromptEditor multi-section state supports active-section tag additions, auto-split, undo, and restore", () => {
  const noop = () => {};
  const makeEditor = () => Object.assign(Object.create(PromptEditor.prototype), {
    sections: [createSection({ id: "sec-1" })],
    activeSectionId: "sec-1",
    outputFormat: "tags",
    wrapBraces: false,
    includeNegativeInPrompt: false,
    dirtySectionIds: new Set(),
    sectionTextareas: new Map(),
    settings: sanitizeSettings({ autoTranslate: false }),
    node: { properties: {}, widgets: [], graph: { setDirtyCanvas: noop } },
    widgets: { prompt: { value: "" }, negative: { value: "" }, outputFormat: { value: "tags" } },
    undoStack: [],
    redoStack: [],
    translationGeneration: 0,
    promptTextarea: { value: "" },
    applyCustomColors: noop,
    renderTranslationControls: noop,
    renderBulk: noop,
    renderTags: noop,
    rebuildControls: noop,
    rebuildSectionViews: noop,
    setStatus: noop,
  });

  const editor = makeEditor();
  editor.promptTextarea.value = SAMPLE_STRUCTURED;
  editor.promptDirty = true;
  editor.applyPromptText();

  assert.equal(editor.outputFormat, "structured");
  assert.equal(editor.wrapBraces, true);
  assert.equal(editor.includeNegativeInPrompt, true);
  assert.equal(editor.sections.length, 3);
  assert.equal(editor.widgets.outputFormat.value, "structured");
  assert.equal(editor.widgets.negative.value, "ANIME假发质感，悬空无支撑手势，手部扭曲崩坏。");

  // Switching active section targets tag additions to that section.
  editor.selectSection(editor.sections[1].id);
  editor.pushUndo();
  editor.addValues([{ value: "soft_lighting" }]);
  assert.ok(editor.sections[1].tags.some((tag) => tag.value === "soft_lighting"));
  assert.ok(editor.widgets.prompt.value.includes("soft_lighting"));

  // Undo reverts the tag addition cleanly, and a second undo reverts bulk split.
  editor.undo();
  assert.ok(!editor.sections[1].tags.some((tag) => tag.value === "soft_lighting"));
  assert.equal(editor.sections.length, 3);
  editor.undo();
  assert.equal(editor.sections.length, 1);
  editor.redo();
  assert.equal(editor.sections.length, 3);

  // Restoring from node properties preserves all sections and settings.
  const restored = makeEditor();
  restored.node.properties = JSON.parse(JSON.stringify(editor.node.properties));
  restored.widgets.prompt.value = editor.widgets.prompt.value;
  restored.widgets.negative.value = editor.widgets.negative.value;
  restored.restore();
  assert.equal(restored.sections.length, 3);
  assert.equal(restored.outputFormat, "structured");
  assert.equal(restored.wrapBraces, true);
  assert.equal(restored.activeSectionId, editor.activeSectionId);

  // Applying a template on an empty editor populates preset sections and roles.
  const fresh = makeEditor();
  assert.ok(SECTION_HEADING_GROUPS.length >= 3);
  assert.ok(SECTION_TEMPLATES.length >= 4);
  assert.equal(fresh.applySectionTemplate("structured-ja"), true);
  assert.equal(fresh.outputFormat, "structured");
  assert.equal(fresh.wrapBraces, true);
  assert.equal(fresh.sections.at(-1).role, "negative");

  // Applying another template when content exists keeps existing sections intact.
  fresh.sections[0].tags.push(createTag("keep_me"));
  assert.equal(fresh.applySectionTemplate("pos-neg"), true);
  assert.ok(fresh.sections.some((section) => section.tags.some((tag) => tag.value === "keep_me")));
  assert.ok(fresh.sections.some((section) => section.title === "【プロンプト】"));
});

test("Pattern G prose mode, JSON output/parsing, and LLM clipboard translation round-trip", () => {
  const jsonInput = JSON.stringify({
    shot: "Medium close-up, 50mm lens.",
    subject: "1girl, silver_hair, white_dress",
    negative: "worst quality, extra fingers",
  }, null, 2);
  assert.equal(looksLikeStructuredPrompt(jsonInput), true);

  const parsedJson = parseStructuredPrompt(jsonInput);
  assert.equal(parsedJson.isJson, true);
  assert.equal(parsedJson.sections.length, 3);
  assert.equal(parsedJson.sections[0].mode, "prose");
  assert.equal(parsedJson.sections[0].proseText, "Medium close-up, 50mm lens.");
  assert.equal(parsedJson.sections[1].mode, "tags");
  assert.equal(parsedJson.sections[2].role, "negative");

  const jsonOut = buildStructuredOutputs(parsedJson.sections, { outputFormat: "json" });
  const roundTripped = JSON.parse(jsonOut.prompt);
  assert.deepEqual(roundTripped, {
    shot: "Medium close-up, 50mm lens.",
    subject: "1girl, silver_hair, white_dress",
  });
  assert.equal(jsonOut.negative, "worst quality, extra fingers");

  const noop = () => {};
  const editor = Object.assign(Object.create(PromptEditor.prototype), {
    sections: [
      createSection({ id: "sec-1", title: "【构图】", mode: "prose", proseText: "Eye-level 50mm portrait." }),
      createSection({ id: "sec-2", title: "【主体】", mode: "tags", tags: [createTag("1girl"), createTag("white_dress")] }),
    ],
    activeSectionId: "sec-2",
    outputFormat: "structured",
    wrapBraces: false,
    includeNegativeInPrompt: false,
    dirtySectionIds: new Set(),
    sectionTextareas: new Map(),
    settings: sanitizeSettings({ autoTranslate: false }),
    node: { properties: {}, widgets: [], graph: { setDirtyCanvas: noop } },
    widgets: { prompt: { value: "" }, negative: { value: "" }, outputFormat: { value: "structured" } },
    undoStack: [],
    redoStack: [],
    translationGeneration: 0,
    applyCustomColors: noop,
    renderTranslationControls: noop,
    renderBulk: noop,
    renderTags: noop,
    rebuildControls: noop,
    rebuildSectionViews: noop,
    setStatus: noop,
  });

  // Switch active tag section to prose and append a prose phrase without trailing comma mangling.
  editor.setActiveSectionMode("prose");
  assert.equal(editor.sections[1].mode, "prose");
  assert.equal(editor.sections[1].proseText, "1girl, white_dress");
  editor.addValues([{ value: "soft key light", translation: "柔らかいキーライト" }]);
  assert.equal(editor.sections[1].proseText, "1girl, white_dress；soft key light");

  // Apply pasted LLM header-preserved translations into sections.
  editor.applyLlmPastedTranslations("【构图】\nアイレベル50mmポートレート\n\n【主体】\n女の子・白いドレス");
  assert.equal(editor.sections[0].translation, "アイレベル50mmポートレート");
  assert.equal(editor.sections[1].translation, "女の子・白いドレス");
});

test("moveTagsToSection moves single or multi-selected tags across sections with undo and prose support", () => {
  const noop = () => {};
  const t1 = createTag("1girl");
  const t2 = createTag("silver_hair");
  const t3 = createTag("white_dress");
  t2.selected = true;
  t3.selected = true;
  const statusMessages = [];
  const editor = Object.assign(Object.create(PromptEditor.prototype), {
    sections: [
      createSection({ id: "sec-1", title: "【人物】", mode: "tags", tags: [t1, t2, t3] }),
      createSection({ id: "sec-2", title: "【衣装】", mode: "tags", tags: [createTag("ribbon")] }),
      createSection({ id: "sec-3", title: "【構図】", mode: "prose", proseText: "Eye-level 50mm." }),
    ],
    activeSectionId: "sec-1",
    outputFormat: "structured",
    wrapBraces: false,
    includeNegativeInPrompt: false,
    dirtySectionIds: new Set(),
    sectionTextareas: new Map(),
    settings: sanitizeSettings({ autoTranslate: false }),
    node: { properties: {}, widgets: [], graph: { setDirtyCanvas: noop } },
    widgets: { prompt: { value: "" }, negative: { value: "" }, outputFormat: { value: "structured" } },
    undoStack: [],
    redoStack: [],
    translationGeneration: 0,
    dragIndex: null,
    dragTagIds: [t2.id, t3.id],
    dragSourceSectionId: "sec-1",
    applyCustomColors: noop,
    renderTranslationControls: noop,
    renderBulk: noop,
    renderTags: noop,
    rebuildControls: noop,
    rebuildSectionViews: noop,
    setStatus: (msg) => statusMessages.push(msg),
  });

  // Dropping on the same section is disallowed and does nothing.
  assert.equal(editor.canDropTagsOnSection("sec-1"), false);
  assert.equal(editor.canDropTagsOnSection("sec-2"), true);
  assert.equal(editor.moveTagsToSection([t2.id, t3.id], "sec-1", "sec-1"), 0);

  // Move multiple tags from sec-1 to sec-2.
  const movedCount = editor.moveTagsToSection([t2.id, t3.id], "sec-2", "sec-1");
  assert.equal(movedCount, 2);
  assert.deepEqual(editor.sections[0].tags.map((tag) => tag.value), ["1girl"]);
  assert.deepEqual(editor.sections[1].tags.map((tag) => tag.value), ["ribbon", "silver_hair", "white_dress"]);
  assert.equal(editor.sections[1].tags.every((tag) => tag.selected === false), true);
  assert.equal(editor.activeSectionId, "sec-1");
  assert.ok(statusMessages.length > 0);

  // Undo restores moved tags back to sec-1.
  editor.undo();
  assert.deepEqual(editor.sections[0].tags.map((tag) => tag.value), ["1girl", "silver_hair", "white_dress"]);
  assert.deepEqual(editor.sections[1].tags.map((tag) => tag.value), ["ribbon"]);

  // Moving a tag into a prose section appends it cleanly to proseText.
  assert.equal(editor.moveTagsToSection([t1.id], "sec-3", "sec-1"), 1);
  assert.deepEqual(editor.sections[0].tags.map((tag) => tag.value), ["silver_hair", "white_dress"]);
  assert.equal(editor.sections[2].proseText, "Eye-level 50mm. 1girl");
});

test("MCP section widgets sync bidirectionally and applyExecutionFeedback updates merged_preview", () => {
  const noop = () => {};
  const widgets = {
    prompt: { name: "prompt", value: "" },
    negative: { name: "negative", value: "" },
    outputFormat: { name: "output_format", value: "tags" },
    sec_quality: { name: "sec_quality", value: "masterpiece, best quality" },
    sec_quality_enabled: { name: "sec_quality_enabled", value: true },
    sec_subject: { name: "sec_subject", value: "1girl" },
    sec_subject_enabled: { name: "sec_subject_enabled", value: true },
    sec_trigger: { name: "sec_trigger", value: "lora_word" },
    sec_trigger_enabled: { name: "sec_trigger_enabled", value: false },
    neg_quality: { name: "neg_quality", value: "lowres" },
    neg_quality_enabled: { name: "neg_quality_enabled", value: true },
    tag_suggestions_subject: { name: "tag_suggestions_subject", value: "" },
    merged_preview: { name: "merged_preview", value: "" },
    sections_schema: { name: "sections_schema", value: "" },
  };
  const editor = Object.assign(Object.create(PromptEditor.prototype), {
    sections: [],
    activeSectionId: "",
    outputFormat: "tags",
    wrapBraces: false,
    includeNegativeInPrompt: false,
    dirtySectionIds: new Set(),
    sectionTextareas: new Map(),
    settings: sanitizeSettings({ autoTranslate: false }),
    node: { properties: {}, widgets: Object.values(widgets), graph: { setDirtyCanvas: noop } },
    widgets,
    undoStack: [],
    redoStack: [],
    translationGeneration: 0,
  });

  assert.equal(editor.hasActiveMcpSectionWidgets(), true);
  editor.applyMcpSectionWidgets();
  const triggerSec = editor.sections.find((s) => s.id === "mcp-pos-trigger");
  assert.ok(triggerSec);
  assert.equal(triggerSec.enabled, false);
  assert.deepEqual(triggerSec.tags.map((t) => t.value), ["lora_word"]);

  // Mirror TagDB suggestions into active section widget.
  editor.activeSectionId = "mcp-pos-subject";
  editor.syncActiveSectionSuggestions(["1girl", "solo", "long_hair"]);
  assert.equal(widgets.tag_suggestions_subject.value, "1girl, solo, long_hair");

  // Execution feedback writes merged_preview and sections_schema back to widgets.
  editor.applyExecutionFeedback({
    merged_preview: ["[POSITIVE]\nmasterpiece, best quality, 1girl,\n\n[NEGATIVE]\nlowres,"],
    sections_schema: ['{"version":1,"merged_prompt":"masterpiece, best quality, 1girl,"}'],
  });
  assert.equal(widgets.merged_preview.value, "[POSITIVE]\nmasterpiece, best quality, 1girl,\n\n[NEGATIVE]\nlowres,");
  assert.equal(widgets.sections_schema.value, '{"version":1,"merged_prompt":"masterpiece, best quality, 1girl,"}');
});

test("syncDynamicSectionSockets adds, renames, and removes section-named input and output sockets on demand", () => {
  const noop = () => {};
  const node = {
    inputs: [],
    outputs: [
      { name: "prompt", type: "STRING", links: [] },
      { name: "negative", type: "STRING", links: [] },
    ],
    properties: {},
    widgets: [],
    graph: { setDirtyCanvas: noop },
    addInput(name, type) {
      const slot = { name, type, link: null };
      this.inputs.push(slot);
      return slot;
    },
    removeInput(index) {
      this.inputs.splice(index, 1);
    },
    addOutput(name, type) {
      const slot = { name, type, links: [] };
      this.outputs.push(slot);
      return slot;
    },
    removeOutput(index) {
      this.outputs.splice(index, 1);
    },
  };
  const sec1 = createSection({ id: "sec-1", title: "【主体】", socketInput: false, socketOutput: false, tags: [createTag("1girl")] });
  const sec2 = createSection({ id: "sec-2", title: "Trigger", socketInput: true, socketOutput: true, tags: [] });
  const editor = Object.assign(Object.create(PromptEditor.prototype), {
    sections: [sec1, sec2],
    activeSectionId: "sec-1",
    outputFormat: "tags",
    wrapBraces: false,
    includeNegativeInPrompt: false,
    settings: sanitizeSettings({ autoTranslate: false }),
    node,
    widgets: {},
  });

  // Only sections with socketInput/socketOutput=true get sockets.
  editor.syncDynamicSectionSockets();
  assert.deepEqual(node.inputs.map((i) => i.name), ["Trigger"]);
  assert.deepEqual(node.outputs.map((o) => o.name), ["prompt", "negative", "Trigger"]);

  // Renaming the section updates both sockets in place without dropping links.
  node.inputs[0].link = 42;
  node.outputs[2].links = [99];
  sec2.title = "LoRA Trigger";
  editor.syncDynamicSectionSockets();
  assert.deepEqual(node.inputs.map((i) => i.name), ["LoRA Trigger"]);
  assert.equal(node.inputs[0].link, 42);
  assert.deepEqual(node.outputs.map((o) => o.name), ["prompt", "negative", "LoRA Trigger"]);
  assert.deepEqual(node.outputs[2].links, [99]);

  // Turning socketInput/socketOutput off removes the sockets, leaving only prompt & negative.
  sec2.socketInput = false;
  sec2.socketOutput = false;
  editor.syncDynamicSectionSockets();
  assert.deepEqual(node.inputs, []);
  assert.deepEqual(node.outputs.map((o) => o.name), ["prompt", "negative"]);
});
