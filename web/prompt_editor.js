import {
  SECTION_HEADING_GROUPS,
  SECTION_TEMPLATES,
  adjustTagWeight,
  buildStructuredOutputs,
  canonicalTagKey,
  classifyTag,
  compileBlacklist,
  createSection,
  createTag,
  findDuplicateKeys,
  getTagWeight,
  inferSectionRole,
  looksLikeStructuredPrompt,
  matchesBlacklist,
  normalizePromptTags,
  outputPrompt,
  parsePrompt,
  parseStructuredPrompt,
  promptBody,
  replacePromptBody,
  serializeEditorPrompt,
  serializePrompt,
  serializeSectionEditorText,
  serializeStructuredSectionBody,
  setTagWeight,
} from "./prompt_parser.js";
import {
  DEFAULT_CATALOG_NAME,
  DEFAULT_SETTINGS,
  exportEditorState,
  mergeFavoriteSettings,
  parseImportedState,
  sanitizeEditorState,
  sanitizeSettings,
} from "./settings.js";
import { fetchSharedFavorites, saveSharedFavorites, sharedFavoritesStore } from "./favorites.js";
export { fetchSharedFavorites, saveSharedFavorites };
import { translateTags } from "./translation.js";
import { attachTagSuggestions, searchTagDb, shouldSearchTagDb, tagDbKey, validateTagDb } from "./tagdb.js";
import { applyCategoryColor, categoryColorId, categoryBaseColor, majorCategory,
  sanitizeCategoryColors, validCategoryColor, tagCategoryIndex, categoryPromptKey } from "./category_colors.js";
import {
  getAvailableUiLanguages,
  getUiLanguage,
  saveUiLanguage,
  translateUi as t,
} from "./i18n.js";
import {
  buildTagLibrary,
  deleteCategoryEdit,
  deleteTagEdit,
  libraryToBundledCatalog,
  libraryToStoredCatalog,
  reorderTagEdits,
  saveCategoryEdit,
  saveTagEdit,
  sanitizeLibraryEdits,
  sortExampleTags,
  tagUsageKey,
} from "./tag_library.js";
import {
  buildTagSetLibrary,
  filterTagSets,
  normalizeTagSetIds,
  resolveTagSetCategoryPath,
  tagSetFavoriteKey,
  sortTagSets,
  tagSetUsageKey,
} from "./tag_sets.js";

const STATE_KEY = "promptWorkbenchState";
const SORT_STORAGE_KEY = "prompt-workbench/library-sort";
const MCP_POSITIVE_SECTION_KEYS = ["quality", "subject", "composition", "style", "trigger"];
const MCP_NEGATIVE_SECTION_KEYS = ["quality", "anatomy", "style"];
const MCP_SECTION_LABELS = {
  quality: "【Quality】",
  subject: "【Subject】",
  composition: "【Composition】",
  style: "【Style】",
  trigger: "【Trigger】",
  anatomy: "【Anatomy】",
};
let categoryColorErrorSerial = 0;
let nextSectionDatalistId = 1;
const MAX_RENDERED_TAGS = 250;
const INITIAL_EXAMPLE_LIMIT = 24;
const EXAMPLE_PAGE_SIZE = 24;
const TAG_DB_SEARCH_DELAY_MS = 300;
const TAG_DB_SEARCH_LIMIT = 50;
const TAG_DB_CHECK_DELAY_MS = 400;
const TAG_DB_CHECK_BATCH = 200;
const MAX_EXAMPLE_SEARCH_RESULTS = 50;
const MAX_CATALOG_FILE_BYTES = 4 * 1024 * 1024;
const TAG_SINGLE_CLICK_DELAY_MS = 450;
const CATALOG_FILE_PICKER_TYPES = [{
  description: t("JSONタグファイル"),
  accept: { "application/json": [".json"] },
}];
const CATALOG_FILE_PICKER_ID = "prompt-workbench-catalog-save";
const TAG_SET_FILE_PICKER_ID = "prompt-workbench-tag-set-save";
const PROSE_PHRASES = [
  { group: "構図・レンズ", prompt: "Medium close-up portrait, 50mm lens, shallow depth of field, eye-level", ja: "ミディアムクローズアップ、50mmレンズ、浅い被写界深度、アイレベル" },
  { group: "構図・レンズ", prompt: "50mm标准焦段，平视全身近景，浅景深虚化背景", ja: "50mm標準レンズ、アイレベル全身寄り、浅い被写界深度で背景ボケ" },
  { group: "構図・レンズ", prompt: "Pure 90-degree side profile silhouette, camera facing left", ja: "真横90度のプロフィールシルエット、画面左向き" },
  { group: "光影・雰囲気", prompt: "Soft key light from upper left, subtle rim lighting, natural skin texture", ja: "左上からの柔らかいキーライト、繊細なリムライト、自然な肌質感" },
  { group: "光影・雰囲気", prompt: "左上方柔和主光斜向倾洒，后方透出环境轮廓光", ja: "左上から柔らかいキーライトが斜めに差し込み、背後から環境リム光" },
  { group: "光影・雰囲気", prompt: "Golden hour window light casting warm soft shadows across the room.", ja: "ゴールデンアワーの窓光が部屋に温かい柔らかい影を落とす。" },
  { group: "質感・カメラ", prompt: "Shot on 35mm medium format film with fine grain and realistic color grading.", ja: "35mm中判フィルム撮影、繊細な粒子とリアルな色調" },
];
const DEFAULT_EXAMPLE_LIST_HEIGHT = 118;
const MIN_EXAMPLE_LIST_HEIGHT = 96;
const MAX_EXAMPLE_LIST_HEIGHT = 520;
const DEFAULT_TAG_SET_LIST_HEIGHT = 160;
const MIN_TAG_SET_LIST_HEIGHT = 96;
const MAX_TAG_SET_LIST_HEIGHT = 720;
const DEFAULT_PROMPT_TEXT_HEIGHT = 140;
const MIN_PROMPT_TEXT_HEIGHT = 96;
const MAX_PROMPT_TEXT_HEIGHT = 420;
const DEFAULT_TAG_LIST_HEIGHT = 260;
const MIN_TAG_LIST_HEIGHT = 96;
const MAX_TAG_LIST_HEIGHT = 720;
const MIN_SPLIT_HEIGHT = 280;
const DEFAULT_SPLIT_HEIGHT = 560;
const BASE_DOM_WIDGET_HEIGHT = 690;
const BASE_NODE_HEIGHT = 760;
const COLOR_DEFAULTS = {
  normal: "#7b8794", disabled: "#6b7280", lora: "#3b82f6", lycoris: "#a855f7",
  embedding: "#14b8a6", wildcard: "#eab308", duplicate: "#f59e0b",
  blacklist: "#ef4444", missing: "#ef4444", error: "#dc2626",
};

export function clampTagListHeight(value) {
  return Math.min(MAX_TAG_LIST_HEIGHT, Math.max(MIN_TAG_LIST_HEIGHT, Math.round(Number(value) || DEFAULT_TAG_LIST_HEIGHT)));
}

export function clampPromptTextHeight(value) {
  return Math.min(MAX_PROMPT_TEXT_HEIGHT, Math.max(MIN_PROMPT_TEXT_HEIGHT, Math.round(Number(value) || DEFAULT_PROMPT_TEXT_HEIGHT)));
}

