import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  applySmartTranslationResult,
  appendPresentChildren,
  buildCompleteCatalogForSave,
  catalogNameFromFileName,
  clampExampleListHeight,
  cleanTranslation,
  compactNodeWidgetLayout,
  containsJapaneseText,
  containNodeContextMenu,
  fetchExampleCatalog,
  filterExampleLibraryTags,
  getTagDisplayText,
  hideWidgetForGood,
  parseImportedCatalogText,
  removeUnlinkedWidgetInput,
  removeWidgetFromLayout,
  replaceTagTextPreservingSyntax,
  resolveExampleCategoryPath,
  suggestedCatalogFileName,
  translatableTagText,
  translationBatchTimeoutMs,
  upsertCatalogCopy,
  writeCatalogFile,
} from "../web/prompt_editor.js";

test("catalog loader reloads default and named files and reports errors", async () => {
  const requested = [];
  const api = {
    async fetchApi(path) {
      requested.push(path);
      return new Response(JSON.stringify({ source: path }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  };
  assert.deepEqual(await fetchExampleCatalog(api), { source: "/prompt_all_in_one/examples" });
  assert.deepEqual(await fetchExampleCatalog(api, "私のタグ"), { source: "/prompt_all_in_one/examples?file=%E7%A7%81%E3%81%AE%E3%82%BF%E3%82%B0" });
  assert.deepEqual(requested, [
    "/prompt_all_in_one/examples",
    "/prompt_all_in_one/examples?file=%E7%A7%81%E3%81%AE%E3%82%BF%E3%82%B0",
  ]);

  await assert.rejects(
    fetchExampleCatalog({ fetchApi: async () => new Response(JSON.stringify({ error: "読込失敗" }), { status: 500 }) }, "broken"),
    /読込失敗/u,
  );
});

test("catalog file picker normalizes names and validates imported JSON", () => {
  assert.equal(catalogNameFromFileName("私の.タグ.json"), "私の_タグ");
  assert.equal(catalogNameFromFileName("CON.json"), "CON_catalog");
  assert.equal(suggestedCatalogFileName("tags.json", new Date(2026, 7, 4, 22, 15, 9)), "tags_20260804_221509.json");
  const catalog = parseImportedCatalogText(JSON.stringify({
    schema: "prompt-workbench/tag-catalog",
    version: 1,
    categories: [
      { id: "large", level: "large", parentId: "", en: "People", ja: "人物" },
      { id: "medium", level: "medium", parentId: "large", en: "Body", ja: "身体" },
      { id: "small", level: "small", parentId: "medium", en: "General", ja: "一般" },
    ],
    tags: [{ id: "tag", categoryId: "small", prompt: "solo", ja: "一人", order: 0 }],
  }));
  assert.equal(catalog.schema_version, 1);
  assert.equal(catalog.major_categories[0].medium_categories[0].small_categories[0].tags[0].name, "solo");
  assert.throws(() => parseImportedCatalogText("{}"), /カテゴリー/u);
});

test("loading the same catalog updates its existing copy without adding a number", async () => {
  const requests = [];
  const api = {
    async fetchApi(path, options = {}) {
      requests.push({ path, method: options.method || "GET", body: options.body });
      if (!options.method) return new Response(JSON.stringify({ files: ["tags", "tags 2"] }), { status: 200 });
      return new Response(JSON.stringify({ name: "tags", filename: "tags.json" }), { status: 200 });
    },
  };
  const result = await upsertCatalogCopy(api, "tags.json", { categories: [], tags: [] });
  assert.equal(result.filename, "tags.json");
  assert.deepEqual(requests.map((item) => item.method), ["GET", "PUT"]);
  assert.equal(JSON.parse(requests[1].body).name, "tags");
});

test("catalog loading tolerates an old server that rejects PUT", async () => {
  const api = {
    async fetchApi(_path, options = {}) {
      if (!options.method) return new Response(JSON.stringify({ files: ["tags"] }), { status: 200 });
      return new Response(JSON.stringify({}), { status: 405 });
    },
  };
  const fallback = await upsertCatalogCopy(api, "tags.json", { categories: [], tags: [] }, { allowLoadFallback: true });
  assert.equal(fallback.filename, "tags.json");
  assert.equal(fallback.compatibilityFallback, true);
  await assert.rejects(
    upsertCatalogCopy(api, "tags.json", { categories: [], tags: [] }),
    /ComfyUIを再起動/u,
  );
});

test("catalog file handle receives formatted JSON and closes", async () => {
  const calls = [];
  const handle = {
    async createWritable() {
      return {
        async write(value) { calls.push(["write", value]); },
        async close() { calls.push(["close"]); },
      };
    },
  };
  await writeCatalogFile(handle, { schema: "prompt-workbench/tag-catalog", version: 1 });
  assert.match(calls[0][1], /"schema": "prompt-workbench\/tag-catalog"/u);
  assert.deepEqual(calls[1], ["close"]);
});

test("catalog save includes untouched categories after loading the complete source", async () => {
  const source = {
    schema: "prompt-workbench/tag-catalog",
    version: 1,
    categories: [
      { id: "large", level: "large", parentId: "", en: "People", ja: "人物" },
      { id: "medium", level: "medium", parentId: "large", en: "Body", ja: "身体" },
      { id: "edited", level: "small", parentId: "medium", en: "Edited", ja: "編集対象" },
      { id: "untouched", level: "small", parentId: "medium", en: "Untouched", ja: "未変更" },
    ],
    tags: [
      { id: "edited-tag", categoryId: "edited", prompt: "solo", ja: "一人", order: 0 },
      { id: "untouched-tag", categoryId: "untouched", prompt: "smile", ja: "笑顔", order: 0 },
    ],
  };
  const saved = await buildCompleteCatalogForSave(async () => source, {
    categories: [],
    tags: [{ id: "edited-tag", categoryId: "edited", prompt: "solo", ja: "単独", custom: false }],
  });
  assert.equal(saved.schema_version, 1);
  const smallCategories = saved.major_categories[0].medium_categories[0].small_categories;
  assert.deepEqual(smallCategories.map((item) => item.id), ["edited", "untouched"]);
  assert.equal(smallCategories[0].tags[0].translation_ja, "単独");
  assert.equal(smallCategories[1].tags[0].translation_ja, "笑顔");
});

test("closed settings dialog stays hidden", () => {
  const css = readFileSync(new URL("../web/prompt_all_in_one.css", import.meta.url), "utf8");
  assert.match(css, /\.paio-settings-dialog:not\(\[open\]\)\s*\{\s*display:\s*none;/u);
  assert.match(css, /\.paio-settings-dialog\[open\]\s*\{\s*display:\s*flex;/u);
});

test("tag buttons use variable width and distinct enabled and disabled colors", () => {
  const css = readFileSync(new URL("../web/prompt_all_in_one.css", import.meta.url), "utf8");
  assert.match(css, /\.paio-tag\s*\{[^}]*width:\s*fit-content;/su);
  assert.match(css, /\.paio-tag\s*\{[^}]*background:\s*var\(--paio-tag-fill,\s*var\(--paio-blue\)\);/su);
  assert.match(css, /\.paio-tag\.is-disabled\s*\{[^}]*background:\s*#292c30;/su);
  assert.match(css, /\.paio-tag\.is-disabled[\s\S]*text-decoration:\s*line-through;/u);
});

test("Japanese translations remain readable on colored tag backgrounds", () => {
  const css = readFileSync(new URL("../web/prompt_all_in_one.css", import.meta.url), "utf8");
  assert.match(css, /--paio-blue:\s*#2474bd;/u);
  assert.match(css, /\.paio-tag-translation\s*\{[^}]*color:\s*#fff;[^}]*font-size:\s*11px;[^}]*font-weight:\s*600;/su);
  assert.match(css, /\.paio-tag\.is-disabled \.paio-tag-translation\s*\{\s*color:\s*#aeb4bc;/u);
  assert.match(css, /\.paio-example-chip-translation\s*\{[^}]*font-weight:\s*550;/su);
});

test("native prompt widget is fully hidden but remains serializable", async () => {
  let removed = false;
  const inputEl = { style: {}, remove: () => { removed = true; } };
  const widget = {
    name: "prompt", type: "text", value: "1girl", inputEl, options: {},
    y: 96, last_y: 96, computedHeight: 24,
  };
  hideWidgetForGood(widget, ":prompt");
  assert.equal(widget.hidden, true);
  assert.equal(widget.visible, false);
  assert.deepEqual(widget.computeSize(), [0, 0]);
  assert.equal(widget.y, 0);
  assert.equal(widget.last_y, 0);
  assert.equal(widget.computedHeight, 0);
  assert.equal(widget.type, "converted-widget:prompt");
  assert.equal(widget.options.hidden, true);
  assert.equal(inputEl.style.display, "none");
  assert.equal(removed, true);
  assert.equal(await widget.serializeValue(), "1girl");
});

test("stale unlinked prompt input is removed without disconnecting linked inputs", () => {
  const node = {
    inputs: [
      { name: "prompt", link: null, widget: { name: "prompt" } },
      { name: "other", link: null },
      { name: "prompt", link: 17, widget: { name: "prompt" } },
    ],
    removeInput(index) { this.inputs.splice(index, 1); },
  };
  assert.equal(removeUnlinkedWidgetInput(node, "prompt"), 1);
  assert.deepEqual(node.inputs.map((input) => [input.name, input.link]), [
    ["other", null],
    ["prompt", 17],
  ]);
});

test("native prompt widget is detached from layout while the DOM widget keeps serialization", async () => {
  const nativeWidget = { name: "prompt", value: "1girl" };
  const domWidget = {
    name: "prompt",
    serialize: true,
    serializeValue: async () => nativeWidget.value,
  };
  const node = { widgets: [nativeWidget, domWidget] };
  assert.equal(removeWidgetFromLayout(node, nativeWidget), true);
  assert.deepEqual(node.widgets, [domWidget]);
  assert.equal(await node.widgets[0].serializeValue(), "1girl");
});

test("custom editor starts at the top of the node widget area", () => {
  const node = { widgets_start_y: 96 };
  compactNodeWidgetLayout(node);
  assert.equal(node.widgets_start_y, 1);
});

test("workflow reload reapplies the compact widget layout after configuration", () => {
  const source = readFileSync(new URL("../web/prompt_all_in_one.js", import.meta.url), "utf8");
  const editorSource = readFileSync(new URL("../web/prompt_editor.js", import.meta.url), "utf8");
  assert.match(source, /nodeType\.prototype\.onConfigure/u);
  assert.match(source, /queueMicrotask\(stabilize\)/u);
  assert.match(source, /requestAnimationFrame\(stabilize\)/u);
  assert.match(editorSource, /addDOMWidget\("prompt", "div"/u);
  assert.match(editorSource, /removeWidgetFromLayout\(this\.node, promptWidget\)/u);
});

test("tag context menu exposes the compact weight stepper", () => {
  const source = readFileSync(new URL("../web/prompt_editor.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("../web/prompt_all_in_one.css", import.meta.url), "utf8");
  assert.match(source, /paio-context-weight-controls/u);
  assert.match(source, /重みを1\.00へ戻す/u);
  assert.match(source, /setWeightOne\(index, requestedWeight\)/u);
  assert.match(css, /\.paio-context-weight-controls\s*\{[^}]*grid-template-columns:/su);
});

test("custom node contains right-click events without disabling text editing menus", () => {
  const listeners = {};
  containNodeContextMenu({ addEventListener: (type, listener) => { listeners[type] = listener; } });
  let stopped = 0;
  let prevented = 0;
  listeners.pointerdown({ button: 2, stopPropagation: () => { stopped += 1; } });
  listeners.contextmenu({
    target: { closest: () => null },
    stopPropagation: () => { stopped += 1; },
    preventDefault: () => { prevented += 1; },
  });
  listeners.contextmenu({
    target: { closest: () => ({ tagName: "INPUT" }) },
    stopPropagation: () => { stopped += 1; },
    preventDefault: () => { prevented += 1; },
  });
  assert.equal(stopped, 3);
  assert.equal(prevented, 1);
});

test("toolbar does not expose the input-output dialog button", () => {
  const source = readFileSync(new URL("../web/prompt_editor.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /button\("入出力"/u);
});

test("example browser resolves a large, medium and small category path", () => {
  const library = { categories: [
    { id: "large", level: "large", parentId: "", ja: "人物" },
    { id: "medium", level: "medium", parentId: "large", ja: "外見" },
    { id: "small", level: "small", parentId: "medium", ja: "髪" },
  ] };
  const resolved = resolveExampleCategoryPath(library);
  assert.equal(resolved.large.id, "large");
  assert.equal(resolved.medium.id, "medium");
  assert.equal(resolved.small.id, "small");
});

test("example search matches English tags and Japanese category names without path metadata", () => {
  const library = {
    categories: [
      { id: "large", level: "large", parentId: "", ja: "顔・目・髪" },
      { id: "medium", level: "medium", parentId: "large", ja: "髪" },
      { id: "small", level: "small", parentId: "medium", ja: "髪型" },
    ],
    tags: [{ id: "tag", categoryId: "small", prompt: "long_hair", ja: "" }],
  };
  assert.deepEqual(filterExampleLibraryTags(library, "small", "long"), library.tags);
  assert.deepEqual(filterExampleLibraryTags(library, "missing", "髪型"), library.tags);
  assert.deepEqual(filterExampleLibraryTags(library, "small", "食べ物"), []);
  assert.equal("post_count" in library.tags[0], false);
});

test("example search matches a Danbooru alias", () => {
  const library = {
    categories: [
      { id: "large", level: "large", parentId: "", ja: "人物" },
      { id: "medium", level: "medium", parentId: "large", ja: "外見" },
      { id: "small", level: "small", parentId: "medium", ja: "髪" },
    ],
    tags: [{ prompt: "long_hair", aliases: ["longhair"], categoryId: "small" }],
  };
  assert.deepEqual(filterExampleLibraryTags(library, "small", "longhair").map((item) => item.prompt), ["long_hair"]);
});

test("example tags display English prompt and Japanese translation together", () => {
  const source = readFileSync(new URL("../web/prompt_editor.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("../web/prompt_all_in_one.css", import.meta.url), "utf8");
  assert.match(source, /paio-example-chip-prompt/u);
  assert.match(source, /paio-example-chip-translation/u);
  assert.match(source, /className: "paio-example-chip-prompt", text: item\.prompt/u);
  assert.doesNotMatch(source, /className: "paio-example-chip-prompt", text: [`'"]?[＋+]/u);
  assert.doesNotMatch(source, /投稿数:|エイリアス:/u);
  assert.match(css, /\.paio-example-chip\s*\{[^}]*flex-direction:\s*column;[^}]*align-items:\s*flex-start;[^}]*min-height:\s*44px;/su);
  assert.match(css, /\.paio-example-chip-prompt\s*\{[^}]*color:\s*#f4f6f8;/su);
  assert.match(css, /\.paio-example-chip-translation\s*\{[^}]*color:\s*#afc7e8;/su);
});

test("tag addition is an obvious disclosure and tag management is unified", () => {
  const source = readFileSync(new URL("../web/prompt_editor.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("../web/prompt_all_in_one.css", import.meta.url), "utf8");
  assert.match(source, /paio-examples-disclosure/u);
  assert.match(source, /text: "タグを追加"/u);
  assert.doesNotMatch(source, /例から追加|クリックで追加|無効タグも表示します/u);
  assert.doesNotMatch(source, /className: "paio-library-tabs"/u);
  assert.match(css, /\.paio-examples\[open\] \.paio-examples-disclosure\s*\{\s*transform:\s*rotate\(90deg\);/u);
});

test("tag browser exposes a persistent vertical resize handle", () => {
  const source = readFileSync(new URL("../web/prompt_editor.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("../web/prompt_all_in_one.css", import.meta.url), "utf8");
  assert.equal(clampExampleListHeight(40), 96);
  assert.equal(clampExampleListHeight(300), 300);
  assert.equal(clampExampleListHeight(900), 520);
  assert.match(source, /ドラッグで高さ変更/u);
  assert.match(source, /setPointerCapture/u);
  assert.match(css, /\.paio-example-resize-handle\s*\{[^}]*cursor:\s*ns-resize;/su);
});

test("tag manager exposes a dedicated drag handle and drop position feedback", () => {
  const source = readFileSync(new URL("../web/prompt_editor.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("../web/prompt_all_in_one.css", import.meta.url), "utf8");
  assert.match(source, /paio-tag-drag-handle/u);
  assert.match(source, /reorderTagEdits/u);
  assert.match(source, /dragstart/u);
  assert.match(css, /\.paio-tag-edit-row\.is-drop-before/u);
  assert.match(css, /\.paio-tag-edit-row\.is-drop-after/u);
});

test("tag manager opens a JSON file picker and puts save actions at the bottom", () => {
  const source = readFileSync(new URL("../web/prompt_editor.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("../web/prompt_all_in_one.css", import.meta.url), "utf8");
  assert.match(source, /fileInput\.type = "file"/u);
  assert.match(source, /fileInput\.accept = "\.json,application\/json"/u);
  assert.match(source, /fileInput\.click\(\)/u);
  assert.match(source, /window\.confirm\("編集内容は保存されていません。破棄して別のタグファイルを読み込みますか？"\)/u);
  assert.match(source, /読み込みをキャンセルしました。編集内容は保持されています/u);
  assert.match(source, /ファイルを選んで読み込む/u);
  assert.doesNotMatch(source, /使用するファイル/u);
  assert.doesNotMatch(source, /編集結果を別名で保存/u);
  assert.match(source, /button\("上書き保存", overwriteCurrentFile\)/u);
  assert.match(source, /button\("別名で保存", saveAsNewFile\)/u);
  assert.match(source, /existingName \? "PUT" : "POST"/u);
  assert.match(source, /window\.showOpenFilePicker/u);
  assert.match(source, /window\.showSaveFilePicker\(pickerOptions\)/u);
  assert.match(source, /const CATALOG_FILE_PICKER_ID = "prompt-workbench-catalog-save"/u);
  assert.equal(source.match(/id: CATALOG_FILE_PICKER_ID/gu)?.length, 2);
  assert.doesNotMatch(source, /prompt-workbench-catalog-open/u);
  assert.match(source, /pickerOptions\.startIn = currentCatalogFileHandle/u);
  assert.match(source, /suggestedCatalogFileName\(currentSourceFileName\)/u);
  assert.equal(source.match(/await buildCompleteCatalogForSave\(\(\) => this\.loadExampleData\(\), edits\)/gu)?.length, 2);
  assert.doesNotMatch(source, /availableCatalogName/u);
  assert.match(css, /\.paio-library-savebar\s*\{/u);
  assert.match(source, /root\.append\(heading, fileBar, body, saveBar\)/u);
});

test("large translation batches receive a longer bounded timeout", () => {
  assert.equal(translationBatchTimeoutMs(1), 12000);
  assert.equal(translationBatchTimeoutMs(40), 20000);
  assert.equal(translationBatchTimeoutMs(100), 30000);
});

test("single translation button replaces Japanese prompt tags and preserves weight syntax", () => {
  const source = readFileSync(new URL("../web/prompt_editor.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("../web/prompt_all_in_one.css", import.meta.url), "utf8");
  assert.match(source, /this\.translateButton = button\("翻訳", \(\) => this\.translatePrompt\(\)/u);
  assert.match(source, /this\.syncToWidgets\(\);[\s\S]*this\.render\(\);/u);
  assert.doesNotMatch(source, /translationMenu|paio-translation-summary|選択タグを日本語へ|全タグを英語へ/u);
  assert.match(css, /\.paio-translate-button\s*\{[^}]*margin-inline-start:\s*auto;/su);

  assert.equal(containsJapaneseText("(背中:1.20)"), true);
  assert.equal(containsJapaneseText("back"), false);
  assert.equal(translatableTagText("(背中:1.20)"), "背中");
  assert.equal(replaceTagTextPreservingSyntax("(背中:1.20)", "back"), "(back:1.20)");

  const japaneseTag = { value: "(背中:1.20)", translation: "", translatedTo: "", type: "normal" };
  assert.equal(applySmartTranslationResult(japaneseTag, "back", "en", "ja"), true);
  assert.equal(japaneseTag.value, "(back:1.20)");
  assert.equal(japaneseTag.translation, "背中");
  assert.equal(japaneseTag.translatedTo, "ja");

  const englishTag = { value: "1girl", translation: "", translatedTo: "", type: "normal" };
  assert.equal(applySmartTranslationResult(englishTag, "1人の女の子", "ja", "ja"), true);
  assert.equal(englishTag.value, "1girl");
  assert.equal(englishTag.translation, "1人の女の子");
});

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
