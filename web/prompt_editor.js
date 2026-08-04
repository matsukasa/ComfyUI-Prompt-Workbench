import {
  adjustTagWeight,
  canonicalTagKey,
  classifyTag,
  compileBlacklist,
  createTag,
  findDuplicateKeys,
  getTagWeight,
  matchesBlacklist,
  normalizePromptTags,
  outputPrompt,
  parseExplicitWeight,
  parsePrompt,
  serializePrompt,
<<<<<<< HEAD
  setTagWeight,
=======
>>>>>>> 6370d6dc927602ebddc0a04713de4d385119ea2d
} from "./prompt_parser.js";
import {
  DEFAULT_SETTINGS,
  exportEditorState,
  parseImportedState,
  sanitizeEditorState,
} from "./settings.js";
import { translateTags } from "./translation.js";
import {
  buildTagLibrary,
  deleteCategoryEdit,
  deleteTagEdit,
<<<<<<< HEAD
  libraryToBundledCatalog,
  libraryToStoredCatalog,
  reorderTagEdits,
=======
  libraryToExampleData,
>>>>>>> 6370d6dc927602ebddc0a04713de4d385119ea2d
  saveCategoryEdit,
  saveTagEdit,
  sanitizeLibraryEdits,
} from "./tag_library.js";

const STATE_KEY = "promptAllInOneState";
const MAX_RENDERED_TAGS = 250;
const INITIAL_EXAMPLE_LIMIT = 24;
const EXAMPLE_PAGE_SIZE = 24;
<<<<<<< HEAD
const MAX_EXAMPLE_SEARCH_RESULTS = 50;
const MAX_CATALOG_FILE_BYTES = 4 * 1024 * 1024;
const CATALOG_FILE_PICKER_TYPES = [{
  description: "JSONタグファイル",
  accept: { "application/json": [".json"] },
}];
const CATALOG_FILE_PICKER_ID = "prompt-workbench-catalog-save";
const DEFAULT_EXAMPLE_LIST_HEIGHT = 118;
const MIN_EXAMPLE_LIST_HEIGHT = 96;
const MAX_EXAMPLE_LIST_HEIGHT = 520;
const BASE_DOM_WIDGET_HEIGHT = 690;
const BASE_NODE_HEIGHT = 760;
=======
>>>>>>> 6370d6dc927602ebddc0a04713de4d385119ea2d
const COLOR_DEFAULTS = {
  normal: "#7b8794", disabled: "#6b7280", lora: "#3b82f6", lycoris: "#a855f7",
  embedding: "#14b8a6", wildcard: "#eab308", duplicate: "#f59e0b",
  blacklist: "#ef4444", missing: "#ef4444", error: "#dc2626",
};

function element(tagName, options = {}, children = []) {
  const node = document.createElement(tagName);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = String(options.text);
  if (options.type) node.type = options.type;
  if (options.title) node.title = options.title;
  if (options.ariaLabel) node.setAttribute("aria-label", options.ariaLabel);
  for (const [name, value] of Object.entries(options.dataset || {})) node.dataset[name] = value;
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child) node.append(child);
  }
  return node;
}

export function appendPresentChildren(parent, ...children) {
  parent.append(...children.filter((child) => child !== null && child !== undefined));
}

function button(label, action, title = label) {
  const control = element("button", {
    className: "paio-button",
    text: label,
    type: "button",
    title,
  });
  control.addEventListener("click", action);
  return control;
}

function download(name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const area = document.createElement("textarea");
  area.value = text;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.append(area);
  area.select();
  document.execCommand("copy");
  area.remove();
}

function openDialog(dialog) {
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

function closeDialog(dialog) {
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

export function cleanTranslation(value) {
  return String(value ?? "").trim().split(/\s+/u)
    .filter((token) => !/^(null|undefined)$/iu.test(token)).join(" ").trim();
}

<<<<<<< HEAD
export async function fetchExampleCatalog(api, libraryFile = "") {
  const query = libraryFile ? `?file=${encodeURIComponent(libraryFile)}` : "";
  const response = await api.fetchApi(`/prompt_all_in_one/examples${query}`);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `タグファイルの読込に失敗しました (${response.status})`);
  return body;
}

export function catalogNameFromFileName(fileName) {
  let name = String(fileName || "").normalize("NFKC").replace(/\.json$/iu, "");
  name = name.replace(/[^\p{L}\p{N}_ -]+/gu, "_").replace(/\s+/gu, " ").trim();
  name = name.slice(0, 64).trim();
  if (!name) name = "imported_tags";
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/iu.test(name)) name = `${name}_catalog`;
  return name.slice(0, 64);
}