export function normalizeMarqueeRect(startX, startY, endX, endY) {
  const left = Math.min(startX, endX);
  const top = Math.min(startY, endY);
  const right = Math.max(startX, endX);
  const bottom = Math.max(startY, endY);
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

export function rectsIntersect(a, b) {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}

export function applyMarqueeSelection(tags, hitIndices, initialSelectedIds = new Set(), additive = false) {
  let lastIndex = null;
  tags.forEach((tag, index) => {
    const selected = hitIndices.has(index) || (additive && initialSelectedIds.has(tag.id));
    tag.selected = selected;
    if (selected) lastIndex = index;
  });
  return lastIndex;
}

function clampTagSetListHeight(value) {
  return Math.min(MAX_TAG_SET_LIST_HEIGHT, Math.max(MIN_TAG_SET_LIST_HEIGHT, Math.round(Number(value) || DEFAULT_TAG_SET_LIST_HEIGHT)));
}

function tagSetImageSource(value) {
  const source = String(value || "").trim();
  if (!source) return "";
  if (!source.startsWith("/prompt-workbench-data/tag-set-images/")) return source;
  const encoded = encodeURI(source);
  return `${encoded}${encoded.includes("?") ? "&" : "?"}v=2`;
}

export function safeSourceUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

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

function collapsiblePane(title, className, children = []) {
  const pane = element("details", { className: `paio-collapsible ${className}`.trim() });
  pane.open = true;
  const summary = element("summary", { className: "paio-collapsible-summary" }, [
    element("span", { className: "paio-disclosure", text: "▾" }),
    element("strong", { text: title }),
  ]);
  pane.append(summary, ...children);
  return { pane, summary };
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

function loadLibrarySortSettings(settings) {
  try {
    const stored = JSON.parse(globalThis.localStorage?.getItem(SORT_STORAGE_KEY) || "null");
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return;
    const safe = sanitizeSettings({ ...settings, ...stored });
    for (const key of ["exampleSortOrder", "tagSetSortOrder", "tagUsage", "tagSetUsage"]) settings[key] = safe[key];
  } catch {}
}

function saveLibrarySortSettings(settings) {
  try {
    const { exampleSortOrder, tagSetSortOrder, tagUsage, tagSetUsage } = sanitizeSettings(settings);
    globalThis.localStorage?.setItem(SORT_STORAGE_KEY, JSON.stringify({ exampleSortOrder, tagSetSortOrder, tagUsage, tagSetUsage }));
  } catch {}
}

function librarySortButtons(settings, key, options, changed) {
  const group = element("div", { className: "paio-segmented paio-library-sort", ariaLabel: t("並び替え") });
  group.setAttribute("role", "group");
  for (const [value, label] of options) {
    const control = button(t(label), () => {
      settings[key] = value;
      for (const item of group.children) {
        const active = item.dataset.sortOrder === value;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-pressed", String(active));
      }
      changed();
    });
    control.dataset.sortOrder = value;
    control.classList.add("paio-segmented-button");
    control.classList.toggle("is-active", settings[key] === value);
    control.setAttribute("aria-pressed", String(settings[key] === value));
    group.append(control);
  }
  return group;
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

export async function fetchExampleCatalog(api, libraryFile = "") {
  const query = libraryFile ? `?file=${encodeURIComponent(libraryFile)}` : "";
  const response = await api.fetchApi(`/prompt_workbench/examples${query}`);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || t("タグファイルの読込に失敗しました ({status})", { status: response.status }));
  return body;
}

export async function fetchSelectedTagSetCatalog(api, tagSetFile = "") {
  const query = tagSetFile ? `?file=${encodeURIComponent(tagSetFile)}` : "";
  const response = await api.fetchApi(`/prompt_workbench/tag_sets${query}`);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || t("タグセットの読込に失敗しました ({status})", { status: response.status }));
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
  const listResponse = await api.fetchApi("/prompt_workbench/catalogs");
  const listBody = await listResponse.json().catch(() => ({}));
  if (!listResponse.ok) throw new Error(listBody.error || t("保存済みファイルの確認に失敗しました ({status})", { status: listResponse.status }));
  const existingName = (listBody.files || []).find((name) => String(name).toLocaleLowerCase() === requestedName.toLocaleLowerCase());
  const send = async (method, name) => {
    const response = await api.fetchApi("/prompt_workbench/catalogs", {
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
    throw new Error(t("この保存機能を有効にするにはComfyUIを再起動してください"));
  }
  if (!result.response.ok) throw new Error(result.body.error || t("タグファイルの保存に失敗しました ({status})", { status: result.response.status }));
  return result.body;
}

export async function upsertTagSetCopy(api, fileName, tagSets, options = {}) {
  const requestedName = catalogNameFromFileName(fileName);
  const listResponse = await api.fetchApi("/prompt_workbench/tag_sets/files");
  const listBody = await listResponse.json().catch(() => ({}));
  if (!listResponse.ok) throw new Error(listBody.error || t("保存済みファイルの確認に失敗しました ({status})", { status: listResponse.status }));
  const existingName = (listBody.files || []).find((name) => String(name).toLocaleLowerCase() === requestedName.toLocaleLowerCase());
  const send = async (method, name) => {
    const response = await api.fetchApi("/prompt_workbench/tag_sets/files", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, tag_sets: tagSets }),
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
    throw new Error(t("この保存機能を有効にするにはComfyUIを再起動してください"));
  }
  if (!result.response.ok) throw new Error(result.body.error || t("タグセットの保存に失敗しました ({status})", { status: result.response.status }));
  return result.body;
}

export async function fetchDefaultSettings(api) {
  const response = await api.fetchApi("/prompt_workbench/settings");
  if (!response.ok) throw new Error(t("設定を読み込めませんでした ({status})", { status: response.status }));
  return sanitizeSettings(await response.json());
}

export async function saveDefaultSettings(api, settings) {
  const response = await api.fetchApi("/prompt_workbench/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ settings: sanitizeSettings(settings) }),
  });
  if (!response.ok) throw new Error(t("設定を保存できませんでした ({status})", { status: response.status }));
  return sanitizeSettings(await response.json());
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

function firstSmallCategories(data) {
  if (!data || typeof data !== "object" || Array.isArray(data) || !Array.isArray(data.major_categories)) return [];
  const smalls = [];
  for (const major of data.major_categories) {
    for (const medium of Array.isArray(major?.medium_categories) ? major.medium_categories : []) {
      for (const small of Array.isArray(medium?.small_categories) ? medium.small_categories : []) {
        if (small && typeof small === "object" && !Array.isArray(small)) smalls.push(small);
      }
    }
  }
  return smalls;
}

export function detectPromptWorkbenchJsonKind(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return "unknown";
  if (data.schema === "prompt-workbench/tag-catalog" && data.version === 1) return "catalog";
  if (data.schema_version !== 1 || !Array.isArray(data.major_categories)) return "unknown";
  const smalls = firstSmallCategories(data);
  const hasTags = smalls.some((small) => Array.isArray(small.tags));
  const hasSets = smalls.some((small) => Array.isArray(small.sets));
  if (hasTags && !hasSets) return "catalog";
  if (hasSets && !hasTags) return "tagSets";
  return "unknown";
}

export function parseImportedCatalogText(value) {
  const parsed = JSON.parse(String(value || ""));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(t("タグファイルの内容が正しくありません"));
  }
  if (detectPromptWorkbenchJsonKind(parsed) === "tagSets") {
    throw new Error(t("これはタグセットファイルです。タグセットファイル欄から読み込んでください"));
  }
  const library = buildTagLibrary(parsed);
  if (!library.categories.length) throw new Error(t("読み込めるカテゴリーがありません"));
  // buildTagLibrary silently prunes tags with an empty prompt or a missing
  // category, so validate against its drop count: a file whose tags were
  // dropped is structurally broken and must not import as a partial success.
  if (library.droppedTagCount > 0) {
    throw new Error(t("タグファイルのカテゴリー構造が正しくありません"));
  }
  return libraryToBundledCatalog(library, parsed);
}

export function parseImportedTagSetText(value) {
  const parsed = JSON.parse(String(value || ""));
  if (detectPromptWorkbenchJsonKind(parsed) === "catalog") {
    throw new Error(t("これはタグファイルです。タグファイル欄から読み込んでください"));
  }
  const normalized = normalizeTagSetIds(parsed);
  const library = buildTagSetLibrary(normalized);
  if (!library.categories.length) throw new Error(t("読み込めるタグセット分類がありません"));
  if (!library.sets.length) throw new Error(t("読み込めるタグセットがありません"));
  return normalized;
}

export function containsJapaneseText(value) {
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(String(value || ""));
}

export function translatableTagText(value) {
  return promptBody(value);
}

export function replaceTagTextPreservingSyntax(value, replacement) {
  return replacePromptBody(value, replacement);
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

export function getTagDisplayText(tag, settings) {
  const translation = cleanTranslation(tag?.translation);
  const displayMode = settings?.translationDisplay || "original";
  const localTranslation = translation && tag?.translatedTo === settings?.localLanguage ? translation : "";
  const primary = displayMode === "local" && localTranslation ? localTranslation : (tag?.value || t("空タグ"));
  const secondary = displayMode === "both" && translation && translation !== tag?.value ? translation : "";
  return { primary, secondary };
}

export function hideWidgetForGood(widget, suffix = "") {
  if (!widget) return;
  if (!Object.hasOwn(widget, "paioOriginalType")) {
    widget.paioOriginalType = widget.type;
    widget.paioOriginalComputeSize = widget.computeSize;
    widget.paioOriginalDraw = widget.draw;
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
    const editingTarget = event.target?.closest?.("input, textarea, [contenteditable='true']");
    if (editingTarget) return;
    event.preventDefault();
    event.stopPropagation();
  }, { capture: true });
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

function normalizeSearchText(value) {
  return String(value || "").normalize("NFKC").trim().toLocaleLowerCase().replace(/[\s_-]+/gu, " ");
}

function parseSearchPattern(query) {
  const raw = String(query || "").trim();
  if (!raw) return { empty: true, test: () => true };
  const normalized = normalizeSearchText(raw);
  let regexSource = "";
  let regexFlags = null;
  if (raw.startsWith("re:")) {
    regexSource = raw.slice(3);
  } else if (raw.startsWith("/") && raw.lastIndexOf("/") > 0) {
    regexSource = raw.slice(1, raw.lastIndexOf("/"));
    regexFlags = raw.slice(raw.lastIndexOf("/") + 1);
  }
  if (!regexSource) {
    return { empty: false, test: (text) => normalizeSearchText(text).includes(normalized) };
  }
  try {
    // The test target is lowercased by normalizeSearchText, so without an
    // explicit flag list the match stays case-insensitive (historic behavior,
    // and patterns like /^Long/ keep working). Trailing flags in /.../flags
    // are honored; "g" is never allowed because .test would become stateful.
    const requested = regexFlags ? regexFlags.split("") : ["i"];
    const flags = [...new Set([...requested, "u"])].filter((flag) => "imsu".includes(flag)).join("");
    const matcher = new RegExp(regexSource, flags);
    return { empty: false, test: (text) => matcher.test(normalizeSearchText(text)) };
  } catch {
    const fallback = normalizeSearchText(regexSource);
    return { empty: false, test: (text) => normalizeSearchText(text).includes(fallback) };
  }
}

export function filterExampleLibraryTags(library, selectedSmallId, query = "") {
  const search = parseSearchPattern(query);
  const categories = new Map((library?.categories || []).map((category) => [category.id, category]));
  return (library?.tags || []).filter((tag) => {
    if (search.empty) return tag.categoryId === selectedSmallId;
    const small = categories.get(tag.categoryId);
    const medium = categories.get(small?.parentId);
    const large = categories.get(medium?.parentId);
    return search.test([tag.prompt, tag.ja, ...(tag.aliases || []), large?.ja, medium?.ja, small?.ja].filter(Boolean).join(" "));
  });
}

export function favoriteTagKey(value) {
  return canonicalTagKey(value);
}

export function translationBatchTimeoutMs(itemCount) {
  return Math.max(12000, Math.min(30000, Math.max(1, Number(itemCount) || 1) * 500));
}

export function clampExampleListHeight(value) {
  return Math.min(MAX_EXAMPLE_LIST_HEIGHT, Math.max(MIN_EXAMPLE_LIST_HEIGHT, Math.round(Number(value) || DEFAULT_EXAMPLE_LIST_HEIGHT)));
}

export function tagsWithoutTrailingPlaceholder(parsed) {
  return [...(parsed?.tags || [])].filter((tag) => String(tag?.value || "").trim());
}

function catalogFavoriteKeys(catalog, edits = {}) {
  return buildTagLibrary(catalog || {}, edits).tags
    .filter((tag) => tag.favorite === true)
    .map((tag) => favoriteTagKey(tag.prompt))
    .filter(Boolean);
}

function tagSetFavoriteKeys(catalog) {
  return buildTagSetLibrary(catalog || {}).sets
    .filter((item) => item.favorite === true)
    .map((item) => tagSetFavoriteKey(item.id))
    .filter(Boolean);
}

function updateCatalogFavoriteFlag(catalog, value, favorite) {
  const target = favoriteTagKey(value);
  if (!target || !catalog || typeof catalog !== "object") return false;
  let changed = false;
  const apply = (item, field) => {
    if (!item || typeof item !== "object" || favoriteTagKey(item[field]) !== target) return;
    if (favorite) {
      if (item.favorite !== true) {
        item.favorite = true;
        changed = true;
      }
    } else if (Object.hasOwn(item, "favorite")) {
      delete item.favorite;
      changed = true;
    }
  };
  if (catalog.schema === "prompt-workbench/tag-catalog" && Array.isArray(catalog.tags)) {
    for (const item of catalog.tags) apply(item, "prompt");
    return changed;
  }
  for (const small of firstSmallCategories(catalog)) {
    for (const item of Array.isArray(small.tags) ? small.tags : []) apply(item, "name");
  }
  return changed;
}

function updateLibraryEditFavoriteFlag(rawEdits, value, favorite) {
  const target = favoriteTagKey(value);
  if (!target) return rawEdits;
  const edits = sanitizeLibraryEdits(rawEdits);
  let changed = false;
  const tags = edits.tags.map((tag) => {
    if (favoriteTagKey(tag.prompt) !== target) return tag;
    changed = true;
    const next = { ...tag };
    if (favorite) next.favorite = true;
    else delete next.favorite;
    return next;
  });
  return changed ? { ...edits, tags } : rawEdits;
}

function updateTagSetFavoriteFlag(catalog, id, favorite) {
  const target = tagSetFavoriteKey(id);
  if (!target || !catalog || typeof catalog !== "object") return false;
  let changed = false;
  for (const small of firstSmallCategories(catalog)) {
    for (const item of Array.isArray(small.sets) ? small.sets : []) {
      if (!item || typeof item !== "object" || tagSetFavoriteKey(item.id) !== target) continue;
      if (favorite) {
        if (item.favorite !== true) {
          item.favorite = true;
          changed = true;
        }
      } else if (Object.hasOwn(item, "favorite")) {
        delete item.favorite;
        changed = true;
      }
    }
  }
  return changed;
}

export class PromptEditor {
  constructor(node, widgets, api) {
    this.node = node;
    this.widgets = widgets;
    this.api = api;
    this.sections = [createSection({ id: "sec-1" })];
    this.activeSectionId = this.sections[0].id;
    this.outputFormat = "tags";
    this.wrapBraces = false;
    this.includeNegativeInPrompt = false;
    this.dirtySectionIds = new Set();
    this.sectionTextareas = new Map();
    this.settings = { ...DEFAULT_SETTINGS };
    this.filterText = "";
    this.filterMode = "all";
    this.undoStack = [];
    this.redoStack = [];
    this.lastSelectedIndex = null;
    this.dragIndex = null;
    this.dragTagIds = null;
    this.dragSourceSectionId = null;
    this.didDrag = false;
    this.clickTimer = null;
    this.renderLimit = MAX_RENDERED_TAGS;
    this.contextMenu = null;
    this.modelRegistry = { loras: null, embeddings: null };
    this.syncing = false;
    this.lastWidgetValue = "";
    this.lastNegativeValue = "";
    this.exampleData = null;
    this.exampleLoadPromise = null;
    this.tagSetData = null;
    this.tagSetLoadPromise = null;
    this.sharedFavoritesPromise = null;
    this.activeLibraryTab = "tags";
    this.refreshExamplesPanel = null;
    this.refreshTagSetsPanel = null;
    this.domWidget = null;
    this.dataGeneration = 0;
    this.translationGeneration = 0;
    this.disposed = false;
    this.restore();
    this.root = this.build();
    this.attach();
    // Graph.configure assigns properties after onNodeCreated. Delay shared
    // state initialization until that synchronous lifecycle has completed.
    queueMicrotask(() => { if (!this.disposed) this.loadSharedFavorites(); });
    queueMicrotask(() => { if (!this.disposed) this.loadDefaultSettings(); });
    this.tagDbStates = new Map();
    this.loadModelRegistry();
    this.pollTimer = window.setInterval(() => this.syncFromWidgets(), 400);
  }

  activeSection() {
    if (!Array.isArray(this.sections) || !this.sections.length) return null;
    const found = this.sections.find((section) => section.id === this.activeSectionId);
    if (found) return found;
    this.activeSectionId = this.sections[0].id;
    return this.sections[0];
  }

  get tags() {
    return this.activeSection()?.tags ?? this._fallbackTags ?? [];
  }

  set tags(value) {
    const next = Array.isArray(value) ? value : [];
    const active = this.activeSection();
    if (active) active.tags = next;
    else this._fallbackTags = next;
  }

  get trailingSeparator() {
    return this.activeSection()?.trailingSeparator ?? Boolean(this._fallbackTrailingSeparator);
  }

  set trailingSeparator(value) {
    const active = this.activeSection();
    if (active) active.trailingSeparator = Boolean(value);
    else this._fallbackTrailingSeparator = Boolean(value);
  }

  get promptDirty() {
    if (!Array.isArray(this.sections)) return Boolean(this._fallbackPromptDirty);
    return Boolean(this.dirtySectionIds?.has(this.activeSectionId));
  }

  set promptDirty(value) {
    if (!Array.isArray(this.sections)) {
      this._fallbackPromptDirty = Boolean(value);
      return;
    }
    this.dirtySectionIds ||= new Set();
    if (value) this.dirtySectionIds.add(this.activeSectionId);
    else this.dirtySectionIds.delete(this.activeSectionId);
  }

  isMultiSectionView() {
    if (!Array.isArray(this.sections)) return false;
    return this.sections.length > 1
      || this.outputFormat === "structured"
      || Boolean(this.sections[0]?.title)
      || this.sections[0]?.role === "negative"
      || this.sections[0]?.enabled === false;
  }

  get currentTags() {
    return this.tags;
  }

  favoriteSet() {
    return new Set(this.settings.favorites || []);
  }

  isFavoriteValue(value) {
    const key = favoriteTagKey(value);
    return Boolean(key && this.favoriteSet().has(key));
  }

  setFavoriteValue(value, favorite) {
    const key = favoriteTagKey(value);
    if (!key) return;
    const favorites = this.favoriteSet();
    if (favorite) favorites.add(key);
    else favorites.delete(key);
    this.settings.favorites = [...favorites].sort();
    this.settings.libraryEdits = updateLibraryEditFavoriteFlag(this.settings.libraryEdits, value, favorite);
    updateCatalogFavoriteFlag(this.exampleData, value, favorite);
    this.clearSelectionState();
    this.persist();
    this.saveSharedFavorites([{ kind: "favorites", key, favorite }]);
    this.renderTags();
    this.refreshExamplesPanel?.();
  }

  favoriteTagSetKeys() {
    return new Set(this.settings.favoriteTagSets || []);
  }

  isFavoriteTagSet(id) {
    const key = tagSetFavoriteKey(id);
    return Boolean(key && this.favoriteTagSetKeys().has(key));
  }

  setFavoriteTagSetValue(id, favorite) {
    const key = tagSetFavoriteKey(id);
    if (!key) return;
    const favorites = this.favoriteTagSetKeys();
    if (favorite) favorites.add(key);
    else favorites.delete(key);
    this.settings.favoriteTagSets = [...favorites].sort();
    updateTagSetFavoriteFlag(this.tagSetData, id, favorite);
    this.persist();
    this.saveSharedFavorites([{ kind: "favoriteTagSets", key, favorite }]);
    this.refreshExamplesPanel?.();
    this.refreshTagSetsPanel?.();
  }

  syncFavoritesWithCatalog(catalog) {
    const fileFavorites = catalogFavoriteKeys(catalog, this.settings.libraryEdits);
    const merged = mergeFavoriteSettings(this.settings, { favorites: fileFavorites });
    const changed = merged.favorites.join("\0") !== (this.settings.favorites || []).join("\0");
    this.settings.favorites = merged.favorites;
    if (changed && this.favoritesStore?.base.revision >= 0) {
      this.saveSharedFavorites(fileFavorites.map((key) => ({ kind: "favorites", key, favorite: true })));
    }
    return fileFavorites.length;
  }

  syncFavoritesWithTagSets(catalog) {
    const fileFavorites = tagSetFavoriteKeys(catalog);
    const merged = mergeFavoriteSettings(this.settings, { favoriteTagSets: fileFavorites });
    const changed = merged.favoriteTagSets.join("\0") !== (this.settings.favoriteTagSets || []).join("\0");
    this.settings.favoriteTagSets = merged.favoriteTagSets;
    if (changed && this.favoritesStore?.base.revision >= 0) {
      this.saveSharedFavorites(fileFavorites.map((key) => ({ kind: "favoriteTagSets", key, favorite: true })));
    }
    return fileFavorites.length;
  }

  currentFavoriteSettings() {
    return mergeFavoriteSettings({
      favorites: this.settings.favorites,
      favoriteTagSets: this.settings.favoriteTagSets,
    }, {
      favorites: this.exampleData ? catalogFavoriteKeys(this.exampleData, this.settings.libraryEdits) : [],
      favoriteTagSets: this.tagSetData ? tagSetFavoriteKeys(this.tagSetData) : [],
    });
  }

  applyFavoriteSettings(favorites) {
    const merged = mergeFavoriteSettings(favorites, {
      favorites: this.exampleData ? catalogFavoriteKeys(this.exampleData, this.settings.libraryEdits) : [],
      favoriteTagSets: this.tagSetData ? tagSetFavoriteKeys(this.tagSetData) : [],
    });
    const changed = merged.favorites.join("\0") !== (this.settings.favorites || []).join("\0")
      || merged.favoriteTagSets.join("\0") !== (this.settings.favoriteTagSets || []).join("\0");
    this.settings.favorites = merged.favorites;
    this.settings.favoriteTagSets = merged.favoriteTagSets;
    if (changed) {
      this.persist();
      this.renderTags();
      this.refreshExamplesPanel?.();
      this.refreshTagSetsPanel?.();
    }
    return merged;
  }

  loadSharedFavorites() {
    const store = this.favoritesStore ||= sharedFavoritesStore(this.api);
    const seed = this.currentFavoriteSettings();
    this.unsubscribeFavorites ||= store.subscribe((favorites) => {
      if (!this.disposed) this.applyFavoriteSettings(favorites);
    });
    this.sharedFavoritesPromise = store.initialize(seed).catch((error) => {
      this.setStatus(t("お気に入りを読み込めませんでした: {error}", { error: error.message }), true);
    });
    return this.sharedFavoritesPromise;
  }

  saveSharedFavorites(operations) {
    if (!this.favoritesStore) this.loadSharedFavorites();
    this.sharedFavoritesPromise = this.favoritesStore.update(operations, this.currentFavoriteSettings())
      .catch((error) => {
        this.setStatus(t("お気に入りを保存できませんでした: {error}", { error: error.message }), true);
      });
    return this.sharedFavoritesPromise;
  }

  hasSavedEditorState() {
    return this.node.properties?.[STATE_KEY]?.version === 1;
  }

  async loadDefaultSettings() {
    if (this.hasSavedEditorState()) return;
    try {
      const defaults = await fetchDefaultSettings(this.api);
      if (this.disposed || this.hasSavedEditorState()) return;
      this.settings = sanitizeSettings({
        ...defaults,
        favorites: this.settings.favorites,
        favoriteTagSets: this.settings.favoriteTagSets,
      });
      if (this.favoritesStore?.base.revision >= 0) Object.assign(this.settings, this.favoritesStore.value);
      this.rebuildControls();
      this.syncToWidgets();
      this.render();
    } catch (error) {
      this.setStatus(t("設定を読み込めませんでした: {error}", { error: error.message }), true);
    }
  }

  promptEditorValue(section = this.activeSection?.() || null) {
    if (section && Array.isArray(this.sections)) {
      return serializeSectionEditorText(section, this.outputFormat || "tags");
    }
    return serializeEditorPrompt(this.tags, {
      trailingSeparator: this.trailingSeparator,
    });
  }

  currentOutputs() {
    if (Array.isArray(this.sections)) {
      return buildStructuredOutputs(this.sections, {
        outputFormat: this.outputFormat || "tags",
        outputLanguage: this.settings.outputLanguage,
        replaceUnderscores: this.settings.replaceUnderscoresForOutput,
        wrapBraces: this.wrapBraces,
        includeNegativeInPrompt: this.includeNegativeInPrompt,
      });
    }
    return {
      prompt: outputPrompt(this.tags, this.settings.outputLanguage, {
        trailingSeparator: true,
        stripLineBreaks: true,
        replaceUnderscores: this.settings.replaceUnderscoresForOutput,
      }),
      negative: "",
    };
  }

  snapshot() {
    const payload = Array.isArray(this.sections)
      ? {
          sections: this.sections,
          activeSectionId: this.activeSectionId,
          outputFormat: this.outputFormat,
          wrapBraces: this.wrapBraces,
          includeNegativeInPrompt: this.includeNegativeInPrompt,
          settings: this.settings,
        }
      : { tags: this.tags, settings: this.settings, trailingSeparator: this.trailingSeparator };
    return typeof structuredClone === "function"
      ? structuredClone(payload)
      : JSON.parse(JSON.stringify(payload));
  }

  pushUndo() {
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  restoreSnapshot(snapshot) {
    if (Array.isArray(this.sections) && Array.isArray(snapshot.sections)) {
      this.sections = snapshot.sections.map((section) => createSection(section));
      this.activeSectionId = snapshot.activeSectionId || this.sections[0]?.id || "sec-1";
      this.outputFormat = ["structured", "json"].includes(snapshot.outputFormat) ? snapshot.outputFormat : "tags";
      this.wrapBraces = Boolean(snapshot.wrapBraces);
      this.includeNegativeInPrompt = Boolean(snapshot.includeNegativeInPrompt);
      this.dirtySectionIds?.clear();
    } else {
      this.tags = snapshot.tags;
      this.trailingSeparator = Boolean(snapshot.trailingSeparator);
      this.promptDirty = false;
    }
    this.settings = snapshot.settings;
    this.translationGeneration += 1;
    this.translationBusy = false;
    if (this.favoritesStore?.base.revision >= 0) {
      Object.assign(this.settings, this.favoritesStore.value);
    }
    this.rebuildControls();
    this.syncToWidgets();
    this.render();
  }

  undo() {
    const snapshot = this.undoStack.pop();
    if (!snapshot) return this.setStatus(t("元に戻す操作はありません"));
    this.redoStack.push(this.snapshot());
    this.restoreSnapshot(snapshot);
  }

  redo() {
    const snapshot = this.redoStack.pop();
    if (!snapshot) return this.setStatus(t("やり直す操作はありません"));
    this.undoStack.push(this.snapshot());
    this.restoreSnapshot(snapshot);
  }

  applyRawWidgetValue(widgetValue, negativeValue = "") {
    if (Array.isArray(this.sections) && looksLikeStructuredPrompt(widgetValue)) {
      const parsed = parseStructuredPrompt(widgetValue, this.sections);
      this.sections = parsed.sections;
      this.activeSectionId = this.sections[0]?.id || "sec-1";
      this.outputFormat = "structured";
      this.wrapBraces = parsed.wrapBraces;
      this.includeNegativeInPrompt = parsed.sections.some((section) => section.role === "negative");
      if (negativeValue.trim() && !this.sections.some((section) => section.role === "negative")) {
        const negParsed = parsePrompt(negativeValue);
        this.sections.push(createSection({
          title: t("【ネガティブ】"),
          role: "negative",
          trailingSeparator: negParsed.trailingSeparator,
          tags: tagsWithoutTrailingPlaceholder(negParsed),
        }));
      }
      return;
    }
    const parsedWidget = parsePrompt(widgetValue, this.tags);
    if (Array.isArray(this.sections)) {
      const nextSections = [createSection({
        id: this.sections[0]?.id || "sec-1",
        title: "",
        role: "positive",
        trailingSeparator: parsedWidget.trailingSeparator,
        tags: tagsWithoutTrailingPlaceholder(parsedWidget),
      })];
      if (negativeValue.trim()) {
        const negParsed = parsePrompt(negativeValue);
        nextSections.push(createSection({
          title: t("【ネガティブ】"),
          role: "negative",
          trailingSeparator: negParsed.trailingSeparator,
          tags: tagsWithoutTrailingPlaceholder(negParsed),
        }));
      }
      this.sections = nextSections;
      this.activeSectionId = this.sections[0].id;
      const rawFmt = this.widgets.outputFormat?.value;
      this.outputFormat = ["structured", "json"].includes(rawFmt) ? rawFmt : "tags";
      this.wrapBraces = false;
      this.includeNegativeInPrompt = false;
    } else {
      this.tags = tagsWithoutTrailingPlaceholder(parsedWidget);
      this.trailingSeparator = parsedWidget.trailingSeparator;
    }
  }

  mcpWidget(name) {
    return this.widgets?.[name] || this.node?.widgets?.find((widget) => widget.name === name) || null;
  }

  mcpBoolValue(name, defaultValue = true) {
    const widget = this.mcpWidget(name);
    if (!widget || widget.value === undefined || widget.value === null) return defaultValue;
    if (typeof widget.value === "boolean") return widget.value;
    if (typeof widget.value === "number") return widget.value !== 0;
    const text = String(widget.value).trim().toLowerCase();
    if (["0", "false", "no", "off", ""].includes(text)) return false;
    if (["1", "true", "yes", "on"].includes(text)) return true;
    return defaultValue;
  }

  hasActiveMcpSectionWidgets() {
    for (const key of MCP_POSITIVE_SECTION_KEYS) {
      if (String(this.mcpWidget(`sec_${key}`)?.value || "").trim()) return true;
      if (this.mcpWidget(`sec_${key}_enabled`) && !this.mcpBoolValue(`sec_${key}_enabled`, true)) return true;
    }
    for (const key of MCP_NEGATIVE_SECTION_KEYS) {
      if (String(this.mcpWidget(`neg_${key}`)?.value || "").trim()) return true;
      if (this.mcpWidget(`neg_${key}_enabled`) && !this.mcpBoolValue(`neg_${key}_enabled`, true)) return true;
    }
    const xyMode = String(this.mcpWidget("xy_trigger_sync")?.value || "off").trim().toLowerCase();
    if (xyMode !== "off" && String(this.mcpWidget("xy_trigger_input")?.value || "").trim()) return true;
    return false;
  }

  mcpWidgetSnapshot() {
    const parts = [];
    for (const key of MCP_POSITIVE_SECTION_KEYS) {
      parts.push(`p:${key}:${String(this.mcpWidget(`sec_${key}`)?.value ?? "")}:${this.mcpBoolValue(`sec_${key}_enabled`, true) ? 1 : 0}`);
    }
    for (const key of MCP_NEGATIVE_SECTION_KEYS) {
      parts.push(`n:${key}:${String(this.mcpWidget(`neg_${key}`)?.value ?? "")}:${this.mcpBoolValue(`neg_${key}_enabled`, true) ? 1 : 0}`);
    }
    for (const name of ["merge_order", "merge_separator", "normalize_tags", "xy_trigger_sync", "xy_trigger_input"]) {
      parts.push(`m:${name}:${String(this.mcpWidget(name)?.value ?? "")}`);
    }
    return parts.join("\u001f");
  }

  applyMcpSectionWidgets() {
    if (!Array.isArray(this.sections)) return;
    const nextSections = [];
    for (const key of MCP_POSITIVE_SECTION_KEYS) {
      const text = String(this.mcpWidget(`sec_${key}`)?.value || "");
      const enabled = this.mcpBoolValue(`sec_${key}_enabled`, true);
      const parsed = parsePrompt(text);
      nextSections.push(createSection({
        id: `mcp-pos-${key}`,
        title: MCP_SECTION_LABELS[key] || key,
        role: "positive",
        enabled,
        tags: tagsWithoutTrailingPlaceholder(parsed),
        trailingSeparator: parsed.trailingSeparator,
      }));
    }
    for (const key of MCP_NEGATIVE_SECTION_KEYS) {
      const text = String(this.mcpWidget(`neg_${key}`)?.value || "");
      const enabled = this.mcpBoolValue(`neg_${key}_enabled`, true);
      const parsed = parsePrompt(text);
      nextSections.push(createSection({
        id: `mcp-neg-${key}`,
        title: `Neg ${MCP_SECTION_LABELS[key] || key}`,
        role: "negative",
        enabled,
        tags: tagsWithoutTrailingPlaceholder(parsed),
        trailingSeparator: parsed.trailingSeparator,
      }));
    }
    this.sections = nextSections;
    if (!this.sections.some((section) => section.id === this.activeSectionId)) {
      this.activeSectionId = this.sections[0]?.id || "mcp-pos-quality";
    }
    const rawFmt = this.widgets.outputFormat?.value;
    if (["tags", "structured", "json"].includes(rawFmt)) this.outputFormat = rawFmt;
  }

  buildMcpSchemaSnapshot(outputs) {
    const mergeOrderRaw = String(this.mcpWidget("merge_order")?.value || MCP_POSITIVE_SECTION_KEYS.join(","));
    const order = [];
    for (const rawToken of mergeOrderRaw.split(/[\s,]+/)) {
      const token = rawToken.trim().toLowerCase().replace(/^sec_/, "");
      if (MCP_POSITIVE_SECTION_KEYS.includes(token) && !order.includes(token)) order.push(token);
    }
    for (const key of MCP_POSITIVE_SECTION_KEYS) {
      if (!order.includes(key)) order.push(key);
    }
    return JSON.stringify({
      version: 1,
      output_format: this.outputFormat || "tags",
      merge_order: order,
      merge_separator: String(this.mcpWidget("merge_separator")?.value ?? ", ") || ", ",
      normalize_tags: this.mcpBoolValue("normalize_tags", true),
      xy_trigger_sync: String(this.mcpWidget("xy_trigger_sync")?.value || "off"),
      positive: order.map((key) => ({
        key,
        widget: `sec_${key}`,
        enabled_widget: `sec_${key}_enabled`,
        suggestions_widget: `tag_suggestions_${key}`,
        enabled: this.mcpBoolValue(`sec_${key}_enabled`, true),
        text: String(this.mcpWidget(`sec_${key}`)?.value || ""),
        suggestions: String(this.mcpWidget(`tag_suggestions_${key}`)?.value || ""),
      })),
      negative: MCP_NEGATIVE_SECTION_KEYS.map((key) => ({
        key,
        widget: `neg_${key}`,
        enabled_widget: `neg_${key}_enabled`,
        enabled: this.mcpBoolValue(`neg_${key}_enabled`, true),
        text: String(this.mcpWidget(`neg_${key}`)?.value || ""),
      })),
      merged_prompt: outputs.prompt,
      merged_negative: outputs.negative,
    }, null, 2);
  }

  applyExecutionFeedback(message) {
    if (!message || typeof message !== "object") return;
    this.syncing = true;
    const preview = Array.isArray(message.merged_preview) ? message.merged_preview[0] : message.merged_preview;
    const previewWidget = this.mcpWidget("merged_preview");
    if (previewWidget && typeof preview === "string" && previewWidget.value !== preview) {
      previewWidget.value = preview;
      previewWidget.callback?.(preview, this.node, previewWidget);
    }
    const schema = Array.isArray(message.sections_schema) ? message.sections_schema[0] : message.sections_schema;
    const schemaWidget = this.mcpWidget("sections_schema");
    if (schemaWidget && typeof schema === "string" && schemaWidget.value !== schema) {
      schemaWidget.value = schema;
      schemaWidget.callback?.(schema, this.node, schemaWidget);
    }
    this.syncing = false;
    this.node.graph?.setDirtyCanvas?.(true, true);
  }

  syncActiveSectionSuggestions(tagList) {
    const active = this.activeSection?.();
    if (!active?.id?.startsWith("mcp-pos-")) return;
    const key = active.id.slice("mcp-pos-".length);
    if (!MCP_POSITIVE_SECTION_KEYS.includes(key)) return;
    const widget = this.mcpWidget(`tag_suggestions_${key}`);
    if (!widget) return;
    const nextValue = (Array.isArray(tagList) ? tagList : []).filter(Boolean).join(", ");
    if (widget.value !== nextValue) {
      this.syncing = true;
      widget.value = nextValue;
      widget.callback?.(nextValue, this.node, widget);
      this.syncing = false;
    }
  }

  restore() {
    const widgetValue = String(this.widgets.prompt?.value || "");
    const negativeValue = String(this.widgets.negative?.value || "");
    const parsedWidget = parsePrompt(widgetValue);
    this.trailingSeparator = parsedWidget.trailingSeparator;
    const saved = this.node.properties?.[STATE_KEY];
    if (this.hasActiveMcpSectionWidgets() && (!saved || saved.version !== 1)) {
      this.applyMcpSectionWidgets();
    } else if (saved?.version === 1) {
      const state = sanitizeEditorState(saved);
      this.settings = state.settings;
      if (Array.isArray(this.sections)) {
        this.sections = state.sections.map((section) => createSection(section));
        this.activeSectionId = state.activeSectionId;
        this.outputFormat = state.outputFormat;
        this.wrapBraces = state.wrapBraces;
        this.includeNegativeInPrompt = state.includeNegativeInPrompt;
      } else {
        this.tags = state.tags.map((tag) => createTag(tag.value, tag));
        if (Object.hasOwn(saved, "trailingSeparator")) this.trailingSeparator = state.trailingSeparator;
      }
      const savedOutputs = this.currentOutputs();
      const savedValue = savedOutputs.prompt;
      // Accept the previous version's translation-only output as well, so
      // fixing weight serialization does not discard an older saved state.
      const legacyValue = serializePrompt(this.tags.map((tag) => ({ ...tag,
        value: tag.translation && tag.translatedTo === this.settings.outputLanguage ? tag.translation : tag.value,
      })), { trailingSeparator: true, stripLineBreaks: true });
      const comparable = (value) => String(value).replace(/\r\n/g, "\n").trim().replace(/,+$/u, "").trim();
      if (comparable(widgetValue) !== comparable(savedValue) && comparable(widgetValue) !== comparable(legacyValue)) {
        this.applyRawWidgetValue(widgetValue, negativeValue);
      }
    } else {
      this.applyRawWidgetValue(widgetValue, negativeValue);
    }
    this.lastWidgetValue = widgetValue;
    this.lastNegativeValue = negativeValue;
    this.lastMcpSnapshot = this.mcpWidgetSnapshot();
    this.applyBlacklist(this.settings.blacklistAction !== "warn");
  }

  configureFromNode() {
    this.translationGeneration += 1;
    this.translationBusy = false;
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.dirtySectionIds?.clear();
    this.promptDirty = false;
    this.restore();
    if (this.favoritesStore?.base.revision >= 0) Object.assign(this.settings, this.favoritesStore.value);
    this.rebuildControls();
    this.syncToWidgets();
    this.render();
  }

  rebuildControls() {
    this.closeContextMenu();
    this.dataGeneration += 1;
    this.exampleData = null;
    this.exampleLoadPromise = null;
    this.tagSetData = null;
    this.tagSetLoadPromise = null;
    if (!this.root) return;
    const rebuilt = this.build();
    this.root.replaceChildren(...rebuilt.childNodes);
    this.stabilizeLayout();
  }

  persist() {
    this.node.properties ||= {};
    this.node.properties[STATE_KEY] = sanitizeEditorState({
      version: 1,
      tags: this.tags,
      trailingSeparator: this.trailingSeparator,
      ...(Array.isArray(this.sections)
        ? {
            sections: this.sections,
            activeSectionId: this.activeSectionId,
            outputFormat: this.outputFormat,
            wrapBraces: this.wrapBraces,
            includeNegativeInPrompt: this.includeNegativeInPrompt,
          }
        : {}),
      settings: this.settings,
    });
    this.node.graph?.setDirtyCanvas?.(true, true);
  }

  sectionSocketNames() {
    const names = new Map();
    const used = new Set(["prompt", "negative", "output_format", "sections_payload"]);
    const sections = Array.isArray(this.sections) ? this.sections : [];
    sections.forEach((section, index) => {
      const base = String(section?.title || "").trim() || `Section ${index + 1}`;
      let candidate = base;
      let suffix = 2;
      while (used.has(candidate)) {
        candidate = `${base} (${suffix++})`;
      }
      used.add(candidate);
      names.set(section.id, candidate);
    });
    return names;
  }

  syncDynamicSectionSockets() {
    if (!this.node || !Array.isArray(this.sections)) return;
    const socketNames = this.sectionSocketNames();
    const desired = this.sections
      .filter((section) => Boolean(section.socketInput))
      .map((section) => ({
        sectionId: section.id,
        name: socketNames.get(section.id) || section.title || section.id,
      }));
    const desiredById = new Map(desired.map((entry) => [entry.sectionId, entry.name]));
    const reservedWidgetNames = new Set(["prompt", "negative", "output_format", "sections_payload"]);
    const existingInputs = Array.isArray(this.node.inputs) ? this.node.inputs : [];

    // Re-attach existing inputs restored from workflow JSON by matching socket name.
    for (const input of existingInputs) {
      if (!input || input._paioSectionId || reservedWidgetNames.has(input.name)) continue;
      const matched = desired.find((entry) => entry.name === input.name);
      if (matched) input._paioSectionId = matched.sectionId;
    }

    // Remove dynamic or orphaned unlinked sockets not in desired sections.
    let socketsChanged = false;
    for (let index = existingInputs.length - 1; index >= 0; index -= 1) {
      const input = existingInputs[index];
      if (!input) continue;
      const isLinked = (input.link !== null && input.link !== undefined)
        || (Array.isArray(input.links) && input.links.length > 0);
      if (reservedWidgetNames.has(input.name)) {
        if (!isLinked) {
          if (typeof this.node.removeInput === "function") this.node.removeInput(index);
          else existingInputs.splice(index, 1);
          socketsChanged = true;
        }
        continue;
      }
      const keep = Boolean(input._paioSectionId && desiredById.has(input._paioSectionId));
      if (!keep && (!isLinked || Boolean(input._paioSectionId))) {
        if (typeof this.node.removeInput === "function") this.node.removeInput(index);
        else existingInputs.splice(index, 1);
        socketsChanged = true;
      }
    }

    // Add missing input sockets or rename existing ones without breaking links.
    for (const entry of desired) {
      const currentInputs = Array.isArray(this.node.inputs) ? this.node.inputs : [];
      const existing = currentInputs.find((input) => input?._paioSectionId === entry.sectionId);
      if (existing) {
        if (existing.name !== entry.name) {
          existing.name = entry.name;
          socketsChanged = true;
        }
      } else if (typeof this.node.addInput === "function") {
        const added = this.node.addInput(entry.name, "STRING");
        const target = added || this.node.inputs?.[this.node.inputs.length - 1];
        if (target) target._paioSectionId = entry.sectionId;
        socketsChanged = true;
      }
    }

    // Sync on-demand dynamic output sockets (after fixed index 0: prompt, 1: negative).
    const desiredOutputs = this.sections
      .filter((section) => Boolean(section.socketOutput))
      .map((section) => ({
        sectionId: section.id,
        name: socketNames.get(section.id) || section.title || section.id,
      }));
    const desiredOutById = new Map(desiredOutputs.map((entry) => [entry.sectionId, entry.name]));
    const existingOutputs = Array.isArray(this.node.outputs) ? this.node.outputs : [];
    for (let index = 2; index < existingOutputs.length; index += 1) {
      const output = existingOutputs[index];
      if (!output || output._paioSectionOutId) continue;
      const matched = desiredOutputs.find((entry) => entry.name === output.name);
      if (matched) output._paioSectionOutId = matched.sectionId;
    }
    for (let index = existingOutputs.length - 1; index >= 2; index -= 1) {
      const output = existingOutputs[index];
      if (!output) continue;
      if (!output._paioSectionOutId || !desiredOutById.has(output._paioSectionOutId)) {
        if (typeof this.node.removeOutput === "function") this.node.removeOutput(index);
        else existingOutputs.splice(index, 1);
        socketsChanged = true;
      }
    }
    for (const entry of desiredOutputs) {
      const currentOutputs = Array.isArray(this.node.outputs) ? this.node.outputs : [];
      const existing = currentOutputs.find((output, idx) => idx >= 2 && output?._paioSectionOutId === entry.sectionId);
      if (existing) {
        if (existing.name !== entry.name) {
          existing.name = entry.name;
          socketsChanged = true;
        }
      } else if (typeof this.node.addOutput === "function") {
        const added = this.node.addOutput(entry.name, "STRING");
        const target = added || this.node.outputs?.[this.node.outputs.length - 1];
        if (target) target._paioSectionOutId = entry.sectionId;
        socketsChanged = true;
      }
    }

    this.node.setDirtyCanvas?.(true, true);
    this.node.graph?.setDirtyCanvas?.(true, true);
    if (socketsChanged) this.node.graph?.change?.();
  }

  buildSectionsPayload() {
    if (!Array.isArray(this.sections)) return "";
    const socketNames = this.sectionSocketNames();
    const outputLanguage = this.settings?.outputLanguage || "en";
    const replaceUnderscores = Boolean(this.settings?.replaceUnderscores);
    const structuredMode = this.outputFormat === "structured" || this.outputFormat === "json";
    const outputOrder = Array.isArray(this.node?.outputs)
      ? this.node.outputs.slice(2).map((output) => output?._paioSectionOutId).filter(Boolean)
      : [];
    return JSON.stringify({
      version: 1,
      wrap_braces: Boolean(this.wrapBraces),
      include_negative_in_prompt: Boolean(this.includeNegativeInPrompt),
      output_order: outputOrder,
      sections: this.sections.map((section) => {
        let text = "";
        if (section.mode === "prose") {
          const translated = section.translation && section.translatedTo === outputLanguage
            ? section.translation
            : section.proseText;
          text = String(translated || "").trim();
        } else if (structuredMode) {
          text = serializeStructuredSectionBody(section.tags || [], outputLanguage, {
            replaceUnderscores,
            trailingSeparator: section.trailingSeparator,
          });
        } else {
          text = outputPrompt(section.tags || [], outputLanguage, {
            trailingSeparator: false,
            stripLineBreaks: true,
            replaceUnderscores,
          });
        }
        return {
          id: section.id,
          title: section.title || "",
          socket_name: socketNames.get(section.id) || section.title || section.id,
          socket_input: Boolean(section.socketInput),
          socket_output: Boolean(section.socketOutput),
          role: section.role === "negative" ? "negative" : "positive",
          mode: section.mode === "prose" ? "prose" : "tags",
          enabled: section.enabled !== false,
          text,
        };
      }),
    });
  }

  syncToWidgets() {
    this.syncing = true;
    this.syncDynamicSectionSockets();
    const outputs = this.currentOutputs();
    const promptWidget = this.widgets.prompt;
    if (promptWidget && promptWidget.value !== outputs.prompt) {
      promptWidget.value = outputs.prompt;
      promptWidget.callback?.(outputs.prompt, this.node, promptWidget);
    }
    const negativeWidget = this.widgets.negative;
    if (negativeWidget && negativeWidget.value !== outputs.negative) {
      negativeWidget.value = outputs.negative;
      negativeWidget.callback?.(outputs.negative, this.node, negativeWidget);
    }
    const outputFormatWidget = this.widgets.outputFormat;
    const nextFormat = this.outputFormat || "tags";
    if (outputFormatWidget && outputFormatWidget.value !== nextFormat) {
      outputFormatWidget.value = nextFormat;
      outputFormatWidget.callback?.(nextFormat, this.node, outputFormatWidget);
    }
    const payloadWidget = this.mcpWidget("sections_payload");
    if (payloadWidget && Array.isArray(this.sections)) {
      const nextPayload = this.buildSectionsPayload();
      if (payloadWidget.value !== nextPayload) {
        payloadWidget.value = nextPayload;
        payloadWidget.callback?.(nextPayload, this.node, payloadWidget);
      }
    }
    if (Array.isArray(this.sections)) {
      for (const section of this.sections) {
        if (section.id?.startsWith("mcp-pos-")) {
          const key = section.id.slice("mcp-pos-".length);
          const textWidget = this.mcpWidget(`sec_${key}`);
          const enabledWidget = this.mcpWidget(`sec_${key}_enabled`);
          const sectionText = section.mode === "prose"
            ? String(section.proseText || "").trim()
            : this.promptEditorValue(section);
          if (textWidget && textWidget.value !== sectionText) {
            textWidget.value = sectionText;
            textWidget.callback?.(sectionText, this.node, textWidget);
          }
          const isEnabled = section.enabled !== false;
          if (enabledWidget && Boolean(enabledWidget.value) !== isEnabled) {
            enabledWidget.value = isEnabled;
            enabledWidget.callback?.(isEnabled, this.node, enabledWidget);
          }
        } else if (section.id?.startsWith("mcp-neg-")) {
          const key = section.id.slice("mcp-neg-".length);
          const textWidget = this.mcpWidget(`neg_${key}`);
          const enabledWidget = this.mcpWidget(`neg_${key}_enabled`);
          const sectionText = section.mode === "prose"
            ? String(section.proseText || "").trim()
            : this.promptEditorValue(section);
          if (textWidget && textWidget.value !== sectionText) {
            textWidget.value = sectionText;
            textWidget.callback?.(sectionText, this.node, textWidget);
          }
          const isEnabled = section.enabled !== false;
          if (enabledWidget && Boolean(enabledWidget.value) !== isEnabled) {
            enabledWidget.value = isEnabled;
            enabledWidget.callback?.(isEnabled, this.node, enabledWidget);
          }
        }
      }
      const previewWidget = this.mcpWidget("merged_preview");
      if (previewWidget) {
        const nextPreview = outputs.negative
          ? `[POSITIVE]\n${outputs.prompt}\n\n[NEGATIVE]\n${outputs.negative}`
          : outputs.prompt;
        if (previewWidget.value !== nextPreview) {
          previewWidget.value = nextPreview;
          previewWidget.callback?.(nextPreview, this.node, previewWidget);
        }
      }
      const schemaWidget = this.mcpWidget("sections_schema");
      if (schemaWidget) {
        const nextSchema = this.buildMcpSchemaSnapshot(outputs);
        if (schemaWidget.value !== nextSchema) {
          schemaWidget.value = nextSchema;
          schemaWidget.callback?.(nextSchema, this.node, schemaWidget);
        }
      }
    }
    this.lastWidgetValue = outputs.prompt;
    this.lastNegativeValue = outputs.negative;
    this.lastMcpSnapshot = this.mcpWidgetSnapshot();
    this.persist();
    this.syncing = false;
  }

  syncFromWidgets() {
    compactNodeWidgetLayout(this.node);
    for (const widget of Object.values(this.widgets)) {
      hideWidgetForGood(widget, widget?.name ? `:${widget.name}` : "");
    }
    if (this.syncing) return;
    const mcpSnapshot = this.mcpWidgetSnapshot();
    if (this.lastMcpSnapshot !== undefined && mcpSnapshot !== this.lastMcpSnapshot && this.hasActiveMcpSectionWidgets()) {
      this.applyMcpSectionWidgets();
      this.lastMcpSnapshot = mcpSnapshot;
      this.dirtySectionIds?.clear();
      this.applyBlacklist(this.settings.blacklistAction !== "warn");
      this.syncToWidgets();
      this.rebuildSectionViews?.();
      this.render();
      this.setStatus(t("STRINGウィジェットの変更を反映しました"));
      return;
    }
    const value = String(this.widgets.prompt?.value || "");
    const negativeValue = String(this.widgets.negative?.value || "");
    const changed = value !== this.lastWidgetValue || (this.widgets.negative && negativeValue !== this.lastNegativeValue);
    if (changed) {
      this.applyRawWidgetValue(value, negativeValue);
      this.lastWidgetValue = value;
      this.lastNegativeValue = negativeValue;
      this.dirtySectionIds?.clear();
      this.applyBlacklist(this.settings.blacklistAction !== "warn");
      this.persist();
      this.rebuildSectionViews?.();
      this.render();
      this.setStatus(t("STRINGウィジェットの変更を反映しました"));
    }
  }

  build() {
    loadLibrarySortSettings(this.settings);
    const root = element("section", { className: "paio-editor paio-editor--fork" });
    root.setAttribute("aria-label", "Prompt Workbench editor");
    containNodeContextMenu(root);

    this.syncBadge = element("span", { className: "paio-sync-badge", text: t("同期済み") });

    this.singlePromptTextarea = element("textarea", { className: "paio-prompt-textarea" });
    this.singlePromptTextarea.rows = 4;
    this.singlePromptTextarea.style.height = `${clampPromptTextHeight(this.settings.promptTextHeight)}px`;
    this.singlePromptTextarea.placeholder = t("プロンプトを入力するか、下のタグ追加から選んでください");
    this.singlePromptTextarea.setAttribute("aria-label", t("現在のプロンプト本文"));
    this.singlePromptTextarea.addEventListener("input", () => {
      this.promptDirty = true;
      this.renderSyncState();
    });
    this.singlePromptTextarea.addEventListener("paste", (event) => {
      if (this.singlePromptTextarea.value.trim()) return;
      const pasted = event.clipboardData?.getData("text/plain") || "";
      if (looksLikeStructuredPrompt(pasted)) {
        event.preventDefault();
        this.applyBulkSplitText(pasted);
      }
    });
    this.singlePromptTextarea.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        this.applyPromptText();
      }
    });
    this.promptTextarea = this.singlePromptTextarea;
    this.applyPromptButton = button(t("タグへ反映"), () => this.applyPromptText(), t("本文を解析してタグへ反映（Ctrl+Enter）"));
    const promptActions = element("div", { className: "paio-prompt-actions" }, [this.applyPromptButton]);
    const promptResizeHandle = element("div", { className: "paio-example-resize-handle paio-prompt-textarea-resize-handle" }, [
      element("span", { className: "paio-example-resize-mark", text: "⋯" }),
    ]);
    promptResizeHandle.tabIndex = 0;
    promptResizeHandle.setAttribute("role", "separator");
    promptResizeHandle.setAttribute("aria-orientation", "horizontal");
    promptResizeHandle.setAttribute("aria-label", t("プロンプト本文の高さを変更"));
    const applyPromptTextHeight = (height, nodeHeight = null, persist = false) => {
      const nextHeight = clampPromptTextHeight(height);
      this.settings.promptTextHeight = nextHeight;
      this.singlePromptTextarea.style.height = `${nextHeight}px`;
      promptResizeHandle.setAttribute("aria-valuemin", String(MIN_PROMPT_TEXT_HEIGHT));
      promptResizeHandle.setAttribute("aria-valuemax", String(MAX_PROMPT_TEXT_HEIGHT));
      promptResizeHandle.setAttribute("aria-valuenow", String(nextHeight));
      if (this.node && nodeHeight !== null) {
        this.node.setSize([Math.max(this.node.size?.[0] || 0, 540), nodeHeight]);
      }
      this.node?.graph?.setDirtyCanvas?.(true, true);
      if (persist) this.persist();
      return nextHeight;
    };
    applyPromptTextHeight(this.settings.promptTextHeight);
    promptResizeHandle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const pointerId = event.pointerId;
      const startY = event.clientY;
      const startHeight = this.settings.promptTextHeight;
      const startNodeHeight = this.node.size?.[1] || BASE_NODE_HEIGHT;
      promptResizeHandle.classList.add("is-dragging");
      promptResizeHandle.setPointerCapture?.(pointerId);
      const move = (moveEvent) => {
        if (moveEvent.pointerId !== pointerId) return;
        const nextHeight = clampPromptTextHeight(startHeight + moveEvent.clientY - startY);
        applyPromptTextHeight(nextHeight, startNodeHeight + nextHeight - startHeight);
      };
      const finish = (finishEvent) => {
        if (finishEvent.pointerId !== pointerId) return;
        promptResizeHandle.removeEventListener("pointermove", move);
        promptResizeHandle.removeEventListener("pointerup", finish);
        promptResizeHandle.removeEventListener("pointercancel", finish);
        promptResizeHandle.releasePointerCapture?.(pointerId);
        promptResizeHandle.classList.remove("is-dragging");
        applyPromptTextHeight(this.settings.promptTextHeight, this.node.size?.[1] || BASE_NODE_HEIGHT, true);
      };
      promptResizeHandle.addEventListener("pointermove", move);
      promptResizeHandle.addEventListener("pointerup", finish);
      promptResizeHandle.addEventListener("pointercancel", finish);
    });
    promptResizeHandle.addEventListener("dblclick", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const currentHeight = this.settings.promptTextHeight;
      const currentNodeHeight = this.node.size?.[1] || BASE_NODE_HEIGHT;
      applyPromptTextHeight(DEFAULT_PROMPT_TEXT_HEIGHT, currentNodeHeight + DEFAULT_PROMPT_TEXT_HEIGHT - currentHeight, true);
    });
    promptResizeHandle.addEventListener("keydown", (event) => {
      if (!["ArrowUp", "ArrowDown", "Home"].includes(event.key)) return;
      event.preventDefault();
      const currentHeight = this.settings.promptTextHeight;
      const nextHeight = event.key === "Home"
        ? DEFAULT_PROMPT_TEXT_HEIGHT
        : currentHeight + (event.key === "ArrowDown" ? 20 : -20);
      const applied = clampPromptTextHeight(nextHeight);
      const currentNodeHeight = this.node.size?.[1] || BASE_NODE_HEIGHT;
      applyPromptTextHeight(applied, currentNodeHeight + applied - currentHeight, true);
    });

    this.outputFormatButtons = new Map();
    const formatGroup = element("div", { className: "paio-segmented", ariaLabel: t("出力形式") });
    formatGroup.setAttribute("role", "group");
    for (const [value, label] of [["tags", "タグ結合"], ["structured", "構造化"], ["json", "JSON"]]) {
      const control = button(t(label), () => {
        this.commitPromptBeforeAction();
        if ((value === "structured" || value === "json") && this.sections?.length === 1 && !this.sections[0].title) {
          const currentText = this.promptEditorValue(this.sections[0]);
          if (looksLikeStructuredPrompt(currentText)) {
            this.applyBulkSplitText(currentText);
            this.outputFormat = value;
            this.syncToWidgets();
            this.render();
            return;
          }
        }
        this.pushUndo();
        this.outputFormat = value;
        this.rebuildSectionViews();
        this.syncToWidgets();
        this.render();
      });
      control.classList.add("paio-segmented-button");
      this.outputFormatButtons.set(value, control);
      formatGroup.append(control);
    }
    this.wrapBracesToggle = button(t("{ } 囲み"), () => {
      this.commitPromptBeforeAction();
      this.pushUndo();
      this.wrapBraces = !this.wrapBraces;
      this.syncToWidgets();
      this.render();
    }, t("構造化出力全体を { } で囲む"));
    this.wrapBracesToggle.classList.add("paio-toggle-pill");
    this.includeNegativeToggle = button(t("Neg→prompt"), () => {
      this.commitPromptBeforeAction();
      this.pushUndo();
      this.includeNegativeInPrompt = !this.includeNegativeInPrompt;
      this.syncToWidgets();
      this.render();
    }, t("ネガティブセクションもprompt出力に含める"));
    this.includeNegativeToggle.classList.add("paio-toggle-pill");
    const addSectionBtn = button(t("＋ セクション"), () => this.addSection(), t("新しいプロンプト入力欄を追加"));
    const bulkSplitBtn = button(t("一括分割"), () => this.openBulkSplitDialog(), t("【見出し】や { } / JSON 付きテキストを一括読込・分割"));
    const templateSelect = element("select", { className: "paio-select paio-section-template-select" });
    templateSelect.setAttribute("aria-label", t("セクションテンプレートを選択"));
    templateSelect.title = t("よく使うセクション構成を一括追加・適用");
    const templatePlaceholder = element("option", { text: t("テンプレート…") });
    templatePlaceholder.value = "";
    templateSelect.append(templatePlaceholder);
    for (const tpl of SECTION_TEMPLATES) {
      const option = element("option", { text: t(tpl.label) });
      option.value = tpl.id;
      templateSelect.append(option);
    }
    templateSelect.addEventListener("change", () => {
      const templateId = templateSelect.value;
      templateSelect.value = "";
      if (templateId) this.applySectionTemplate(templateId);
    });
    this.sectionTitleDatalistId = `paio-section-headings-${nextSectionDatalistId++}`;
    const headingDatalist = element("datalist");
    headingDatalist.id = this.sectionTitleDatalistId;
    for (const group of SECTION_HEADING_GROUPS) {
      for (const item of group.items) {
        const option = element("option");
        option.value = item;
        headingDatalist.append(option);
      }
    }
    const showBlockJaCheck = element("input", { type: "checkbox" });
    showBlockJaCheck.checked = this.settings.showSectionTranslationsInList !== false;
    showBlockJaCheck.addEventListener("change", () => {
      this.settings.showSectionTranslationsInList = showBlockJaCheck.checked;
      this.persist();
      this.rebuildSectionViews();
      this.render();
    });
    const showBlockJaLabel = element("label", { className: "paio-inline-check" }, [
      showBlockJaCheck,
      element("span", { text: t("一覧に訳を表示") }),
    ]);

    this.settingsDialog = this.buildSettingsDialog();
    this.blacklistDialog = this.buildBlacklistDialog();
    this.ioDialog = this.buildIoDialog();
    this.bulkSplitDialog = this.buildBulkSplitDialog();

    this.sectionControls = element("div", { className: "paio-section-controls" }, [
      element("span", { className: "paio-translation-label", text: t("出力") }),
      formatGroup,
      this.wrapBracesToggle,
      this.includeNegativeToggle,
      addSectionBtn,
      templateSelect,
      bulkSplitBtn,
      showBlockJaLabel,
      button(t("コピー/IO"), () => openDialog(this.ioDialog), t("コピー・エクスポート・インポート")),
      button(t("禁止"), () => openDialog(this.blacklistDialog), t("ブラックリスト")),
      button(t("設定"), () => { this.refreshCategoryColorSettings?.(); openDialog(this.settingsDialog); }),
      this.syncBadge,
      headingDatalist,
    ]);

    this.promptSingleContainer = element("div", { className: "paio-prompt-single" }, [
      this.singlePromptTextarea,
      promptResizeHandle,
      promptActions,
    ]);
    this.promptSingleContainer.hidden = true;
    this.sectionsContainer = element("div", { className: "paio-sections-list" });
    this.sectionCountLabel = element("span", { className: "paio-section-count-label" });
    const leftPaneHeader = element("div", { className: "paio-pane-head" }, [
      element("div", { className: "paio-pane-title-group" }, [
        element("strong", { text: t("セクションブロック") }),
        this.sectionCountLabel,
      ]),
      element("div", { className: "paio-pane-actions" }, [
        button(t("全ON"), () => this.setAllSectionsEnabled(true), t("すべてのセクションを有効にする")),
        button(t("全OFF"), () => this.setAllSectionsEnabled(false), t("すべてのセクションを無効にする")),
      ]),
    ]);
    const leftPane = element("div", { className: "paio-pane paio-pane-left" }, [
      leftPaneHeader,
      this.sectionsContainer,
    ]);

    const splitter = element("div", { className: "paio-splitter", title: t("ドラッグして左右ペインの比率を調整") });
    splitter.tabIndex = 0;
    splitter.setAttribute("role", "separator");
    splitter.setAttribute("aria-orientation", "vertical");

    this.translationBar = this.buildTranslationBar();

    this.activeSectionTitleLabel = element("strong", { className: "paio-active-section-title", text: t("編集中セクション") });
    this.sectionModeButtons = new Map();
    const modeSwitch = element("div", { className: "paio-segmented", ariaLabel: t("セクション編集モード") });
    for (const [modeVal, modeLabel] of [["prose", "散文モード"], ["tags", "タグモード"]]) {
      const btn = button(t(modeLabel), () => this.setActiveSectionMode(modeVal));
      btn.classList.add("paio-segmented-button");
      this.sectionModeButtons.set(modeVal, btn);
      modeSwitch.append(btn);
    }
    const activeWorkspaceHead = element("div", { className: "paio-pane-head" }, [
      this.activeSectionTitleLabel,
      modeSwitch,
    ]);

    this.proseOrigTextarea = element("textarea", { className: "paio-prompt-textarea paio-prose-textarea" });
    this.proseOrigTextarea.rows = 3;
    this.proseOrigTextarea.placeholder = t("出力されるプロンプト（英語・中国語など自然文）を入力...");
    this.proseOrigTextarea.addEventListener("input", () => this.handleProseOrigInput());

    this.proseJaTextarea = element("textarea", { className: "paio-prompt-textarea paio-prose-textarea" });
    this.proseJaTextarea.rows = 3;
    this.proseJaTextarea.placeholder = t("日本語訳（上の「① 選択を日本語訳」で自動取得、または日本語で下書き入力）");
    this.proseJaTextarea.addEventListener("input", () => this.handleProseJaInput());

    const applyJaQuickBtn = button(t("日本語の編集内容を原文へ反映 →"), () => this.translateSectionJaToOriginal(this.activeSectionId));
    applyJaQuickBtn.classList.add("paio-subtle-action");
    this.proseWorkspace = element("div", { className: "paio-prose-workspace" }, [
      element("div", { className: "paio-bilingual-box" }, [
        element("div", { className: "paio-bilingual-head" }, [
          element("strong", { text: t("出力プロンプト（原文）") }),
          element("span", { className: "paio-hint", text: t("散文モード：TagDB警告・末尾カンマなし") }),
        ]),
        this.proseOrigTextarea,
      ]),
      element("div", { className: "paio-bilingual-box is-ja" }, [
        element("div", { className: "paio-bilingual-head" }, [
          element("strong", { text: t("日本語訳（確認・日本語で編集用）") }),
          applyJaQuickBtn,
        ]),
        this.proseJaTextarea,
      ]),
    ]);

    this.addInput = element("textarea", { className: "paio-add-input" });
    this.addInput.rows = 1;
    this.addInput.placeholder = t("タグを追加（Enter）");
    this.addInput.setAttribute("aria-label", t("追加するプロンプトタグ"));
    this.addInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        this.addFromInput();
      }
    });
    const tagDbLanguage = () => this.settings.localLanguage;
    attachTagSuggestions(this.singlePromptTextarea, { api: this.api, language: tagDbLanguage });
    attachTagSuggestions(this.addInput, {
      api: this.api,
      language: tagDbLanguage,
      onPick: (item) => {
        this.pushUndo();
        this.addValues(
          [{ value: item.tag, translation: item.translations[0] || "", translatedTo: this.settings.localLanguage }],
          { trailingSeparator: true },
        );
        this.addInput.value = "";
        this.setStatus(t("{tag} を追加しました", { tag: item.tag }));
      },
    });
    this.searchInput = element("input", { className: "paio-search" });
    this.searchInput.type = "search";
    this.searchInput.placeholder = t("原文・翻訳を検索");
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
      const option = element("option", { text: t(label) });
      option.value = value;
      this.filterSelect.append(option);
    }
    this.filterSelect.addEventListener("change", () => {
      this.filterMode = this.filterSelect.value;
      this.renderTags();
    });
    this.favoriteOnlyToggle = button(t("お気に入りのみ表示"), () => {
      this.settings.showFavoritesOnly = !this.settings.showFavoritesOnly;
      this.favoriteOnlyToggle.classList.toggle("is-active", this.settings.showFavoritesOnly);
      this.favoriteOnlyToggle.setAttribute("aria-pressed", String(this.settings.showFavoritesOnly));
      this.persist();
      this.renderTags();
      this.refreshExamplesPanel?.();
    });
    this.favoriteOnlyToggle.classList.add("paio-favorite-filter");
    this.favoriteOnlyToggle.classList.toggle("is-active", this.settings.showFavoritesOnly);
    this.favoriteOnlyToggle.setAttribute("aria-pressed", String(this.settings.showFavoritesOnly));

    const addRow = element("div", { className: "paio-add-row" }, [
      this.addInput,
      button(t("追加"), () => this.addFromInput()),
    ]);
    const tools = element("div", { className: "paio-toolbar" }, [
      this.searchInput,
      this.filterSelect,
      this.favoriteOnlyToggle,
      button("↶", () => this.undo(), t("元に戻す")),
      button("↷", () => this.redo(), t("やり直す")),
      button(t("整形"), () => this.normalize(false)),
      button(t("重複削除"), () => this.normalize(true)),
    ]);

    this.bulkBar = element("div", { className: "paio-bulk" });
    this.tagSummary = element("span");
    const tagSummaryRow = element("div", { className: "paio-tag-summary" }, [
      element("span", { className: "paio-hint", text: t("クリック: 有効/無効 / ダブルクリック: 編集 / Shift+ドラッグ: 矩形選択 / Shift・Ctrl+クリック: 複数選択") }),
      this.tagSummary,
    ]);
    this.tagList = element("div", { className: "paio-tags" });
    this.tagList.setAttribute("role", "list");
    this.attachTagListMarquee();
    this.status = element("p", { className: "paio-status", text: t("準備完了") });
    this.status.setAttribute("aria-live", "polite");

    const currentTagsDisclosure = element("span", { className: "paio-disclosure", text: "▾" });
    const currentTagsToggle = element("button", { className: "paio-collapsible-toggle", type: "button" }, [
      currentTagsDisclosure,
      element("strong", { text: t("現在のタグ") }),
    ]);
    currentTagsToggle.setAttribute("aria-expanded", "true");
    const currentTagsBody = element("div", { className: "paio-current-tags-body" }, [
      this.bulkBar,
      tagSummaryRow,
      this.tagList,
    ]);
    const currentTagsPane = element("div", { className: "paio-current-tags-pane" }, [
      currentTagsToggle,
      currentTagsBody,
    ]);
    currentTagsToggle.addEventListener("click", () => {
      const collapsed = !currentTagsPane.classList.contains("is-collapsed");
      currentTagsPane.classList.toggle("is-collapsed", collapsed);
      currentTagsBody.hidden = collapsed;
      currentTagsToggle.setAttribute("aria-expanded", String(!collapsed));
      currentTagsDisclosure.textContent = collapsed ? "▶" : "▾";
    });
    this.currentTagsSummaryTitle = currentTagsToggle.querySelector("strong");

    this.activeTagPromptTextarea = element("textarea", { className: "paio-prompt-textarea paio-section-text-input" });
    this.activeTagPromptTextarea.rows = 3;
    this.activeTagPromptTextarea.placeholder = t("このセクションのタグを入力（例: 1girl, solo）");
    this.activeTagPromptTextarea.setAttribute("aria-label", t("セクションの本文を一括編集"));
    this.activeTagPromptTextarea.addEventListener("input", () => {
      this.dirtySectionIds.add(this.activeSectionId);
      this.renderSyncState();
    });
    this.activeTagPromptTextarea.addEventListener("paste", (event) => {
      if (this.activeTagPromptTextarea.value.trim()) return;
      const pasted = event.clipboardData?.getData("text/plain") || "";
      if (looksLikeStructuredPrompt(pasted)) {
        event.preventDefault();
        this.applyBulkSplitText(pasted);
      }
    });
    this.activeTagPromptTextarea.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        this.applyPromptText(this.activeSectionId);
      }
    });
    attachTagSuggestions(this.activeTagPromptTextarea, { api: this.api, language: () => this.settings.localLanguage });
    this.promptTextarea = this.activeTagPromptTextarea;
    this.activeSectionApplyButton = button(t("タグへ反映"), () => this.applyPromptText(this.activeSectionId), t("本文を解析してタグへ反映（Ctrl+Enter）"));
    this.activeSectionApplyButton.classList.add("paio-section-apply");
    const sectionTextPane = collapsiblePane(t("テキスト直接編集（一括貼付・反映）"), "paio-section-text-pane", [
      this.activeTagPromptTextarea,
      element("div", { className: "paio-prompt-actions" }, [this.activeSectionApplyButton]),
    ]);
    sectionTextPane.pane.open = false;

    this.tagsWorkspace = element("div", { className: "paio-tags-workspace" }, [
      addRow,
      tools,
      currentTagsPane,
      sectionTextPane.pane,
    ]);
    const activeSectionWorkspace = element("div", { className: "paio-active-section-pane" }, [
      activeWorkspaceHead,
      this.proseWorkspace,
      this.tagsWorkspace,
    ]);

    this.examplesPanel = this.buildExamplesPanel();
    this.tagSetsPanel = this.buildTagSetsPanel();
    this.prosePhrasesPanel = this.buildProsePhrasesPanel();
    this.libraryTabs = this.buildLibraryTabs();
    this.catalogOpen = Boolean(this.settings.catalogOpen);
    const catalogDisclosure = element("span", { className: "paio-disclosure", text: this.catalogOpen ? "▾" : "▶" });
    const catalogToggleBtn = element("button", { className: "paio-button paio-library-toggle", type: "button" }, [
      catalogDisclosure,
      element("span", { text: t("カタログ") }),
    ]);
    catalogToggleBtn.setAttribute("aria-expanded", String(this.catalogOpen));
    catalogToggleBtn.title = t("タグ追加・タグセット・散文フレーズのカタログを表示／折りたたみ");
    this.libraryHeader = element("div", { className: "paio-library-header" }, [
      catalogToggleBtn,
      this.libraryTabs,
    ]);
    this.libraryBody = element("div", { className: "paio-library-body-wrap" }, [
      this.examplesPanel,
      this.tagSetsPanel,
      this.prosePhrasesPanel,
    ]);
    this.libraryBox = element("div", { className: "paio-library-pane" }, [
      this.libraryHeader,
      this.libraryBody,
    ]);

    const hSplitter = element("div", { className: "paio-h-splitter", title: t("ドラッグして編集エリアとカタログの比率を調整") });
    hSplitter.tabIndex = 0;
    hSplitter.setAttribute("role", "separator");
    hSplitter.setAttribute("aria-orientation", "horizontal");
    this.hSplitter = hSplitter;

    const rightSplit = element("div", { className: "paio-right-split" }, [
      activeSectionWorkspace,
      hSplitter,
      this.libraryBox,
    ]);
    this.rightSplit = rightSplit;

    const applyCatalogRatio = (pct, persist = false) => {
      const clamped = Math.min(72, Math.max(25, Number(pct) || 46));
      this.settings.catalogPanePercent = Number(clamped.toFixed(1));
      rightSplit.style.setProperty("--paio-catalog-height", `${this.settings.catalogPanePercent}%`);
      hSplitter.setAttribute("aria-valuemin", "25");
      hSplitter.setAttribute("aria-valuemax", "72");
      hSplitter.setAttribute("aria-valuenow", String(Math.round(this.settings.catalogPanePercent)));
      if (persist) this.persist();
    };
    applyCatalogRatio(this.settings.catalogPanePercent);

    this.setCatalogOpen = (open, persist = true) => {
      this.catalogOpen = Boolean(open);
      this.settings.catalogOpen = this.catalogOpen;
      this.libraryBox.classList.toggle("is-collapsed", !this.catalogOpen);
      this.libraryBody.hidden = !this.catalogOpen;
      hSplitter.hidden = !this.catalogOpen;
      rightSplit.classList.toggle("is-catalog-open", this.catalogOpen);
      catalogToggleBtn.setAttribute("aria-expanded", String(this.catalogOpen));
      catalogDisclosure.textContent = this.catalogOpen ? "▾" : "▶";
      if (this.catalogOpen && this.activeLibraryTab === "tagSets") this.refreshTagSetsPanel?.();
      if (persist) this.persist();
    };
    catalogToggleBtn.addEventListener("click", () => this.setCatalogOpen(!this.catalogOpen));

    hSplitter.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || !this.catalogOpen) return;
      event.preventDefault();
      event.stopPropagation();
      const pointerId = event.pointerId;
      hSplitter.classList.add("is-dragging");
      hSplitter.setPointerCapture?.(pointerId);
      const applyY = (clientY) => {
        const rect = rightSplit.getBoundingClientRect();
        if (!rect.height) return;
        const pct = ((rect.bottom - clientY) / rect.height) * 100;
        applyCatalogRatio(pct);
      };
      const move = (moveEvent) => {
        if (moveEvent.pointerId !== pointerId) return;
        applyY(moveEvent.clientY);
      };
      const finish = (finishEvent) => {
        if (finishEvent.pointerId !== pointerId) return;
        hSplitter.removeEventListener("pointermove", move);
        hSplitter.removeEventListener("pointerup", finish);
        hSplitter.removeEventListener("pointercancel", finish);
        hSplitter.releasePointerCapture?.(pointerId);
        hSplitter.classList.remove("is-dragging");
        applyCatalogRatio(this.settings.catalogPanePercent, true);
      };
      hSplitter.addEventListener("pointermove", move);
      hSplitter.addEventListener("pointerup", finish);
      hSplitter.addEventListener("pointercancel", finish);
    });
    hSplitter.addEventListener("keydown", (event) => {
      if (!["ArrowUp", "ArrowDown", "Home"].includes(event.key)) return;
      event.preventDefault();
      const cur = Number(this.settings.catalogPanePercent) || 46;
      const next = event.key === "Home" ? 46 : cur + (event.key === "ArrowUp" ? 4 : -4);
      applyCatalogRatio(next, true);
    });
    hSplitter.addEventListener("dblclick", (event) => {
      event.preventDefault();
      event.stopPropagation();
      applyCatalogRatio(46, true);
    });
    this.setCatalogOpen(this.catalogOpen, false);

    const rightPane = element("div", { className: "paio-pane paio-pane-right" }, [
      this.translationBar,
      rightSplit,
    ]);

    const splitLayout = element("div", { className: "paio-split-layout" }, [
      leftPane,
      splitter,
      rightPane,
    ]);
    this.splitLayout = splitLayout;
    const initialLeftPct = Math.min(70, Math.max(25, Number(this.settings.leftPaneWidthPercent) || 46));
    splitLayout.style.setProperty("--paio-left-pane-width", `${initialLeftPct}%`);

    splitter.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const pointerId = event.pointerId;
      splitter.classList.add("is-dragging");
      splitter.setPointerCapture?.(pointerId);
      const applyX = (clientX) => {
        const rect = splitLayout.getBoundingClientRect();
        if (!rect.width) return;
        const splitterW = 6;
        const minPct = Math.min(70, (160 / rect.width) * 100);
        const maxPct = Math.max(minPct, Math.min(70, ((rect.width - splitterW - 220) / rect.width) * 100));
        const pct = Math.min(maxPct, Math.max(minPct, ((clientX - rect.left) / rect.width) * 100));
        this.settings.leftPaneWidthPercent = Number(pct.toFixed(1));
        splitLayout.style.setProperty("--paio-left-pane-width", `${this.settings.leftPaneWidthPercent}%`);
      };
      const move = (moveEvent) => {
        if (moveEvent.pointerId !== pointerId) return;
        applyX(moveEvent.clientX);
      };
      const finish = (finishEvent) => {
        if (finishEvent.pointerId !== pointerId) return;
        splitter.removeEventListener("pointermove", move);
        splitter.removeEventListener("pointerup", finish);
        splitter.removeEventListener("pointercancel", finish);
        splitter.releasePointerCapture?.(pointerId);
        splitter.classList.remove("is-dragging");
        this.persist();
      };
      splitter.addEventListener("pointermove", move);
      splitter.addEventListener("pointerup", finish);
      splitter.addEventListener("pointercancel", finish);
    });
    splitter.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home"].includes(event.key)) return;
      event.preventDefault();
      const cur = Number(this.settings.leftPaneWidthPercent) || 46;
      const next = event.key === "Home" ? 46 : Math.min(70, Math.max(25, cur + (event.key === "ArrowRight" ? 4 : -4)));
      this.settings.leftPaneWidthPercent = next;
      splitLayout.style.setProperty("--paio-left-pane-width", `${next}%`);
      this.persist();
    });
    splitter.addEventListener("dblclick", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.settings.leftPaneWidthPercent = 46;
      splitLayout.style.setProperty("--paio-left-pane-width", "46%");
      this.persist();
    });

    this.setLibraryTab(this.activeLibraryTab);
    this.rebuildSectionViews();

    root.append(
      this.sectionControls,
      this.promptSingleContainer,
      splitLayout,
      this.status,
      this.settingsDialog,
      this.blacklistDialog,
      this.ioDialog,
      this.bulkSplitDialog,
    );
    return root;
  }

  attach() {
    const promptWidget = this.widgets.prompt;
    hideWidgetForGood(promptWidget, ":prompt");
    if (this.splitLayout) {
      // Two-pane mode fills the ComfyUI DOMWidget container via CSS flexbox so
      // outer-frame resize works natively without JS height feedback loops.
      this.root.style.height = "100%";
      this.root.style.flex = "1 1 auto";
    } else {
      // Keep intrinsic height measurable even when the frontend adds h-full/flex-1.
      this.root.style.height = "auto";
      this.root.style.flex = "0 0 auto";
    }
    const domWidget = this.node.addDOMWidget("prompt", "div", this.root, {
      serialize: true,
      hideOnZoom: false,
      getMinHeight: () => (this.splitLayout ? 420 : this.widgetHeight()),
      onDraw: (widget) => this.syncWidgetLayout(widget),
      afterResize: () => this.syncWidgetLayout(),
      getValue: () => String(promptWidget?.value || ""),
      setValue: (value) => {
        if (promptWidget) promptWidget.value = String(value || "");
      },
    });
    this.domWidget = domWidget;
    domWidget.serialize = true;
    domWidget.serializeValue = async () => String(promptWidget?.value || "");
    domWidget.computeSize = (width = this.node.size?.[0] || 540) => [
      this.splitLayout ? 540 : width,
      this.splitLayout ? 420 : this.widgetHeight(),
    ];
    removeWidgetFromLayout(this.node, promptWidget);
    this.stabilizeLayout();
    this.node.setSize([
      Math.max(this.node.size?.[0] || 0, 540),
      Math.max(this.node.size?.[1] || 0, BASE_NODE_HEIGHT),
    ]);
    const previousRemoved = this.node.onRemoved;
    this.node.onRemoved = () => {
      this.disposed = true;
      this.translationGeneration += 1;
      this.unsubscribeFavorites?.();
      this.layoutObserver?.disconnect();
      clearInterval(this.pollTimer);
      clearTimeout(this.clickTimer);
      this.closeContextMenu();
      previousRemoved?.apply(this.node);
    };
    this.render();
    if (typeof ResizeObserver === "function") {
      this.layoutObserver = new ResizeObserver(() => {
        if (!this.disposed && !this.splitLayout) this.syncWidgetLayout();
      });
      this.layoutObserver.observe(this.root);
    }
  }

  widgetHeight() {
    const measuredHeight = this.root.offsetHeight;
    if (measuredHeight > 0) return measuredHeight + (this.domWidget?.margin ?? 10) * 2;
    return BASE_DOM_WIDGET_HEIGHT;
  }

  splitInnerChromeHeight() {
    if (!this.splitLayout) return 0;
    const currentSplitHeight = this.splitLayout.offsetHeight || 0;
    if (this.root?.offsetHeight > 0 && currentSplitHeight > 0) {
      return Math.max(0, this.root.offsetHeight - currentSplitHeight);
    }
    return (this.sectionControls?.offsetHeight || 0) + (this.status?.offsetHeight || 0) + 32;
  }

  minSplitWidgetHeight() {
    const stacked = Boolean(this.splitLayout?.classList?.contains("is-stacked"));
    const minSplit = stacked ? 460 : MIN_SPLIT_HEIGHT;
    const margin = Number(this.domWidget?.margin ?? 10);
    return minSplit + this.splitInnerChromeHeight() + margin * 2;
  }

  syncSplitBounds() {
    if (!this.splitLayout) return;
    const splitWidth = this.splitLayout.clientWidth || Math.max(0, (this.node?.size?.[0] || 540) - 38);
    const stacked = splitWidth > 0 && splitWidth < 440;
    this.splitLayout.classList.toggle("is-stacked", stacked);
    if (!stacked && splitWidth > 0) {
      const splitterW = 6;
      const minPct = Math.min(70, (160 / splitWidth) * 100);
      const maxPct = Math.max(minPct, Math.min(70, ((splitWidth - splitterW - 220) / splitWidth) * 100));
      const desired = Number(this.settings.leftPaneWidthPercent) || 46;
      const effectivePct = Math.min(maxPct, Math.max(minPct, desired));
      this.splitLayout.style.setProperty("--paio-left-pane-width", `${effectivePct.toFixed(2)}%`);
    }
  }

  syncWidgetLayout(widget = this.domWidget) {
    if (!widget || this._syncingLayout) return;
    this._syncingLayout = true;
    try {
      this.syncWidgetWidth(widget);
      this.syncSplitBounds();
      if (this.splitLayout) {
        // Two-pane mode relies on ComfyUI's native DOMWidget container height
        // and CSS flexbox (height: 100% / flex: 1 1 0). Do not mutate
        // widget.computedHeight or node.size here.
        return;
      }
      const nodeOverhead = BASE_NODE_HEIGHT - BASE_DOM_WIDGET_HEIGHT;
      const height = this.widgetHeight();
      // LiteGraph adds a four-pixel gap to computeSize() heights.
      const computedHeight = height + 4;
      const changed = widget.computedHeight !== computedHeight;
      widget.computedHeight = computedHeight;
      const minimumNodeHeight = height + nodeOverhead;
      if (this.node.size?.[1] < minimumNodeHeight) {
        this.node.setSize([this.node.size[0], minimumNodeHeight]);
      } else if (changed) {
        this.node.graph?.setDirtyCanvas?.(true, true);
      }
    } finally {
      this._syncingLayout = false;
    }
  }

  syncWidgetWidth(widget = this.domWidget) {
    // The frontend can retain a legacy widget width after interaction.
    // DOM rendering must follow the node instead of that cached measurement.
    if (widget) widget.width = this.node.size?.[0] || 540;
  }

  stabilizeLayout() {
    removeUnlinkedWidgetInput(this.node, "prompt");
    removeUnlinkedWidgetInput(this.node, "negative");
    removeUnlinkedWidgetInput(this.node, "output_format");
    removeUnlinkedWidgetInput(this.node, "sections_payload");
    for (const widget of Object.values(this.widgets || {})) {
      if (widget?.name) removeUnlinkedWidgetInput(this.node, widget.name);
    }
    this.syncDynamicSectionSockets?.();
    compactNodeWidgetLayout(this.node);
    for (const widget of Object.values(this.widgets)) {
      hideWidgetForGood(widget, widget?.name ? `:${widget.name}` : "");
    }
    if (this.domWidget) {
      this.syncWidgetLayout();
      this.domWidget.y = 0;
      this.domWidget.last_y = 0;
    }
    this.node.graph?.setDirtyCanvas?.(true, true);
  }

  buildTranslationBar() {
    const bar = element("div", { className: "paio-translation-flow" });

    const providerSelect = element("select", { className: "paio-select paio-translation-provider-select" });
    providerSelect.setAttribute("aria-label", t("翻訳手段"));
    for (const [value, text] of [
      ["local", "無料翻訳（辞書→MyMemory）"],
      ["offline", "ローカル辞書のみ"],
      ["libretranslate", "LibreTranslate"],
      ["deepl", "DeepL"],
      ["openai", "OpenAI互換"],
      ["clipboard", "外部AI（ChatGPT等）往復"],
    ]) {
      const opt = element("option", { text: t(text) });
      opt.value = value;
      providerSelect.append(opt);
    }
    providerSelect.value = this.translationWorkflowProvider || this.settings.translationProvider || "local";

    const label = element("span", { className: "paio-translation-label", text: t("表示") });
    const modes = element("div", { className: "paio-segmented" });
    this.translationDisplayButtons = new Map();
    for (const [value, text] of [["original", "原文"], ["local", "日本語"], ["both", "両方"]]) {
      const control = button(t(text), () => {
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

    const headRow = element("div", { className: "paio-pane-head" }, [
      element("strong", { text: t("翻訳ワークフロー（読む・日本語で直して戻す）") }),
      element("div", { className: "paio-trans-meta" }, [
        label,
        modes,
        providerSelect,
      ]),
    ]);

    this.translateSectionBtn = button(t("① 選択を日本語訳"), () => this.translateSectionToLocal(this.activeSectionId), t("選択中ブロックを日本語へ翻訳"));
    this.translateSectionBtn.classList.add("paio-is-info");
    this.translateAllSectionsBtn = button(t("全ブロック日本語訳"), () => this.translateAllSectionsToLocal(), t("すべてのブロックを日本語へ翻訳"));
    this.translateButton = button(t("② 日本語→原文へ反映"), () => this.translateSectionJaToOriginal(this.activeSectionId), t("日本語訳（または日本語タグ）を出力用言語へ変換して原文へ反映"));
    this.translateButton.classList.add("paio-translate-button");

    const stepRow = element("div", { className: "paio-trans-steps" }, [
      this.translateSectionBtn,
      this.translateAllSectionsBtn,
      element("span", { className: "paio-hint", text: "→" }),
      this.translateButton,
    ]);

    this.llmPasteTextarea = element("textarea", { className: "paio-prompt-textarea paio-llm-paste-area" });
    this.llmPasteTextarea.rows = 3;
    this.llmPasteTextarea.placeholder = t("外部AIが返した【見出し】付き日本語訳をここに貼り付けて「Step 2」を押してください...");
    const copyLlmBtn = button(t("Step 1: 翻訳用プロンプトをコピー"), () => this.copyLlmTranslationPrompt());
    copyLlmBtn.classList.add("paio-is-info");
    const applyLlmBtn = button(t("Step 2: 貼付結果を「日本語訳」へ反映"), () => this.applyLlmPastedTranslations(this.llmPasteTextarea.value));
    applyLlmBtn.classList.add("paio-translate-button");

    this.llmBridgeDrawer = element("div", { className: "paio-llm-bridge" }, [
      element("p", { className: "paio-hint", text: t("見出し構造を保ったまま外部AIへコピーし、返答を貼付すると各ブロックの日本語訳へ自動で戻ります。") }),
      element("div", { className: "paio-trans-steps" }, [copyLlmBtn, applyLlmBtn]),
      this.llmPasteTextarea,
    ]);
    this.llmBridgeDrawer.hidden = providerSelect.value !== "clipboard";

    providerSelect.addEventListener("change", () => {
      this.translationWorkflowProvider = providerSelect.value;
      const isClipboard = providerSelect.value === "clipboard";
      this.llmBridgeDrawer.hidden = !isClipboard;
      if (!isClipboard) {
        this.settings.translationProvider = providerSelect.value;
        this.persist();
      }
    });

    bar.append(headRow, stepRow, this.llmBridgeDrawer);
    return bar;
  }

  buildDialog(title) {
    const dialog = element("dialog", { className: "paio-dialog" });
    const heading = element("h3", { text: t(title) });
    const close = button(t("閉じる"), () => closeDialog(dialog));
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
      const option = element("option", { text: t(label) });
      option.value = value;
      duplicate.append(option);
    }
    duplicate.value = this.settings.duplicatePolicy;
    const provider = element("select", { className: "paio-select" });
    for (const [value, label] of [["local", "無料翻訳（辞書→MyMemory）"], ["offline", "ローカル辞書のみ"], ["libretranslate", "LibreTranslate"], ["deepl", "DeepL"], ["openai", "OpenAI互換"]]) {
      const option = element("option", { text: t(label) });
      option.value = value;
      provider.append(option);
    }
    provider.value = this.settings.translationProvider;
    const output = element("select", { className: "paio-select" });
    for (const [value, label] of [["en", "英語"], ["ja", "日本語"]]) {
      const option = element("option", { text: t(label) });
      option.value = value;
      output.append(option);
    }
    output.value = this.settings.outputLanguage;
    const auto = element("input", { type: "checkbox" });
    auto.checked = this.settings.autoTranslate;
    const replaceUnderscores = element("input", { type: "checkbox" });
    replaceUnderscores.checked = this.settings.replaceUnderscoresForOutput;
    const uiLanguage = element("select", { className: "paio-select" });
    for (const { code, label } of getAvailableUiLanguages()) {
      const option = element("option", { text: label });
      option.value = code;
      uiLanguage.append(option);
    }
    uiLanguage.value = getUiLanguage();
    const colorGrid = element("div", { className: "paio-color-grid" });
    const colorInputs = {};
    const colorLabels = {
      normal: "通常", disabled: "無効", lora: "LoRA", lycoris: "LyCORIS",
      embedding: "Embedding", wildcard: "ワイルドカード", duplicate: "重複",
      blacklist: "ブラックリスト", missing: "モデルなし", error: "翻訳エラー",
    };
    const colorDescriptions = {
      normal: "通常タグの背景色", disabled: "無効タグの背景色",
      lora: "LoRAタグの背景色", lycoris: "LyCORISタグの背景色",
      embedding: "Embeddingタグの背景色", wildcard: "特殊構文タグの背景色",
      duplicate: "重複タグの枠線色", blacklist: "ブラックリスト一致タグの背景色",
      missing: "モデル未検出タグの枠線色", error: "翻訳エラータグの枠線色",
    };
    for (const [key, label] of Object.entries(colorLabels)) {
      const input = element("input");
      input.type = "color";
      input.value = this.settings.tagColors?.[key] || COLOR_DEFAULTS[key];
      input.setAttribute("aria-label", t("{label}の色", { label: t(label) }));
      colorInputs[key] = input;
      colorGrid.append(element("label", { className: "paio-color-field" }, [
        input,
        element("span", { className: "paio-color-copy" }, [
          element("strong", { text: t(label) }),
          element("small", { text: t(colorDescriptions[key]) }),
        ]),
      ]));
    }
    const libraryManager = this.buildLibraryManager();
    this.refreshSettingsFileStatus = () => libraryManager.refresh();
    const generalPanel = element("section", { className: "paio-settings-panel is-active", dataset: { panel: "general" } });
    generalPanel.append(
      element("h4", { text: t("一般") }),
      this.labeled(t("UI言語"), uiLanguage),
      element("p", { className: "paio-settings-help", text: t("UI言語はComfyUIの再読み込み後に反映されます") }),
      this.labeled(t("重み刻み"), step),
      this.labeled(t("重複時"), duplicate),
      this.labeled(t("出力言語"), output),
      this.labeled(t("_を半角空白に変換して出力"), replaceUnderscores),
      element("p", { className: "paio-settings-help", text: t("表示中のタグは変更せず、次のノードへ渡すSTRINGとコピー/書き出しだけを変換します。") }),
    );
    const translationPanel = element("section", { className: "paio-settings-panel", dataset: { panel: "translation" } });
    translationPanel.append(
      element("h4", { text: t("翻訳") }),
      this.labeled(t("翻訳プロバイダー"), provider),
      this.labeled(t("入力時に自動翻訳"), auto),
      element("p", { className: "paio-settings-help", text: t("上部の「翻訳」ボタンは、日本語タグを英語へ置換し、英語タグには日本語訳を追加します。") }),
    );
    const filePanel = element("section", { className: "paio-settings-panel paio-library-panel", dataset: { panel: "files" } }, libraryManager.fileRoot);
    const libraryPanel = element("section", { className: "paio-settings-panel paio-library-panel", dataset: { panel: "library" } }, libraryManager.editorRoot);
    const categoryColors = this.buildCategoryColorSettings();
    categoryColors.panel.append(element("h4", { text: t("タグ状態の色") }), colorGrid);
    const content = element("div", { className: "paio-settings-content" }, [generalPanel, translationPanel, filePanel, libraryPanel, categoryColors.panel]);
    const navigation = element("nav", { className: "paio-settings-nav", ariaLabel: t("設定項目") });
    for (const [id, label] of [["general", "一般"], ["translation", "翻訳"], ["files", "ファイル"], ["library", "タグ管理"], ["categoryColors", "ボタン色"]]) {
      const navButton = button(t(label), () => {
        navigation.querySelectorAll(".paio-button").forEach((item) => item.classList.toggle("is-active", item === navButton));
        content.querySelectorAll(".paio-settings-panel").forEach((item) => item.classList.toggle("is-active", item.dataset.panel === id));
        if (id === "files" || id === "library") libraryManager.refresh();
        if (id === "categoryColors") categoryColors.refreshCategories();
      });
      navButton.classList.add("paio-settings-nav-button");
      if (id === "general") navButton.classList.add("is-active");
      navigation.append(navButton);
    }
    const save = button(t("変更を保存"), async () => {
      if (!categoryColors.valid()) {
        content.querySelectorAll(".paio-settings-panel").forEach((item) => item.classList.toggle("is-active", item === categoryColors.panel));
        navigation.querySelectorAll(".paio-button").forEach((item) => item.classList.toggle("is-active", item.textContent === t("ボタン色")));
        categoryColors.panel.querySelector('[aria-invalid="true"]')?.focus();
        return;
      }
      const previousCategoryColors = this.settings.categoryColors;
      save.disabled = true;
      this.pushUndo();
      this.settings.weightStep = Number(step.value);
      this.settings.duplicatePolicy = duplicate.value;
      this.settings.translationProvider = provider.value;
      this.settings.outputLanguage = output.value;
      this.settings.autoTranslate = auto.checked;
      this.settings.replaceUnderscoresForOutput = replaceUnderscores.checked;
      this.settings.tagColors = Object.fromEntries(Object.entries(colorInputs).map(([key, input]) => [key, input.value]));
      this.settings.categoryColors = categoryColors.value();
      this.settings.libraryEdits = libraryManager.getEdits();
      const previousUiLanguage = getUiLanguage();
      const nextUiLanguage = saveUiLanguage(uiLanguage.value);
      this.applyCustomColors();
      this.syncToWidgets();
      this.render();
      this.refreshExamplesPanel?.();
      this.refreshTagSetsPanel?.();
      try {
        const currentFavorites = this.currentFavoriteSettings();
        this.settings = sanitizeSettings({
          ...await saveDefaultSettings(this.api, this.settings),
          favorites: currentFavorites.favorites,
          favoriteTagSets: currentFavorites.favoriteTagSets,
        });
        if (this.favoritesStore?.base.revision >= 0) Object.assign(this.settings, this.favoritesStore.value);
        this.syncToWidgets();
        closeDialog(dialog);
        this.setStatus(t(previousUiLanguage === nextUiLanguage
          ? "設定を保存しました。APIキーはワークフローに保存されません"
          : "設定を保存しました。UI言語はComfyUIの再読み込み後に反映されます"));
      } catch (error) {
        this.settings.categoryColors = previousCategoryColors;
        this.refreshCategoryButtonColors();
        this.syncToWidgets();
        this.setStatus(t("設定を保存できませんでした: {error}", { error: error.message }), true);
      } finally {
        save.disabled = false;
      }
    });
    const shell = element("div", { className: "paio-settings-shell" }, [navigation, content]);
    dialog.body.append(shell);
    dialog.querySelector(".paio-dialog-footer")?.prepend(save);
    return dialog;
  }

  buildCategoryColorSettings() {
    const panel = element("section", { className: "paio-settings-panel", dataset: { panel: "categoryColors" } });
    const rows = element("div", { className: "paio-category-color-rows" });
    let draft = sanitizeCategoryColors(this.settings.categoryColors);
    let generation = 0;
    const invalid = new Set();
    const controls = new Map();
    const addRow = (id, label) => {
      if (controls.has(id)) return;
      const picker = element("input", { type: "color" });
      const hex = element("input", { className: "paio-search" });
      hex.maxLength = 7;
      hex.setAttribute("aria-label", t("{label}のHEXカラー", { label }));
      picker.setAttribute("aria-label", t("{label}の色", { label }));
      const error = element("small", { className: "paio-error", text: "" });
      error.id = `paio-color-error-${++categoryColorErrorSerial}`;
      hex.setAttribute("aria-describedby", error.id);
      const preview = button(label, () => {});
      preview.tabIndex = -1;
      const sync = () => {
        picker.value = hex.value = categoryBaseColor(id, draft);
        hex.setAttribute("aria-invalid", "false");
        error.textContent = "";
        invalid.delete(id);
        applyCategoryColor(preview, id, draft);
      };
      const set = (value) => {
        if (id) draft.overrides[id] = value;
        else draft.unknown = value;
        sync();
      };
      picker.addEventListener("input", () => set(picker.value));
      hex.addEventListener("input", () => {
        const value = validCategoryColor(hex.value.trim());
        if (value) set(value);
        else {
          invalid.add(id);
          hex.setAttribute("aria-invalid", "true");
          error.textContent = t("#と6桁の16進数で入力してください");
        }
      });
      const reset = button(t("初期値に戻す"), () => {
        if (id) delete draft.overrides[id]; else draft.unknown = null;
        sync();
      });
      controls.set(id, sync);
      rows.append(element("div", { className: "paio-category-color-row", dataset: { categoryId: id } }, [
        element("strong", { text: label }), picker,
        element("div", { className: "paio-category-hex-field" }, [hex, error]), preview, reset,
      ]));
      sync();
    };
    const refreshCategories = async () => {
      const request = ++generation;
      const results = await Promise.allSettled([this.loadExampleData(), this.loadTagSetData()]);
      if (request !== generation || this.disposed) return;
      rows.replaceChildren(); controls.clear(); invalid.clear();
      const libraries = [buildTagLibrary(this.exampleData || {}, this.settings.libraryEdits), buildTagSetLibrary(this.tagSetData || {})];
      libraries.forEach((library, index) => {
        rows.append(element("h4", { text: t(index ? "タグセット" : "タグ") }));
        for (const category of library.categories.filter((item) => item.level === "large")) {
          const id = categoryColorId(category);
          if (id) addRow(id, category.ja || category.en || category.id);
        }
      });
      addRow("", t("未分類・分類不明"));
      if (results.some((result) => result.status === "rejected")) rows.append(element("p", { className: "paio-error", text: t("分類を読み込めませんでした。ファイル設定を確認してください。") }));
    };
    this.refreshCategoryColorSettings = () => {
      draft = sanitizeCategoryColors(this.settings.categoryColors);
      refreshCategories();
    };
    panel.append(element("h4", { text: t("ボタン色") }), element("p", { className: "paio-settings-caption", text: t("大分類の色") }), rows,
      button(t("大分類の色をすべて初期値に戻す"), () => {
        draft = sanitizeCategoryColors(null);
        for (const sync of controls.values()) sync();
      }));
    return { panel, refreshCategories, valid: () => invalid.size === 0, value: () => sanitizeCategoryColors(draft) };
  }

  refreshCategoryButtonColors() {
    const library = buildTagLibrary(this.exampleData || {}, this.settings.libraryEdits);
    this.colorTagIndex = tagCategoryIndex(library);
    for (const control of this.root?.querySelectorAll(".paio-category-colored") || []) {
      if (!control.closest(".paio-settings-dialog")) applyCategoryColor(control, control.dataset.colorCategory || "", this.settings.categoryColors);
    }
    this.renderTags();
  }

  buildLibraryManager() {
    const fileRoot = element("div", { className: "paio-library-manager paio-file-manager" });
    const editorRoot = element("div", { className: "paio-library-manager" });
    const heading = element("div", { className: "paio-library-heading" }, [
      element("div", {}, [element("h4", { text: t("タグ管理") }), element("p", { text: t("大分類 → 中分類 → 小分類 → タグの順で整理します。") })]),
    ]);
    const fileHeading = element("div", { className: "paio-library-heading" }, [
      element("div", {}, [element("h4", { text: t("ファイル") }), element("p", { text: t("読み込むタグファイルとタグセットファイルを指定します。") })]),
    ]);
    const fileInput = element("input");
    fileInput.type = "file";
    fileInput.accept = ".json,application/json";
    fileInput.hidden = true;
    const tagSetFileInput = element("input");
    tagSetFileInput.type = "file";
    tagSetFileInput.accept = ".json,application/json";
    tagSetFileInput.hidden = true;
    const fileStatus = element("span", { className: "paio-library-file-status", text: t("保存先を確認中…") });
    const tagSetFileStatus = element("span", { className: "paio-library-file-status", text: t("タグセット保存先を確認中…") });
    fileStatus.hidden = true;
    tagSetFileStatus.hidden = true;
    const body = element("div", { className: "paio-library-body" });
    const treePane = element("section", { className: "paio-library-tree" });
    const detailPane = element("section", { className: "paio-library-detail" });
    const search = element("input", { className: "paio-search" });
    search.type = "search";
    search.placeholder = t("カテゴリーやタグを検索");
    let edits = sanitizeLibraryEdits(this.settings.libraryEdits);
    let selectedId = "";
    let serial = 0;
    let currentCatalogFileHandle = null;
    let currentTagSetFileHandle = null;
    let currentSourceFileName = this.settings.libraryFile ? `${this.settings.libraryFile}.json` : "tag_catalog.json";
    const collapsedCategoryIds = new Set();
    const source = () => this.exampleData || { categories: [] };
    const getLibrary = () => buildTagLibrary(source(), edits);
    const hasEdits = () => edits.categories.length > 0 || edits.tags.length > 0;
    let overwriteButton;
    const refreshFileStatus = async () => {
      try {
        const query = this.settings.libraryFile ? `?selected=${encodeURIComponent(this.settings.libraryFile)}` : "";
        const response = await this.api.fetchApi(`/prompt_workbench/catalogs${query}`);
        const responseBody = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(responseBody.error || t("ファイル情報の取得に失敗しました ({status})", { status: response.status }));
        const canOverwrite = Boolean(this.settings.libraryFile && responseBody.exists);
        overwriteButton.disabled = !canOverwrite;
        overwriteButton.title = canOverwrite
          ? t("{file} を上書き保存", { file: `${this.settings.libraryFile}.json` })
          : t("デフォルトは上書きできません。別名で保存してください");
        fileStatus.classList.remove("is-error");
        fileStatus.classList.remove("is-success");
        fileStatus.hidden = true;
        fileStatus.textContent = "";
        fileStatus.title = "";
      } catch (error) {
        overwriteButton.disabled = true;
        fileStatus.hidden = false;
        fileStatus.textContent = error.message;
        fileStatus.classList.add("is-error");
        fileStatus.classList.remove("is-success");
      }
    };
    const refreshTagSetFileStatus = async () => {
      try {
        const query = this.settings.tagSetFile ? `?selected=${encodeURIComponent(this.settings.tagSetFile)}` : "";
        const response = await this.api.fetchApi(`/prompt_workbench/tag_sets/files${query}`);
        const responseBody = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(responseBody.error || t("タグセットファイル情報の取得に失敗しました ({status})", { status: response.status }));
        tagSetFileStatus.classList.remove("is-error");
        tagSetFileStatus.classList.remove("is-success");
        tagSetFileStatus.hidden = true;
        tagSetFileStatus.textContent = "";
        tagSetFileStatus.title = "";
      } catch (error) {
        tagSetFileStatus.hidden = false;
        tagSetFileStatus.textContent = error.message;
        tagSetFileStatus.classList.add("is-error");
        tagSetFileStatus.classList.remove("is-success");
      }
    };
    const loadSelectedCatalog = async (selectedFile, fileHandle = null) => {
      loadButton.disabled = true;
      loadButton.textContent = t("読み込み中…");
      fileStatus.hidden = false;
      fileStatus.textContent = t("{file} を確認中…", { file: selectedFile.name });
      fileStatus.classList.remove("is-error");
      fileStatus.classList.remove("is-success");
      try {
        if (selectedFile.size > MAX_CATALOG_FILE_BYTES) throw new Error(t("タグファイルは4 MB以下にしてください"));
        if (!selectedFile.name.toLocaleLowerCase().endsWith(".json")) throw new Error(t("JSONファイルを選択してください"));
        const catalog = parseImportedCatalogText(await selectedFile.text());
        const saved = await upsertCatalogCopy(this.api, selectedFile.name, catalog, { allowLoadFallback: true });
        this.pushUndo();
        this.settings.libraryFile = saved.name;
        this.settings.libraryEdits = { categories: [], tags: [] };
        edits = sanitizeLibraryEdits({});
        this.exampleData = catalog;
        this.exampleLoadPromise = Promise.resolve(catalog);
        this.syncFavoritesWithCatalog(catalog);
        currentCatalogFileHandle = fileHandle;
        currentSourceFileName = selectedFile.name;
        this.syncToWidgets();
        render();
        this.refreshExamplesPanel?.();
        await refreshFileStatus();
        const successMessage = saved.compatibilityFallback
          ? t("{file} を読み込みました。同名コピーの更新にはComfyUIの再起動が必要です", { file: selectedFile.name })
          : t("{file} を正常に読み込みました", { file: selectedFile.name });
        fileStatus.hidden = false;
        fileStatus.textContent = successMessage;
        fileStatus.title = successMessage;
        fileStatus.classList.remove("is-error");
        fileStatus.classList.add("is-success");
        this.setStatus(successMessage);
      } catch (error) {
        fileStatus.textContent = error.message;
        fileStatus.classList.add("is-error");
        fileStatus.classList.remove("is-success");
        this.setStatus(error.message, true);
      } finally {
        loadButton.disabled = false;
        loadButton.textContent = t("ファイルを選んで読み込む");
        fileInput.value = "";
      }
    };
    const openCatalogFile = async () => {
      if (hasEdits()) {
        const confirmed = window.confirm(t("編集内容は保存されていません。破棄して別のタグファイルを読み込みますか？"));
        if (!confirmed) {
          const message = t("読み込みをキャンセルしました。編集内容は保持されています");
          fileStatus.textContent = message;
          fileStatus.classList.remove("is-error");
          fileStatus.classList.remove("is-success");
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
        if (error?.name === "AbortError") return this.setStatus(t("読み込みをキャンセルしました"));
        fileStatus.textContent = error.message;
        fileStatus.classList.add("is-error");
        fileStatus.classList.remove("is-success");
        this.setStatus(error.message, true);
      }
    };
    const loadButton = button(t("ファイルを選んで読み込む"), openCatalogFile, t("JSONタグファイルを選んで読み込む"));
    fileInput.addEventListener("change", async () => {
      const selectedFile = fileInput.files?.[0];
      if (!selectedFile) return;
      await loadSelectedCatalog(selectedFile);
    });
    const loadSelectedTagSetFile = async (selectedFile, fileHandle = null) => {
      tagSetLoadButton.disabled = true;
      tagSetLoadButton.textContent = t("読み込み中…");
      tagSetFileStatus.hidden = false;
      tagSetFileStatus.textContent = t("{file} を確認中…", { file: selectedFile.name });
      tagSetFileStatus.classList.remove("is-error");
      tagSetFileStatus.classList.remove("is-success");
      try {
        if (selectedFile.size > MAX_CATALOG_FILE_BYTES) throw new Error(t("タグセットファイルは4 MB以下にしてください"));
        if (!selectedFile.name.toLocaleLowerCase().endsWith(".json")) throw new Error(t("JSONファイルを選択してください"));
        const tagSets = parseImportedTagSetText(await selectedFile.text());
        const saved = await upsertTagSetCopy(this.api, selectedFile.name, tagSets, { allowLoadFallback: true });
        this.pushUndo();
        this.settings.tagSetFile = saved.name;
        this.tagSetData = tagSets;
        this.tagSetLoadPromise = Promise.resolve(tagSets);
        currentTagSetFileHandle = fileHandle;
        this.syncToWidgets();
        this.refreshTagSetsPanel?.();
        await refreshTagSetFileStatus();
        const successMessage = saved.compatibilityFallback
          ? t("{file} を読み込みました。同名コピーの更新にはComfyUIの再起動が必要です", { file: selectedFile.name })
          : t("{file} を正常に読み込みました", { file: selectedFile.name });
        tagSetFileStatus.hidden = false;
        tagSetFileStatus.textContent = successMessage;
        tagSetFileStatus.title = successMessage;
        tagSetFileStatus.classList.remove("is-error");
        tagSetFileStatus.classList.add("is-success");
        this.setStatus(successMessage);
      } catch (error) {
        tagSetFileStatus.textContent = error.message;
        tagSetFileStatus.classList.add("is-error");
        tagSetFileStatus.classList.remove("is-success");
        this.setStatus(error.message, true);
      } finally {
        tagSetLoadButton.disabled = false;
        tagSetLoadButton.textContent = t("ファイルを選んで読み込む");
        tagSetFileInput.value = "";
      }
    };
    const openTagSetFile = async () => {
      if (typeof window.showOpenFilePicker !== "function") {
        tagSetFileInput.value = "";
        tagSetFileInput.click();
        return;
      }
      try {
        const [fileHandle] = await window.showOpenFilePicker({
          id: TAG_SET_FILE_PICKER_ID,
          multiple: false,
          types: CATALOG_FILE_PICKER_TYPES,
        });
        await loadSelectedTagSetFile(await fileHandle.getFile(), fileHandle);
      } catch (error) {
        if (error?.name === "AbortError") return this.setStatus(t("読み込みをキャンセルしました"));
        tagSetFileStatus.textContent = error.message;
        tagSetFileStatus.classList.add("is-error");
        tagSetFileStatus.classList.remove("is-success");
        this.setStatus(error.message, true);
      }
    };
    const tagSetLoadButton = button(t("ファイルを選んで読み込む"), openTagSetFile, t("JSONタグセットファイルを選んで読み込む"));
    tagSetFileInput.addEventListener("change", async () => {
      const selectedFile = tagSetFileInput.files?.[0];
      if (!selectedFile) return;
      await loadSelectedTagSetFile(selectedFile);
    });
    const applySavedCatalog = async (catalog, responseBody, message, options = {}) => {
      this.pushUndo();
      this.settings.libraryFile = responseBody.name;
      this.settings.libraryEdits = { categories: [], tags: [] };
      if (options.clearTagSelection) this.clearSelectionState();
      edits = sanitizeLibraryEdits({});
      this.exampleData = catalog;
      this.exampleLoadPromise = Promise.resolve(catalog);
      this.syncFavoritesWithCatalog(catalog);
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
        await applySavedCatalog(catalog, responseBody, t("{file} に別名保存しました", { file: savedFileName }));
      } catch (error) {
        if (error?.name === "AbortError") return this.setStatus(t("別名保存をキャンセルしました"));
        fileStatus.textContent = error.message;
        fileStatus.classList.add("is-error");
        fileStatus.classList.remove("is-success");
        this.setStatus(error.message, true);
      } finally {
        saveAsButton.disabled = false;
      }
    };
    const overwriteCurrentFile = async () => {
      const name = this.settings.libraryFile;
      if (!name) return this.setStatus(t("デフォルトは上書きできません。別名で保存してください"), true);
      const targetName = currentCatalogFileHandle?.name || `${name}.json`;
      if (!window.confirm(t("{file} を上書き保存しますか？", { file: targetName }))) return this.setStatus(t("上書き保存をキャンセルしました"));
      overwriteButton.disabled = true;
      try {
        const catalog = await buildCompleteCatalogForSave(() => this.loadExampleData(), edits);
        if (currentCatalogFileHandle) await writeCatalogFile(currentCatalogFileHandle, catalog);
        const responseBody = await upsertCatalogCopy(this.api, targetName, catalog);
        await applySavedCatalog(catalog, responseBody, t("{file} を上書き保存しました", { file: targetName }), { clearTagSelection: true });
      } catch (error) {
        fileStatus.textContent = error.message;
        fileStatus.classList.add("is-error");
        fileStatus.classList.remove("is-success");
        this.setStatus(error.message, true);
      }
    };
    overwriteButton = button(t("上書き保存"), overwriteCurrentFile);
    overwriteButton.disabled = !this.settings.libraryFile;
    saveAsButton = button(t("別名で保存"), saveAsNewFile);
    saveAsButton.classList.add("is-primary");
    const fileBar = element("section", { className: "paio-library-filebar" }, [
      element("div", { className: "paio-library-file-controls" }, [
        this.labeled(t("タグファイル"), loadButton),
        fileInput,
      ]),
      fileStatus,
    ]);
    const tagSetFileBar = element("section", { className: "paio-library-filebar" }, [
      element("div", { className: "paio-library-file-controls" }, [
        this.labeled(t("タグセットファイル"), tagSetLoadButton),
        tagSetFileInput,
      ]),
      tagSetFileStatus,
    ]);
    const saveBar = element("section", { className: "paio-library-savebar" }, [
      element("span", { className: "paio-hint", text: t("タグとカテゴリーの変更をJSONへ保存") }),
      element("div", { className: "paio-library-save-actions" }, [overwriteButton, saveAsButton]),
    ]);
    const createCategory = (level) => {
      const library = getLibrary();
      let parentId = "";
      const selected = library.categories.find((item) => item.id === selectedId);
      if (level === "medium") parentId = selected?.level === "large" ? selected.id : selected?.level === "medium" ? selected.parentId : library.categories.find((item) => item.level === "large")?.id || "";
      if (level === "small") parentId = selected?.level === "medium" ? selected.id : selected?.level === "small" ? selected.parentId : library.categories.find((item) => item.level === "medium")?.id || "";
      if (level !== "large" && !parentId) return this.setStatus(t("先に親カテゴリーを作成してください"), true);
      const id = `custom-category-${Date.now()}-${serial++}`;
      edits = saveCategoryEdit(edits, { id, level, parentId, en: "New category", ja: "新しいカテゴリー", custom: true });
      selectedId = id;
      render();
    };
    const addBar = element("div", { className: "paio-library-addbar" }, [
      button(t("＋ 大分類"), () => createCategory("large")),
      button(t("＋ 中分類"), () => createCategory("medium")),
      button(t("＋ 小分類"), () => createCategory("small")),
    ]);
    const showCategoryDetail = (library, category) => {
      if (!category) return detailPane.append(element("p", { className: "paio-empty", text: t("左からカテゴリーを選択してください") }));
      const en = element("input", { className: "paio-search" }); en.value = category.en;
      const ja = element("input", { className: "paio-search" }); ja.value = category.ja;
      const stageCategoryName = () => {
        edits = saveCategoryEdit(edits, { ...category, en: en.value, ja: ja.value, custom: !category.builtin });
      };
      en.addEventListener("input", stageCategoryName);
      ja.addEventListener("input", stageCategoryName);
      const destination = element("select", { className: "paio-select" });
      const empty = element("option", { text: t("移動先を選択") }); empty.value = ""; destination.append(empty);
      for (const small of library.categories.filter((item) => item.level === "small" && item.id !== category.id)) {
        const option = element("option", { text: `${small.ja} / ${small.en}` }); option.value = small.id; destination.append(option);
      }
      const remove = button(t("カテゴリーを削除"), () => {
        try {
          edits = deleteCategoryEdit(source(), edits, category.id, destination.value);
          selectedId = "";
          render();
        } catch (error) { this.setStatus(error.message, true); }
      });
      remove.classList.add("is-danger");
      detailPane.append(
        element("div", { className: "paio-library-detail-title" }, [element("span", { className: `paio-level-badge is-${category.level}`, text: t({ large: "大分類", medium: "中分類", small: "小分類" }[category.level]) }), element("strong", { text: category.ja })]),
        this.labeled(t("英語名"), en), this.labeled(t("日本語名"), ja),
      );
      if (category.level === "small") detailPane.append(this.buildTagEditor(library, category, () => edits, (value, shouldRender = true) => { edits = value; if (shouldRender) render(); }));
      detailPane.append(element("div", { className: "paio-library-danger" }, [
        element("strong", { text: t("カテゴリー削除") }),
        element("p", { text: t("配下のタグがある場合は、小分類の移動先を選択してください。") }), destination, remove,
      ]));
    };
    const render = () => {
      const library = getLibrary();
      const query = search.value.trim().toLocaleLowerCase();
      treePane.replaceChildren(search, addBar);
      detailPane.replaceChildren();
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
        row.prepend(element("span", { className: `paio-level-badge is-${category.level}`, text: t({ large: "大", medium: "中", small: "小" }[category.level]) }));
        treePane.append(row);
        if (category.level === "small") {
          const tags = library.tags.filter((tag) => tag.categoryId === category.id).slice(0, 8);
          if (tags.length) treePane.append(element("div", { className: "paio-tree-tag-preview" }, tags.map((tag) => element("span", { text: tag.prompt }))));
        }
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
    fileRoot.append(fileHeading, fileBar, tagSetFileBar);
    editorRoot.append(heading, body, saveBar);
    this.loadExampleData().then(render).catch(render);
    refreshFileStatus();
    refreshTagSetFileStatus();
    return {
      fileRoot,
      editorRoot,
      getEdits: () => sanitizeLibraryEdits(edits),
      refresh: () => { render(); refreshFileStatus(); refreshTagSetFileStatus(); },
    };
  }

  buildTagEditor(library, category, getEdits, setEdits) {
    const section = element("div", { className: "paio-tag-editor" }, [
      element("strong", { text: t("タグ") }),
      element("span", { className: "paio-hint", text: t("⋮⋮をドラッグして表示順を変更") }),
    ]);
    const prompt = element("input", { className: "paio-search" }); prompt.placeholder = t("英語タグ");
    const ja = element("input", { className: "paio-search" }); ja.placeholder = t("日本語訳");
    section.append(element("div", { className: "paio-tag-add" }, [prompt, ja, button(t("追加"), () => {
      if (!prompt.value.trim()) return this.setStatus(t("タグを入力してください"), true);
      const id = `custom-tag-${Date.now()}`;
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
      const dragHandle = button("⋮⋮", () => {}, t("ドラッグ、または上下矢印キーで表示順を変更"));
      dragHandle.classList.add("paio-tag-drag-handle");
      dragHandle.draggable = true;
      dragHandle.setAttribute("aria-label", t("{tag} の表示順を変更", { tag: tag.prompt }));
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
      const remove = button(t("削除"), () => setEdits(deleteTagEdit(getEdits(), tag))); remove.classList.add("is-danger"); row.append(remove);
      section.append(row);
    }
    return section;
  }

  loadExampleData() {
    if (this.exampleData) return Promise.resolve(this.exampleData);
    if (!this.exampleLoadPromise) {
      const generation = this.dataGeneration;
      const file = this.settings.libraryFile;
      this.exampleLoadPromise = fetchExampleCatalog(this.api, file).then((body) => {
        if (generation !== this.dataGeneration || file !== this.settings.libraryFile) return this.loadExampleData();
        this.exampleData = body;
        this.colorTagIndex = tagCategoryIndex(buildTagLibrary(body, this.settings.libraryEdits));
        this.renderTags();
        this.syncFavoritesWithCatalog(body);
        return body;
      }).catch((error) => {
        if (generation === this.dataGeneration && file === this.settings.libraryFile) this.exampleLoadPromise = null;
        throw error;
      });
    }
    return this.exampleLoadPromise;
  }

  loadTagSetData() {
    if (this.tagSetData) return Promise.resolve(this.tagSetData);
    if (!this.tagSetLoadPromise) {
      const generation = this.dataGeneration;
      const file = this.settings.tagSetFile;
      this.tagSetLoadPromise = fetchSelectedTagSetCatalog(this.api, file).then((body) => {
        if (generation !== this.dataGeneration || file !== this.settings.tagSetFile) return this.loadTagSetData();
        this.tagSetData = body;
        this.syncFavoritesWithTagSets(body);
        return body;
      }).catch((error) => {
        if (generation === this.dataGeneration && file === this.settings.tagSetFile) this.tagSetLoadPromise = null;
        throw error;
      });
    }
    return this.tagSetLoadPromise;
  }

  labeled(label, control) {
    return element("label", { className: "paio-field" }, [element("span", { text: label }), control]);
  }

  buildLibraryTabs() {
    const pick = (tab) => {
      this.setLibraryTab(tab);
      if (!this.catalogOpen) this.setCatalogOpen?.(true);
    };
    const tags = button(t("タグ追加"), () => pick("tags"));
    const tagSets = button(t("タグセット"), () => pick("tagSets"));
    const prose = button(t("散文フレーズ"), () => pick("prose"));
    tags.dataset.tab = "tags";
    tagSets.dataset.tab = "tagSets";
    prose.dataset.tab = "prose";
    return element("div", { className: "paio-library-tabs paio-tabs" }, [tags, tagSets, prose]);
  }

  buildProsePhrasesPanel() {
    const panel = element("div", { className: "paio-examples paio-prose-phrases" });
    const search = element("input", { className: "paio-search", type: "search" });
    search.placeholder = t("英語・中国語・日本語でフレーズ検索");
    const list = element("div", { className: "paio-example-list paio-prose-phrase-list" });
    const redraw = () => {
      const q = search.value.trim().toLocaleLowerCase();
      list.replaceChildren();
      const matched = PROSE_PHRASES.filter((item) => !q
        || item.prompt.toLocaleLowerCase().includes(q)
        || item.ja.toLocaleLowerCase().includes(q)
        || item.group.toLocaleLowerCase().includes(q));
      if (!matched.length) {
        list.append(element("p", { className: "paio-empty", text: t("一致するフレーズはありません") }));
        return;
      }
      for (const item of matched) {
        const chip = button("", () => {
          this.pushUndo();
          this.addValues([{ value: item.prompt, translation: item.ja, translatedTo: this.settings.localLanguage }], { trailingSeparator: true });
          this.setStatus(t("フレーズを追加しました"));
        }, `${item.prompt}\n${item.ja}`);
        chip.classList.add("paio-example-chip", "paio-prose-phrase-chip");
        chip.replaceChildren(
          element("span", { className: "paio-prose-phrase-group", text: `[${item.group}]` }),
          element("span", { className: "paio-example-chip-prompt", text: item.prompt }),
          element("span", { className: "paio-example-chip-translation", text: item.ja }),
        );
        list.append(chip);
      }
    };
    search.addEventListener("input", redraw);
    panel.append(element("div", { className: "paio-example-controls" }, [search]), list);
    redraw();
    return panel;
  }

  setLibraryTab(tab) {
    this.activeLibraryTab = ["tagSets", "prose"].includes(tab) ? tab : "tags";
    if (this.examplesPanel) this.examplesPanel.hidden = this.activeLibraryTab !== "tags";
    if (this.tagSetsPanel) this.tagSetsPanel.hidden = this.activeLibraryTab !== "tagSets";
    if (this.prosePhrasesPanel) this.prosePhrasesPanel.hidden = this.activeLibraryTab !== "prose";
    this.libraryTabs?.querySelectorAll?.(".paio-button").forEach((control) => {
      const active = control.dataset.tab === this.activeLibraryTab;
      control.classList.toggle("is-active", active);
      control.setAttribute("aria-pressed", String(active));
    });
    if (this.activeLibraryTab === "tagSets") this.refreshTagSetsPanel?.();
  }

  buildTagSetsPanel() {
    const panel = element("div", { className: "paio-examples paio-tag-sets" });
    const categoryBands = element("div", { className: "paio-example-category-bands" });
    const pathStatus = element("span", { className: "paio-example-path", text: t("タグセットを読み込み中…") });
    const search = element("input", { className: "paio-search" });
    search.type = "search";
    search.placeholder = t("タグセットを検索");
    search.setAttribute("aria-label", t("タグセットを検索"));
    const favoriteOnly = button(t("お気に入りのみ表示"), () => {
      this.settings.showFavoritesOnly = !this.settings.showFavoritesOnly;
      favoriteOnly.classList.toggle("is-active", this.settings.showFavoritesOnly);
      favoriteOnly.setAttribute("aria-pressed", String(this.settings.showFavoritesOnly));
      this.favoriteOnlyToggle?.classList.toggle("is-active", this.settings.showFavoritesOnly);
      this.favoriteOnlyToggle?.setAttribute("aria-pressed", String(this.settings.showFavoritesOnly));
      this.persist();
      renderLimit = INITIAL_EXAMPLE_LIMIT;
      redraw();
      this.renderTags();
    });
    favoriteOnly.classList.add("paio-favorite-filter");
    favoriteOnly.classList.toggle("is-active", this.settings.showFavoritesOnly);
    favoriteOnly.setAttribute("aria-pressed", String(this.settings.showFavoritesOnly));
    const list = element("div", { className: "paio-example-list paio-tag-set-list" });
    list.setAttribute("aria-live", "polite");
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
          if (level === "large") applyCategoryColor(chip, categoryColorId(category), this.settings.categoryColors);
          chip.classList.toggle("is-active", category.id === activeId);
          chip.setAttribute("aria-pressed", String(category.id === activeId));
          chips.append(chip);
        }
        if (!options.length) chips.append(element("span", { className: "paio-hint", text: t("分類がありません") }));
        categoryBands.append(element("div", { className: `paio-example-category-band is-${level}` }, [
          element("strong", { className: "paio-example-category-label", text: t(label) }),
          chips,
        ]));
      }
      pathStatus.textContent = [resolved.large?.ja, resolved.medium?.ja, resolved.small?.ja].filter(Boolean).join(" > ") || t("分類がありません");
    };
    const redraw = () => {
      list.replaceChildren();
      if (!library) {
        renderCategoryBands({ large: null, medium: null, small: null, largeOptions: [], mediumOptions: [], smallOptions: [] });
        list.append(element("p", { className: "paio-empty", text: t("タグセットを読み込み中…") }));
        return;
      }
      const resolved = resolveTagSetCategoryPath(library, categoryPath);
      categoryPath = {
        largeId: resolved.large?.id || "",
        mediumId: resolved.medium?.id || "",
        smallId: resolved.small?.id || "",
      };
      renderCategoryBands(resolved);
      const warnings = Array.isArray(library.warnings) ? library.warnings.filter(Boolean) : [];
      if (warnings.length) {
        list.append(element("p", {
          className: "paio-empty paio-error",
          text: t("タグセットの読み込みに警告があります: {message}", { message: warnings.slice(0, 3).join(" / ") }),
        }));
      }
      const favorites = this.favoriteTagSetKeys();
      const matches = sortTagSets(filterTagSets(library, resolved.small?.id, search.value)
        .filter((item) => !this.settings.showFavoritesOnly || favorites.has(tagSetFavoriteKey(item.id))),
      this.settings.tagSetSortOrder, this.settings.tagSetUsage, this.settings.tagSetFile);
      const visibleLimit = search.value.trim() ? MAX_EXAMPLE_SEARCH_RESULTS : renderLimit;
      for (const item of matches.slice(0, visibleLimit)) {
        const favorite = favorites.has(tagSetFavoriteKey(item.id));
        const row = button("", (event) => {
          if (event.ctrlKey || event.metaKey) return;
          this.pushUndo();
          this.addValues(item.tags.map((value) => ({ value })), { trailingSeparator: true });
          const usageKey = tagSetUsageKey(this.settings.tagSetFile, item.id);
          this.settings.tagSetUsage = { ...this.settings.tagSetUsage, [usageKey]: Math.min(1000000, (this.settings.tagSetUsage[usageKey] || 0) + 1) };
          saveLibrarySortSettings(this.settings);
          this.persist();
          if (this.settings.tagSetSortOrder === "popular") redraw();
          this.setStatus(t("{name} を追加しました", { name: item.nameJa || item.name }));
        }, item.tags.join(", "));
        row.classList.add("paio-tag-set-row");
        applyCategoryColor(row, categoryColorId(majorCategory(library, item.categoryId)), this.settings.categoryColors);
        row.classList.toggle("is-favorite", favorite);
        row.dataset.setId = item.id;
        const openMenu = (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.showTagSetFavoriteContextMenu(event, item);
        };
        row.addEventListener("pointerdown", (event) => {
          if (event.button === 2) openMenu(event);
        });
        row.addEventListener("contextmenu", openMenu);
        const imageSource = tagSetImageSource(item.imagePath || item.imageUrl);
        const imageNode = imageSource
          ? element("span", { className: "paio-tag-set-image-wrap" }, [
            element("img", { className: "paio-tag-set-image", title: item.nameJa || item.name }),
            element("span", { className: "paio-tag-set-image-popover" }, [
              element("img", { className: "paio-tag-set-image-preview", alt: "" }),
            ]),
          ])
          : element("span", { className: "paio-tag-set-image-placeholder" });
        const nameChildren = [element("span", { className: "paio-tag-set-name-text", text: item.nameJa || item.name })];
        if (item.creator) nameChildren.push(element("small", { className: "paio-tag-set-creator", text: t("製作者: {name}", { name: item.creator }) }));
        row.replaceChildren(
          element("span", { className: "paio-favorite-mark", text: favorite ? "★" : "☆" }),
          imageNode,
          element("span", { className: "paio-tag-set-name" }, nameChildren),
          element("span", { className: "paio-tag-set-preview", text: item.preview }),
        );
        const image = row.querySelector(".paio-tag-set-image");
        if (image) {
          image.src = imageSource;
          image.alt = item.nameJa || item.name;
          image.loading = "lazy";
        }
        const previewImage = row.querySelector(".paio-tag-set-image-preview");
        if (previewImage) {
          previewImage.src = imageSource;
          previewImage.loading = "lazy";
        }
        const entry = element("div", { className: "paio-tag-set-entry" }, row);
        const metadata = element("div", { className: "paio-tag-set-metadata" });
        if (item.description) metadata.append(element("p", { className: "paio-tag-set-description", text: item.description }));
        const sourceUrl = safeSourceUrl(item.sourceUrl);
        if (sourceUrl) {
          const link = element("a", { className: "paio-tag-set-source", text: t("参照元を開く") });
          link.href = sourceUrl;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.title = sourceUrl;
          metadata.append(link);
        }
        if (metadata.childNodes.length) entry.append(metadata);
        list.append(entry);
      }
      if (!matches.length) list.append(element("p", { className: "paio-empty", text: t("一致するタグセットはありません") }));
      if (!search.value.trim() && matches.length > renderLimit) {
        list.append(button(t("さらに表示（残り {count}）", { count: matches.length - renderLimit }), () => {
          renderLimit += EXAMPLE_PAGE_SIZE;
          redraw();
        }));
      }
    };
    this.refreshTagSetsPanel = () => {
      if (this.tagSetData) library = buildTagSetLibrary(this.tagSetData);
      redraw();
    };
    this.loadTagSetData()
      .then((body) => {
        library = buildTagSetLibrary(body);
        redraw();
      })
      .catch(() => {
        library = { categories: [], sets: [], warnings: [t("タグセットを読み込めませんでした")] };
        redraw();
        this.setStatus(t("タグセットを読み込めませんでした"), true);
      });
    search.addEventListener("input", () => {
      renderLimit = INITIAL_EXAMPLE_LIMIT;
      redraw();
    });
    const resetCategories = button(t("リセット"), () => {
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
    const sortButtons = librarySortButtons(this.settings, "tagSetSortOrder", [["default", "デフォルト"], ["popular", "よく使う順"]], () => {
      renderLimit = INITIAL_EXAMPLE_LIMIT;
      saveLibrarySortSettings(this.settings);
      this.persist();
      list.scrollTop = 0;
      redraw();
    });
    const controls = element("div", { className: "paio-example-controls" }, [search, favoriteOnly, sortButtons]);
    const footer = element("div", { className: "paio-example-footer" }, [
      element("span", { className: "paio-hint", text: t("右クリック: お気に入り") }),
    ]);
    panel.append(navigation, controls, list, footer);
    redraw();
    return panel;
  }

  buildExamplesPanel() {
    const panel = element("div", { className: "paio-examples" });
    const search = element("input", { className: "paio-search" });
    search.type = "search";
    search.placeholder = t("英語・日本語でタグを検索");
    search.setAttribute("aria-label", t("内蔵例を検索"));
    const favoriteOnly = button(t("お気に入りのみ表示"), () => {
      this.settings.showFavoritesOnly = !this.settings.showFavoritesOnly;
      favoriteOnly.classList.toggle("is-active", this.settings.showFavoritesOnly);
      favoriteOnly.setAttribute("aria-pressed", String(this.settings.showFavoritesOnly));
      this.favoriteOnlyToggle?.classList.toggle("is-active", this.settings.showFavoritesOnly);
      this.favoriteOnlyToggle?.setAttribute("aria-pressed", String(this.settings.showFavoritesOnly));
      this.persist();
      renderLimit = INITIAL_EXAMPLE_LIMIT;
      redraw();
      this.renderTags();
    });
    favoriteOnly.classList.add("paio-favorite-filter");
    favoriteOnly.classList.toggle("is-active", this.settings.showFavoritesOnly);
    favoriteOnly.setAttribute("aria-pressed", String(this.settings.showFavoritesOnly));
    const categoryBands = element("div", { className: "paio-example-category-bands" });
    const pathStatus = element("span", { className: "paio-example-path", text: t("分類を読み込み中…") });
    const list = element("div", { className: "paio-example-list" });
    list.setAttribute("aria-live", "polite");
    const openExampleFavoriteMenu = (event) => {
      const chip = event.target?.closest?.(".paio-example-chip");
      const prompt = chip?.dataset?.prompt;
      if (!prompt) return;
      event.preventDefault();
      event.stopPropagation();
      clearTimeout(this.clickTimer);
      this.showFavoriteContextMenu(event, prompt);
    };
    list.addEventListener("pointerdown", (event) => {
      if (event.button === 2) openExampleFavoriteMenu(event);
    }, true);
    list.addEventListener("contextmenu", openExampleFavoriteMenu, true);
    const resultStatus = element("span", { className: "paio-example-count", text: t("読み込み中…") });
    const selected = new Set();
    let library = null;
    let tagDbItems = [];
    let tagDbTimer = 0;
    let tagDbAbort = null;
    let categoryPath = { largeId: "", mediumId: "", smallId: "" };
    const categoryScrollPositions = new Map();
    let renderLimit = INITIAL_EXAMPLE_LIMIT;
    const selectCategory = (level, id) => {
      if (level === "large") {
        categoryScrollPositions.delete("medium");
        categoryScrollPositions.delete("small");
      } else if (level === "medium") {
        categoryScrollPositions.delete("small");
      }
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
        chips.addEventListener("scroll", () => {
          categoryScrollPositions.set(level, { left: chips.scrollLeft, top: chips.scrollTop });
        }, { passive: true });
        for (const category of options) {
          const chip = button(category.ja || category.en, () => selectCategory(level, category.id), category.en || category.ja);
          chip.classList.add("paio-example-category-chip", `is-${level}`);
          if (level === "large") applyCategoryColor(chip, categoryColorId(category), this.settings.categoryColors);
          chip.classList.toggle("is-active", category.id === activeId);
          chip.setAttribute("aria-pressed", String(category.id === activeId));
          chips.append(chip);
        }
        if (!options.length) chips.append(element("span", { className: "paio-hint", text: t("分類がありません") }));
        const scrollPosition = categoryScrollPositions.get(level);
        if (scrollPosition) {
          chips.scrollLeft = scrollPosition.left;
          chips.scrollTop = scrollPosition.top;
        }
        categoryBands.append(element("div", { className: `paio-example-category-band is-${level}` }, [
          element("strong", { className: "paio-example-category-label", text: t(label) }),
          chips,
        ]));
      }
      pathStatus.textContent = [resolved.large?.ja, resolved.medium?.ja, resolved.small?.ja].filter(Boolean).join(" › ") || t("分類がありません");
    };
    const redraw = () => {
      list.replaceChildren();
      if (!library) {
        list.append(element("p", { className: "paio-empty", text: t("内蔵例を読み込んでいます…") }));
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
      const favoriteKeys = this.favoriteSet();
      const matches = sortExampleTags(filterExampleLibraryTags(library, resolved.small?.id, query)
        .filter((item) => !this.settings.showFavoritesOnly || favoriteKeys.has(favoriteTagKey(item.prompt))),
      this.settings.exampleSortOrder, this.settings.tagUsage, this.settings.libraryFile);
      const catalogKeys = new Set(matches.map((item) => tagDbKey(item.prompt)));
      const tagDbMatches = !query ? [] : tagDbItems.filter((item) => !catalogKeys.has(tagDbKey(item.prompt))
        && (!this.settings.showFavoritesOnly || favoriteKeys.has(favoriteTagKey(item.prompt))));
      resultStatus.textContent = t("{count}件", { count: matches.length + tagDbMatches.length });
      const visibleLimit = query ? MAX_EXAMPLE_SEARCH_RESULTS : renderLimit;
      for (const item of [...matches.slice(0, visibleLimit), ...tagDbMatches]) {
        const translation = cleanTranslation(item.ja);
        const favorite = favoriteKeys.has(favoriteTagKey(item.prompt));
        const chip = button("", (event) => {
          if (event.ctrlKey || event.metaKey) {
            if (selected.has(item.prompt)) selected.delete(item.prompt);
            else selected.add(item.prompt);
            chip.classList.toggle("is-selected", selected.has(item.prompt));
            chip.setAttribute("aria-pressed", String(selected.has(item.prompt)));
            this.exampleBulkButton.hidden = selected.size === 0;
            this.exampleBulkButton.textContent = t("選択した{count}件を追加", { count: selected.size });
            return;
          }
          this.pushUndo();
          this.addValues(
            [{ value: item.prompt, translation: translation, translatedTo: translation ? this.settings.localLanguage : "" }],
            { trailingSeparator: true },
          );
          const usageKey = tagUsageKey(this.settings.libraryFile, item.prompt);
          this.settings.tagUsage = { ...this.settings.tagUsage, [usageKey]: Math.min(1000000, (this.settings.tagUsage[usageKey] || 0) + 1) };
          saveLibrarySortSettings(this.settings);
          this.persist();
          this.setStatus(t("{tag} を追加しました", { tag: item.prompt }));
        }, [
          translation ? `${item.prompt} — ${translation}` : item.prompt,
        ].filter(Boolean).join("\n"));
        chip.classList.add("paio-example-chip");
        applyCategoryColor(chip, categoryColorId(majorCategory(library, item.categoryId)), this.settings.categoryColors);
        chip.dataset.prompt = item.prompt;
        chip.classList.toggle("is-favorite", favorite);
        const openFavoriteMenu = (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.showFavoriteContextMenu(event, item.prompt);
        };
        chip.addEventListener("pointerdown", (event) => {
          if (event.button === 2) openFavoriteMenu(event);
        });
        chip.addEventListener("contextmenu", (event) => {
          openFavoriteMenu(event);
        });
        chip.replaceChildren(
          element("span", { className: "paio-favorite-mark", text: favorite ? "★" : "☆" }),
          element("span", { className: "paio-example-chip-prompt", text: item.prompt }),
          ...(translation ? [element("span", { className: "paio-example-chip-translation", text: item.translations?.join(" / ") || translation })] : []),
        );
        chip.classList.toggle("is-selected", selected.has(item.prompt));
        chip.setAttribute("aria-pressed", String(selected.has(item.prompt)));
        list.append(chip);
      }
      if (!matches.length && !tagDbMatches.length) list.append(element("p", { className: "paio-empty", text: t("一致する例はありません") }));
      if (!query && matches.length > renderLimit) {
        list.append(button(t("さらに表示（残り {count}）", { count: matches.length - renderLimit }), () => {
          renderLimit += EXAMPLE_PAGE_SIZE;
          redraw();
        }));
      }
    };
    const populate = () => {
      library = buildTagLibrary(this.exampleData || { categories: [] }, this.settings.libraryEdits);
      this.colorTagIndex = tagCategoryIndex(library);
      this.renderTags();
      redraw();
    };
    this.refreshExamplesPanel = populate;
    this.loadExampleData()
      .then((body) => {
        this.exampleData = body;
        populate();
      })
      .catch(() => {
        library = { categories: [], tags: [] };
        resultStatus.textContent = t("読込失敗");
        list.replaceChildren(element("p", { className: "paio-empty paio-error", text: t("内蔵例を読み込めませんでした") }));
        this.setStatus(t("内蔵例を読み込めませんでした"), true);
      });
    const refreshTagDbItems = () => {
      clearTimeout(tagDbTimer);
      tagDbAbort?.abort();
      tagDbItems = [];
      const query = search.value.trim();
      if (!shouldSearchTagDb(query)) return;
      tagDbTimer = window.setTimeout(async () => {
        tagDbAbort = new AbortController();
        const { signal } = tagDbAbort;
        const results = await searchTagDb(this.api, query, {
          language: this.settings.localLanguage,
          contains: true,
          limit: TAG_DB_SEARCH_LIMIT,
          signal,
        });
        if (signal.aborted) return;
        tagDbItems = results.map((item) => ({ prompt: item.tag, ja: item.translations[0] || "", translations: item.translations }));
        this.syncActiveSectionSuggestions(tagDbItems.map((item) => item.prompt));
        redraw();
      }, TAG_DB_SEARCH_DELAY_MS);
    };
    search.addEventListener("input", () => {
      renderLimit = INITIAL_EXAMPLE_LIMIT;
      refreshTagDbItems();
      redraw();
    });
    this.exampleBulkButton = button(t("選択した{count}件を追加", { count: 0 }), () => {
      if (!selected.size) return;
      this.pushUndo();
      this.addValues(
        [...selected].map((prompt) => {
          const item = [...(library?.tags || []), ...tagDbItems].find((tag) => tag.prompt === prompt);
          const translation = cleanTranslation(item?.ja);
          return { value: prompt, translation, translatedTo: translation ? this.settings.localLanguage : "" };
        }),
        { trailingSeparator: true },
      );
      const tagUsage = { ...this.settings.tagUsage };
      for (const prompt of selected) {
        const usageKey = tagUsageKey(this.settings.libraryFile, prompt);
        tagUsage[usageKey] = Math.min(1000000, (tagUsage[usageKey] || 0) + 1);
      }
      this.settings.tagUsage = tagUsage;
      saveLibrarySortSettings(this.settings);
      this.persist();
      selected.clear();
      redraw();
      this.setStatus(t("内蔵例を追加しました"));
    });
    this.exampleBulkButton.hidden = true;
    const resetCategories = button(t("リセット"), () => {
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
    const sortButtons = librarySortButtons(this.settings, "exampleSortOrder", [["default", "デフォルト"], ["popular", "よく使う順"], ["alphabetical", "アルファベット順"]], () => {
      renderLimit = INITIAL_EXAMPLE_LIMIT;
      saveLibrarySortSettings(this.settings);
      this.persist();
      list.scrollTop = 0;
      redraw();
    });
    const controls = element("div", { className: "paio-example-controls" }, [search, favoriteOnly, sortButtons]);
    const footer = element("div", { className: "paio-example-footer" }, [
      resultStatus,
      element("span", { className: "paio-hint", text: t("Ctrl+クリックで複数選択") }),
      this.exampleBulkButton,
    ]);
    panel.append(navigation, controls, list, footer);
    redraw();
    return panel;
  }

  buildBlacklistDialog() {
    const dialog = this.buildDialog("ブラックリスト");
    const help = element("p", { text: t("1行ごとに exact:tag / iexact:tag / contains:tag / regex:pattern") });
    const textarea = element("textarea", { className: "paio-dialog-textarea" });
    textarea.value = this.settings.blacklist.map((item) => `${item.mode}:${item.pattern}`).join("\n");
    const action = element("select", { className: "paio-select" });
    for (const [value, label] of [["warn", "警告のみ"], ["disable", "無効化"], ["delete", "削除"]]) {
      const option = element("option", { text: t(label) });
      option.value = value;
      action.append(option);
    }
    action.value = this.settings.blacklistAction;
    const save = button(t("適用"), () => {
      const entries = textarea.value.split(/\r?\n/u).filter(Boolean).slice(0, 200).map((line) => {
        const separator = line.indexOf(":");
        if (separator < 0) return { mode: "exact", pattern: line.trim() };
        return { mode: line.slice(0, separator).trim(), pattern: line.slice(separator + 1).trim() };
      });
      const compiled = compileBlacklist(entries);
      const errors = compiled.filter((entry) => entry.error);
      if (errors.length) {
        this.setStatus(t("無効な正規表現: {error}", { error: errors[0].error }), true);
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
    dialog.body.append(help, textarea, this.labeled(t("一致時の処理"), action), save);
    return dialog;
  }

  buildBulkSplitDialog() {
    const dialog = this.buildDialog("一括テキスト読込・分割");
    const help = element("p", {
      className: "paio-hint",
      text: t("{ } や 【見出し】 / ## 見出し / [見出し] 付きのプロンプトをまとめて貼り付けてセクションへ分割できます。"),
    });
    const textarea = element("textarea", { className: "paio-dialog-textarea" });
    textarea.rows = 12;
    textarea.placeholder = "{\n【任务与范式】\n...\n\n【可选负面提示词】\n...\n}";
    this.bulkSplitTextarea = textarea;
    const apply = button(t("分割して反映"), () => {
      this.applyBulkSplitText(textarea.value);
      closeDialog(dialog);
    });
    const clearBtn = button(t("クリア"), () => {
      textarea.value = "";
      textarea.focus();
    });
    dialog.body.append(help, textarea, element("div", { className: "paio-toolbar" }, [apply, clearBtn]));
    return dialog;
  }

  openBulkSplitDialog() {
    this.commitPromptBeforeAction();
    if (this.bulkSplitTextarea) {
      this.bulkSplitTextarea.value = this.currentOutputs().prompt || "";
    }
    openDialog(this.bulkSplitDialog);
  }

  applyBulkSplitText(rawText) {
    if (!Array.isArray(this.sections)) return;
    this.pushUndo();
    const parsed = parseStructuredPrompt(rawText, this.sections);
    this.sections = parsed.sections;
    this.activeSectionId = this.sections[0]?.id || "sec-1";
    this.dirtySectionIds?.clear();
    if (parsed.isJson) {
      this.outputFormat = "json";
    } else if (parsed.wrapBraces || parsed.sections.length > 1 || parsed.sections.some((section) => section.title)) {
      this.outputFormat = "structured";
    }
    this.wrapBraces = parsed.wrapBraces;
    if (parsed.wrapBraces && parsed.sections.some((section) => section.role === "negative")) {
      this.includeNegativeInPrompt = true;
    }
    this.applyBlacklist(this.settings.blacklistAction !== "warn");
    this.rebuildSectionViews();
    this.syncToWidgets();
    this.render();
    if (parsed.errors.length) {
      this.setStatus(t("{count}セクションに分割しましたが構文警告が{errors}件あります", { count: this.sections.length, errors: parsed.errors.length }), true);
    } else {
      this.setStatus(t("{count}セクションに分割しました", { count: this.sections.length }));
    }
  }

  selectSection(sectionId) {
    if (!Array.isArray(this.sections) || this.activeSectionId === sectionId) return;
    this.flushPendingTagToggle?.();
    const prevId = this.activeSectionId;
    if (this.dirtySectionIds?.has(prevId)) {
      this.applyPromptText(prevId);
    }
    this.activeSectionId = sectionId;
    this.renderLimit = MAX_RENDERED_TAGS;
    this.rebuildSectionViews?.();
    this.promptTextarea = this.activeTagPromptTextarea || this.singlePromptTextarea;
    this.persist();
    this.render();
  }

  addSection() {
    if (!Array.isArray(this.sections)) return;
    this.commitPromptBeforeAction();
    this.pushUndo();
    const created = createSection({ title: "", role: "positive" });
    this.sections.push(created);
    this.activeSectionId = created.id;
    this.rebuildSectionViews();
    this.syncToWidgets();
    this.render();
    this.sectionsContainer?.querySelector(`[data-section-id="${created.id}"]`)?.scrollIntoView?.({ block: "nearest" });
    this.addInput?.focus?.();
    this.setStatus(t("セクションを追加しました"));
  }

  removeSection(sectionId) {
    if (!Array.isArray(this.sections) || this.sections.length <= 1) return;
    this.commitPromptBeforeAction();
    this.pushUndo();
    const index = this.sections.findIndex((section) => section.id === sectionId);
    if (index < 0) return;
    this.sections.splice(index, 1);
    this.dirtySectionIds?.delete(sectionId);
    if (this.activeSectionId === sectionId) {
      const next = this.sections[Math.min(index, this.sections.length - 1)];
      this.activeSectionId = next.id;
    }
    this.rebuildSectionViews();
    this.syncToWidgets();
    this.render();
    this.setStatus(t("セクションを削除しました"));
  }

  applySectionTemplate(templateId) {
    if (!Array.isArray(this.sections)) return false;
    const template = SECTION_TEMPLATES.find((item) => item.id === templateId);
    if (!template) return false;
    this.commitPromptBeforeAction();
    this.pushUndo();
    const hasExistingContent = this.sections.some((section) => section.tags.length > 0);
    if (!hasExistingContent) {
      this.sections = template.titles.map((title) => createSection({
        title,
        role: inferSectionRole(title),
      }));
      this.activeSectionId = this.sections[0]?.id || "sec-1";
      this.outputFormat = template.outputFormat;
      this.wrapBraces = template.wrapBraces;
      this.includeNegativeInPrompt = template.includeNegativeInPrompt;
    } else {
      const expanded = [];
      let didSplitExisting = false;
      for (const section of this.sections) {
        if (!section.title && section.tags.length > 0) {
          const raw = this.promptEditorValue(section);
          if (looksLikeStructuredPrompt(raw)) {
            const parsed = parseStructuredPrompt(raw, this.sections);
            expanded.push(...parsed.sections);
            didSplitExisting = true;
            continue;
          }
        }
        if (section.tags.length > 0 || section.title) expanded.push(section);
      }
      const existingTitles = new Set(expanded.map((section) => section.title).filter(Boolean));
      for (const title of template.titles) {
        if (existingTitles.has(title)) continue;
        expanded.push(createSection({ title, role: inferSectionRole(title) }));
        existingTitles.add(title);
      }
      this.sections = expanded.length ? expanded : this.sections;
      if (!this.sections.some((section) => section.id === this.activeSectionId)) {
        this.activeSectionId = this.sections[0]?.id || "sec-1";
      }
      if (didSplitExisting || (this.sections.length === 1 && !this.sections[0].title)) {
        this.outputFormat = template.outputFormat;
      }
    }
    this.rebuildSectionViews();
    this.syncToWidgets();
    this.render();
    this.setStatus(
      hasExistingContent
        ? t("テンプレート「{name}」を追加しました（既存の内容は保持）", { name: t(template.label) })
        : t("テンプレート「{name}」を適用しました", { name: t(template.label) }),
    );
    return true;
  }

  moveSection(sectionId, delta) {
    if (!Array.isArray(this.sections)) return;
    const index = this.sections.findIndex((section) => section.id === sectionId);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= this.sections.length) return;
    this.commitPromptBeforeAction();
    this.pushUndo();
    const [item] = this.sections.splice(index, 1);
    this.sections.splice(target, 0, item);
    this.rebuildSectionViews();
    this.syncToWidgets();
    this.render();
  }

  sectionTranslationPreview(section) {
    if (!section) return "";
    if (section.mode === "prose") {
      return cleanTranslation(section.translation);
    }
    const direct = cleanTranslation(section.translation);
    if (direct) return direct;
    return (section.tags || [])
      .filter((tag) => tag.enabled !== false)
      .map((tag) => cleanTranslation(tag.translation))
      .filter(Boolean)
      .join(", ");
  }

  setAllSectionsEnabled(enabled) {
    if (!Array.isArray(this.sections)) return;
    this.commitPromptBeforeAction();
    this.pushUndo();
    for (const section of this.sections) section.enabled = Boolean(enabled);
    this.rebuildSectionViews();
    this.syncToWidgets();
    this.render();
  }

  setActiveSectionMode(mode) {
    const active = this.activeSection();
    if (!active) return;
    const nextMode = mode === "prose" ? "prose" : "tags";
    if (active.mode === nextMode) return;
    this.commitPromptBeforeAction();
    this.pushUndo();
    if (nextMode === "prose") {
      active.proseText = serializeStructuredSectionBody(active.tags, null, {
        trailingSeparator: active.trailingSeparator,
      });
      const joinedJa = this.sectionTranslationPreview(active);
      if (joinedJa) {
        active.translation = joinedJa;
        active.translatedTo = this.settings.localLanguage;
      }
      active.mode = "prose";
    } else {
      const disabledTags = (active.tags || []).filter((tag) => tag.enabled === false);
      const parsed = parsePrompt(active.proseText || "", (active.tags || []).filter((tag) => tag.enabled !== false));
      active.tags = [...tagsWithoutTrailingPlaceholder(parsed), ...disabledTags];
      active.trailingSeparator = parsed.trailingSeparator;
      active.mode = "tags";
    }
    this.dirtySectionIds?.delete(active.id);
    this.rebuildSectionViews();
    this.syncToWidgets();
    this.render();
  }

  handleProseOrigInput() {
    const active = this.activeSection();
    if (!active || active.mode !== "prose" || !this.proseOrigTextarea) return;
    const text = this.proseOrigTextarea.value;
    const disabledTags = (active.tags || []).filter((tag) => tag.enabled === false);
    active.proseText = text;
    active.tags = [
      ...(text.trim()
        ? [createTag(text.trim(), { translation: active.translation, translatedTo: active.translatedTo })]
        : []),
      ...disabledTags,
    ];
    const card = this.sectionsContainer?.querySelector(`[data-section-id="${active.id}"]`);
    const origEl = card?.querySelector(".paio-section-orig-line");
    if (origEl) origEl.textContent = text.trim() || t("（空 — 右ペインで入力）");
    this.syncToWidgets();
  }

  handleProseJaInput() {
    const active = this.activeSection();
    if (!active || !this.proseJaTextarea) return;
    active.translation = this.proseJaTextarea.value;
    active.translatedTo = active.translation.trim() ? this.settings.localLanguage : "";
    const card = this.sectionsContainer?.querySelector(`[data-section-id="${active.id}"]`);
    const jaEl = card?.querySelector(".paio-section-ja-line");
    if (jaEl) {
      const ja = cleanTranslation(active.translation);
      jaEl.textContent = ja ? t("訳: {text}", { text: ja }) : "";
      jaEl.hidden = !ja || this.settings.showSectionTranslationsInList === false;
    }
    this.persist();
  }

  async translateSectionToLocal(sectionId) {
    const section = this.sections?.find((s) => s.id === sectionId) || this.activeSection();
    if (!section) return;
    if (section.mode === "prose") {
      await this.translateProseSections([section], this.settings.localLanguage, false);
      return;
    }
    if (this.activeSectionId !== section.id) this.selectSection(section.id);
    const indexes = section.tags.map((_t, i) => i);
    await this.translateIndexes(indexes, this.settings.localLanguage);
  }

  async translateAllSectionsToLocal() {
    if (!Array.isArray(this.sections) || !this.sections.length) return;
    this.commitPromptBeforeAction();
    const proseSecs = this.sections.filter((s) => s.mode === "prose" && (s.proseText || "").trim());
    if (proseSecs.length) {
      await this.translateProseSections(proseSecs, this.settings.localLanguage, false);
    }
    const tagSecs = this.sections.filter((s) => s.mode !== "prose" && s.tags?.length);
    if (tagSecs.length) {
      const generation = this.translationGeneration;
      const items = tagSecs.flatMap((sec) => sec.tags.map((tag) => ({ sec, tag, text: translatableTagText(tag.value) })))
        .filter((item) => item.text && !containsJapaneseText(item.text));
      if (items.length) {
        this.setStatus(t("{count}件のタグを日本語訳中…", { count: items.length }));
        const results = await translateTags(this.api, items.map((i) => i.text), {
          provider: this.settings.translationProvider,
          source: "auto",
          target: this.settings.localLanguage,
          catalog: this.settings.libraryFile,
          timeoutMs: translationBatchTimeoutMs(items.length),
          isCancelled: () => this.disposed || generation !== this.translationGeneration,
        });
        items.forEach((item, idx) => {
          const tr = cleanTranslation(results[idx]?.translated);
          if (tr) {
            item.tag.translation = tr;
            item.tag.translatedTo = this.settings.localLanguage;
          }
        });
      }
      this.syncToWidgets();
      this.render();
    }
    this.setStatus(t("全ブロックの日本語訳を更新しました"));
  }

  async translateSectionJaToOriginal(sectionId) {
    const section = this.sections?.find((s) => s.id === sectionId) || this.activeSection();
    if (!section) return;
    if (section.mode === "prose") {
      if (!cleanTranslation(section.translation)) {
        this.setStatus(t("日本語訳欄に入力してから実行してください"), true);
        return;
      }
      await this.translateProseSections([section], "en", true);
      return;
    }
    if (this.activeSectionId !== section.id) this.selectSection(section.id);
    await this.translatePrompt();
  }

  async translateProseSections(targetSections, targetLang, fromTranslationField) {
    const pairs = targetSections
      .map((sec) => ({
        sec,
        sourceText: fromTranslationField ? String(sec.translation || "").trim() : String(sec.proseText || "").trim(),
      }))
      .filter((pair) => pair.sourceText);
    if (!pairs.length) {
      this.setStatus(t("翻訳対象のテキストがありません"));
      return;
    }
    const provider = this.settings.translationProvider === "offline" ? "local" : (this.settings.translationProvider || "local");
    this.setStatus(t("{count}ブロックを翻訳中…", { count: pairs.length }));
    try {
      const results = await translateTags(this.api, pairs.map((p) => p.sourceText), {
        provider,
        source: "auto",
        target: targetLang,
        catalog: this.settings.libraryFile,
        timeoutMs: translationBatchTimeoutMs(pairs.length * 4),
      });
      this.pushUndo();
      let updated = 0;
      pairs.forEach(({ sec }, idx) => {
        const translated = cleanTranslation(results[idx]?.translated);
        if (!translated) return;
        updated += 1;
        if (fromTranslationField) {
          sec.proseText = translated;
          sec.tags = [createTag(translated, { translation: sec.translation, translatedTo: this.settings.localLanguage })];
        } else {
          sec.translation = translated;
          sec.translatedTo = targetLang;
        }
      });
      this.syncToWidgets();
      this.render();
      this.setStatus(updated
        ? t("{count}ブロックを翻訳しました", { count: updated })
        : t("翻訳結果を取得できませんでした（プロバイダー設定を確認してください）"), updated === 0);
    } catch (error) {
      this.setStatus(t("翻訳に失敗しました: {error}", { error: error.message }), true);
    }
  }

  async copyLlmTranslationPrompt() {
    this.commitPromptBeforeAction();
    const body = (this.sections || []).map((section, idx) => {
      const heading = section.title || `【セクション${idx + 1}】`;
      const text = section.mode === "prose"
        ? (section.proseText || "")
        : serializeStructuredSectionBody(section.tags, null, { trailingSeparator: section.trailingSeparator });
      return `${heading}\n${text}`;
    }).join("\n\n");
    const promptTxt = `以下の各見出し（【】や[]）をそのまま保持して、自然で正確な日本語へ翻訳して返してください:\n\n${body}`;
    await copyText(promptTxt);
    this.setStatus(t("外部AI用の見出し保持翻訳プロンプトをコピーしました"));
  }

  applyLlmPastedTranslations(rawText) {
    const raw = String(rawText || "").trim();
    if (!raw) return;
    const parsed = parseStructuredPrompt(raw, []);
    let matchedCount = 0;
    this.pushUndo();
    for (const parsedSec of parsed.sections) {
      const title = String(parsedSec.title || "").trim();
      const body = serializeStructuredSectionBody(parsedSec.tags, null, { trailingSeparator: false }).trim();
      if (!title || !body) continue;
      const target = this.sections.find((sec) => sec.title === title);
      if (!target) continue;
      target.translation = body;
      target.translatedTo = this.settings.localLanguage;
      matchedCount += 1;
    }
    this.persist();
    this.rebuildSectionViews();
    this.render();
    this.setStatus(matchedCount
      ? t("{count}ブロックの日本語訳へ反映しました", { count: matchedCount })
      : t("一致する【見出し】が見つかりませんでした"), matchedCount === 0);
  }

  clearSectionDropTargets() {
    this.sectionsContainer?.querySelectorAll(".paio-section-card")
      .forEach((item) => item.classList.remove("is-drop-target", "is-section-drop-before", "is-section-drop-after"));
  }

  reorderSection(sourceSectionId, targetSectionId, position = "before") {
    if (!Array.isArray(this.sections) || !sourceSectionId || !targetSectionId || sourceSectionId === targetSectionId) {
      return false;
    }
    this.commitPromptBeforeAction();
    const sourceIndex = this.sections.findIndex((section) => section.id === sourceSectionId);
    const targetIndex = this.sections.findIndex((section) => section.id === targetSectionId);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return false;
    this.pushUndo();
    const [moved] = this.sections.splice(sourceIndex, 1);
    const remainingTargetIndex = this.sections.findIndex((section) => section.id === targetSectionId);
    const insertionIndex = remainingTargetIndex + (position === "after" ? 1 : 0);
    this.sections.splice(insertionIndex, 0, moved);
    this.syncToWidgets();
    this.rebuildSectionViews();
    this.render();
    return true;
  }

  canDropTagsOnSection(sectionId) {
    return Boolean(
      Array.isArray(this.dragTagIds)
      && this.dragTagIds.length > 0
      && this.dragSourceSectionId
      && sectionId
      && this.dragSourceSectionId !== sectionId
    );
  }

  moveTagsToSection(tagIds, targetSectionId, sourceSectionId = this.dragSourceSectionId || this.activeSectionId) {
    if (!Array.isArray(this.sections) || !Array.isArray(tagIds) || !tagIds.length) return 0;
    this.commitPromptBeforeAction();
    const sourceSection = this.sections.find((section) => section.id === sourceSectionId) || this.activeSection();
    const targetSection = this.sections.find((section) => section.id === targetSectionId);
    if (!sourceSection || !targetSection || sourceSection.id === targetSection.id) return 0;
    const idSet = new Set(tagIds);
    const movedTags = (sourceSection.tags || []).filter((tag) => idSet.has(tag.id));
    if (!movedTags.length) return 0;
    this.pushUndo();
    sourceSection.tags = (sourceSection.tags || []).filter((tag) => !idSet.has(tag.id));
    if (targetSection.mode === "prose") {
      const enabledTags = movedTags.filter((tag) => tag.enabled !== false);
      const disabledTags = movedTags.filter((tag) => tag.enabled === false);
      const addition = enabledTags.map((tag) => tag.value).filter(Boolean).join(", ");
      const existing = String(targetSection.proseText || "").trim();
      if (addition) {
        if (!existing) targetSection.proseText = addition;
        else if (/[,，。.;；]$/.test(existing)) targetSection.proseText = `${existing} ${addition}`;
        else targetSection.proseText = `${existing}, ${addition}`;
      }
      if (disabledTags.length) {
        targetSection.tags ||= [];
        for (const moved of disabledTags) {
          moved.selected = false;
          targetSection.tags.push(moved);
        }
      }
    } else {
      targetSection.tags ||= [];
      for (const moved of movedTags) {
        moved.selected = false;
        targetSection.tags.push(moved);
      }
    }
    this.lastSelectedIndex = null;
    this.syncToWidgets();
    this.render();
    const targetIndex = Math.max(0, this.sections.indexOf(targetSection));
    const targetLabel = targetSection.title || t("セクション {index}", { index: targetIndex + 1 });
    this.setStatus(t("{count}件のタグを「{section}」へ移動しました", {
      count: movedTags.length,
      section: targetLabel,
    }));
    return movedTags.length;
  }

  rebuildSectionViews() {
    if (!this.promptSingleContainer || !this.sectionsContainer) return;
    this.promptSingleContainer.hidden = true;
    this.sectionsContainer.hidden = false;
    this.sectionTextareas ||= new Map();
    this.sectionTextareas.clear();
    const cards = this.sections.map((section, index) => {
      const isActive = section.id === this.activeSectionId;
      const card = element("section", { className: "paio-section-card" });
      card.dataset.sectionId = section.id;
      card.addEventListener("click", () => this.selectSection(section.id));
      card.addEventListener("dragover", (event) => {
        if (this.dragSectionId && this.dragSectionId !== section.id) {
          event.preventDefault();
          this.clearSectionDropTargets();
          const bounds = card.getBoundingClientRect();
          const position = event.clientY >= bounds.top + bounds.height / 2 ? "after" : "before";
          card.classList.add(position === "after" ? "is-section-drop-after" : "is-section-drop-before");
          if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
          return;
        }
        if (!this.canDropTagsOnSection(section.id)) return;
        event.preventDefault();
        this.clearSectionDropTargets();
        card.classList.add("is-drop-target");
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      });
      card.addEventListener("dragleave", (event) => {
        if (event.relatedTarget && card.contains(event.relatedTarget)) return;
        card.classList.remove("is-drop-target", "is-section-drop-before", "is-section-drop-after");
      });
      card.addEventListener("drop", (event) => {
        if (this.dragSectionId && this.dragSectionId !== section.id) {
          event.preventDefault();
          event.stopPropagation();
          const position = card.classList.contains("is-section-drop-after") ? "after" : "before";
          const sourceSectionId = this.dragSectionId;
          this.dragSectionId = null;
          this.clearSectionDropTargets();
          this.reorderSection(sourceSectionId, section.id, position);
          return;
        }
        if (!this.canDropTagsOnSection(section.id)) return;
        event.preventDefault();
        event.stopPropagation();
        const tagIds = [...this.dragTagIds];
        const sourceId = this.dragSourceSectionId;
        this.clearSectionDropTargets();
        this.dragIndex = null;
        this.dragTagIds = null;
        this.dragSourceSectionId = null;
        this.moveTagsToSection(tagIds, section.id, sourceId);
      });

      const dragHandle = element("span", {
        className: "paio-section-drag-handle",
        text: "⋮⋮",
        title: t("ドラッグしてセクションの順序を入れ替え"),
      });
      dragHandle.draggable = this.sections.length > 1;
      dragHandle.setAttribute("aria-label", t("セクションを並び替え"));
      dragHandle.addEventListener("click", (event) => event.stopPropagation());
      dragHandle.addEventListener("dragstart", (event) => {
        event.stopPropagation();
        this.dragSectionId = section.id;
        this.dragIndex = null;
        this.dragTagIds = null;
        this.dragSourceSectionId = null;
        card.classList.add("is-dragging");
        event.dataTransfer?.setData("text/plain", section.title || section.id);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
      });
      dragHandle.addEventListener("dragend", () => {
        card.classList.remove("is-dragging");
        this.clearSectionDropTargets();
        this.dragSectionId = null;
      });

      const switchBtn = button("", (event) => {
        event.stopPropagation();
        this.commitPromptBeforeAction();
        this.pushUndo();
        section.enabled = section.enabled === false;
        this.syncToWidgets();
        this.render();
      }, t("クリックで出力 ON/OFF を切替"));
      switchBtn.className = `paio-switch-btn ${section.enabled !== false ? "is-on" : ""}`;
      switchBtn.replaceChildren(
        element("span", { className: "paio-switch-dot" }),
        element("span", { text: section.enabled !== false ? "ON" : "OFF" }),
      );

      const titleInput = element("input", { className: "paio-section-title-input" });
      titleInput.type = "text";
      titleInput.value = section.title || "";
      titleInput.placeholder = t("見出し（任意）");
      titleInput.setAttribute("aria-label", t("セクション見出し"));
      if (this.sectionTitleDatalistId) titleInput.setAttribute("list", this.sectionTitleDatalistId);
      titleInput.addEventListener("focus", () => this.selectSection(section.id));
      titleInput.addEventListener("click", (event) => event.stopPropagation());
      titleInput.addEventListener("input", () => {
        section.title = titleInput.value.trim();
        this.syncToWidgets();
        this.renderSectionHeaderSummary();
      });

      const titlePicker = element("select", { className: "paio-select paio-section-title-picker" });
      titlePicker.setAttribute("aria-label", t("セクション見出しを候補から選択"));
      titlePicker.title = t("セクション見出しを候補から選択");
      const pickerPlaceholder = element("option", { text: t("候補…") });
      pickerPlaceholder.value = "";
      titlePicker.append(pickerPlaceholder);
      for (const group of SECTION_HEADING_GROUPS) {
        const optgroup = element("optgroup");
        optgroup.label = t(group.label);
        for (const item of group.items) {
          const option = element("option", { text: item });
          option.value = item;
          optgroup.append(option);
        }
        titlePicker.append(optgroup);
      }
      titlePicker.addEventListener("focus", () => this.selectSection(section.id));
      titlePicker.addEventListener("click", (event) => event.stopPropagation());
      titlePicker.addEventListener("change", () => {
        const chosen = titlePicker.value;
        titlePicker.value = "";
        if (!chosen) return;
        this.commitPromptBeforeAction();
        this.pushUndo();
        section.title = chosen;
        section.role = inferSectionRole(chosen);
        titleInput.value = chosen;
        this.syncToWidgets();
        this.render();
      });

      const modeBadge = element("span", {
        className: `paio-section-mode-badge ${section.mode === "prose" ? "is-prose" : "is-tags"}`,
        text: section.mode === "prose" ? t("散文") : t("タグ"),
      });

      const roleBtn = button(section.role === "negative" ? "Neg" : "Pos", (event) => {
        event.stopPropagation();
        this.commitPromptBeforeAction();
        this.pushUndo();
        section.role = section.role === "negative" ? "positive" : "negative";
        this.syncToWidgets();
        this.render();
      }, t("クリックで Positive / Negative を切替"));
      roleBtn.classList.add("paio-section-role");

      const socketBtn = button("IN", (event) => {
        event.stopPropagation();
        this.commitPromptBeforeAction();
        this.pushUndo();
        section.socketInput = !section.socketInput;
        this.syncToWidgets();
        this.render();
      }, t("このセクション名で入力ソケットを表示/非表示"));
      socketBtn.classList.add("paio-section-socket-btn");
      socketBtn.classList.toggle("is-active", Boolean(section.socketInput));
      socketBtn.setAttribute("aria-pressed", String(Boolean(section.socketInput)));

      const outSocketBtn = button("OUT", (event) => {
        event.stopPropagation();
        this.commitPromptBeforeAction();
        this.pushUndo();
        section.socketOutput = !section.socketOutput;
        this.syncToWidgets();
        this.render();
      }, t("このセクション名で出力ソケットを表示/非表示"));
      outSocketBtn.classList.add("paio-section-out-btn");
      outSocketBtn.classList.toggle("is-active", Boolean(section.socketOutput));
      outSocketBtn.setAttribute("aria-pressed", String(Boolean(section.socketOutput)));

      const delBtn = button("×", (event) => { event.stopPropagation(); this.removeSection(section.id); }, t("セクションを削除"));
      delBtn.disabled = this.sections.length <= 1;

      const header = element("div", { className: "paio-section-card-header" }, [
        dragHandle,
        switchBtn,
        titleInput,
        titlePicker,
        modeBadge,
        roleBtn,
        socketBtn,
        outSocketBtn,
        delBtn,
      ]);
      card.append(header);

      const jaPreviewText = this.sectionTranslationPreview(section);
      const showJa = this.settings.showSectionTranslationsInList !== false;
      const origText = section.mode === "prose"
        ? String(section.proseText || "").trim()
        : this.promptEditorValue(section).trim();
      const origLine = element("div", {
        className: "paio-section-orig-line",
        text: origText || t("（空 — クリックして編集）"),
      });
      const jaLine = element("div", {
        className: "paio-section-ja-line",
        text: jaPreviewText ? t("訳: {text}", { text: jaPreviewText }) : "",
      });
      jaLine.hidden = !showJa || !jaPreviewText;
      card.append(element("div", { className: "paio-section-summary" }, [origLine, jaLine]));
      return card;
    });
    this.sectionsContainer.replaceChildren(...cards);
    this.promptTextarea = this.activeTagPromptTextarea || this.singlePromptTextarea;
  }

  renderSectionHeaderSummary() {
    if (!this.currentTagsSummaryTitle) return;
    if (!this.isMultiSectionView()) {
      this.currentTagsSummaryTitle.textContent = t("現在のタグ");
      return;
    }
    const active = this.activeSection();
    const index = Math.max(0, this.sections.indexOf(active));
    const label = active?.title || t("セクション {index}", { index: index + 1 });
    const roleTag = active?.role === "negative" ? "Neg" : "Pos";
    this.currentTagsSummaryTitle.textContent = t("現在のタグ — {section} [{role}]", { section: label, role: roleTag });
  }

  buildIoDialog() {
    const dialog = this.buildDialog("コピー・インポート・エクスポート");
    const file = element("input");
    file.type = "file";
    file.accept = ".txt,.json,text/plain,application/json";
    file.addEventListener("change", async () => {
      const selected = file.files?.[0];
      if (!selected) return;
      if (selected.size > 1024 * 1024) return this.setStatus(t("ファイルは1 MB以下にしてください"), true);
      const text = await selected.text();
      this.pushUndo();
      try {
        if (selected.name.toLocaleLowerCase().endsWith(".json")) {
          const state = parseImportedState(text);
          if (Array.isArray(this.sections)) {
            this.sections = state.sections.map((section) => createSection(section));
            this.activeSectionId = state.activeSectionId;
            this.outputFormat = state.outputFormat;
            this.wrapBraces = state.wrapBraces;
            this.includeNegativeInPrompt = state.includeNegativeInPrompt;
          } else {
            this.tags = state.tags.map((tag) => createTag(tag.value, tag));
            this.trailingSeparator = state.trailingSeparator;
          }
          this.settings = state.settings;
        } else if (Array.isArray(this.sections) && looksLikeStructuredPrompt(text)) {
          const parsed = parseStructuredPrompt(text, this.sections);
          this.sections = parsed.sections;
          this.activeSectionId = this.sections[0]?.id || "sec-1";
          this.outputFormat = "structured";
          this.wrapBraces = parsed.wrapBraces;
          this.includeNegativeInPrompt = parsed.sections.some((section) => section.role === "negative");
        } else {
          const parsed = parsePrompt(text);
          if (Array.isArray(this.sections)) {
            this.sections = [createSection({
              id: "sec-1",
              trailingSeparator: parsed.trailingSeparator,
              tags: tagsWithoutTrailingPlaceholder(parsed),
            })];
            this.activeSectionId = "sec-1";
            this.outputFormat = "tags";
            this.wrapBraces = false;
            this.includeNegativeInPrompt = false;
          } else {
            this.tags = tagsWithoutTrailingPlaceholder(parsed);
            this.trailingSeparator = parsed.trailingSeparator;
          }
        }
        this.dirtySectionIds?.clear();
        this.promptDirty = false;
        this.translationGeneration += 1;
        this.translationBusy = false;
        const favorites = this.currentFavoriteSettings();
        const operations = ["favorites", "favoriteTagSets"].flatMap((kind) =>
          favorites[kind].map((key) => ({ kind, key, favorite: true })));
        this.rebuildControls();
        if (operations.length) this.saveSharedFavorites(operations);
        this.applyBlacklist(this.settings.blacklistAction !== "warn");
        this.syncToWidgets();
        this.render();
        this.refreshSettingsFileStatus?.();
        closeDialog(dialog);
        this.setStatus(t("インポートしました"));
      } catch (error) {
        this.setStatus(error.message, true);
      }
    });
    const controls = [
      button(t("プロンプトをコピー"), () => this.copyPrompt()),
      button(t("表示言語込みで選択をコピー"), () => this.copySelected(true)),
      button(t("選択を英語でコピー"), () => this.copySelectedLanguage("en")),
      button(t("TXTを書き出す"), () => download("prompt.txt", this.currentOutputs().prompt, "text/plain;charset=utf-8")),
      button(t("状態JSONを書き出す"), () => download("prompt_workbench_state.json", exportEditorState({
        tags: this.tags,
        trailingSeparator: this.trailingSeparator,
        ...(Array.isArray(this.sections)
          ? {
              sections: this.sections,
              activeSectionId: this.activeSectionId,
              outputFormat: this.outputFormat,
              wrapBraces: this.wrapBraces,
              includeNegativeInPrompt: this.includeNegativeInPrompt,
            }
          : {}),
        settings: this.settings,
      }), "application/json;charset=utf-8")),
    ];
    dialog.body.append(file, element("div", { className: "paio-toolbar" }, controls));
    return dialog;
  }

  render() {
    this.applyCustomColors();
    if (Array.isArray(this.sections) && this.sectionsContainer) {
      const enabledSections = this.sections.filter((section) => section.enabled !== false).length;
      if (this.sectionCountLabel) {
        this.sectionCountLabel.textContent = t("{enabled}/{total} 有効", {
          enabled: enabledSections,
          total: this.sections.length,
        });
      }
      const showJa = this.settings.showSectionTranslationsInList !== false;
      for (const section of this.sections) {
        const card = this.sectionsContainer.querySelector(`[data-section-id="${section.id}"]`);
        if (card) {
          card.classList.toggle("is-active", section.id === this.activeSectionId);
          card.classList.toggle("is-disabled", section.enabled === false);
          card.classList.toggle("is-negative", section.role === "negative");
          const switchBtn = card.querySelector(".paio-switch-btn");
          if (switchBtn) {
            const on = section.enabled !== false;
            switchBtn.classList.toggle("is-on", on);
            const labelEl = switchBtn.querySelector("span:last-child");
            if (labelEl) labelEl.textContent = on ? "ON" : "OFF";
          }
          const modeBadge = card.querySelector(".paio-section-mode-badge");
          if (modeBadge) {
            modeBadge.classList.toggle("is-prose", section.mode === "prose");
            modeBadge.classList.toggle("is-tags", section.mode !== "prose");
            modeBadge.textContent = section.mode === "prose" ? t("散文") : t("タグ");
          }
          const roleBtn = card.querySelector(".paio-section-role");
          if (roleBtn) {
            roleBtn.textContent = section.role === "negative" ? "Neg" : "Pos";
            roleBtn.classList.toggle("is-negative", section.role === "negative");
          }
          const socketBtn = card.querySelector(".paio-section-socket-btn");
          if (socketBtn) {
            const hasSocket = Boolean(section.socketInput);
            socketBtn.classList.toggle("is-active", hasSocket);
            socketBtn.setAttribute("aria-pressed", String(hasSocket));
          }
          const outSocketBtn = card.querySelector(".paio-section-out-btn");
          if (outSocketBtn) {
            const hasOutSocket = Boolean(section.socketOutput);
            outSocketBtn.classList.toggle("is-active", hasOutSocket);
            outSocketBtn.setAttribute("aria-pressed", String(hasOutSocket));
          }
          const origLine = card.querySelector(".paio-section-orig-line");
          if (origLine) {
            const origText = section.mode === "prose"
              ? String(section.proseText || "").trim()
              : this.promptEditorValue(section).trim();
            origLine.textContent = origText || t("（空 — クリックして編集）");
          }
          const jaLine = card.querySelector(".paio-section-ja-line");
          if (jaLine) {
            const jaText = this.sectionTranslationPreview(section);
            jaLine.textContent = jaText ? t("訳: {text}", { text: jaText }) : "";
            jaLine.hidden = !showJa || !jaText;
          }
        }
      }
      const activeForText = this.activeSection();
      if (this.activeTagPromptTextarea && activeForText && !this.dirtySectionIds?.has(activeForText.id)) {
        this.activeTagPromptTextarea.value = this.promptEditorValue(activeForText);
      }
      this.promptTextarea = this.activeTagPromptTextarea || this.singlePromptTextarea;
    } else if (!this.promptDirty && this.promptTextarea) {
      this.promptTextarea.value = this.promptEditorValue();
    }

    const active = this.activeSection();
    if (this.activeSectionTitleLabel && active) {
      const idx = Math.max(0, (this.sections || []).indexOf(active));
      const label = active.title || t("セクション {index}", { index: idx + 1 });
      const roleTag = active.role === "negative" ? "Negative" : "Positive";
      this.activeSectionTitleLabel.textContent = t("編集中: {section}（{role}）", { section: label, role: roleTag });
    }
    const activeMode = active?.mode === "prose" ? "prose" : "tags";
    for (const [modeVal, btn] of this.sectionModeButtons || []) {
      const isSelected = modeVal === activeMode;
      btn.classList.toggle("is-active", isSelected);
      btn.setAttribute("aria-pressed", String(isSelected));
    }
    if (this.proseWorkspace) this.proseWorkspace.hidden = activeMode !== "prose";
    if (this.tagsWorkspace) this.tagsWorkspace.hidden = activeMode === "prose";
    if (activeMode === "prose" && active) {
      if (this.proseOrigTextarea && document.activeElement !== this.proseOrigTextarea) {
        this.proseOrigTextarea.value = active.proseText || "";
      }
      if (this.proseJaTextarea && document.activeElement !== this.proseJaTextarea) {
        this.proseJaTextarea.value = active.translation || "";
      }
    }

    this.renderSectionToolbar();
    this.renderSectionHeaderSummary();
    this.renderSyncState();
    this.renderTranslationControls();
    this.renderBulk();
    this.renderTags();
  }

  renderSectionToolbar() {
    const format = this.outputFormat || "tags";
    for (const [value, control] of this.outputFormatButtons || []) {
      const active = value === format;
      control.classList.toggle("is-active", active);
      control.setAttribute("aria-pressed", String(active));
    }
    if (this.wrapBracesToggle) {
      this.wrapBracesToggle.hidden = format !== "structured";
      this.wrapBracesToggle.classList.toggle("is-active", Boolean(this.wrapBraces));
      this.wrapBracesToggle.setAttribute("aria-pressed", String(Boolean(this.wrapBraces)));
    }
    if (this.includeNegativeToggle) {
      const hasNegative = Array.isArray(this.sections) && this.sections.some((section) => section.role === "negative");
      this.includeNegativeToggle.hidden = !hasNegative;
      this.includeNegativeToggle.classList.toggle("is-active", Boolean(this.includeNegativeInPrompt));
      this.includeNegativeToggle.setAttribute("aria-pressed", String(Boolean(this.includeNegativeInPrompt)));
    }
  }

  renderSyncState() {
    const anyDirty = (this.dirtySectionIds?.size || 0) > 0 || Boolean(this.promptDirty);
    if (this.syncBadge) {
      this.syncBadge.textContent = t(anyDirty ? "未反映" : "同期済み");
      this.syncBadge.classList.toggle("is-dirty", anyDirty);
    }
    if (this.applyPromptButton) {
      this.applyPromptButton.disabled = !this.promptDirty;
    }
    if (this.activeSectionApplyButton) {
      this.activeSectionApplyButton.disabled = !this.dirtySectionIds?.has(this.activeSectionId);
    }
    if (this.sectionsContainer && Array.isArray(this.sections)) {
      for (const section of this.sections) {
        const card = this.sectionsContainer.querySelector(`[data-section-id="${section.id}"]`);
        const isDirty = Boolean(this.dirtySectionIds?.has(section.id));
        card?.classList.toggle("is-dirty", isDirty);
      }
    }
  }

  applyPromptText(targetSectionId = null) {
    if (!Array.isArray(this.sections)) {
      if (!this.promptTextarea || !this.promptDirty) return;
      this.pushUndo();
      const previousTags = this.currentTags;
      const parsed = parsePrompt(this.promptTextarea.value, previousTags.filter((tag) => tag.enabled !== false));
      const nextTags = tagsWithoutTrailingPlaceholder(parsed);
      const survivingIds = new Set(nextTags.map((tag) => tag.id));
      const disabledBefore = new Map();
      let anchorId = null;
      for (let index = previousTags.length - 1; index >= 0; index -= 1) {
        const tag = previousTags[index];
        if (tag.enabled === false) {
          if (!disabledBefore.has(anchorId)) disabledBefore.set(anchorId, []);
          disabledBefore.get(anchorId).push(tag);
        } else if (survivingIds.has(tag.id)) {
          anchorId = tag.id;
        }
      }
      this.tags = nextTags.flatMap((tag) => [...(disabledBefore.get(tag.id) || []).reverse(), tag]);
      this.tags.push(...(disabledBefore.get(null) || []).reverse());
      this.trailingSeparator = parsed.trailingSeparator;
      this.promptDirty = false;
      this.applyBlacklist(this.settings.blacklistAction !== "warn");
      this.syncToWidgets();
      this.render();
      if (parsed.errors.length) this.setStatus(t("本文を反映しましたが構文警告が{count}件あります", { count: parsed.errors.length }), true);
      else this.setStatus(t("本文をタグへ反映しました"));
      if (this.settings.autoTranslate) this.translatePrompt();
      return;
    }

    const sectionId = targetSectionId || this.activeSectionId;
    const section = this.sections.find((item) => item.id === sectionId);
    const textarea = this.activeTagPromptTextarea || this.promptTextarea;
    if (!section || !textarea || !this.dirtySectionIds?.has(sectionId)) return;

    const rawText = textarea.value;
    const otherSectionsEmpty = this.sections.every((item) => item.id === sectionId || item.tags.length === 0);
    if (otherSectionsEmpty && !section.title && looksLikeStructuredPrompt(rawText)
      || (this.sections.every((item) => item.tags.length === 0) && looksLikeStructuredPrompt(rawText))) {
      this.applyBulkSplitText(rawText);
      return;
    }

    this.pushUndo();
    const previousTags = section.tags;
    const parsed = parsePrompt(rawText, previousTags.filter((tag) => tag.enabled !== false));
    const nextTags = tagsWithoutTrailingPlaceholder(parsed);
    const survivingIds = new Set(nextTags.map((tag) => tag.id));
    const disabledBefore = new Map();
    let anchorId = null;
    // Keep hidden tags beside the next surviving tag without parsing them again.
    for (let index = previousTags.length - 1; index >= 0; index -= 1) {
      const tag = previousTags[index];
      if (tag.enabled === false) {
        if (!disabledBefore.has(anchorId)) disabledBefore.set(anchorId, []);
        disabledBefore.get(anchorId).push(tag);
      } else if (survivingIds.has(tag.id)) {
        anchorId = tag.id;
      }
    }
    section.tags = nextTags.flatMap((tag) => [...(disabledBefore.get(tag.id) || []).reverse(), tag]);
    section.tags.push(...(disabledBefore.get(null) || []).reverse());
    section.trailingSeparator = parsed.trailingSeparator;
    this.dirtySectionIds.delete(sectionId);
    this.applyBlacklist(this.settings.blacklistAction !== "warn");
    this.syncToWidgets();
    this.render();
    if (parsed.errors.length) this.setStatus(t("本文を反映しましたが構文警告が{count}件あります", { count: parsed.errors.length }), true);
    else this.setStatus(t("本文をタグへ反映しました"));
    if (this.settings.autoTranslate && sectionId === this.activeSectionId) this.translatePrompt();
  }

  commitPromptBeforeAction() {
    if (Array.isArray(this.sections) && this.dirtySectionIds?.size) {
      for (const sectionId of [...this.dirtySectionIds]) {
        this.applyPromptText(sectionId);
      }
      return;
    }
    if (this.promptDirty) this.applyPromptText();
  }

  renderTranslationControls() {
    const mode = this.settings.translationDisplay || "original";
    for (const [value, control] of this.translationDisplayButtons || []) {
      const active = value === mode;
      control.classList.toggle("is-active", active);
      control.setAttribute("aria-pressed", String(active));
    }
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
      button(t("{count}件選択", { count: selected.length }), () => this.clearSelection()),
      button(t("有効"), () => this.bulkMutate((tag) => { tag.enabled = true; })),
      button(t("無効"), () => this.bulkMutate((tag) => { tag.enabled = false; })),
      button("＋", () => this.bulkWeight(1), t("重みを上げる")),
      button("－", () => this.bulkWeight(-1), t("重みを下げる")),
      button(t("コピー"), () => this.copySelected(false)),
      button(t("削除"), () => this.deleteSelected()),
    ];
    this.bulkBar.append(...actions);
  }

  filteredTags() {
    const duplicates = findDuplicateKeys(this.currentTags);
    const query = this.filterText.trim().toLocaleLowerCase();
    return this.currentTags.map((tag, index) => ({ tag, index })).filter(({ tag }) => {
      const haystack = `${tag.value} ${cleanTranslation(tag.translation)}`.toLocaleLowerCase();
      if (query && !haystack.includes(query)) return false;
      if (this.settings.showFavoritesOnly && !this.isFavoriteValue(tag.value)) return false;
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
    this.tagSummary.textContent = t("{total}件中 {disabled}件無効", { total: this.currentTags.length, disabled: disabledCount });
    const duplicates = findDuplicateKeys(this.currentTags);
    for (const { tag, index } of rows.slice(0, this.renderLimit)) {
      const duplicate = duplicates.has(canonicalTagKey(tag.value));
      this.tagList.append(this.renderTag(tag, index, duplicate));
    }
    if (!rows.length) {
      const message = this.currentTags.length
        ? t("検索・絞り込みに一致するタグはありません")
        : t("プロンプトがありません。上の本文へ入力するか、下のタグ追加から選んでください");
      this.tagList.append(element("p", { className: "paio-empty", text: message }));
    } else if (rows.length > this.renderLimit) {
      this.tagList.append(button(t("さらに表示（残り {count}）", { count: rows.length - this.renderLimit }), () => {
        this.renderLimit += MAX_RENDERED_TAGS;
        this.renderTags();
      }));
    }
    if (this.activeSection()?.mode !== "prose") {
      this.scheduleTagDbCheck();
    }
  }

  scheduleTagDbCheck() {
    clearTimeout(this.tagDbTimer);
    this.tagDbTimer = window.setTimeout(() => this.checkTagDb(), TAG_DB_CHECK_DELAY_MS);
  }

  async checkTagDb() {
    if (!this.tagDbStates) return;
    const pending = [...new Set(this.currentTags.filter((tag) => tag.type === "normal").map((tag) => promptBody(tag.value)))]
      .filter((value) => value && !containsJapaneseText(value) && !this.tagDbStates.has(value));
    if (!pending.length) return;
    const results = await validateTagDb(this.api, pending.slice(0, TAG_DB_CHECK_BATCH));
    if (!results) {
      this.tagDbStates = null;
      return;
    }
    for (const result of results) this.tagDbStates.set(result.tag, result);
    if (results.some((result) => result.state === "alias")) this.renderTags();
    else if (pending.length > TAG_DB_CHECK_BATCH) this.scheduleTagDbCheck();
  }

  replaceWithPreferredTag(index, preferred) {
    const tag = this.currentTags[index];
    if (!tag) return;
    this.pushUndo();
    tag.value = replacePromptBody(tag.value, preferred);
    tag.translation = "";
    tag.translatedTo = "";
    tag.translationError = "";
    tag.translationErrorTarget = "";
    tag.type = classifyTag(tag.value);
    this.applyBlacklist(this.settings.blacklistAction !== "warn");
    this.syncToWidgets();
    this.render();
    this.setStatus(t("{tag} に置き換えました", { tag: preferred }));
  }

  renderTag(tag, index, duplicate) {
    const row = element("div", { className: "paio-tag", dataset: { type: tag.type, tagIndex: index } });
    const key = categoryPromptKey(canonicalTagKey(tag.value));
    applyCategoryColor(row, this.colorTagIndex?.get(key) || "", this.settings.categoryColors);
    row.setAttribute("role", "button");
    row.setAttribute("aria-pressed", String(tag.enabled));
    const translation = cleanTranslation(tag.translation);
    const { primary: primaryText, secondary: secondaryText } = getTagDisplayText(tag, this.settings);
    row.setAttribute("aria-label", t("{primary}{translation}、{state}", {
      primary: primaryText,
      translation: secondaryText ? t("、翻訳 {translation}", { translation: secondaryText }) : "",
      state: t(tag.enabled ? "有効" : "無効"),
    }));
    row.tabIndex = 0;
    row.draggable = true;
    row.classList.toggle("is-disabled", !tag.enabled);
    row.classList.toggle("is-selected", tag.selected);
    row.classList.toggle("is-duplicate", duplicate);
    row.classList.toggle("is-blacklisted", tag.blacklistMatch);
    row.classList.toggle("is-missing", tag.missingModel);
    row.classList.toggle("has-error", Boolean(tag.translationError));
    row.classList.toggle("is-favorite", this.isFavoriteValue(tag.value));
    const notices = [];
    if (duplicate) notices.push(t("重複"));
    if (tag.blacklistMatch) notices.push(t("ブラックリスト一致"));
    if (tag.missingModel) notices.push(t("モデルが見つかりません"));
    if (tag.translationError) notices.push(tag.translationError);
    const tagDbState = this.tagDbStates?.get(promptBody(tag.value));
    const preferred = tagDbState?.state === "alias" ? tagDbState.preferred : "";
    if (preferred) notices.push(t("別名です。推奨: {tag}", { tag: preferred }));
    const tagDbNote = tagDbState?.state === "unknown" ? t("タグDBに未登録") : "";
    const selectMark = element("span", { className: "paio-select-mark", text: tag.selected ? "✓" : "" });
    selectMark.setAttribute("aria-hidden", "true");
    const stateMark = element("span", { className: "paio-state-mark", text: this.isFavoriteValue(tag.value) ? "★" : "☆" });
    stateMark.setAttribute("aria-hidden", "true");
    const content = element("span", { className: "paio-tag-content" }, [
      element("span", { className: "paio-tag-label", text: primaryText }),
    ]);
    if (secondaryText) content.append(element("span", { className: "paio-tag-translation", text: secondaryText }));
    const warning = notices.length ? element("span", { className: "paio-tag-warning", text: "!", title: notices.join(" / ") }) : null;
    const preferredButton = preferred ? button(`→ ${preferred}`, (event) => {
      event.stopPropagation();
      clearTimeout(this.clickTimer);
      this.replaceWithPreferredTag(index, preferred);
    }, t("{tag} に置き換える", { tag: preferred })) : null;
    preferredButton?.classList.add("paio-tag-preferred");
    appendPresentChildren(row, selectMark, stateMark, content, preferredButton, warning);

    row.title = [translation, ...notices, tagDbNote, t("クリック: 有効/無効、ダブルクリック: 編集、右クリック: 詳細操作、Shift+ドラッグ: 矩形選択、Shift/Ctrl+クリック: 複数選択")].filter(Boolean).join("\n");

    row.addEventListener("click", (event) => {
      if (this.didDrag || this.didMarqueeDrag) {
        this.didDrag = false;
        this.didMarqueeDrag = false;
        return;
      }
      if (event.shiftKey || event.ctrlKey || event.metaKey) {
        this.cancelPendingTagToggle();
        this.selectIndex(index, event.shiftKey, event.ctrlKey || event.metaKey);
        return;
      }
      this.scheduleTagToggle(this.activeSectionId || null, tag.id);
    });
    row.addEventListener("dblclick", (event) => {
      event.preventDefault();
      this.cancelPendingTagToggle();
      this.beginInlineEdit(row, tag, index);
    });
    row.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.cancelPendingTagToggle();
      this.showContextMenu(event, tag, index);
    });
    row.addEventListener("pointerdown", (event) => {
      if (event.button !== 2) return;
      event.preventDefault();
      event.stopPropagation();
      this.cancelPendingTagToggle();
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
      if (event.shiftKey || this.didMarqueeDrag) {
        event.preventDefault();
        return;
      }
      this.dragIndex = index;
      const selectedTags = tag.selected ? this.currentTags.filter((item) => item.selected) : [];
      this.dragTagIds = selectedTags.length > 0 ? selectedTags.map((item) => item.id) : [tag.id];
      this.dragSourceSectionId = this.activeSectionId || null;
      this.didDrag = true;
      row.classList.add("is-dragging");
      const transferText = selectedTags.length > 0
        ? selectedTags.map((item) => item.value).join(", ")
        : tag.value;
      event.dataTransfer?.setData("text/plain", transferText);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    });
    row.addEventListener("dragend", () => {
      row.classList.remove("is-dragging");
      this.tagList.querySelectorAll(".paio-tag").forEach((item) => item.classList.remove("is-drop-before", "is-drop-after"));
      this.clearSectionDropTargets();
      this.dragIndex = null;
      this.dragTagIds = null;
      this.dragSourceSectionId = null;
      window.setTimeout(() => { this.didDrag = false; }, 0);
    });
    row.addEventListener("dragover", (event) => {
      if (this.dragIndex === null || this.dragIndex === index) return;
      event.preventDefault();
      this.tagList.querySelectorAll(".paio-tag").forEach((item) => item.classList.remove("is-drop-before", "is-drop-after"));
      const bounds = row.getBoundingClientRect();
      const position = event.clientX >= bounds.left + bounds.width / 2 ? "after" : "before";
      row.classList.add(position === "after" ? "is-drop-after" : "is-drop-before");
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    });
    row.addEventListener("drop", (event) => {
      event.preventDefault();
      if (this.dragIndex === null || this.dragIndex === index) return;
      const position = row.classList.contains("is-drop-after") ? "after" : "before";
      const movedId = this.currentTags[this.dragIndex]?.id;
      const targetId = this.currentTags[index]?.id;
      this.commitPromptBeforeAction();
      const movedIndex = this.currentTags.findIndex((item) => item.id === movedId);
      const targetIndex = this.currentTags.findIndex((item) => item.id === targetId);
      if (movedIndex < 0 || targetIndex < 0 || movedIndex === targetIndex) return;
      this.pushUndo();
      const [moved] = this.currentTags.splice(movedIndex, 1);
      const remainingTargetIndex = this.currentTags.findIndex((item) => item.id === targetId);
      const insertionIndex = remainingTargetIndex + (position === "after" ? 1 : 0);
      this.currentTags.splice(insertionIndex, 0, moved);
      this.clearSectionDropTargets();
      this.dragIndex = null;
      this.dragTagIds = null;
      this.dragSourceSectionId = null;
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
    editor.setAttribute("aria-label", t("タグを編集"));
    let finished = false;
    const finish = (save) => {
      if (finished) return;
      finished = true;
      if (save && editor.value.trim() !== tag.value) {
        this.pushUndo();
        tag.value = editor.value.trim();
        tag.translation = "";
        tag.translatedTo = "";
        tag.translationError = "";
        tag.translationErrorTarget = "";
        tag.type = classifyTag(tag.value);
        this.applyBlacklist(this.settings.blacklistAction !== "warn");
        this.syncToWidgets();
      }
      this.render();
    };
    editor.addEventListener("click", (event) => event.stopPropagation());
    editor.addEventListener("dblclick", (event) => event.stopPropagation());
    editor.addEventListener("keydown", (event) => {
      event.stopPropagation();
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
    const title = element("strong", { className: "paio-context-title", text: tag.value || t("空タグ") });
    const selectedCount = tag.selected ? this.currentTags.filter((item) => item.selected).length : 0;
    const currentWeight = getTagWeight(tag.value);
    const weightLabel = tag.type === "lora" ? t("LoRA強度") : tag.type === "lycoris" ? t("LyCORIS強度") : t("重み");
    const weightInput = element("input", { className: "paio-context-weight-input" });
    weightInput.type = "number";
    weightInput.min = String(this.settings.weightMin);
    weightInput.max = String(this.settings.weightMax);
    weightInput.step = String(this.settings.weightStep);
    weightInput.value = currentWeight === null ? "" : currentWeight.toFixed(2);
    weightInput.inputMode = "decimal";
    weightInput.disabled = currentWeight === null;
    weightInput.setAttribute("aria-label", weightLabel);
    const applyWeight = (requestedWeight) => {
      const appliedWeight = this.setWeightOne(index, requestedWeight);
      if (appliedWeight === null) return;
      weightInput.value = appliedWeight.toFixed(2);
      title.textContent = this.currentTags[index]?.value || t("空タグ");
    };
    const weightButton = (label, requestedWeight, ariaLabel) => {
      const control = button(label, () => applyWeight(requestedWeight()));
      control.className = "paio-context-weight-button";
      control.disabled = currentWeight === null;
      control.setAttribute("aria-label", ariaLabel);
      return control;
    };
    const weightControls = element("div", { className: "paio-context-weight-controls" }, [
      weightButton("−", () => Number(weightInput.value) - this.settings.weightStep, t("重みを下げる")),
      weightInput,
      weightButton("＋", () => Number(weightInput.value) + this.settings.weightStep, t("重みを上げる")),
    ]);
    const resetWeight = weightButton(t("1.00へ戻す"), () => 1, t("重みを1.00へ戻す"));
    resetWeight.classList.add("is-reset");
    const weightPanel = element("div", { className: "paio-context-weight" }, [
      element("span", {
        className: "paio-context-weight-label",
        text: currentWeight === null
          ? t("{label}（タグ編集で変更）", { label: weightLabel })
          : t("{label}・刻み {step}", { label: weightLabel, step: this.settings.weightStep }),
      }),
      weightControls,
      resetWeight,
    ]);
    weightPanel.setAttribute("role", "group");
    weightPanel.setAttribute("aria-label", t("{label}を変更", { label: weightLabel }));
    const commitWeightInput = () => {
      const requestedWeight = weightInput.valueAsNumber;
      if (Number.isFinite(requestedWeight)) applyWeight(requestedWeight);
      else weightInput.value = (getTagWeight(this.currentTags[index]?.value) ?? 1).toFixed(2);
    };
    weightInput.addEventListener("change", commitWeightInput);
    weightInput.addEventListener("keydown", (inputEvent) => {
      if (inputEvent.key === "Enter") {
        inputEvent.preventDefault();
        commitWeightInput();
        weightInput.select();
      }
    });
    menu.append(
      title,
      weightPanel,
      action(t(this.isFavoriteValue(tag.value) ? "お気に入りから削除" : "お気に入りに追加"), () => {
        const current = this.currentTags[index]?.value || tag.value;
        this.setFavoriteValue(current, !this.isFavoriteValue(current));
        this.setStatus(t("お気に入りを更新しました"));
      }),
      action(t("編集"), () => {
        const row = [...this.tagList.children].find((item) => item.dataset?.tagIndex === String(index));
        if (row) this.beginInlineEdit(row, tag, index);
      }),
      action(t("英語へ翻訳"), () => this.translateIndexes([index], "en")),
      action(t("日本語へ翻訳"), () => this.translateIndexes([index], this.settings.localLanguage)),
      action(t(tag.enabled ? "無効にする" : "有効にする"), () => this.toggleOne(index)),
      selectedCount > 1
        ? action(t("{count}件をコピー", { count: selectedCount }), () => this.copySelected(false))
        : action(t("コピー"), async () => { await copyText(tag.value); this.setStatus(t("タグをコピーしました")); }),
      action(t("削除"), () => this.deleteOneById(tag.id), "is-danger"),
    );
    menu.style.left = `${Math.max(6, Math.min(event.clientX, window.innerWidth - 246))}px`;
    menu.style.top = `${Math.max(6, Math.min(event.clientY, window.innerHeight - 420))}px`;
    document.body.append(menu);
    this.contextMenu = menu;
    window.setTimeout(() => {
      this.contextMenuAbort = new AbortController();
      document.addEventListener("pointerdown", (pointerEvent) => {
        if (!menu.contains(pointerEvent.target)) {
          commitWeightInput();
          this.closeContextMenu();
        }
      }, { capture: true, signal: this.contextMenuAbort.signal });
      document.addEventListener("keydown", (keyEvent) => {
        if (keyEvent.key === "Escape") this.closeContextMenu();
      }, { signal: this.contextMenuAbort.signal });
    }, 0);
  }

  showFavoriteContextMenu(event, value) {
    this.closeContextMenu();
    const favorite = this.isFavoriteValue(value);
    const menu = element("div", { className: "paio-context-menu paio-favorite-context-menu" });
    menu.setAttribute("role", "menu");
    const title = element("strong", { className: "paio-context-title", text: value || t("空タグ") });
    const action = button(t(favorite ? "お気に入りから削除" : "お気に入りに追加"), () => {
      this.closeContextMenu();
      this.setFavoriteValue(value, !favorite);
      this.setStatus(t("お気に入りを更新しました"));
    });
    action.className = "paio-context-action";
    action.setAttribute("role", "menuitem");
    menu.append(title, action);
    menu.style.left = `${Math.max(6, Math.min(event.clientX, window.innerWidth - 246))}px`;
    menu.style.top = `${Math.max(6, Math.min(event.clientY, window.innerHeight - 140))}px`;
    document.body.append(menu);
    this.contextMenu = menu;
    window.setTimeout(() => {
      this.contextMenuAbort = new AbortController();
      document.addEventListener("pointerdown", (pointerEvent) => {
        if (!menu.contains(pointerEvent.target)) this.closeContextMenu();
      }, { capture: true, signal: this.contextMenuAbort.signal });
      document.addEventListener("keydown", (keyEvent) => {
        if (keyEvent.key === "Escape") this.closeContextMenu();
      }, { signal: this.contextMenuAbort.signal });
    }, 0);
  }

  showTagSetFavoriteContextMenu(event, item) {
    this.closeContextMenu();
    const favorite = this.isFavoriteTagSet(item?.id);
    const menu = element("div", { className: "paio-context-menu paio-favorite-context-menu" });
    menu.setAttribute("role", "menu");
    const title = element("strong", { className: "paio-context-title", text: item?.nameJa || item?.name || t("タグセット") });
    const action = button(t(favorite ? "お気に入りから削除" : "お気に入りに追加"), () => {
      this.closeContextMenu();
      this.setFavoriteTagSetValue(item?.id, !favorite);
      this.setStatus(t("お気に入りを更新しました"));
    });
    action.className = "paio-context-action";
    action.setAttribute("role", "menuitem");
    menu.append(title, action);
    menu.style.left = `${Math.max(6, Math.min(event.clientX, window.innerWidth - 246))}px`;
    menu.style.top = `${Math.max(6, Math.min(event.clientY, window.innerHeight - 140))}px`;
    document.body.append(menu);
    this.contextMenu = menu;
    window.setTimeout(() => {
      this.contextMenuAbort = new AbortController();
      document.addEventListener("pointerdown", (pointerEvent) => {
        if (!menu.contains(pointerEvent.target)) this.closeContextMenu();
      }, { capture: true, signal: this.contextMenuAbort.signal });
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
    if (parsed.errors.length) this.setStatus(t("追加しましたが構文警告が{count}件あります", { count: parsed.errors.length }), true);
    else this.setStatus(t("タグを追加しました"));
  }

  addValues(values, options = {}) {
    this.commitPromptBeforeAction();
    const active = this.activeSection?.();
    if (active && active.mode === "prose") {
      const additions = [];
      const jaAdditions = [];
      for (const raw of values) {
        const descriptor = raw && typeof raw === "object" ? raw : { value: raw };
        const value = String(descriptor.value || "").trim();
        if (!value) continue;
        additions.push(value);
        const ja = cleanTranslation(descriptor.translation);
        if (ja) jaAdditions.push(ja);
      }
      if (additions.length) {
        const cur = String(active.proseText || "").trim();
        const joined = additions.join(", ");
        active.proseText = !cur
          ? joined
          : (/[。；.!?\n]$/u.test(cur) ? `${cur} ${joined}` : `${cur}；${joined}`);
        if (jaAdditions.length) {
          const curJa = cleanTranslation(active.translation);
          active.translation = curJa ? `${curJa} / ${jaAdditions.join(" / ")}` : jaAdditions.join(" / ");
          active.translatedTo = this.settings.localLanguage;
        }
        active.tags = [createTag(active.proseText, {
          translation: active.translation,
          translatedTo: active.translatedTo,
        })];
        this.syncToWidgets();
        this.render();
      }
      return;
    }
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
    if (options.trailingSeparator !== undefined) {
      this.trailingSeparator = Boolean(options.trailingSeparator);
    }
    this.applyBlacklist(this.settings.blacklistAction !== "warn");
    this.syncToWidgets();
    this.render();
    if (this.settings.autoTranslate) {
      this.translatePrompt();
    }
  }

  attachTagListMarquee() {
    this.tagList.addEventListener("mousedown", (event) => {
      if (event.button !== 0 || !event.shiftKey) return;
      if (event.target?.closest?.("input, textarea, select, button")) return;
      event.preventDefault();
      event.stopPropagation();
    });
    this.tagList.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || !event.shiftKey) return;
      if (event.target?.closest?.("input, textarea, select, button")) return;
      event.preventDefault();
      event.stopPropagation();
      const targetRow = event.target?.closest?.(".paio-tag");
      const wasDraggable = targetRow ? targetRow.draggable : false;
      if (targetRow) targetRow.draggable = false;
      const pointerId = event.pointerId;
      const startClientX = event.clientX;
      const startClientY = event.clientY;
      const additive = event.ctrlKey || event.metaKey;
      const initialSelectedIds = new Set(this.currentTags.filter((tag) => tag.selected).map((tag) => tag.id));
      let dragging = false;
      let finished = false;
      let marqueeBox = null;
      let listRect = null;
      let scaleX = 1;
      let scaleY = 1;
      let cachedRows = [];
      let lastScrollLeft = this.tagList.scrollLeft;
      let lastScrollTop = this.tagList.scrollTop;

      const cacheGeometry = () => {
        listRect = this.tagList.getBoundingClientRect();
        scaleX = this.tagList.offsetWidth > 0 ? listRect.width / this.tagList.offsetWidth : 1;
        scaleY = this.tagList.offsetHeight > 0 ? listRect.height / this.tagList.offsetHeight : 1;
        lastScrollLeft = this.tagList.scrollLeft;
        lastScrollTop = this.tagList.scrollTop;
        cachedRows = [...this.tagList.querySelectorAll(".paio-tag")].map((row) => {
          const index = Number(row.dataset.tagIndex);
          return {
            row,
            index,
            rect: row.getBoundingClientRect(),
            mark: row.querySelector(".paio-select-mark"),
            selected: Boolean(this.currentTags[index]?.selected),
            target: false,
          };
        });
      };

      const updateSelection = (clientX, clientY) => {
        if (!listRect || this.tagList.scrollLeft !== lastScrollLeft || this.tagList.scrollTop !== lastScrollTop) {
          cacheGeometry();
        }
        const selectionRect = normalizeMarqueeRect(startClientX, startClientY, clientX, clientY);
        const toContentX = (x) => Math.max(0, Math.min(this.tagList.scrollWidth, (x - listRect.left) / scaleX + lastScrollLeft));
        const toContentY = (y) => Math.max(0, Math.min(this.tagList.scrollHeight, (y - listRect.top) / scaleY + lastScrollTop));
        const boxRect = normalizeMarqueeRect(
          toContentX(startClientX),
          toContentY(startClientY),
          toContentX(clientX),
          toContentY(clientY),
        );
        if (marqueeBox) {
          marqueeBox.style.left = `${boxRect.left}px`;
          marqueeBox.style.top = `${boxRect.top}px`;
          marqueeBox.style.width = `${boxRect.width}px`;
          marqueeBox.style.height = `${boxRect.height}px`;
        }
        const hitIndices = new Set();
        for (const item of cachedRows) {
          if (Number.isInteger(item.index) && rectsIntersect(selectionRect, item.rect)) {
            hitIndices.add(item.index);
          }
        }
        this.lastSelectedIndex = applyMarqueeSelection(this.currentTags, hitIndices, initialSelectedIds, additive);
        for (const item of cachedRows) {
          const nextSelected = Boolean(this.currentTags[item.index]?.selected);
          const nextTarget = hitIndices.has(item.index);
          if (item.selected !== nextSelected) {
            item.selected = nextSelected;
            item.row.classList.toggle("is-selected", nextSelected);
            if (item.mark) item.mark.textContent = nextSelected ? "✓" : "";
          }
          if (item.target !== nextTarget) {
            item.target = nextTarget;
            item.row.classList.toggle("is-marquee-target", nextTarget);
          }
        }
      };

      const onMove = (moveEvent) => {
        if (finished) return;
        if (!moveEvent.shiftKey) {
          finish(moveEvent);
          return;
        }
        if (!dragging) {
          if (Math.hypot(moveEvent.clientX - startClientX, moveEvent.clientY - startClientY) < 1) return;
          dragging = true;
          this.didMarqueeDrag = true;
          this.tagList.classList.add("is-marquee-selecting");
          this.tagList.setPointerCapture?.(pointerId);
          cacheGeometry();
          marqueeBox = element("div", { className: "paio-marquee-box" });
          this.tagList.append(marqueeBox);
        }
        moveEvent.preventDefault();
        moveEvent.stopPropagation();
        updateSelection(moveEvent.clientX, moveEvent.clientY);
      };

      const onKeyUp = (keyEvent) => {
        if (keyEvent.key === "Shift") finish(keyEvent);
      };

      const finish = (endEvent) => {
        if (finished) return;
        finished = true;
        window.removeEventListener("pointermove", onMove, true);
        window.removeEventListener("pointerup", finish, true);
        window.removeEventListener("pointercancel", finish, true);
        window.removeEventListener("keyup", onKeyUp, true);
        if (targetRow) targetRow.draggable = wasDraggable;
        if (!dragging) return;
        this.tagList.releasePointerCapture?.(pointerId);
        if (endEvent?.type === "pointerup" && Number.isFinite(endEvent.clientX) && Number.isFinite(endEvent.clientY)) {
          updateSelection(endEvent.clientX, endEvent.clientY);
        }
        marqueeBox?.remove();
        this.tagList.classList.remove("is-marquee-selecting");
        this.persist();
        this.render();
        if (endEvent?.type === "pointerup" || endEvent?.type === "pointercancel") {
          window.setTimeout(() => { this.didMarqueeDrag = false; }, 0);
        } else {
          const clearClickGuard = () => {
            window.setTimeout(() => { this.didMarqueeDrag = false; }, 0);
          };
          window.addEventListener("pointerup", clearClickGuard, { capture: true, once: true });
          window.addEventListener("pointercancel", clearClickGuard, { capture: true, once: true });
        }
      };

      window.addEventListener("pointermove", onMove, true);
      window.addEventListener("pointerup", finish, true);
      window.addEventListener("pointercancel", finish, true);
      window.addEventListener("keyup", onKeyUp, true);
    });
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
    this.clearSelectionState();
    this.persist();
    this.render();
  }

  clearSelectionState() {
    this.currentTags.forEach((tag) => { tag.selected = false; });
    this.lastSelectedIndex = null;
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

  cancelPendingTagToggle() {
    clearTimeout(this.clickTimer);
    this.clickTimer = null;
    this.pendingTagToggle = null;
  }

  flushPendingTagToggle() {
    const pending = this.pendingTagToggle;
    if (!pending) return;
    this.cancelPendingTagToggle();
    this.toggleTagInSection(pending.sectionId, pending.tagId);
  }

  scheduleTagToggle(sectionId, tagId) {
    if (this.pendingTagToggle && (this.pendingTagToggle.sectionId !== sectionId || this.pendingTagToggle.tagId !== tagId)) {
      this.flushPendingTagToggle();
    } else {
      clearTimeout(this.clickTimer);
    }
    this.pendingTagToggle = { sectionId, tagId };
    this.clickTimer = globalThis.setTimeout(() => this.flushPendingTagToggle(), TAG_SINGLE_CLICK_DELAY_MS);
  }

  toggleTagInSection(sectionId, tagId) {
    if (!tagId) return;
    if (Array.isArray(this.sections) && sectionId) {
      const targetSection = this.sections.find((section) => section.id === sectionId);
      if (!targetSection) return;
      if (this.activeSectionId === sectionId) this.commitPromptBeforeAction();
      const targetTag = (targetSection.tags || []).find((tag) => tag.id === tagId);
      if (!targetTag) return;
      this.pushUndo();
      targetTag.enabled = !targetTag.enabled;
      this.syncToWidgets();
      this.render();
      return;
    }
    const index = this.currentTags.findIndex((tag) => tag.id === tagId);
    if (index >= 0) this.toggleOne(index);
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
    this.deleteOneById(tagId);
  }

  deleteOneById(tagId) {
    if (!tagId) return;
    this.commitPromptBeforeAction();
    const index = this.currentTags.findIndex((tag) => tag.id === tagId);
    if (index < 0) return;
    this.pushUndo();
    this.currentTags.splice(index, 1);
    this.syncToWidgets();
    this.render();
    this.setStatus(t("タグを削除しました。元に戻せます"));
  }

  deleteSelected() {
    this.commitPromptBeforeAction();
    this.pushUndo();
    this.tags = this.currentTags.filter((tag) => !tag.selected);
    this.syncToWidgets();
    this.render();
    this.setStatus(t("選択タグを削除しました。元に戻せます"));
  }

  normalize(removeDuplicates) {
    this.commitPromptBeforeAction();
    this.pushUndo();
    this.tags = normalizePromptTags(this.currentTags, { removeEmpty: true, removeDuplicates });
    this.syncToWidgets();
    this.render();
    this.setStatus(t(removeDuplicates ? "空タグと重複を整理しました。元に戻せます" : "区切りと空白を整形しました。元に戻せます"));
  }

  async translateIndexes(indexes, target) {
    const ids = [...new Set(indexes)].map((index) => this.tags[index]?.id).filter(Boolean);
    this.commitPromptBeforeAction();
    const unique = ids.map((id) => this.tags.findIndex((tag) => tag.id === id)).filter((index) => index >= 0);
    if (!unique.length) return;
    const generation = this.translationGeneration;
    const requestId = this.translationRequestId = (this.translationRequestId || 0) + 1;
    const tasks = unique.map((index) => {
      const tag = this.tags[index];
      tag.translationRequestId = requestId;
      return { id: tag.id, originalValue: tag.value, text: translatableTagText(tag.value) };
    });
    const values = tasks.map((task) => task.text);
    const currentTag = (task) => generation === this.translationGeneration && !this.disposed
      ? this.tags.find((tag) => tag.id === task.id && tag.value === task.originalValue && tag.translationRequestId === requestId)
      : null;
    unique.forEach((index) => { this.tags[index].translationError = ""; });
    this.setStatus(t("{count}件を翻訳中…", { count: values.length }));
    try {
      const results = await translateTags(this.api, values, {
        provider: this.settings.translationProvider,
        source: "auto",
        target,
        catalog: this.settings.libraryFile,
        timeoutMs: translationBatchTimeoutMs(values.length),
        isCancelled: () => this.disposed || generation !== this.translationGeneration,
        onProgress: (done, total) => {
          if (generation === this.translationGeneration && !this.disposed) this.setStatus(t("翻訳中… {done}/{total}件", { done, total }));
        },
      });
      if (!tasks.some(currentTag)) return;
      this.pushUndo();
      let emptyCount = 0;
      results.forEach((result, offset) => {
        const tag = tasks[offset] && currentTag(tasks[offset]);
        if (!tag) return;
        const translated = promptBody(cleanTranslation(result?.translated));
        if (target === "en" && applySmartTranslationResult(tag, translated, target, this.settings.localLanguage)) return;
        tag.translation = translated;
        tag.translatedTo = translated ? target : "";
        tag.translationError = translated ? "" : (result?.error || t("翻訳結果が空でした"));
        tag.translationErrorTarget = translated ? "" : target;
        if (!translated) emptyCount += 1;
      });
      this.syncToWidgets();
      this.render();
      if (emptyCount) this.setStatus(t("{count}件の翻訳結果が空でした。翻訳ボタンから再試行できます", { count: emptyCount }), true);
      else this.setStatus(t("翻訳しました"));
    } catch (error) {
      if (!tasks.some(currentTag)) return;
      tasks.forEach((task) => {
        const tag = currentTag(task);
        if (!tag) return;
        tag.translationError = error.message;
        tag.translationErrorTarget = target;
      });
      this.persist();
      this.render();
      this.setStatus(t("{error}。同じ翻訳ボタンで再試行できます", { error: error.message }), true);
    }
  }

  async translatePrompt() {
    if (this.translationBusy) return;
    this.commitPromptBeforeAction();
    const generation = this.translationGeneration;
    this.exampleData = null;
    this.exampleLoadPromise = null;
    try {
      await this.loadExampleData();
    } catch (error) {
      return this.setStatus(t("タグ設定ファイルを再読み込みできませんでした: {error}", { error: error.message }), true);
    }
    if (generation !== this.translationGeneration || this.disposed) return;
    const specialTypes = new Set(["lora", "lycoris", "embedding", "wildcard", "dynamic"]);
    const japaneseTasks = [];
    const localTasks = [];
    const requestId = this.translationRequestId = (this.translationRequestId || 0) + 1;
    for (const tag of this.currentTags) {
      if (specialTypes.has(tag.type)) continue;
      const sourceText = translatableTagText(tag.value);
      const task = { id: tag.id, originalValue: tag.value, text: sourceText };
      tag.translationRequestId = requestId;
      if (containsJapaneseText(sourceText)) japaneseTasks.push(task);
      else if (!cleanTranslation(tag.translation) || tag.translatedTo !== this.settings.localLanguage) localTasks.push(task);
    }

    const taskCount = japaneseTasks.length + localTasks.length;
    if (!taskCount) return this.setStatus(t("翻訳が必要なタグはありません"));

    this.translationBusy = true;
    if (this.translateButton) {
      this.translateButton.disabled = true;
      this.translateButton.textContent = t("翻訳中…");
    }
    this.pushUndo();
    [...japaneseTasks, ...localTasks].forEach((task) => {
      const tag = this.tags.find((item) => item.id === task.id);
      if (tag) tag.translationError = "";
    });
    this.setStatus(t("{count}件を翻訳中…", { count: taskCount }));

    const progress = new Map();
    const execute = async (tasks, target) => {
      if (!tasks.length) return [];
      try {
        const results = await translateTags(this.api, tasks.map((task) => task.text), {
          provider: this.settings.translationProvider,
          source: "auto",
          target,
          catalog: this.settings.libraryFile,
          timeoutMs: translationBatchTimeoutMs(tasks.length),
          isCancelled: () => this.disposed || generation !== this.translationGeneration,
          onProgress: (done) => {
            progress.set(tasks, done);
            if (generation === this.translationGeneration && !this.disposed) {
              this.setStatus(t("翻訳中… {done}/{total}件", { done: [...progress.values()].reduce((a, b) => a + b, 0), total: taskCount }));
            }
          },
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
      if (generation !== this.translationGeneration || this.disposed) return;
      let replaced = 0;
      let supplemented = 0;
      let failed = 0;
      for (const { task, target, result } of batches.flat()) {
        const tag = this.tags.find((item) => item.id === task.id);
        if (!tag || tag.value !== task.originalValue || tag.translationRequestId !== requestId) continue;
        const translated = cleanTranslation(result?.translated);
        if (applySmartTranslationResult(tag, translated, target, this.settings.localLanguage)) {
          if (target === "en") replaced += 1;
          else supplemented += 1;
        } else {
          tag.translationError = result?.error || t("翻訳結果が空でした");
          tag.translationErrorTarget = target;
          failed += 1;
        }
      }
      this.applyBlacklist(this.settings.blacklistAction !== "warn");
      this.syncToWidgets();
      this.render();
      const completed = t("日本語{replaced}件を英語へ置換、日本語訳{supplemented}件を追加", { replaced, supplemented });
      if (failed) this.setStatus(t("{completed}。{failed}件は翻訳できませんでした。翻訳ボタンで再試行できます", { completed, failed }), true);
      else this.setStatus(t("{completed}しました", { completed }));
    } catch (error) {
      this.persist();
      this.render();
      this.setStatus(t("{error}。翻訳ボタンで再試行できます", { error: error.message }), true);
    } finally {
      if (generation === this.translationGeneration) this.translationBusy = false;
      if (generation === this.translationGeneration && this.translateButton) {
        this.translateButton.disabled = false;
        this.translateButton.textContent = t("翻訳");
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
    if (!failures.length) return this.setStatus(t("再試行が必要な翻訳はありません"));
    const english = failures.filter(({ tag }) => tag.translationErrorTarget === "en").map(({ index }) => index);
    const local = failures.filter(({ tag }) => tag.translationErrorTarget !== "en").map(({ index }) => index);
    if (english.length) await this.translateIndexes(english, "en");
    if (local.length) await this.translateIndexes(local, this.settings.localLanguage);
  }

  async copySelected(withTranslation) {
    const selected = this.currentTags.filter((tag) => tag.selected);
    const value = withTranslation
      ? selected.map((tag) => cleanTranslation(tag.translation) ? `${tag.value} (${cleanTranslation(tag.translation)})` : tag.value).join(", ")
      : this.outputPromptForExport(selected);
    await copyText(value);
    this.setStatus(t("選択タグをコピーしました"));
  }

  async copySelectedLanguage(language) {
    const selected = this.currentTags.filter((tag) => tag.selected);
    const value = selected.map((tag) => {
      const translation = cleanTranslation(tag.translation);
      return translation && tag.translatedTo === language ? translation : tag.value;
    }).join(", ");
    await copyText(value);
    this.setStatus(t("{language}形式で選択タグをコピーしました", { language: language.toUpperCase() }));
  }

  async copyPrompt() {
    await copyText(this.currentOutputs().prompt);
    this.setStatus(t("プロンプトをコピーしました"));
  }

  outputPromptForExport(tags, options = {}) {
    return outputPrompt(tags, this.settings.outputLanguage, {
      trailingSeparator: Boolean(options.trailingSeparator),
      stripLineBreaks: true,
      replaceUnderscores: this.settings.replaceUnderscoresForOutput,
    });
  }

  applyBlacklist(mutate) {
    const compiled = compileBlacklist(this.settings.blacklist);
    const targets = Array.isArray(this.sections) ? this.sections : [{ tags: this.tags }];
    for (const section of targets) {
      for (const tag of section.tags) tag.blacklistMatch = matchesBlacklist(tag.value, compiled);
      if (!mutate) continue;
      if (this.settings.blacklistAction === "disable") {
        section.tags.filter((tag) => tag.blacklistMatch).forEach((tag) => { tag.enabled = false; });
      } else if (this.settings.blacklistAction === "delete") {
        section.tags = section.tags.filter((tag) => !tag.blacklistMatch);
      }
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
