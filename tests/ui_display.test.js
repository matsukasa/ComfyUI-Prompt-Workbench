import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  appendPresentChildren,
  cleanTranslation,
  compactNodeWidgetLayout,
  containNodeContextMenu,
  filterExampleLibraryTags,
  getTagDisplayText,
  hideWidgetForGood,
  resolveExampleCategoryPath,
  translationBatchTimeoutMs,
} from "../web/prompt_editor.js";

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
  assert.equal(widget.options.hidden, true);
  assert.equal(inputEl.style.display, "none");
  assert.equal(removed, true);
  assert.equal(await widget.serializeValue(), "1girl");
});

test("custom editor starts at the top of the node widget area", () => {
  const node = { widgets_start_y: 96 };
  compactNodeWidgetLayout(node);
  assert.equal(node.widgets_start_y, 1);
});

test("workflow reload reapplies the compact widget layout after configuration", () => {
  const source = readFileSync(new URL("../web/prompt_all_in_one.js", import.meta.url), "utf8");
  assert.match(source, /nodeType\.prototype\.onConfigure/u);
  assert.match(source, /queueMicrotask\(stabilize\)/u);
  assert.match(source, /requestAnimationFrame\(stabilize\)/u);
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

test("example tags display English prompt and Japanese translation together", () => {
  const source = readFileSync(new URL("../web/prompt_editor.js", import.meta.url), "utf8");
  assert.match(source, /paio-example-chip-prompt/u);
  assert.match(source, /paio-example-chip-translation/u);
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

test("tag manager exposes a dedicated drag handle and drop position feedback", () => {
  const source = readFileSync(new URL("../web/prompt_editor.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("../web/prompt_all_in_one.css", import.meta.url), "utf8");
  assert.match(source, /paio-tag-drag-handle/u);
  assert.match(source, /reorderTagEdits/u);
  assert.match(source, /dragstart/u);
  assert.match(css, /\.paio-tag-edit-row\.is-drop-before/u);
  assert.match(css, /\.paio-tag-edit-row\.is-drop-after/u);
});

test("tag manager exposes named catalog load and save without an overwrite action", () => {
  const source = readFileSync(new URL("../web/prompt_editor.js", import.meta.url), "utf8");
  assert.match(source, /使用するファイル/u);
  assert.match(source, /編集結果を別名で保存/u);
  assert.match(source, /button\("読み込む"/u);
  assert.match(source, /button\("別名で保存"/u);
  assert.doesNotMatch(source, /button\("上書き保存"/u);
});

test("large translation batches receive a longer bounded timeout", () => {
  assert.equal(translationBatchTimeoutMs(1), 12000);
  assert.equal(translationBatchTimeoutMs(40), 20000);
  assert.equal(translationBatchTimeoutMs(100), 30000);
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