export function suggestedCatalogFileName(fileName, now = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${catalogNameFromFileName(fileName || "tag_catalog")}_${date}_${time}.json`;
}

export async function upsertCatalogCopy(api, fileName, catalog, options = {}) {
  const requestedName = catalogNameFromFileName(fileName);
  const listResponse = await api.fetchApi("/prompt_all_in_one/catalogs");
  const listBody = await listResponse.json().catch(() => ({}));
  if (!listResponse.ok) throw new Error(listBody.error || `保存済みファイルの確認に失敗しました (${listResponse.status})`);
  const existingName = (listBody.files || []).find((name) => String(name).toLocaleLowerCase() === requestedName.toLocaleLowerCase());
  const send = async (method, name) => {
    const response = await api.fetchApi("/prompt_all_in_one/catalogs", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, catalog }),
    });
    const body = await response.json().catch(() => ({}));
    return { response, body };
  };
  let result = await send(existingName ? "PUT" : "POST", existingName || requestedName);
  if (!existingName && result.response.status === 409) result = await send("PUT", requestedName);
  if (result.response.status === 405) {
    if (existingName && options.allowLoadFallback) {
      return { name: existingName, filename: `${existingName}.json`, compatibilityFallback: true };
    }
    throw new Error("この保存機能を有効にするにはComfyUIを再起動してください");
  }
  if (!result.response.ok) throw new Error(result.body.error || `タグファイルの保存に失敗しました (${result.response.status})`);
  return result.body;
}

export async function writeCatalogFile(handle, catalog) {
  const writable = await handle.createWritable();
  try {
    await writable.write(`${JSON.stringify(catalog, null, 2)}\n`);
    await writable.close();
  } catch (error) {
    await writable.abort?.().catch(() => {});
    throw error;
  }
}

export async function buildCompleteCatalogForSave(loadSource, edits) {
  const completeSource = await loadSource();
  return libraryToBundledCatalog(buildTagLibrary(completeSource, edits), completeSource);
}

export function parseImportedCatalogText(value) {
  const parsed = JSON.parse(String(value || ""));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("タグファイルの内容が正しくありません");
  }
  const library = buildTagLibrary(parsed);
  if (!library.categories.length) throw new Error("読み込めるカテゴリーがありません");
  const categoryIds = new Set(library.categories.map((category) => category.id));
  if (library.tags.some((tag) => !tag.prompt || !categoryIds.has(tag.categoryId))) {
    throw new Error("タグファイルのカテゴリー構造が正しくありません");
  }
  return libraryToBundledCatalog(library, parsed);
}

export function containsJapaneseText(value) {
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(String(value || ""));
}

export function translatableTagText(value) {
  const text = String(value || "").trim();
  const weighted = parseExplicitWeight(text);
  if (weighted) return weighted.body.trim();
  const wrapped = text.match(/^([([])([\s\S]+)([)\]])$/u);
  const pairs = { "(": ")", "[": "]" };
  if (wrapped && pairs[wrapped[1]] === wrapped[3]) return wrapped[2].trim();
  return text;
}

export function replaceTagTextPreservingSyntax(value, replacement) {
  const text = String(value || "").trim();
  const next = String(replacement || "").trim();
  if (!next) return text;
  const weighted = parseExplicitWeight(text);
  if (weighted) return `${weighted.open}${next}:${weighted.weight.toFixed(2)}${weighted.close}`;
  const wrapped = text.match(/^([([])([\s\S]+)([)\]])$/u);
  const pairs = { "(": ")", "[": "]" };
  if (wrapped && pairs[wrapped[1]] === wrapped[3]) return `${wrapped[1]}${next}${wrapped[3]}`;
  return next;
}

export function applySmartTranslationResult(tag, translatedValue, target, localLanguage = "ja") {
  const translated = cleanTranslation(translatedValue);
  if (!tag || !translated) return false;
  if (target === "en" && containsJapaneseText(translated)) return false;
  if (target.toLocaleLowerCase().startsWith("ja") && !containsJapaneseText(translated)) return false;

  const sourceText = translatableTagText(tag.value);
  if (target === "en" && containsJapaneseText(sourceText)) {
    tag.value = replaceTagTextPreservingSyntax(tag.value, translated);
    tag.translation = sourceText;
    tag.translatedTo = localLanguage;
    tag.type = classifyTag(tag.value);
  } else {
    tag.translation = translated;
    tag.translatedTo = target;
  }
  tag.translationError = "";
  tag.translationErrorTarget = "";
  return true;
}

=======
>>>>>>> 6370d6dc927602ebddc0a04713de4d385119ea2d
export function getTagDisplayText(tag, settings) {
  const translation = cleanTranslation(tag?.translation);
  const displayMode = settings?.translationDisplay || "original";
  const localTranslation = translation && tag?.translatedTo === settings?.localLanguage ? translation : "";
  const primary = displayMode === "local" && localTranslation ? localTranslation : (tag?.value || "空タグ");
  const secondary = displayMode === "both" && translation && translation !== tag?.value ? translation : "";
  return { primary, secondary };
}

<<<<<<< HEAD
export function hideWidgetForGood(widget, suffix = "") {
=======
function hideWidgetForGood(widget, suffix = "") {
>>>>>>> 6370d6dc927602ebddc0a04713de4d385119ea2d
  if (!widget) return;
  if (!Object.hasOwn(widget, "paioOriginalType")) {
    widget.paioOriginalType = widget.type;
    widget.paioOriginalComputeSize = widget.computeSize;
    widget.paioOriginalDraw = widget.draw;
<<<<<<< HEAD
    widget.paioOriginalSerializeValue = widget.serializeValue;
  }
  widget.hidden = true;
  widget.visible = false;
  widget.computeSize = () => [0, 0];
  widget.draw = () => {};
  widget.y = 0;
  widget.last_y = 0;
  if (Object.hasOwn(widget, "computedHeight")) widget.computedHeight = 0;
  widget.type = `converted-widget${suffix}`;
  widget.serialize = true;
  widget.serializeValue = async () => widget.value;
  widget.options = { ...widget.options, hidden: true, serialize: true };
  for (const widgetElement of [widget.element, widget.inputEl, widget.el]) {
    if (!widgetElement) continue;
    if (widgetElement.style) {
      Object.assign(widgetElement.style, {
        border: "0", display: "none", height: "0", margin: "0",
        maxHeight: "0", minHeight: "0", overflow: "hidden", padding: "0",
        pointerEvents: "none", visibility: "hidden", width: "0",
      });
    }
    widgetElement.remove?.();
  }
  for (const linked of widget.linkedWidgets || []) hideWidgetForGood(linked, `:${widget.name}`);
}

export function removeUnlinkedWidgetInput(node, widgetName) {
  if (!Array.isArray(node?.inputs) || !widgetName) return 0;
  let removed = 0;
  for (let index = node.inputs.length - 1; index >= 0; index -= 1) {
    const input = node.inputs[index];
    const belongsToWidget = input?.name === widgetName || input?.widget?.name === widgetName;
    const isLinked = input?.link !== null && input?.link !== undefined
      || Array.isArray(input?.links) && input.links.length > 0;
    if (!belongsToWidget || isLinked) continue;
    if (typeof node.removeInput === "function") node.removeInput(index);
    else node.inputs.splice(index, 1);
    removed += 1;
  }
  return removed;
}

export function removeWidgetFromLayout(node, widget) {
  if (!Array.isArray(node?.widgets) || !widget) return false;
  const index = node.widgets.indexOf(widget);
  if (index < 0) return false;
  node.widgets.splice(index, 1);
  return true;
}

export function compactNodeWidgetLayout(node) {
  if (!node) return;
  node.widgets_start_y = 1;
}

export function containNodeContextMenu(root) {
  root?.addEventListener?.("pointerdown", (event) => {
    if (event.button === 2) event.stopPropagation();
  });
  root?.addEventListener?.("contextmenu", (event) => {
    event.stopPropagation();
    const editingTarget = event.target?.closest?.("input, textarea, [contenteditable='true']");
    if (!editingTarget) event.preventDefault();
  });
}

export function resolveExampleCategoryPath(library, requested = {}) {
  const categories = library?.categories || [];
  const children = (parentId, level) => categories.filter((item) => item.parentId === parentId && item.level === level);
  const largeOptions = categories.filter((item) => item.level === "large");
  const large = largeOptions.find((item) => item.id === requested.largeId) || largeOptions[0] || null;
  const mediumOptions = large ? children(large.id, "medium") : [];
  const medium = mediumOptions.find((item) => item.id === requested.mediumId) || mediumOptions[0] || null;
  const smallOptions = medium ? children(medium.id, "small") : [];
  const small = smallOptions.find((item) => item.id === requested.smallId) || smallOptions[0] || null;
  return { large, medium, small, largeOptions, mediumOptions, smallOptions };
}

export function filterExampleLibraryTags(library, selectedSmallId, query = "") {
  const normalizedQuery = String(query).trim().toLocaleLowerCase();
  const categories = new Map((library?.categories || []).map((category) => [category.id, category]));
  return (library?.tags || []).filter((tag) => {
    if (!normalizedQuery) return tag.categoryId === selectedSmallId;
    const small = categories.get(tag.categoryId);
    const medium = categories.get(small?.parentId);
    const large = categories.get(medium?.parentId);
    return [tag.prompt, ...(tag.aliases || []), large?.ja, medium?.ja, small?.ja]
      .filter(Boolean).join(" ").toLocaleLowerCase().includes(normalizedQuery);
  });
}

export function translationBatchTimeoutMs(itemCount) {
  return Math.max(12000, Math.min(30000, Math.max(1, Number(itemCount) || 1) * 500));
}

export function clampExampleListHeight(value) {
  return Math.min(MAX_EXAMPLE_LIST_HEIGHT, Math.max(MIN_EXAMPLE_LIST_HEIGHT, Math.round(Number(value) || DEFAULT_EXAMPLE_LIST_HEIGHT)));
}

=======
  }
  widget.hidden = true;
  widget.computeSize = () => [0, -4];
  widget.draw = () => {};
  widget.type = `converted-widget${suffix}`;
  for (const linked of widget.linkedWidgets || []) hideWidgetForGood(linked, `:${widget.name}`);
}

>>>>>>> 6370d6dc927602ebddc0a04713de4d385119ea2d
export class PromptEditor {
  constructor(node, widgets, api) {
    this.node = node;
    this.widgets = widgets;
    this.api = api;
    this.tags = [];
    this.settings = { ...DEFAULT_SETTINGS };
    this.filterText = "";
    this.filterMode = "all";
    this.undoStack = [];
    this.redoStack = [];
    this.lastSelectedIndex = null;
    this.dragIndex = null;
    this.didDrag = false;
    this.clickTimer = null;
    this.renderLimit = MAX_RENDERED_TAGS;
    this.promptDirty = false;
    this.contextMenu = null;
    this.modelRegistry = { loras: null, embeddings: null };
    this.syncing = false;
    this.lastWidgetValue = "";
    this.exampleData = null;
    this.exampleLoadPromise = null;
    this.refreshExamplesPanel = null;
<<<<<<< HEAD
    this.domWidget = null;
=======
>>>>>>> 6370d6dc927602ebddc0a04713de4d385119ea2d
    this.restore();
    this.root = this.build();
    this.attach();
    this.loadModelRegistry();
    this.pollTimer = window.setInterval(() => this.syncFromWidgets(), 400);
  }

  get currentTags() {
    return this.tags;
  }

  promptEditorValue() {
    return serializePrompt(this.tags, { includeDisabled: true });
  }

  snapshot() {
    return typeof structuredClone === "function"
      ? structuredClone({ tags: this.tags, settings: this.settings })
      : JSON.parse(JSON.stringify({ tags: this.tags, settings: this.settings }));
  }

  pushUndo() {
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  restoreSnapshot(snapshot) {
    this.tags = snapshot.tags;
    this.settings = snapshot.settings;
    this.promptDirty = false;
    this.syncToWidgets();
    this.render();
  }

  undo() {
    const snapshot = this.undoStack.pop();
    if (!snapshot) return this.setStatus("元に戻す操作はありません");
    this.redoStack.push(this.snapshot());
    this.restoreSnapshot(snapshot);
  }

  redo() {
    const snapshot = this.redoStack.pop();
    if (!snapshot) return this.setStatus("やり直す操作はありません");
    this.undoStack.push(this.snapshot());
    this.restoreSnapshot(snapshot);
  }

  restore() {
    const widgetValue = String(this.widgets.prompt?.value || "");
    const saved = this.node.properties?.[STATE_KEY];
    if (saved?.version === 1) {
      const state = sanitizeEditorState(saved);
      this.settings = state.settings;
      this.tags = state.tags.map((tag) => createTag(tag.value, tag));
      const savedValue = outputPrompt(this.tags, this.settings.outputLanguage);
      if (widgetValue !== savedValue) this.tags = parsePrompt(widgetValue).tags;
    } else {
      this.tags = parsePrompt(widgetValue).tags;
    }
    this.lastWidgetValue = widgetValue;
    this.applyBlacklist(this.settings.blacklistAction !== "warn");
  }

  persist() {
    this.node.properties ||= {};
    this.node.properties[STATE_KEY] = sanitizeEditorState({
      version: 1,
      tags: this.tags,
      settings: this.settings,
    });
    this.node.graph?.setDirtyCanvas?.(true, true);
  }

  syncToWidgets() {
    this.syncing = true;
    const value = outputPrompt(this.tags, this.settings.outputLanguage);
    const widget = this.widgets.prompt;
    if (widget && widget.value !== value) {
      widget.value = value;
      widget.callback?.(value, this.node, widget);
    }
    this.lastWidgetValue = value;
    this.persist();
    this.syncing = false;
  }

  syncFromWidgets() {
    compactNodeWidgetLayout(this.node);
    for (const widget of Object.values(this.widgets)) {
      hideWidgetForGood(widget, widget?.name ? `:${widget.name}` : "");
    }
    if (this.syncing) return;
    const value = String(this.widgets.prompt?.value || "");
    const changed = value !== this.lastWidgetValue;
    if (changed) {
      this.tags = parsePrompt(value, this.tags).tags;
      this.lastWidgetValue = value;
    }
    if (changed) {
      this.applyBlacklist(this.settings.blacklistAction !== "warn");
      this.persist();
      this.render();
      this.setStatus("STRINGウィジェットの変更を反映しました");
    }
  }

  build() {
    const root = element("section", { className: "paio-editor" });
    root.setAttribute("aria-label", "Prompt Workbench editor");
<<<<<<< HEAD
    containNodeContextMenu(root);
=======
>>>>>>> 6370d6dc927602ebddc0a04713de4d385119ea2d

    const promptHeader = element("div", { className: "paio-section-header" }, [
      element("strong", { text: "プロンプト本文" }),
    ]);
    this.syncBadge = element("span", { className: "paio-sync-badge", text: "同期済み" });
    promptHeader.append(this.syncBadge);

    this.promptTextarea = element("textarea", { className: "paio-prompt-textarea" });
    this.promptTextarea.rows = 4;
<<<<<<< HEAD
    this.promptTextarea.placeholder = "プロンプトを入力するか、下のタグ追加から選んでください";
=======
    this.promptTextarea.placeholder = "プロンプトを入力するか、下の例から追加してください";
>>>>>>> 6370d6dc927602ebddc0a04713de4d385119ea2d
    this.promptTextarea.setAttribute("aria-label", "現在のプロンプト本文");
    this.promptTextarea.addEventListener("input", () => {
      this.promptDirty = true;
      this.renderSyncState();
    });
    this.promptTextarea.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        this.applyPromptText();
      }
    });
    this.applyPromptButton = button("タグへ反映", () => this.applyPromptText(), "本文を解析してタグへ反映（Ctrl+Enter）");
<<<<<<< HEAD
    const promptActions = element("div", { className: "paio-prompt-actions" }, [this.applyPromptButton]);
=======
    const promptActions = element("div", { className: "paio-prompt-actions" }, [
      element("span", { className: "paio-hint", text: "無効タグも表示します" }),
      this.applyPromptButton,
    ]);
>>>>>>> 6370d6dc927602ebddc0a04713de4d385119ea2d
    this.translationBar = this.buildTranslationBar();

    this.addInput = element("textarea", { className: "paio-add-input" });
    this.addInput.rows = 1;
    this.addInput.placeholder = "タグを追加（Enter）";
    this.addInput.setAttribute("aria-label", "追加するプロンプトタグ");
    this.addInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        this.addFromInput();
      }
    });
    this.searchInput = element("input", { className: "paio-search" });
    this.searchInput.type = "search";
    this.searchInput.placeholder = "原文・翻訳を検索";
    this.searchInput.addEventListener("input", () => {
      this.filterText = this.searchInput.value;
      this.renderTags();
    });
    this.filterSelect = element("select", { className: "paio-select" });
    const filters = [
      ["all", "すべて"], ["enabled", "有効"], ["disabled", "無効"],
      ["normal", "通常"], ["lora", "LoRA"], ["embedding", "Embedding"],
      ["duplicate", "重複"], ["blacklist", "ブラックリスト"],
      ["untranslated", "未翻訳"],
    ];
    for (const [value, label] of filters) {
      const option = element("option", { text: label });
      option.value = value;
      this.filterSelect.append(option);
    }
    this.filterSelect.addEventListener("change", () => {
      this.filterMode = this.filterSelect.value;
      this.renderTags();
    });

    const addRow = element("div", { className: "paio-add-row" }, [
      this.addInput,
      button("追加", () => this.addFromInput()),
    ]);
    const tools = element("div", { className: "paio-toolbar" }, [
      this.searchInput,
      this.filterSelect,
      button("↶", () => this.undo(), "元に戻す"),
      button("↷", () => this.redo(), "やり直す"),
      button("整形", () => this.normalize(false)),
      button("重複削除", () => this.normalize(true)),
      button("禁止", () => openDialog(this.blacklistDialog), "ブラックリスト"),
      button("設定", () => openDialog(this.settingsDialog)),
    ]);

    this.bulkBar = element("div", { className: "paio-bulk" });
    this.tagSummary = element("div", { className: "paio-tag-summary" });
    this.tagList = element("div", { className: "paio-tags" });
    this.tagList.setAttribute("role", "list");
    this.status = element("p", { className: "paio-status", text: "準備完了" });
    this.status.setAttribute("aria-live", "polite");

    this.settingsDialog = this.buildSettingsDialog();
    this.examplesPanel = this.buildExamplesPanel();
    this.blacklistDialog = this.buildBlacklistDialog();
    this.ioDialog = this.buildIoDialog();

    root.append(
      promptHeader,
      this.promptTextarea,
      promptActions,
      this.translationBar,
      addRow,
      tools,
      this.bulkBar,
      this.tagSummary,
      this.tagList,
      this.status,
      this.examplesPanel,
      this.settingsDialog,
      this.blacklistDialog,
      this.ioDialog,
    );
    return root;
  }

  attach() {
<<<<<<< HEAD
    const promptWidget = this.widgets.prompt;
    hideWidgetForGood(promptWidget, ":prompt");
    const domWidget = this.node.addDOMWidget("prompt", "div", this.root, {
      serialize: true,
=======
    for (const widget of Object.values(this.widgets)) {
      hideWidgetForGood(widget, widget?.name ? `:${widget.name}` : "");
    }
    const domWidget = this.node.addDOMWidget("prompt_editor", "div", this.root, {
      serialize: false,
>>>>>>> 6370d6dc927602ebddc0a04713de4d385119ea2d
      hideOnZoom: false,
      getValue: () => String(promptWidget?.value || ""),
      setValue: (value) => {
        if (promptWidget) promptWidget.value = String(value || "");
      },
    });
<<<<<<< HEAD
    this.domWidget = domWidget;
    domWidget.serialize = true;
    domWidget.serializeValue = async () => String(promptWidget?.value || "");
    domWidget.computeSize = (width) => [width, BASE_DOM_WIDGET_HEIGHT + this.settings.exampleListHeight - DEFAULT_EXAMPLE_LIST_HEIGHT];
    removeWidgetFromLayout(this.node, promptWidget);
    this.stabilizeLayout();
    this.node.setSize([
      Math.max(this.node.size?.[0] || 0, 540),
      Math.max(this.node.size?.[1] || 0, BASE_NODE_HEIGHT + this.settings.exampleListHeight - DEFAULT_EXAMPLE_LIST_HEIGHT),
    ]);
=======
    domWidget.computeSize = (width) => [width, 690];
    this.node.setSize([Math.max(this.node.size?.[0] || 0, 540), Math.max(this.node.size?.[1] || 0, 760)]);
>>>>>>> 6370d6dc927602ebddc0a04713de4d385119ea2d
    const previousRemoved = this.node.onRemoved;
    this.node.onRemoved = () => {
      clearInterval(this.pollTimer);
      clearTimeout(this.clickTimer);
      this.closeContextMenu();
      previousRemoved?.apply(this.node);
    };
    this.render();
  }

<<<<<<< HEAD
  stabilizeLayout() {
    removeUnlinkedWidgetInput(this.node, "prompt");
    compactNodeWidgetLayout(this.node);
    for (const widget of Object.values(this.widgets)) {
      hideWidgetForGood(widget, widget?.name ? `:${widget.name}` : "");
    }
    if (this.domWidget) {
      this.domWidget.y = 0;
      this.domWidget.last_y = 0;
    }
    this.node.graph?.setDirtyCanvas?.(true, true);
  }

=======
>>>>>>> 6370d6dc927602ebddc0a04713de4d385119ea2d
  buildTranslationBar() {
    const bar = element("div", { className: "paio-translation-bar" });
    const label = element("span", { className: "paio-translation-label", text: "表示" });
    const modes = element("div", { className: "paio-segmented" });
    this.translationDisplayButtons = new Map();
    for (const [value, text] of [["original", "原文"], ["local", "日本語"], ["both", "両方"]]) {
      const control = button(text, () => {
        this.settings.translationDisplay = value;
        this.persist();
        this.renderTranslationControls();
        this.renderTags();
      });
      control.classList.add("paio-segmented-button");
      control.setAttribute("aria-pressed", "false");
      this.translationDisplayButtons.set(value, control);
      modes.append(control);
    }

<<<<<<< HEAD
    this.translateButton = button("翻訳", () => this.translatePrompt(), "日本語タグを英語へ置換し、英語タグへ日本語訳を追加");
    this.translateButton.classList.add("paio-translate-button");
    bar.append(label, modes, this.translateButton);
=======
    this.translationMenu = element("details", { className: "paio-translation-menu" });
    const summary = element("summary", { className: "paio-button paio-translation-summary", text: "翻訳" });
    summary.setAttribute("aria-label", "翻訳操作を開く");
    const menu = element("div", { className: "paio-translation-popover" });
    menu.setAttribute("role", "menu");
    this.translationSelectionButtons = [];
    const menuAction = (text, action, selectionOnly = false) => {
      const control = button(text, () => {
        this.translationMenu.open = false;
        action();
      });
      control.className = "paio-translation-action";
      control.setAttribute("role", "menuitem");
      if (selectionOnly) this.translationSelectionButtons.push(control);
      return control;
    };
    menu.append(
      menuAction("選択タグを日本語へ", () => this.translateSelection(this.settings.localLanguage), true),
      menuAction("選択タグを英語へ", () => this.translateSelection("en"), true),
      element("hr", { className: "paio-menu-separator" }),
      menuAction("全タグを日本語へ", () => this.translateAll(this.settings.localLanguage)),
      menuAction("全タグを英語へ", () => this.translateAll("en")),
      menuAction("失敗した翻訳を再試行", () => this.retryFailedTranslations()),
    );
    this.translationMenu.append(summary, menu);
    bar.append(label, modes, this.translationMenu);
>>>>>>> 6370d6dc927602ebddc0a04713de4d385119ea2d
    return bar;
  }

  buildDialog(title) {
    const dialog = element("dialog", { className: "paio-dialog" });
    const heading = element("h3", { text: title });
    const close = button("閉じる", () => closeDialog(dialog));
    const body = element("div", { className: "paio-dialog-body" });
    dialog.append(heading, body, element("div", { className: "paio-dialog-footer" }, close));
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) closeDialog(dialog);
    });
    dialog.body = body;
    return dialog;
  }

  buildSettingsDialog() {
    const dialog = this.buildDialog("設定");
    dialog.classList.add("paio-settings-dialog");
    const step = element("select", { className: "paio-select" });
    for (const value of [0.05, 0.1, 0.25]) {
      const option = element("option", { text: value });
      option.value = value;
      step.append(option);
    }
    step.value = String(this.settings.weightStep);
    const duplicate = element("select", { className: "paio-select" });
    for (const [value, label] of [["allow", "許可"], ["skip", "追加しない"], ["move", "末尾へ移動"]]) {
      const option = element("option", { text: label });
      option.value = value;
      duplicate.append(option);
    }
    duplicate.value = this.settings.duplicatePolicy;
    const provider = element("select", { className: "paio-select" });
    for (const [value, label] of [["local", "無料翻訳（辞書→MyMemory）"], ["offline", "ローカル辞書のみ"], ["libretranslate", "LibreTranslate"], ["deepl", "DeepL"], ["openai", "OpenAI互換"]]) {
      const option = element("option", { text: label });
      option.value = value;
      provider.append(option);
    }
    provider.value = this.settings.translationProvider;
    const output = element("select", { className: "paio-select" });
    for (const [value, label] of [["en", "英語"], ["ja", "日本語"]]) {
      const option = element("option", { text: label });
      option.value = value;
      output.append(option);
    }
    output.value = this.settings.outputLanguage;
    const auto = element("input", { type: "checkbox" });
    auto.checked = this.settings.autoTranslate;
    const colorGrid = element("div", { className: "paio-color-grid" });
    const colorInputs = {};
    const colorLabels = {
      normal: "通常", disabled: "無効", lora: "LoRA", lycoris: "LyCORIS",
      embedding: "Embedding", wildcard: "ワイルドカード", duplicate: "重複",
      blacklist: "ブラックリスト", missing: "モデルなし", error: "翻訳エラー",
    };
    for (const [key, label] of Object.entries(colorLabels)) {
      const input = element("input");
      input.type = "color";
      input.value = this.settings.tagColors?.[key] || COLOR_DEFAULTS[key];
      colorInputs[key] = input;
      colorGrid.append(this.labeled(label, input));
    }
    const libraryManager = this.buildLibraryManager();
    const generalPanel = element("section", { className: "paio-settings-panel is-active", dataset: { panel: "general" } });
    generalPanel.append(
      element("h4", { text: "一般" }),
      this.labeled("重み刻み", step),
      this.labeled("重複時", duplicate),
      this.labeled("出力言語", output),
      element("p", { className: "paio-settings-caption", text: "タグ状態の色" }),
      colorGrid,
    );
    const translationPanel = element("section", { className: "paio-settings-panel", dataset: { panel: "translation" } });
    translationPanel.append(
      element("h4", { text: "翻訳" }),
      this.labeled("翻訳プロバイダー", provider),
      this.labeled("入力時に自動翻訳", auto),
<<<<<<< HEAD
      element("p", { className: "paio-settings-help", text: "上部の「翻訳」ボタンは、日本語タグを英語へ置換し、英語タグには日本語訳を追加します。" }),
=======
      element("p", { className: "paio-settings-help", text: "翻訳操作は上部の「翻訳」メニューから、選択中または全タグを対象に実行できます。" }),
>>>>>>> 6370d6dc927602ebddc0a04713de4d385119ea2d
    );
    const libraryPanel = element("section", { className: "paio-settings-panel paio-library-panel", dataset: { panel: "library" } }, libraryManager.root);
    const content = element("div", { className: "paio-settings-content" }, [generalPanel, translationPanel, libraryPanel]);
    const navigation = element("nav", { className: "paio-settings-nav", ariaLabel: "設定項目" });
    for (const [id, label] of [["general", "一般"], ["translation", "翻訳"], ["library", "タグ管理"]]) {
      const navButton = button(label, () => {
        navigation.querySelectorAll(".paio-button").forEach((item) => item.classList.toggle("is-active", item === navButton));
        content.querySelectorAll(".paio-settings-panel").forEach((item) => item.classList.toggle("is-active", item.dataset.panel === id));
        if (id === "library") libraryManager.refresh();
      });
      navButton.classList.add("paio-settings-nav-button");
      if (id === "general") navButton.classList.add("is-active");
      navigation.append(navButton);
    }
    const save = button("変更を保存", () => {
      this.pushUndo();
      this.settings.weightStep = Number(step.value);
      this.settings.duplicatePolicy = duplicate.value;
      this.settings.translationProvider = provider.value;
      this.settings.outputLanguage = output.value;
      this.settings.autoTranslate = auto.checked;
      this.settings.tagColors = Object.fromEntries(Object.entries(colorInputs).map(([key, input]) => [key, input.value]));
      this.settings.libraryEdits = libraryManager.getEdits();
      this.applyCustomColors();
      this.syncToWidgets();
      this.render();
      this.refreshExamplesPanel?.();
      closeDialog(dialog);
      this.setStatus("設定を保存しました。APIキーはワークフローに保存されません");
    });
    const shell = element("div", { className: "paio-settings-shell" }, [navigation, content]);
    dialog.body.append(shell);
    dialog.querySelector(".paio-dialog-footer")?.prepend(save);
    return dialog;
  }

  buildLibraryManager() {
    const root = element("div", { className: "paio-library-manager" });
    const heading = element("div", { className: "paio-library-heading" }, [
      element("div", {}, [element("h4", { text: "タグ管理" }), element("p", { text: "大分類 → 中分類 → 小分類 → タグの順で整理します。" })]),
    ]);
<<<<<<< HEAD
    const fileInput = element("input");
    fileInput.type = "file";
    fileInput.accept = ".json,application/json";
    fileInput.hidden = true;
    const fileStatus = element("span", { className: "paio-library-file-status", text: "保存先を確認中…" });
=======
    const modeTabs = element("div", { className: "paio-library-tabs" });
>>>>>>> 6370d6dc927602ebddc0a04713de4d385119ea2d
    const body = element("div", { className: "paio-library-body" });
    const treePane = element("section", { className: "paio-library-tree" });
    const detailPane = element("section", { className: "paio-library-detail" });
    const search = element("input", { className: "paio-search" });
    search.type = "search";
    search.placeholder = "カテゴリーやタグを検索";
<<<<<<< HEAD
    let edits = sanitizeLibraryEdits(this.settings.libraryEdits);
    let selectedId = "";
    let serial = 0;
    let currentCatalogFileHandle = null;
    let currentSourceFileName = this.settings.libraryFile ? `${this.settings.libraryFile}.json` : "tag_catalog.json";
    const collapsedCategoryIds = new Set();
    const source = () => this.exampleData || { categories: [] };
    const getLibrary = () => buildTagLibrary(source(), edits);
    const hasEdits = () => edits.categories.length > 0 || edits.tags.length > 0;
    let overwriteButton;
    const refreshFileStatus = async () => {
      try {
        const query = this.settings.libraryFile ? `?selected=${encodeURIComponent(this.settings.libraryFile)}` : "";
        const response = await this.api.fetchApi(`/prompt_all_in_one/catalogs${query}`);
        const responseBody = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(responseBody.error || `ファイル情報の取得に失敗しました (${response.status})`);
        const canOverwrite = Boolean(this.settings.libraryFile && responseBody.exists);
        overwriteButton.disabled = !canOverwrite;
        overwriteButton.title = canOverwrite ? `${this.settings.libraryFile}.json を上書き保存` : "デフォルトは上書きできません。別名で保存してください";
        fileStatus.classList.remove("is-error");
        fileStatus.textContent = this.settings.libraryFile
          ? (responseBody.exists ? `使用中: ${this.settings.libraryFile}.json` : "指定ファイルがないためデフォルトを使用中")
          : "使用中: デフォルト";
      } catch (error) {
        overwriteButton.disabled = true;
        fileStatus.textContent = error.message;
        fileStatus.classList.add("is-error");
      }
    };
    const loadSelectedCatalog = async (selectedFile, fileHandle = null) => {
      loadButton.disabled = true;
      loadButton.textContent = "読み込み中…";
      fileStatus.textContent = `${selectedFile.name} を確認中…`;
      fileStatus.classList.remove("is-error");
      try {
        if (selectedFile.size > MAX_CATALOG_FILE_BYTES) throw new Error("タグファイルは4 MB以下にしてください");
        if (!selectedFile.name.toLocaleLowerCase().endsWith(".json")) throw new Error("JSONファイルを選択してください");
        const catalog = parseImportedCatalogText(await selectedFile.text());
        const saved = await upsertCatalogCopy(this.api, selectedFile.name, catalog, { allowLoadFallback: true });
        this.pushUndo();
        this.settings.libraryFile = saved.name;
        this.settings.libraryEdits = { categories: [], tags: [] };
        edits = sanitizeLibraryEdits({});
        this.exampleData = catalog;
        this.exampleLoadPromise = Promise.resolve(catalog);
        currentCatalogFileHandle = fileHandle;
        currentSourceFileName = selectedFile.name;
        this.syncToWidgets();
        render();
        this.refreshExamplesPanel?.();
        await refreshFileStatus();
        this.setStatus(saved.compatibilityFallback
          ? `${selectedFile.name} を読み込みました。同名コピーの更新にはComfyUIの再起動が必要です`
          : `${selectedFile.name} を読み込みました`);
      } catch (error) {
        fileStatus.textContent = error.message;
        fileStatus.classList.add("is-error");
        this.setStatus(error.message, true);
      } finally {
        loadButton.disabled = false;
        loadButton.textContent = "ファイルを選んで読み込む";
        fileInput.value = "";
      }
    };
    const openCatalogFile = async () => {
      if (hasEdits()) {
        const confirmed = window.confirm("編集内容は保存されていません。破棄して別のタグファイルを読み込みますか？");
        if (!confirmed) {
          const message = "読み込みをキャンセルしました。編集内容は保持されています";
          fileStatus.textContent = message;
          fileStatus.classList.remove("is-error");
          return this.setStatus(message);
        }
      }
      if (typeof window.showOpenFilePicker !== "function") {
        fileInput.value = "";
        fileInput.click();
        return;
      }
      try {
        const [fileHandle] = await window.showOpenFilePicker({
          id: CATALOG_FILE_PICKER_ID,
          multiple: false,
          types: CATALOG_FILE_PICKER_TYPES,
        });
        await loadSelectedCatalog(await fileHandle.getFile(), fileHandle);
      } catch (error) {
        if (error?.name === "AbortError") return this.setStatus("読み込みをキャンセルしました");
        fileStatus.textContent = error.message;
        fileStatus.classList.add("is-error");
        this.setStatus(error.message, true);
      }
    };
    const loadButton = button("ファイルを選んで読み込む", openCatalogFile, "JSONタグファイルを選んで読み込む");
    fileInput.addEventListener("change", async () => {
      const selectedFile = fileInput.files?.[0];
      if (!selectedFile) return;
      await loadSelectedCatalog(selectedFile);
    });
    const applySavedCatalog = async (catalog, responseBody, message) => {
      this.pushUndo();
      this.settings.libraryFile = responseBody.name;
      this.settings.libraryEdits = { categories: [], tags: [] };
      edits = sanitizeLibraryEdits({});
      this.exampleData = catalog;
      this.exampleLoadPromise = Promise.resolve(catalog);
      this.syncToWidgets();
      render();
      this.refreshExamplesPanel?.();
      await refreshFileStatus();
      this.setStatus(message);
    };
    let saveAsButton;
    const saveAsNewFile = async () => {
      const suggestedName = suggestedCatalogFileName(currentSourceFileName);
      saveAsButton.disabled = true;
      try {
        const catalog = await buildCompleteCatalogForSave(() => this.loadExampleData(), edits);
        let savedFileName = suggestedName;
        let savedFileHandle = null;
        if (typeof window.showSaveFilePicker === "function") {
          const pickerOptions = {
            id: CATALOG_FILE_PICKER_ID,
            suggestedName,
            types: CATALOG_FILE_PICKER_TYPES,
          };
          if (currentCatalogFileHandle) pickerOptions.startIn = currentCatalogFileHandle;
          savedFileHandle = await window.showSaveFilePicker(pickerOptions);
          savedFileName = savedFileHandle.name;
          await writeCatalogFile(savedFileHandle, catalog);
        } else {
          download(savedFileName, `${JSON.stringify(catalog, null, 2)}\n`, "application/json");
        }
        const responseBody = await upsertCatalogCopy(this.api, savedFileName, catalog);
        currentCatalogFileHandle = savedFileHandle;
        currentSourceFileName = savedFileName;
        await applySavedCatalog(catalog, responseBody, `${savedFileName} に別名保存しました`);
      } catch (error) {
        if (error?.name === "AbortError") return this.setStatus("別名保存をキャンセルしました");
        fileStatus.textContent = error.message;
        fileStatus.classList.add("is-error");
        this.setStatus(error.message, true);
      } finally {
        saveAsButton.disabled = false;
      }
    };
    const overwriteCurrentFile = async () => {
      const name = this.settings.libraryFile;
      if (!name) return this.setStatus("デフォルトは上書きできません。別名で保存してください", true);
      const targetName = currentCatalogFileHandle?.name || `${name}.json`;
      if (!window.confirm(`${targetName} を上書き保存しますか？`)) return this.setStatus("上書き保存をキャンセルしました");
      overwriteButton.disabled = true;
      try {
        const catalog = await buildCompleteCatalogForSave(() => this.loadExampleData(), edits);
        if (currentCatalogFileHandle) await writeCatalogFile(currentCatalogFileHandle, catalog);
        const responseBody = await upsertCatalogCopy(this.api, targetName, catalog);
        await applySavedCatalog(catalog, responseBody, `${targetName} を上書き保存しました`);
      } catch (error) {
        fileStatus.textContent = error.message;
        fileStatus.classList.add("is-error");
        this.setStatus(error.message, true);
      }
    };
    overwriteButton = button("上書き保存", overwriteCurrentFile);
    overwriteButton.disabled = !this.settings.libraryFile;
    saveAsButton = button("別名で保存", saveAsNewFile);
    saveAsButton.classList.add("is-primary");
    const fileBar = element("section", { className: "paio-library-filebar" }, [
      element("div", { className: "paio-library-file-controls" }, [
        this.labeled("タグファイル", loadButton),
        fileInput,
      ]),
      fileStatus,
    ]);
    const saveBar = element("section", { className: "paio-library-savebar" }, [
      element("span", { className: "paio-hint", text: "タグとカテゴリーの変更をJSONへ保存" }),
      element("div", { className: "paio-library-save-actions" }, [overwriteButton, saveAsButton]),
    ]);
=======
    let mode = "category";
    let edits = sanitizeLibraryEdits(this.settings.libraryEdits);
    let selectedId = "";
    let serial = 0;
    const source = () => this.exampleData || { categories: [] };
    const getLibrary = () => buildTagLibrary(source(), edits);
>>>>>>> 6370d6dc927602ebddc0a04713de4d385119ea2d
    const createCategory = (level) => {
      const library = getLibrary();
      let parentId = "";
      const selected = library.categories.find((item) => item.id === selectedId);
      if (level === "medium") parentId = selected?.level === "large" ? selected.id : selected?.level === "medium" ? selected.parentId : library.categories.find((item) => item.level === "large")?.id || "";
      if (level === "small") parentId = selected?.level === "medium" ? selected.id : selected?.level === "small" ? selected.parentId : library.categories.find((item) => item.level === "medium")?.id || "";
      if (level !== "large" && !parentId) return this.setStatus("先に親カテゴリーを作成してください", true);
      const id = `custom-category-${Date.now()}-${serial++}`;
      edits = saveCategoryEdit(edits, { id, level, parentId, en: "New category", ja: "新しいカテゴリー", custom: true });
      selectedId = id;
      render();
    };
    const addBar = element("div", { className: "paio-library-addbar" }, [
      button("＋ 大分類", () => createCategory("large")),
      button("＋ 中分類", () => createCategory("medium")),
      button("＋ 小分類", () => createCategory("small")),
    ]);
    const showCategoryDetail = (library, category) => {
      if (!category) return detailPane.append(element("p", { className: "paio-empty", text: "左からカテゴリーを選択してください" }));
      const en = element("input", { className: "paio-search" }); en.value = category.en;
      const ja = element("input", { className: "paio-search" }); ja.value = category.ja;
<<<<<<< HEAD
      const stageCategoryName = () => {
        edits = saveCategoryEdit(edits, { ...category, en: en.value, ja: ja.value, custom: !category.builtin });
      };
      en.addEventListener("input", stageCategoryName);
      ja.addEventListener("input", stageCategoryName);
=======
      const save = button("名称を保存", () => {
        edits = saveCategoryEdit(edits, { ...category, en: en.value, ja: ja.value, custom: !category.builtin });
        render();
      });
>>>>>>> 6370d6dc927602ebddc0a04713de4d385119ea2d
      const destination = element("select", { className: "paio-select" });
      const empty = element("option", { text: "移動先を選択" }); empty.value = ""; destination.append(empty);
      for (const small of library.categories.filter((item) => item.level === "small" && item.id !== category.id)) {
        const option = element("option", { text: `${small.ja} / ${small.en}` }); option.value = small.id; destination.append(option);
      }
      const remove = button("カテゴリーを削除", () => {
        try {
          edits = deleteCategoryEdit(source(), edits, category.id, destination.value);
          selectedId = "";
          render();
        } catch (error) { this.setStatus(error.message, true); }
      });
      remove.classList.add("is-danger");
      detailPane.append(
        element("div", { className: "paio-library-detail-title" }, [element("span", { className: `paio-level-badge is-${category.level}`, text: { large: "大分類", medium: "中分類", small: "小分類" }[category.level] }), element("strong", { text: category.ja })]),
<<<<<<< HEAD
        this.labeled("英語名", en), this.labeled("日本語名", ja),
      );
      if (category.level === "small") detailPane.append(this.buildTagEditor(library, category, () => edits, (value, shouldRender = true) => { edits = value; if (shouldRender) render(); }));
=======
        this.labeled("英語名", en), this.labeled("日本語名", ja), save,
      );
      if (category.level === "small") detailPane.append(this.buildTagEditor(library, category, () => edits, (value) => { edits = value; render(); }));
>>>>>>> 6370d6dc927602ebddc0a04713de4d385119ea2d
      detailPane.append(element("div", { className: "paio-library-danger" }, [
        element("strong", { text: "カテゴリー削除" }),
        element("p", { text: "配下のタグがある場合は、小分類の移動先を選択してください。" }), destination, remove,
      ]));
    };
    const render = () => {
      const library = getLibrary();
      const query = search.value.trim().toLocaleLowerCase();
      treePane.replaceChildren(search, addBar);
      detailPane.replaceChildren();
<<<<<<< HEAD
      const categoriesById = new Map(library.categories.map((category) => [category.id, category]));
      const childrenByParent = new Map();
      for (const category of library.categories) {
        if (!childrenByParent.has(category.parentId)) childrenByParent.set(category.parentId, []);
        childrenByParent.get(category.parentId).push(category);
      }
      const matches = (category) => {
        if (!query) return true;
        if (`${category.en} ${category.ja}`.toLocaleLowerCase().includes(query)) return true;
        return library.tags.some((tag) => tag.categoryId === category.id && `${tag.prompt} ${tag.ja}`.toLocaleLowerCase().includes(query));
      };
      const visibleIds = new Set();
      const includeDescendants = (id) => {
        for (const child of childrenByParent.get(id) || []) {
          visibleIds.add(child.id);
          includeDescendants(child.id);
        }
      };
      if (query) {
        for (const category of library.categories.filter(matches)) {
          visibleIds.add(category.id);
          if (category.level !== "small") includeDescendants(category.id);
          let parentId = category.parentId;
          while (parentId) {
            visibleIds.add(parentId);
            parentId = categoriesById.get(parentId)?.parentId || "";
          }
        }
      }
      const displayed = [];
      const appendCategory = (category) => {
        if (query && !visibleIds.has(category.id)) return;
        displayed.push(category);
        const foldable = category.level !== "small";
        const collapsed = collapsedCategoryIds.has(category.id);
        const prefix = foldable ? `${collapsed ? "▸" : "▾"} ` : "";
        const row = button(`${prefix}${category.ja}  ${category.en}`, () => {
          selectedId = category.id;
          if (foldable) {
            if (collapsed) collapsedCategoryIds.delete(category.id);
            else collapsedCategoryIds.add(category.id);
          }
          render();
        });
        row.className = `paio-library-tree-row is-${category.level}${selectedId === category.id ? " is-selected" : ""}`;
        if (foldable) row.setAttribute("aria-expanded", String(!collapsed));
=======
      const visible = library.categories.filter((category) => {
        if (mode === "tag" && category.level !== "small") return false;
        if (!query) return true;
        if (`${category.en} ${category.ja}`.toLocaleLowerCase().includes(query)) return true;
        return library.tags.some((tag) => tag.categoryId === category.id && `${tag.prompt} ${tag.ja}`.toLocaleLowerCase().includes(query));
      });
      for (const category of visible) {
        const row = button(`${category.ja}  ${category.en}`, () => { selectedId = category.id; render(); });
        row.className = `paio-library-tree-row is-${category.level}${selectedId === category.id ? " is-selected" : ""}`;
>>>>>>> 6370d6dc927602ebddc0a04713de4d385119ea2d
        row.prepend(element("span", { className: `paio-level-badge is-${category.level}`, text: { large: "大", medium: "中", small: "小" }[category.level] }));
        treePane.append(row);
        if (category.level === "small") {
          const tags = library.tags.filter((tag) => tag.categoryId === category.id).slice(0, 8);
          if (tags.length) treePane.append(element("div", { className: "paio-tree-tag-preview" }, tags.map((tag) => element("span", { text: tag.prompt }))));
        }
<<<<<<< HEAD
        if (!collapsed || query) {
          for (const child of childrenByParent.get(category.id) || []) appendCategory(child);
        }
      };
      for (const category of childrenByParent.get("") || []) appendCategory(category);
      if (!displayed.some((item) => item.id === selectedId)) selectedId = displayed[0]?.id || "";
      showCategoryDetail(library, library.categories.find((item) => item.id === selectedId));
    };
    search.addEventListener("input", render);
    body.append(treePane, detailPane);
    root.append(heading, fileBar, body, saveBar);
    this.loadExampleData().then(render).catch(render);
    refreshFileStatus();
    return { root, getEdits: () => sanitizeLibraryEdits(edits), refresh: () => { render(); refreshFileStatus(); } };
  }

  buildTagEditor(library, category, getEdits, setEdits) {
    const section = element("div", { className: "paio-tag-editor" }, [
      element("strong", { text: "タグ" }),
      element("span", { className: "paio-hint", text: "⋮⋮をドラッグして表示順を変更" }),
    ]);
=======
      }
      if (!visible.some((item) => item.id === selectedId)) selectedId = visible[0]?.id || "";
      showCategoryDetail(library, library.categories.find((item) => item.id === selectedId));
    };
    search.addEventListener("input", render);
    for (const [id, label] of [["tag", "タグ"], ["category", "カテゴリー"]]) {
      const tab = button(label, () => { mode = id; modeTabs.querySelectorAll("button").forEach((item) => item.classList.toggle("is-active", item === tab)); render(); });
      if (id === mode) tab.classList.add("is-active");
      modeTabs.append(tab);
    }
    body.append(treePane, detailPane);
    root.append(heading, modeTabs, body);
    this.loadExampleData().then(render).catch(render);
    return { root, getEdits: () => sanitizeLibraryEdits(edits), refresh: render };
  }

  buildTagEditor(library, category, getEdits, setEdits) {
    const section = element("div", { className: "paio-tag-editor" }, [element("strong", { text: "タグ" })]);
>>>>>>> 6370d6dc927602ebddc0a04713de4d385119ea2d
    const prompt = element("input", { className: "paio-search" }); prompt.placeholder = "英語タグ";
    const ja = element("input", { className: "paio-search" }); ja.placeholder = "日本語訳";
    section.append(element("div", { className: "paio-tag-add" }, [prompt, ja, button("追加", () => {
      if (!prompt.value.trim()) return this.setStatus("タグを入力してください", true);
      const id = `custom-tag-${Date.now()}`;
<<<<<<< HEAD
      const order = library.tags.filter((item) => item.categoryId === category.id).length;
      setEdits(saveTagEdit(getEdits(), { id, categoryId: category.id, prompt: prompt.value, ja: ja.value, order, custom: true }));
    })]));
    const categoryTags = library.tags.filter((item) => item.categoryId === category.id);
    let draggedTagId = "";
    const clearDropState = () => section.querySelectorAll(".paio-tag-edit-row").forEach((item) => item.classList.remove("is-drop-before", "is-drop-after"));
    const currentCategoryTags = () => {
      const stagedById = new Map(getEdits().tags.map((tag) => [tag.id, tag]));
      return categoryTags.map((tag) => ({ ...tag, ...(stagedById.get(tag.id) || {}), builtin: tag.builtin }));
    };
    const moveTag = (draggedId, targetId, position) => {
      setEdits(reorderTagEdits(getEdits(), currentCategoryTags(), draggedId, targetId, position));
    };
    for (const [index, tag] of categoryTags.entries()) {
      const tagPrompt = element("input", { className: "paio-search" }); tagPrompt.value = tag.prompt;
      const tagJa = element("input", { className: "paio-search" }); tagJa.value = tag.ja;
      const dragHandle = button("⋮⋮", () => {}, "ドラッグ、または上下矢印キーで表示順を変更");
      dragHandle.classList.add("paio-tag-drag-handle");
      dragHandle.draggable = true;
      dragHandle.setAttribute("aria-label", `${tag.prompt} の表示順を変更`);
      const row = element("div", { className: "paio-tag-edit-row" }, [dragHandle, tagPrompt, tagJa]);
      row.dataset.tagId = tag.id;
      const stageTag = () => setEdits(saveTagEdit(getEdits(), { ...tag, prompt: tagPrompt.value, ja: tagJa.value, custom: !tag.builtin }), false);
      tagPrompt.addEventListener("input", stageTag);
      tagJa.addEventListener("input", stageTag);
      dragHandle.addEventListener("dragstart", (event) => {
        draggedTagId = tag.id;
        row.classList.add("is-dragging");
        event.stopPropagation();
        event.dataTransfer?.setData("text/plain", tag.id);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
      });
      dragHandle.addEventListener("dragend", () => { draggedTagId = ""; row.classList.remove("is-dragging"); clearDropState(); });
      dragHandle.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
        const target = categoryTags[index + (event.key === "ArrowUp" ? -1 : 1)];
        if (!target) return;
        event.preventDefault();
        moveTag(tag.id, target.id, event.key === "ArrowUp" ? "before" : "after");
      });
      row.addEventListener("dragover", (event) => {
        if (!draggedTagId || draggedTagId === tag.id) return;
        event.preventDefault();
        event.stopPropagation();
        clearDropState();
        const bounds = row.getBoundingClientRect();
        const position = event.clientY >= bounds.top + bounds.height / 2 ? "after" : "before";
        row.classList.add(position === "after" ? "is-drop-after" : "is-drop-before");
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      });
      row.addEventListener("drop", (event) => {
        if (!draggedTagId || draggedTagId === tag.id) return;
        event.preventDefault();
        event.stopPropagation();
        const position = row.classList.contains("is-drop-after") ? "after" : "before";
        const movedId = draggedTagId;
        draggedTagId = "";
        clearDropState();
        moveTag(movedId, tag.id, position);
      });
=======
      setEdits(saveTagEdit(getEdits(), { id, categoryId: category.id, prompt: prompt.value, ja: ja.value, custom: true }));
    })]));
    for (const tag of library.tags.filter((item) => item.categoryId === category.id)) {
      const tagPrompt = element("input", { className: "paio-search" }); tagPrompt.value = tag.prompt;
      const tagJa = element("input", { className: "paio-search" }); tagJa.value = tag.ja;
      const row = element("div", { className: "paio-tag-edit-row" }, [tagPrompt, tagJa]);
      row.append(button("保存", () => setEdits(saveTagEdit(getEdits(), { ...tag, prompt: tagPrompt.value, ja: tagJa.value, custom: !tag.builtin }))));
>>>>>>> 6370d6dc927602ebddc0a04713de4d385119ea2d
      const remove = button("削除", () => setEdits(deleteTagEdit(getEdits(), tag))); remove.classList.add("is-danger"); row.append(remove);
      section.append(row);
    }
    return section;
  }

  loadExampleData() {
    if (this.exampleData) return Promise.resolve(this.exampleData);
    if (!this.exampleLoadPromise) {
<<<<<<< HEAD
      this.exampleLoadPromise = fetchExampleCatalog(this.api, this.settings.libraryFile).then((body) => {
        this.exampleData = body;
        return body;
      }).catch((error) => {
        this.exampleLoadPromise = null;
        throw error;
=======
      this.exampleLoadPromise = this.api.fetchApi("/prompt_all_in_one/examples").then((response) => response.json()).then((body) => {
        this.exampleData = body;
        return body;
>>>>>>> 6370d6dc927602ebddc0a04713de4d385119ea2d
      });
    }
    return this.exampleLoadPromise;
  }

  labeled(label, control) {
    return element("label", { className: "paio-field" }, [element("span", { text: label }), control]);
  }

  buildExamplesPanel() {
    const panel = element("details", { className: "paio-examples" });
    panel.open = true;
    const summary = element("summary", { className: "paio-examples-summary" });
<<<<<<< HEAD
    const disclosure = element("span", { className: "paio-examples-disclosure", text: "▶" });
    disclosure.setAttribute("aria-hidden", "true");
    summary.append(disclosure, element("strong", { text: "タグを追加" }));
    const search = element("input", { className: "paio-search" });
    search.type = "search";
    search.placeholder = "英語・日本語でタグを検索";
    search.setAttribute("aria-label", "内蔵例を検索");
    const categoryBands = element("div", { className: "paio-example-category-bands" });
    const pathStatus = element("span", { className: "paio-example-path", text: "分類を読み込み中…" });
    const list = element("div", { className: "paio-example-list" });
    list.setAttribute("aria-live", "polite");
    list.style.height = `${clampExampleListHeight(this.settings.exampleListHeight)}px`;
    const resizeHandle = element("div", { className: "paio-example-resize-handle" }, [
      element("span", { className: "paio-example-resize-mark", text: "⋯" }),
      element("span", { text: "ドラッグで高さ変更" }),
    ]);
    resizeHandle.tabIndex = 0;
    resizeHandle.setAttribute("role", "separator");
    resizeHandle.setAttribute("aria-orientation", "horizontal");
    resizeHandle.setAttribute("aria-label", "タグ一覧の高さを変更");
    resizeHandle.title = "上下にドラッグしてタグ一覧の高さを変更（ダブルクリックでリセット）";
    const applyListHeight = (height, nodeHeight = null, persist = false) => {
      const nextHeight = clampExampleListHeight(height);
      this.settings.exampleListHeight = nextHeight;
      list.style.height = `${nextHeight}px`;
      resizeHandle.setAttribute("aria-valuemin", String(MIN_EXAMPLE_LIST_HEIGHT));
      resizeHandle.setAttribute("aria-valuemax", String(MAX_EXAMPLE_LIST_HEIGHT));
      resizeHandle.setAttribute("aria-valuenow", String(nextHeight));
      if (this.node && nodeHeight !== null) {
        this.node.setSize([
          Math.max(this.node.size?.[0] || 0, 540),
          Math.max(BASE_NODE_HEIGHT + nextHeight - DEFAULT_EXAMPLE_LIST_HEIGHT, nodeHeight),
        ]);
      }
      this.node?.graph?.setDirtyCanvas?.(true, true);
      if (persist) this.persist();
      return nextHeight;
    };
    applyListHeight(this.settings.exampleListHeight);
    resizeHandle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const pointerId = event.pointerId;
      const startY = event.clientY;
      const startHeight = this.settings.exampleListHeight;
      const startNodeHeight = this.node.size?.[1] || BASE_NODE_HEIGHT;
      resizeHandle.classList.add("is-dragging");
      resizeHandle.setPointerCapture?.(pointerId);
      const move = (moveEvent) => {
        if (moveEvent.pointerId !== pointerId) return;
        const nextHeight = clampExampleListHeight(startHeight + moveEvent.clientY - startY);
        applyListHeight(nextHeight, startNodeHeight + nextHeight - startHeight);
      };
      const finish = (finishEvent) => {
        if (finishEvent.pointerId !== pointerId) return;
        resizeHandle.removeEventListener("pointermove", move);
        resizeHandle.removeEventListener("pointerup", finish);
        resizeHandle.removeEventListener("pointercancel", finish);
        resizeHandle.releasePointerCapture?.(pointerId);
        resizeHandle.classList.remove("is-dragging");
        applyListHeight(this.settings.exampleListHeight, this.node.size?.[1] || BASE_NODE_HEIGHT, true);
      };
      resizeHandle.addEventListener("pointermove", move);
      resizeHandle.addEventListener("pointerup", finish);
      resizeHandle.addEventListener("pointercancel", finish);
    });
    resizeHandle.addEventListener("dblclick", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const currentHeight = this.settings.exampleListHeight;
      const currentNodeHeight = this.node.size?.[1] || BASE_NODE_HEIGHT;
      applyListHeight(DEFAULT_EXAMPLE_LIST_HEIGHT, currentNodeHeight + DEFAULT_EXAMPLE_LIST_HEIGHT - currentHeight, true);
    });
    resizeHandle.addEventListener("keydown", (event) => {
      if (!['ArrowUp', 'ArrowDown', 'Home'].includes(event.key)) return;
      event.preventDefault();
      const currentHeight = this.settings.exampleListHeight;
      const nextHeight = event.key === 'Home'
        ? DEFAULT_EXAMPLE_LIST_HEIGHT
        : currentHeight + (event.key === 'ArrowDown' ? 20 : -20);
      const currentNodeHeight = this.node.size?.[1] || BASE_NODE_HEIGHT;
      const applied = clampExampleListHeight(nextHeight);
      applyListHeight(applied, currentNodeHeight + applied - currentHeight, true);
    });
    const resultStatus = element("span", { className: "paio-example-count", text: "読み込み中…" });
    const selected = new Set();
    let library = null;
    let categoryPath = { largeId: "", mediumId: "", smallId: "" };
    let renderLimit = INITIAL_EXAMPLE_LIMIT;
    const selectCategory = (level, id) => {
      categoryPath = {
        largeId: level === "large" ? id : categoryPath.largeId,
        mediumId: level === "medium" ? id : (level === "large" ? "" : categoryPath.mediumId),
        smallId: level === "small" ? id : "",
      };
      renderLimit = INITIAL_EXAMPLE_LIMIT;
      redraw();
    };
    const renderCategoryBands = (resolved) => {
      categoryBands.replaceChildren();
      const definitions = [
        ["large", "大分類", resolved.largeOptions, resolved.large?.id],
        ["medium", "中分類", resolved.mediumOptions, resolved.medium?.id],
        ["small", "小分類", resolved.smallOptions, resolved.small?.id],
      ];
      for (const [level, label, options, activeId] of definitions) {
        const chips = element("div", { className: "paio-example-category-chips" });
        for (const category of options) {
          const chip = button(category.ja || category.en, () => selectCategory(level, category.id), category.en || category.ja);
          chip.classList.add("paio-example-category-chip", `is-${level}`);
          chip.classList.toggle("is-active", category.id === activeId);
          chip.setAttribute("aria-pressed", String(category.id === activeId));
          chips.append(chip);
        }
        if (!options.length) chips.append(element("span", { className: "paio-hint", text: "分類がありません" }));
        categoryBands.append(element("div", { className: `paio-example-category-band is-${level}` }, [
          element("strong", { className: "paio-example-category-label", text: label }),
          chips,
        ]));
      }
      pathStatus.textContent = [resolved.large?.ja, resolved.medium?.ja, resolved.small?.ja].filter(Boolean).join(" › ") || "分類がありません";
    };
    const redraw = () => {
      list.replaceChildren();
      if (!library) {
        list.append(element("p", { className: "paio-empty", text: "内蔵例を読み込んでいます…" }));
        return;
      }
      const resolved = resolveExampleCategoryPath(library, categoryPath);
      categoryPath = {
        largeId: resolved.large?.id || "",
        mediumId: resolved.medium?.id || "",
        smallId: resolved.small?.id || "",
      };
      renderCategoryBands(resolved);
      const query = search.value.trim().toLocaleLowerCase();
      const matches = filterExampleLibraryTags(library, resolved.small?.id, query);
      resultStatus.textContent = `${matches.length}件`;
      const visibleLimit = query ? MAX_EXAMPLE_SEARCH_RESULTS : renderLimit;
      for (const item of matches.slice(0, visibleLimit)) {
        const translation = cleanTranslation(item.ja);
        const chip = button("", (event) => {
          if (event.ctrlKey || event.metaKey) {
            if (selected.has(item.prompt)) selected.delete(item.prompt);
            else selected.add(item.prompt);
            chip.classList.toggle("is-selected", selected.has(item.prompt));
            chip.setAttribute("aria-pressed", String(selected.has(item.prompt)));
            this.exampleBulkButton.hidden = selected.size === 0;
            this.exampleBulkButton.textContent = `選択した${selected.size}件を追加`;
            return;
          }
          this.pushUndo();
          this.addValues([{ value: item.prompt, translation: translation, translatedTo: translation ? this.settings.localLanguage : "" }]);
          this.setStatus(`${item.prompt} を追加しました`);
        }, [
          translation ? `${item.prompt} — ${translation}` : item.prompt,
        ].filter(Boolean).join("\n"));
        chip.classList.add("paio-example-chip");
        chip.replaceChildren(
          element("span", { className: "paio-example-chip-prompt", text: item.prompt }),
          ...(translation ? [element("span", { className: "paio-example-chip-translation", text: translation })] : []),
        );
        chip.classList.toggle("is-selected", selected.has(item.prompt));
        chip.setAttribute("aria-pressed", String(selected.has(item.prompt)));
        list.append(chip);
      }
      if (!matches.length) list.append(element("p", { className: "paio-empty", text: "一致する例はありません" }));
      if (!query && matches.length > renderLimit) {
        list.append(button(`さらに表示（残り ${matches.length - renderLimit}）`, () => {
          renderLimit += EXAMPLE_PAGE_SIZE;
          redraw();
        }));
=======
    summary.append(
      element("strong", { text: "例から追加" }),
      element("span", { className: "paio-hint", text: "クリックで追加" }),
    );
    const search = element("input", { className: "paio-search" });
    search.type = "search";
    search.placeholder = "英語・日本語を検索";
    search.setAttribute("aria-label", "内蔵例を検索");
    const category = element("select", { className: "paio-select" });
    const list = element("div", { className: "paio-example-list" });
    list.setAttribute("aria-live", "polite");
    const resultStatus = element("span", { className: "paio-example-count", text: "読み込み中…" });
    const selected = new Set();
    let data = null;
    let renderLimit = INITIAL_EXAMPLE_LIMIT;
    const redraw = () => {
      list.replaceChildren();
      if (!data) {
        list.append(element("p", { className: "paio-empty", text: "内蔵例を読み込んでいます…" }));
        return;
      }
      const query = search.value.trim().toLocaleLowerCase();
      const matches = [];
      for (const group of data.categories || []) {
        if (category.value && category.value !== group.id) continue;
        for (const item of group.items || []) {
          const label = `${item.prompt} ${item.translation?.ja || ""}`;
          if (query && !label.toLocaleLowerCase().includes(query)) continue;
          matches.push(item);
        }
>>>>>>> 6370d6dc927602ebddc0a04713de4d385119ea2d
      }
      resultStatus.textContent = `${matches.length}件`;
      for (const item of matches.slice(0, renderLimit)) {
        const translation = item.translation?.ja || "";
        const chip = button(`＋ ${item.prompt}`, (event) => {
          if (event.ctrlKey || event.metaKey) {
            if (selected.has(item.prompt)) selected.delete(item.prompt);
            else selected.add(item.prompt);
            chip.classList.toggle("is-selected", selected.has(item.prompt));
            chip.setAttribute("aria-pressed", String(selected.has(item.prompt)));
            this.exampleBulkButton.hidden = selected.size === 0;
            this.exampleBulkButton.textContent = `選択した${selected.size}件を追加`;
            return;
          }
          this.pushUndo();
          this.addValues([item.prompt]);
          this.setStatus(`${item.prompt} を追加しました`);
        }, translation ? `${item.prompt} — ${translation}` : item.prompt);
        chip.classList.add("paio-example-chip");
        chip.classList.toggle("is-selected", selected.has(item.prompt));
        chip.setAttribute("aria-pressed", String(selected.has(item.prompt)));
        list.append(chip);
      }
      if (!matches.length) list.append(element("p", { className: "paio-empty", text: "一致する例はありません" }));
      if (matches.length > renderLimit) {
        list.append(button(`さらに表示（残り ${matches.length - renderLimit}）`, () => {
          renderLimit += EXAMPLE_PAGE_SIZE;
          redraw();
        }));
      }
    };
    const populate = () => {
<<<<<<< HEAD
      library = buildTagLibrary(this.exampleData || { categories: [] }, this.settings.libraryEdits);
=======
      data = libraryToExampleData(buildTagLibrary(this.exampleData || { categories: [] }, this.settings.libraryEdits));
      const previous = category.value;
      category.replaceChildren();
      const all = element("option", { text: "全カテゴリー" });
      all.value = "";
      category.append(all);
      for (const group of data.categories || []) {
        const option = element("option", { text: `${group.label?.ja || group.id} / ${group.label?.en || ""}` });
        option.value = group.id;
        category.append(option);
      }
      if ([...category.options].some((option) => option.value === previous)) category.value = previous;
>>>>>>> 6370d6dc927602ebddc0a04713de4d385119ea2d
      redraw();
    };
    this.refreshExamplesPanel = populate;
    this.loadExampleData()
      .then((body) => {
        this.exampleData = body;
        populate();
      })
      .catch(() => {
<<<<<<< HEAD
        library = { categories: [], tags: [] };
=======
        data = { categories: [] };
>>>>>>> 6370d6dc927602ebddc0a04713de4d385119ea2d
        resultStatus.textContent = "読込失敗";
        list.replaceChildren(element("p", { className: "paio-empty paio-error", text: "内蔵例を読み込めませんでした" }));
        this.setStatus("内蔵例を読み込めませんでした", true);
      });
    search.addEventListener("input", () => { renderLimit = INITIAL_EXAMPLE_LIMIT; redraw(); });
<<<<<<< HEAD
    this.exampleBulkButton = button("選択した0件を追加", () => {
      if (!selected.size) return;
      this.pushUndo();
      this.addValues([...selected].map((prompt) => {
        const item = library?.tags.find((tag) => tag.prompt === prompt);
        const translation = cleanTranslation(item?.ja);
        return { value: prompt, translation, translatedTo: translation ? this.settings.localLanguage : "" };
      }));
=======
    category.addEventListener("change", () => { renderLimit = INITIAL_EXAMPLE_LIMIT; redraw(); });
    this.exampleBulkButton = button("選択した0件を追加", () => {
      if (!selected.size) return;
      this.pushUndo();
      this.addValues([...selected]);
>>>>>>> 6370d6dc927602ebddc0a04713de4d385119ea2d
      selected.clear();
      redraw();
      this.setStatus("内蔵例を追加しました");
    });
    this.exampleBulkButton.hidden = true;
<<<<<<< HEAD
    const resetCategories = button("リセット", () => {
      categoryPath = { largeId: "", mediumId: "", smallId: "" };
      search.value = "";
      renderLimit = INITIAL_EXAMPLE_LIMIT;
      redraw();
    });
    resetCategories.classList.add("paio-example-reset");
    const navigation = element("div", { className: "paio-example-navigation" }, [
      element("div", { className: "paio-example-path-row" }, [pathStatus, resetCategories]),
      categoryBands,
    ]);
    const controls = element("div", { className: "paio-example-controls" }, [search]);
=======
    const controls = element("div", { className: "paio-example-controls" }, [category, search]);
>>>>>>> 6370d6dc927602ebddc0a04713de4d385119ea2d
    const footer = element("div", { className: "paio-example-footer" }, [
      resultStatus,
      element("span", { className: "paio-hint", text: "Ctrl+クリックで複数選択" }),
      this.exampleBulkButton,
    ]);
<<<<<<< HEAD
    panel.append(summary, navigation, controls, list, resizeHandle, footer);
=======
    panel.append(summary, controls, list, footer);
>>>>>>> 6370d6dc927602ebddc0a04713de4d385119ea2d
    redraw();
    return panel;
  }

  buildBlacklistDialog() {
    const dialog = this.buildDialog("ブラックリスト");
    const help = element("p", { text: "1行ごとに exact:tag / iexact:tag / contains:tag / regex:pattern" });
    const textarea = element("textarea", { className: "paio-dialog-textarea" });
    textarea.value = this.settings.blacklist.map((item) => `${item.mode}:${item.pattern}`).join("\n");
    const action = element("select", { className: "paio-select" });
    for (const [value, label] of [["warn", "警告のみ"], ["disable", "無効化"], ["delete", "削除"]]) {
      const option = element("option", { text: label });
      option.value = value;
      action.append(option);
    }
    action.value = this.settings.blacklistAction;
    const save = button("適用", () => {
      const entries = textarea.value.split(/\r?\n/u).filter(Boolean).slice(0, 200).map((line) => {
        const separator = line.indexOf(":");
        if (separator < 0) return { mode: "exact", pattern: line.trim() };
        return { mode: line.slice(0, separator).trim(), pattern: line.slice(separator + 1).trim() };
      });
      const compiled = compileBlacklist(entries);
      const errors = compiled.filter((entry) => entry.error);
      if (errors.length) {
        this.setStatus(`無効な正規表現: ${errors[0].error}`, true);
        return;
      }
      this.pushUndo();
      this.settings.blacklist = entries;
      this.settings.blacklistAction = action.value;
      this.applyBlacklist(true);
      this.syncToWidgets();
      this.render();
      closeDialog(dialog);
    });
    dialog.body.append(help, textarea, this.labeled("一致時の処理", action), save);
    return dialog;
  }

  buildIoDialog() {
    const dialog = this.buildDialog("コピー・インポート・エクスポート");
    const file = element("input");
    file.type = "file";
    file.accept = ".txt,.json,text/plain,application/json";
    file.addEventListener("change", async () => {
      const selected = file.files?.[0];
      if (!selected) return;
      if (selected.size > 1024 * 1024) return this.setStatus("ファイルは1 MB以下にしてください", true);
      const text = await selected.text();
      this.pushUndo();
      try {
        if (selected.name.toLocaleLowerCase().endsWith(".json")) {
          const state = parseImportedState(text);
          this.tags = state.tags.map((tag) => createTag(tag.value, tag));
          this.settings = state.settings;
        } else {
          this.tags = parsePrompt(text).tags;
        }
        this.applyBlacklist(this.settings.blacklistAction !== "warn");
        this.syncToWidgets();
        this.render();
        closeDialog(dialog);
        this.setStatus("インポートしました");
      } catch (error) {
        this.setStatus(error.message, true);
      }
    });
    const controls = [
      button("プロンプトをコピー", () => this.copyPrompt()),
      button("表示言語込みで選択をコピー", () => this.copySelected(true)),
      button("選択を英語でコピー", () => this.copySelectedLanguage("en")),
      button("TXTを書き出す", () => download("prompt.txt", outputPrompt(this.currentTags, this.settings.outputLanguage), "text/plain;charset=utf-8")),
      button("状態JSONを書き出す", () => download("prompt_all_in_one_state.json", exportEditorState({ tags: this.tags, settings: this.settings }), "application/json;charset=utf-8")),
    ];
    dialog.body.append(file, element("div", { className: "paio-toolbar" }, controls));
    return dialog;
  }

  render() {
    this.applyCustomColors();
    if (!this.promptDirty && this.promptTextarea) this.promptTextarea.value = this.promptEditorValue();
    this.renderSyncState();
    this.renderTranslationControls();
    this.renderBulk();
    this.renderTags();
  }

  renderSyncState() {
    if (!this.syncBadge || !this.applyPromptButton) return;
    this.syncBadge.textContent = this.promptDirty ? "未反映" : "同期済み";
    this.syncBadge.classList.toggle("is-dirty", this.promptDirty);
    this.applyPromptButton.disabled = !this.promptDirty;
  }

  applyPromptText() {
    if (!this.promptTextarea || !this.promptDirty) return;
    this.pushUndo();
    const parsed = parsePrompt(this.promptTextarea.value, this.currentTags);
    this.tags = parsed.tags;
    this.promptDirty = false;
    this.applyBlacklist(this.settings.blacklistAction !== "warn");
    this.syncToWidgets();
    this.render();
    if (parsed.errors.length) this.setStatus(`本文を反映しましたが構文警告が${parsed.errors.length}件あります`, true);
    else this.setStatus("本文をタグへ反映しました");
  }

  commitPromptBeforeAction() {
    if (this.promptDirty) this.applyPromptText();
  }

  renderTranslationControls() {
    const mode = this.settings.translationDisplay || "original";
    for (const [value, control] of this.translationDisplayButtons || []) {
      const active = value === mode;
      control.classList.toggle("is-active", active);
      control.setAttribute("aria-pressed", String(active));
    }
<<<<<<< HEAD
=======
    const hasSelection = this.currentTags.some((tag) => tag.selected);
    for (const control of this.translationSelectionButtons || []) control.disabled = !hasSelection;
>>>>>>> 6370d6dc927602ebddc0a04713de4d385119ea2d
  }

  renderBulk() {
    this.bulkBar.replaceChildren();
    const selected = this.currentTags.filter((tag) => tag.selected);
    if (!selected.length) {
      this.bulkBar.hidden = true;
      return;
    }
    this.bulkBar.hidden = false;
    const actions = [
      button(`${selected.length}件選択`, () => this.clearSelection()),
      button("有効", () => this.bulkMutate((tag) => { tag.enabled = true; })),
      button("無効", () => this.bulkMutate((tag) => { tag.enabled = false; })),
      button("＋", () => this.bulkWeight(1), "重みを上げる"),
      button("－", () => this.bulkWeight(-1), "重みを下げる"),
      button("コピー", () => this.copySelected(false)),
      button("削除", () => this.deleteSelected()),
    ];
    this.bulkBar.append(...actions);
  }

  filteredTags() {
    const duplicates = findDuplicateKeys(this.currentTags);
    const query = this.filterText.trim().toLocaleLowerCase();
    return this.currentTags.map((tag, index) => ({ tag, index })).filter(({ tag }) => {
      const haystack = `${tag.value} ${cleanTranslation(tag.translation)}`.toLocaleLowerCase();
      if (query && !haystack.includes(query)) return false;
      const duplicate = duplicates.has(canonicalTagKey(tag.value));
      if (this.filterMode === "enabled") return tag.enabled;
      if (this.filterMode === "disabled") return !tag.enabled;
      if (this.filterMode === "duplicate") return duplicate;
      if (this.filterMode === "blacklist") return tag.blacklistMatch;
      if (this.filterMode === "untranslated") return !cleanTranslation(tag.translation);
      if (this.filterMode !== "all") return tag.type === this.filterMode;
      return true;
    });
  }

  renderTags() {
    this.tagList.replaceChildren();
    const rows = this.filteredTags();
    const disabledCount = this.currentTags.filter((tag) => !tag.enabled).length;
    this.tagSummary.textContent = `${this.currentTags.length}件中 ${disabledCount}件無効`;
    const duplicates = findDuplicateKeys(this.currentTags);
    for (const { tag, index } of rows.slice(0, this.renderLimit)) {
      const duplicate = duplicates.has(canonicalTagKey(tag.value));
      this.tagList.append(this.renderTag(tag, index, duplicate));
    }
    if (!rows.length) {
      const message = this.currentTags.length
        ? "検索・絞り込みに一致するタグはありません"
<<<<<<< HEAD
        : "プロンプトがありません。上の本文へ入力するか、下のタグ追加から選んでください";
=======
        : "プロンプトがありません。上の本文へ入力するか、下の例から追加してください";
>>>>>>> 6370d6dc927602ebddc0a04713de4d385119ea2d
      this.tagList.append(element("p", { className: "paio-empty", text: message }));
    } else if (rows.length > this.renderLimit) {
      this.tagList.append(button(`さらに表示（残り ${rows.length - this.renderLimit}）`, () => {
        this.renderLimit += MAX_RENDERED_TAGS;
        this.renderTags();
      }));
    }
  }

  renderTag(tag, index, duplicate) {
    const row = element("div", { className: "paio-tag", dataset: { type: tag.type, tagIndex: index } });
    row.setAttribute("role", "button");
    row.setAttribute("aria-pressed", String(tag.enabled));
    const translation = cleanTranslation(tag.translation);
    const { primary: primaryText, secondary: secondaryText } = getTagDisplayText(tag, this.settings);
    row.setAttribute("aria-label", `${primaryText}${secondaryText ? `、翻訳 ${secondaryText}` : ""}、${tag.enabled ? "有効" : "無効"}`);
    row.tabIndex = 0;
    row.draggable = true;
    row.classList.toggle("is-disabled", !tag.enabled);
    row.classList.toggle("is-selected", tag.selected);
    row.classList.toggle("is-duplicate", duplicate);
    row.classList.toggle("is-blacklisted", tag.blacklistMatch);
    row.classList.toggle("is-missing", tag.missingModel);
    row.classList.toggle("has-error", Boolean(tag.translationError));
    const notices = [];
    if (duplicate) notices.push("重複");
    if (tag.blacklistMatch) notices.push("ブラックリスト一致");
    if (tag.missingModel) notices.push("モデルが見つかりません");
    if (tag.translationError) notices.push(tag.translationError);
    row.title = [translation, ...notices, "クリック: 有効/無効、ダブルクリック: 編集、右クリック: 詳細操作"].filter(Boolean).join("\n");

    const selectMark = element("span", { className: "paio-select-mark", text: tag.selected ? "✓" : "" });
    selectMark.setAttribute("aria-hidden", "true");
<<<<<<< HEAD
    const stateMark = element("span", { className: "paio-state-mark", text: "" });
=======
    const stateMark = element("span", { className: "paio-state-mark", text: tag.enabled ? "" : "⊘" });
>>>>>>> 6370d6dc927602ebddc0a04713de4d385119ea2d
    stateMark.setAttribute("aria-hidden", "true");
    const content = element("span", { className: "paio-tag-content" }, [
      element("span", { className: "paio-tag-label", text: primaryText }),
    ]);
    if (secondaryText) content.append(element("span", { className: "paio-tag-translation", text: secondaryText }));
    const warning = notices.length ? element("span", { className: "paio-tag-warning", text: "!", title: notices.join(" / ") }) : null;
    appendPresentChildren(row, selectMark, stateMark, content, warning);

    row.addEventListener("click", (event) => {
      if (this.didDrag) {
        this.didDrag = false;
        return;
      }
      if (event.shiftKey || event.ctrlKey || event.metaKey) {
        clearTimeout(this.clickTimer);
        this.selectIndex(index, event.shiftKey, event.ctrlKey || event.metaKey);
        return;
      }
      clearTimeout(this.clickTimer);
      this.clickTimer = window.setTimeout(() => this.toggleOne(index), 180);
    });
    row.addEventListener("dblclick", (event) => {
      event.preventDefault();
      clearTimeout(this.clickTimer);
      this.beginInlineEdit(row, tag, index);
    });
    row.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      clearTimeout(this.clickTimer);
      this.showContextMenu(event, tag, index);
    });
    row.addEventListener("keydown", (event) => {
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        if (event.key === "Enter") this.beginInlineEdit(row, tag, index);
        else this.toggleOne(index);
      } else if (event.key === "F2") {
        event.preventDefault();
        this.beginInlineEdit(row, tag, index);
      } else if (event.key === "Delete") {
        event.preventDefault();
        this.deleteOne(index);
      }
    });
    row.addEventListener("dragstart", (event) => {
      this.dragIndex = index;
      this.didDrag = true;
      row.classList.add("is-dragging");
      event.dataTransfer?.setData("text/plain", tag.value);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    });
    row.addEventListener("dragend", () => {
      row.classList.remove("is-dragging");
      window.setTimeout(() => { this.didDrag = false; }, 0);
    });
    row.addEventListener("dragover", (event) => event.preventDefault());
    row.addEventListener("drop", (event) => {
      event.preventDefault();
      if (this.dragIndex === null || this.dragIndex === index) return;
      const movedId = this.currentTags[this.dragIndex]?.id;
      const targetId = this.currentTags[index]?.id;
      this.commitPromptBeforeAction();
      const movedIndex = this.currentTags.findIndex((item) => item.id === movedId);
      const targetIndex = this.currentTags.findIndex((item) => item.id === targetId);
      if (movedIndex < 0 || targetIndex < 0 || movedIndex === targetIndex) return;
      this.pushUndo();
      const [moved] = this.currentTags.splice(movedIndex, 1);
      const target = movedIndex < targetIndex ? targetIndex - 1 : targetIndex;
      this.currentTags.splice(target, 0, moved);
      this.dragIndex = null;
      this.syncToWidgets();
      this.render();
    });
    return row;
  }

  beginInlineEdit(row, tag, index) {
    clearTimeout(this.clickTimer);
    if (this.promptDirty) {
      this.applyPromptText();
      const currentRow = [...this.tagList.children].find((item) => item.dataset?.tagIndex === String(index));
      const currentTag = this.currentTags[index];
      if (currentRow && currentTag) this.beginInlineEdit(currentRow, currentTag, index);
      return;
    }
    const editor = element("input", { className: "paio-tag-input" });
    editor.value = tag.value;
    editor.setAttribute("aria-label", "タグを編集");
    let finished = false;
    const finish = (save) => {
      if (finished) return;
      finished = true;
      if (save && editor.value.trim() !== tag.value) {
        this.pushUndo();
        tag.value = editor.value.trim();
        tag.type = classifyTag(tag.value);
        this.applyBlacklist(this.settings.blacklistAction !== "warn");
        this.syncToWidgets();
      }
      this.render();
    };
    editor.addEventListener("click", (event) => event.stopPropagation());
    editor.addEventListener("dblclick", (event) => event.stopPropagation());
    editor.addEventListener("keydown", (event) => {
      if (event.key === "Enter") { event.preventDefault(); finish(true); }
      if (event.key === "Escape") { event.preventDefault(); finish(false); }
    });
    editor.addEventListener("blur", () => finish(true));
    row.draggable = false;
    row.replaceChildren(editor);
    editor.focus();
    editor.select();
  }

  showContextMenu(event, tag, index) {
    if (this.promptDirty) {
      this.applyPromptText();
      tag = this.currentTags[index];
      if (!tag) return;
    }
    this.closeContextMenu();
    const menu = element("div", { className: "paio-context-menu" });
    menu.setAttribute("role", "menu");
    const action = (label, handler, className = "") => {
      const control = button(label, () => {
        this.closeContextMenu();
        handler();
      });
      control.className = `paio-context-action ${className}`.trim();
      control.setAttribute("role", "menuitem");
      return control;
    };
<<<<<<< HEAD
    const title = element("strong", { className: "paio-context-title", text: tag.value || "空タグ" });
    const currentWeight = getTagWeight(tag.value);
    const weightInput = element("input", { className: "paio-context-weight-input" });
    weightInput.type = "number";
    weightInput.min = String(this.settings.weightMin);
    weightInput.max = String(this.settings.weightMax);
    weightInput.step = String(this.settings.weightStep);
    weightInput.value = currentWeight === null ? "" : currentWeight.toFixed(2);
    weightInput.inputMode = "decimal";
    weightInput.disabled = currentWeight === null;
    weightInput.setAttribute("aria-label", "タグの重み");
    const applyWeight = (requestedWeight) => {
      const appliedWeight = this.setWeightOne(index, requestedWeight);
      if (appliedWeight === null) return;
      weightInput.value = appliedWeight.toFixed(2);
      title.textContent = this.currentTags[index]?.value || "空タグ";
    };
    const weightButton = (label, requestedWeight, ariaLabel) => {
      const control = button(label, () => applyWeight(requestedWeight()));
      control.className = "paio-context-weight-button";
      control.disabled = currentWeight === null;
      control.setAttribute("aria-label", ariaLabel);
      return control;
    };
    const weightControls = element("div", { className: "paio-context-weight-controls" }, [
      weightButton("−", () => Number(weightInput.value) - this.settings.weightStep, "重みを下げる"),
      weightInput,
      weightButton("＋", () => Number(weightInput.value) + this.settings.weightStep, "重みを上げる"),
    ]);
    const resetWeight = weightButton("1.00へ戻す", () => 1, "重みを1.00へ戻す");
    resetWeight.classList.add("is-reset");
    const weightPanel = element("div", { className: "paio-context-weight" }, [
      element("span", {
        className: "paio-context-weight-label",
        text: currentWeight === null ? "重み（タグ編集で変更）" : `重み・刻み ${this.settings.weightStep}`,
      }),
      weightControls,
      resetWeight,
    ]);
    weightPanel.setAttribute("role", "group");
    weightPanel.setAttribute("aria-label", "重みを変更");
    weightInput.addEventListener("change", () => {
      const requestedWeight = weightInput.valueAsNumber;
      if (Number.isFinite(requestedWeight)) applyWeight(requestedWeight);
      else weightInput.value = (getTagWeight(this.currentTags[index]?.value) ?? 1).toFixed(2);
    });
    weightInput.addEventListener("keydown", (inputEvent) => {
      if (inputEvent.key === "Enter") {
        inputEvent.preventDefault();
        const requestedWeight = weightInput.valueAsNumber;
        if (Number.isFinite(requestedWeight)) applyWeight(requestedWeight);
        weightInput.select();
      }
    });
    menu.append(
      title,
      weightPanel,
=======
    menu.append(
      element("strong", { className: "paio-context-title", text: tag.value || "空タグ" }),
>>>>>>> 6370d6dc927602ebddc0a04713de4d385119ea2d
      action("編集", () => {
        const row = [...this.tagList.children].find((item) => item.dataset?.tagIndex === String(index));
        if (row) this.beginInlineEdit(row, tag, index);
      }),
<<<<<<< HEAD
=======
      action("重みを上げる", () => this.weightOne(index, 1)),
      action("重みを下げる", () => this.weightOne(index, -1)),
>>>>>>> 6370d6dc927602ebddc0a04713de4d385119ea2d
      action("英語へ翻訳", () => this.translateIndexes([index], "en")),
      action("日本語へ翻訳", () => this.translateIndexes([index], this.settings.localLanguage)),
      action(tag.enabled ? "無効にする" : "有効にする", () => this.toggleOne(index)),
      action("コピー", async () => { await copyText(tag.value); this.setStatus("タグをコピーしました"); }),
      action("削除", () => this.deleteOne(index), "is-danger"),
    );
<<<<<<< HEAD
    menu.style.left = `${Math.max(6, Math.min(event.clientX, window.innerWidth - 246))}px`;
    menu.style.top = `${Math.max(6, Math.min(event.clientY, window.innerHeight - 420))}px`;
=======
    menu.style.left = `${Math.min(event.clientX, window.innerWidth - 210)}px`;
    menu.style.top = `${Math.min(event.clientY, window.innerHeight - 330)}px`;
>>>>>>> 6370d6dc927602ebddc0a04713de4d385119ea2d
    document.body.append(menu);
    this.contextMenu = menu;
    window.setTimeout(() => {
      this.contextMenuAbort = new AbortController();
      document.addEventListener("pointerdown", (pointerEvent) => {
        if (!menu.contains(pointerEvent.target)) this.closeContextMenu();
      }, { signal: this.contextMenuAbort.signal });
      document.addEventListener("keydown", (keyEvent) => {
        if (keyEvent.key === "Escape") this.closeContextMenu();
      }, { signal: this.contextMenuAbort.signal });
    }, 0);
  }

  closeContextMenu() {
    this.contextMenuAbort?.abort();
    this.contextMenuAbort = null;
    this.contextMenu?.remove();
    this.contextMenu = null;
  }

  addFromInput() {
    const value = this.addInput.value;
    if (!value.trim()) return;
    this.commitPromptBeforeAction();
    this.pushUndo();
    const parsed = parsePrompt(value);
    this.addValues(parsed.tags.map((tag) => tag.value));
    this.addInput.value = "";
    if (parsed.errors.length) this.setStatus(`追加しましたが構文警告が${parsed.errors.length}件あります`, true);
    else this.setStatus("タグを追加しました");
  }

  addValues(values) {
    this.commitPromptBeforeAction();
    const target = this.tags;
    for (const raw of values) {
      const descriptor = raw && typeof raw === "object" ? raw : { value: raw };
      const value = String(descriptor.value || "").trim();
      if (!value) continue;
      const translation = cleanTranslation(descriptor.translation);
      const key = canonicalTagKey(value);
      const existing = target.findIndex((tag) => canonicalTagKey(tag.value) === key);
      if (existing >= 0 && this.settings.duplicatePolicy === "skip") {
        if (translation && !cleanTranslation(target[existing].translation)) {
          target[existing].translation = translation;
          target[existing].translatedTo = descriptor.translatedTo || this.settings.localLanguage;
        }
        continue;
      }
      if (existing >= 0 && this.settings.duplicatePolicy === "move") {
        target.push(target.splice(existing, 1)[0]);
        continue;
      }
      target.push(createTag(value, {
        translation,
        translatedTo: translation ? (descriptor.translatedTo || this.settings.localLanguage) : "",
      }));
    }
    this.applyBlacklist(this.settings.blacklistAction !== "warn");
    this.syncToWidgets();
    this.render();
    if (this.settings.autoTranslate) {
      const indexes = target.map((tag, index) => ({ tag, index })).filter(({ tag }) => !cleanTranslation(tag.translation)).map(({ index }) => index);
<<<<<<< HEAD
      this.translateIndexes(indexes, this.settings.localLanguage);
=======
      this.translateIndexes(indexes, "en", side);
>>>>>>> 6370d6dc927602ebddc0a04713de4d385119ea2d
    }
  }

  selectIndex(index, range, additive) {
    if (range && this.lastSelectedIndex !== null) {
      const [start, end] = [this.lastSelectedIndex, index].sort((a, b) => a - b);
      if (!additive) this.currentTags.forEach((tag) => { tag.selected = false; });
      for (let position = start; position <= end; position += 1) this.currentTags[position].selected = true;
    } else {
      if (!additive) this.currentTags.forEach((tag, position) => { if (position !== index) tag.selected = false; });
      this.currentTags[index].selected = !this.currentTags[index].selected;
      this.lastSelectedIndex = index;
    }
    this.persist();
    this.render();
  }

  clearSelection() {
    this.currentTags.forEach((tag) => { tag.selected = false; });
    this.lastSelectedIndex = null;
    this.persist();
    this.render();
  }

  bulkMutate(mutate) {
    this.commitPromptBeforeAction();
    this.pushUndo();
    this.currentTags.filter((tag) => tag.selected).forEach(mutate);
    this.syncToWidgets();
    this.render();
  }

  weightOne(index, direction) {
    const tagId = this.currentTags[index]?.id;
    this.commitPromptBeforeAction();
    index = this.currentTags.findIndex((tag) => tag.id === tagId);
    if (index < 0) return;
    this.pushUndo();
    const tag = this.currentTags[index];
    tag.value = adjustTagWeight(tag.value, this.settings.weightStep * direction, this.settings.weightMin, this.settings.weightMax);
    tag.type = classifyTag(tag.value);
    this.syncToWidgets();
    this.render();
  }

  setWeightOne(index, weight) {
    const tagId = this.currentTags[index]?.id;
    this.commitPromptBeforeAction();
    index = this.currentTags.findIndex((tag) => tag.id === tagId);
    if (index < 0) return null;
    const tag = this.currentTags[index];
    const currentWeight = getTagWeight(tag.value);
    if (currentWeight === null || !Number.isFinite(Number(weight))) return currentWeight;
    const nextValue = setTagWeight(
      tag.value,
      Number(weight),
      this.settings.weightMin,
      this.settings.weightMax,
    );
    if (nextValue === tag.value) return getTagWeight(nextValue);
    this.pushUndo();
    tag.value = nextValue;
    tag.type = classifyTag(nextValue);
    this.syncToWidgets();
    this.render();
    return getTagWeight(nextValue);
  }

  bulkWeight(direction) {
    this.bulkMutate((tag) => {
      tag.value = adjustTagWeight(tag.value, this.settings.weightStep * direction, this.settings.weightMin, this.settings.weightMax);
      tag.type = classifyTag(tag.value);
    });
  }

  toggleOne(index) {
    const tagId = this.currentTags[index]?.id;
    this.commitPromptBeforeAction();
    index = this.currentTags.findIndex((tag) => tag.id === tagId);
    if (index < 0) return;
    this.pushUndo();
    this.currentTags[index].enabled = !this.currentTags[index].enabled;
    this.syncToWidgets();
    this.render();
  }

  deleteOne(index) {
    const tagId = this.currentTags[index]?.id;
    this.commitPromptBeforeAction();
    index = this.currentTags.findIndex((tag) => tag.id === tagId);
    if (index < 0) return;
    this.pushUndo();
    this.currentTags.splice(index, 1);
    this.syncToWidgets();
    this.render();
    this.setStatus("タグを削除しました。元に戻せます");
  }

  deleteSelected() {
    this.commitPromptBeforeAction();
    this.pushUndo();
    this.tags = this.currentTags.filter((tag) => !tag.selected);
    this.syncToWidgets();
    this.render();
    this.setStatus("選択タグを削除しました。元に戻せます");
  }

  normalize(removeDuplicates) {
    this.commitPromptBeforeAction();
    this.pushUndo();
    this.tags = normalizePromptTags(this.currentTags, { removeEmpty: true, removeDuplicates });
    this.syncToWidgets();
    this.render();
    this.setStatus(removeDuplicates ? "空タグと重複を整理しました。元に戻せます" : "区切りと空白を整形しました。元に戻せます");
  }

  async translateIndexes(indexes, target) {
    const ids = [...new Set(indexes)].map((index) => this.tags[index]?.id).filter(Boolean);
    this.commitPromptBeforeAction();
    const unique = ids.map((id) => this.tags.findIndex((tag) => tag.id === id)).filter((index) => index >= 0);
    if (!unique.length) return;
    const values = unique.map((index) => this.tags[index].value);
    unique.forEach((index) => { this.tags[index].translationError = ""; });
    this.setStatus(`${values.length}件を翻訳中…`);
    try {
      const results = await translateTags(this.api, values, {
        provider: this.settings.translationProvider,
        source: "auto",
        target,
        timeoutMs: translationBatchTimeoutMs(values.length),
      });
      this.pushUndo();
      let emptyCount = 0;
      results.forEach((result, offset) => {
        const tag = this.tags[unique[offset]];
        if (!tag) return;
        const translated = cleanTranslation(result?.translated);
        tag.translation = translated;
        tag.translatedTo = translated ? target : "";
<<<<<<< HEAD
        tag.translationError = translated ? "" : (result?.error || "翻訳結果が空でした");
=======
        tag.translationError = translated ? "" : "翻訳結果が空でした";
>>>>>>> 6370d6dc927602ebddc0a04713de4d385119ea2d
        tag.translationErrorTarget = translated ? "" : target;
        if (!translated) emptyCount += 1;
      });
      this.syncToWidgets();
      this.render();
<<<<<<< HEAD
      if (emptyCount) this.setStatus(`${emptyCount}件の翻訳結果が空でした。翻訳ボタンから再試行できます`, true);
=======
      if (emptyCount) this.setStatus(`${emptyCount}件の翻訳結果が空でした。翻訳メニューから再試行できます`, true);
>>>>>>> 6370d6dc927602ebddc0a04713de4d385119ea2d
      else this.setStatus("翻訳しました");
    } catch (error) {
      unique.forEach((index) => {
        this.tags[index].translationError = error.message;
        this.tags[index].translationErrorTarget = target;
      });
      this.persist();
      this.render();
      this.setStatus(`${error.message}。同じ翻訳ボタンで再試行できます`, true);
    }
  }

  async translatePrompt() {
    if (this.translationBusy) return;
    this.commitPromptBeforeAction();
    const specialTypes = new Set(["lora", "lycoris", "embedding", "wildcard", "dynamic"]);
    const japaneseTasks = [];
    const localTasks = [];
    for (const tag of this.currentTags) {
      if (specialTypes.has(tag.type)) continue;
      const sourceText = translatableTagText(tag.value);
      const task = { id: tag.id, originalValue: tag.value, text: sourceText };
      if (containsJapaneseText(sourceText)) japaneseTasks.push(task);
      else if (!cleanTranslation(tag.translation) || tag.translatedTo !== this.settings.localLanguage) localTasks.push(task);
    }

    const taskCount = japaneseTasks.length + localTasks.length;
    if (!taskCount) return this.setStatus("翻訳が必要なタグはありません");

    this.translationBusy = true;
    if (this.translateButton) {
      this.translateButton.disabled = true;
      this.translateButton.textContent = "翻訳中…";
    }
    this.pushUndo();
    [...japaneseTasks, ...localTasks].forEach((task) => {
      const tag = this.tags.find((item) => item.id === task.id);
      if (tag) tag.translationError = "";
    });
    this.setStatus(`${taskCount}件を翻訳中…`);

    const execute = async (tasks, target) => {
      if (!tasks.length) return [];
      try {
        const results = await translateTags(this.api, tasks.map((task) => task.text), {
          provider: this.settings.translationProvider,
          source: "auto",
          target,
          timeoutMs: translationBatchTimeoutMs(tasks.length),
        });
        return tasks.map((task, index) => ({ task, target, result: results[index] || {} }));
      } catch (error) {
        return tasks.map((task) => ({ task, target, result: { error: error.message } }));
      }
    };

    try {
      const batches = await Promise.all([
        execute(japaneseTasks, "en"),
        execute(localTasks, this.settings.localLanguage),
      ]);
      let replaced = 0;
      let supplemented = 0;
      let failed = 0;
      for (const { task, target, result } of batches.flat()) {
        const tag = this.tags.find((item) => item.id === task.id);
        if (!tag || tag.value !== task.originalValue) continue;
        const translated = cleanTranslation(result?.translated);
        if (applySmartTranslationResult(tag, translated, target, this.settings.localLanguage)) {
          if (target === "en") replaced += 1;
          else supplemented += 1;
        } else {
          tag.translationError = result?.error || "翻訳結果が空でした";
          tag.translationErrorTarget = target;
          failed += 1;
        }
      }
      this.applyBlacklist(this.settings.blacklistAction !== "warn");
      this.syncToWidgets();
      this.render();
      const completed = [`日本語${replaced}件を英語へ置換`, `日本語訳${supplemented}件を追加`].join("、");
      if (failed) this.setStatus(`${completed}。${failed}件は翻訳できませんでした。翻訳ボタンで再試行できます`, true);
      else this.setStatus(`${completed}しました`);
    } catch (error) {
      this.persist();
      this.render();
      this.setStatus(`${error.message}。翻訳ボタンで再試行できます`, true);
    } finally {
      this.translationBusy = false;
      if (this.translateButton) {
        this.translateButton.disabled = false;
        this.translateButton.textContent = "翻訳";
      }
    }
  }

  translateSelection(target) {
    const indexes = this.currentTags.map((tag, index) => tag.selected ? index : -1).filter((index) => index >= 0);
    return this.translateIndexes(indexes, target);
  }

  translateAll(target) {
    return this.translateIndexes(this.currentTags.map((_tag, index) => index), target);
  }

  async retryFailedTranslations() {
    const failures = this.currentTags
      .map((tag, index) => ({ tag, index }))
      .filter(({ tag }) => tag.translationError);
    if (!failures.length) return this.setStatus("再試行が必要な翻訳はありません");
    const english = failures.filter(({ tag }) => tag.translationErrorTarget === "en").map(({ index }) => index);
    const local = failures.filter(({ tag }) => tag.translationErrorTarget !== "en").map(({ index }) => index);
    if (english.length) await this.translateIndexes(english, "en");
    if (local.length) await this.translateIndexes(local, this.settings.localLanguage);
  }

  async copySelected(withTranslation) {
    const selected = this.currentTags.filter((tag) => tag.selected);
    const value = withTranslation
      ? selected.map((tag) => cleanTranslation(tag.translation) ? `${tag.value} (${cleanTranslation(tag.translation)})` : tag.value).join(", ")
      : outputPrompt(selected, this.settings.outputLanguage);
    await copyText(value);
    this.setStatus("選択タグをコピーしました");
  }

  async copySelectedLanguage(language) {
    const selected = this.currentTags.filter((tag) => tag.selected);
    const value = selected.map((tag) => {
      const translation = cleanTranslation(tag.translation);
      return translation && tag.translatedTo === language ? translation : tag.value;
    }).join(", ");
    await copyText(value);
    this.setStatus(`${language.toUpperCase()}形式で選択タグをコピーしました`);
  }

  async copyPrompt() {
    await copyText(outputPrompt(this.tags, this.settings.outputLanguage));
    this.setStatus("プロンプトをコピーしました");
  }

  applyBlacklist(mutate) {
    const compiled = compileBlacklist(this.settings.blacklist);
    for (const tag of this.tags) tag.blacklistMatch = matchesBlacklist(tag.value, compiled);
    if (!mutate) return;
    if (this.settings.blacklistAction === "disable") {
      this.tags.filter((tag) => tag.blacklistMatch).forEach((tag) => { tag.enabled = false; });
    } else if (this.settings.blacklistAction === "delete") {
      this.tags = this.tags.filter((tag) => !tag.blacklistMatch);
    }
  }

  async loadModelRegistry() {
    try {
      const [embeddingResponse, objectResponse] = await Promise.all([
        this.api.fetchApi("/embeddings"),
        this.api.fetchApi("/object_info"),
      ]);
      if (embeddingResponse.ok) {
        const embeddings = await embeddingResponse.json();
        this.modelRegistry.embeddings = new Set((embeddings || []).map((item) => String(item).toLocaleLowerCase()));
      }
      if (objectResponse.ok) {
        const objectInfo = await objectResponse.json();
        const values = objectInfo?.LoraLoader?.input?.required?.lora_name?.[0];
        if (Array.isArray(values)) this.modelRegistry.loras = new Set(values.map((item) => String(item).replace(/\\/g, "/").toLocaleLowerCase()));
      }
      this.checkModels();
      this.renderTags();
    } catch {
      this.modelRegistry = { loras: null, embeddings: null };
    }
  }

  checkModels() {
    for (const tag of this.tags) {
        tag.missingModel = false;
        if (tag.type === "lora" && this.modelRegistry.loras) {
          const name = tag.value.match(/^<lora:([^:>]+)/i)?.[1]?.toLocaleLowerCase();
          tag.missingModel = Boolean(name) && ![...this.modelRegistry.loras].some((path) => path.endsWith(name) || path.endsWith(`${name}.safetensors`));
        } else if (tag.type === "embedding" && this.modelRegistry.embeddings) {
          const name = tag.value.replace(/^embedding:/i, "").toLocaleLowerCase();
          tag.missingModel = !this.modelRegistry.embeddings.has(name);
        }
    }
  }

  applyCustomColors() {
    if (!this.root) return;
    for (const [key, value] of Object.entries(this.settings.tagColors || {})) {
      if (/^#[0-9a-f]{6}$/i.test(value)) this.root.style.setProperty(`--paio-color-${key}`, value);
    }
  }

  setStatus(message, error = false) {
    if (!this.status) return;
    this.status.textContent = String(message);
    this.status.classList.toggle("is-error", error);
  }
}
