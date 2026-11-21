import { sanitizeLibraryEdits } from "./tag_library.js";
import { sanitizeCategoryColors } from "./category_colors.js";

export const DEFAULT_CATALOG_NAME = "tag_catalog";
export const FAVORITES_SCHEMA = "prompt-workbench/favorites";
export const SUPPORTED_OUTPUT_LANGUAGES = Object.freeze(["en", "ja", "zh", "zh-CN", "zh-TW", "ko"]);
export const SUPPORTED_LOCAL_LANGUAGES = Object.freeze(["ja", "en", "zh", "zh-CN", "zh-TW", "ko"]);

export const DEFAULT_SETTINGS = Object.freeze({
  weightStep: 0.05,
  weightMin: 0.05,
  weightMax: 2,
  duplicatePolicy: "skip",
  translationProvider: "local",
  localLanguage: "ja",
  outputLanguage: "en",
  translationDisplay: "original",
  autoTranslate: false,
  blacklist: [],
  blacklistAction: "warn",
  tagColors: {},
  categoryColors: { overrides: {}, unknown: null },
  filter: "all",
  libraryFile: DEFAULT_CATALOG_NAME,
  tagSetFile: "",
  libraryEdits: { categories: [], tags: [] },
  favorites: [],
  favoriteTagSets: [],
  showFavoritesOnly: false,
  exampleSortOrder: "default",
  tagSetSortOrder: "default",
  tagUsage: {},
  tagSetUsage: {},
  replaceUnderscoresForOutput: false,
  promptTextHeight: 140,
  tagListHeight: 260,
  exampleListHeight: 118,
  tagSetListHeight: 160,
  leftPaneWidthPercent: 46,
  catalogOpen: false,
  catalogPanePercent: 46,
  showSectionTranslationsInList: true,
});

const MAX_IMPORT_BYTES = 1024 * 1024;

export function sanitizeFavorites(values, limit = 20000) {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  for (const value of values) {
    const key = String(value || "").trim().replace(/\s+/gu, " ").toLocaleLowerCase();
    if (key) seen.add(key);
    if (seen.size >= limit) break;
  }
  return [...seen].sort();
}

export function parseFavoriteSettings(value = {}) {
  if (Array.isArray(value)) return { favorites: sanitizeFavorites(value), favoriteTagSets: [] };
  if (!value || typeof value !== "object") return { favorites: [], favoriteTagSets: [] };
  if (value.schema && (value.schema !== FAVORITES_SCHEMA || value.version !== 1)) {
    return { favorites: [], favoriteTagSets: [] };
  }
  return {
    favorites: sanitizeFavorites(value.favorites),
    favoriteTagSets: sanitizeFavorites(value.favoriteTagSets, 2000),
  };
}

export function mergeFavoriteSettings(...settingsList) {
  return parseFavoriteSettings({
    favorites: settingsList.flatMap((settings) => settings?.favorites || []),
    favoriteTagSets: settingsList.flatMap((settings) => settings?.favoriteTagSets || []),
  });
}

export function favoriteSettingsPayload(settings = {}) {
  const sanitized = parseFavoriteSettings(settings);
  return {
    schema: FAVORITES_SCHEMA,
    version: 1,
    favorites: sanitized.favorites,
    favoriteTagSets: sanitized.favoriteTagSets,
  };
}

export function sanitizeSettings(input = {}) {
  input = input && typeof input === "object" ? input : {};
  const settings = { ...DEFAULT_SETTINGS };
  if ([0.05, 0.1, 0.25].includes(Number(input.weightStep))) {
    settings.weightStep = Number(input.weightStep);
  }
  if (Number.isFinite(Number(input.weightMin))) {
    settings.weightMin = Number(input.weightMin);
  }
  if (Number.isFinite(Number(input.weightMax))) {
    settings.weightMax = Number(input.weightMax);
  }
  if (["allow", "skip", "move"].includes(input.duplicatePolicy)) {
    settings.duplicatePolicy = input.duplicatePolicy;
  }
  if (["local", "offline", "libretranslate", "deepl", "openai"].includes(input.translationProvider)) {
    settings.translationProvider = input.translationProvider;
  }
  if (SUPPORTED_OUTPUT_LANGUAGES.includes(input.outputLanguage)) settings.outputLanguage = input.outputLanguage;
  if (["original", "local", "both"].includes(input.translationDisplay)) {
    settings.translationDisplay = input.translationDisplay;
  }
  if (typeof input.localLanguage === "string" && /^[a-z-]{2,16}$/i.test(input.localLanguage)) {
    settings.localLanguage = input.localLanguage;
  }
  settings.autoTranslate = Boolean(input.autoTranslate);
  if (["warn", "disable", "delete"].includes(input.blacklistAction)) {
    settings.blacklistAction = input.blacklistAction;
  }
  if (Array.isArray(input.blacklist)) {
    settings.blacklist = input.blacklist.slice(0, 200).map((entry) => ({
      mode: ["exact", "iexact", "contains", "regex"].includes(entry?.mode)
        ? entry.mode
        : "exact",
      pattern: String(entry?.pattern || "").slice(0, 256),
    }));
  }
  if (input.tagColors && typeof input.tagColors === "object") {
    settings.tagColors = {};
    for (const key of ["normal", "disabled", "lora", "lycoris", "embedding", "wildcard", "duplicate", "blacklist", "missing", "error"]) {
      const value = input.tagColors[key];
      if (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)) settings.tagColors[key] = value;
    }
  }
  settings.libraryEdits = sanitizeLibraryEdits(input.libraryEdits);
  settings.categoryColors = sanitizeCategoryColors(input.categoryColors);
  if (Array.isArray(input.favorites)) {
    settings.favorites = sanitizeFavorites(input.favorites);
  }
  if (Array.isArray(input.favoriteTagSets)) {
    settings.favoriteTagSets = sanitizeFavorites(input.favoriteTagSets, 2000);
  }
  settings.showFavoritesOnly = Boolean(input.showFavoritesOnly);
  if (["default", "popular", "alphabetical"].includes(input.exampleSortOrder)) settings.exampleSortOrder = input.exampleSortOrder;
  if (["default", "popular"].includes(input.tagSetSortOrder)) settings.tagSetSortOrder = input.tagSetSortOrder;
  settings.tagUsage = {};
  if (input.tagUsage && typeof input.tagUsage === "object" && !Array.isArray(input.tagUsage)) {
    for (const [key, value] of Object.entries(input.tagUsage).slice(0, 20000)) {
      if (key.length <= 1024 && Number.isSafeInteger(value) && value > 0) {
        Object.defineProperty(settings.tagUsage, key, { value: Math.min(value, 1000000), enumerable: true, writable: true, configurable: true });
      }
    }
  }
  settings.tagSetUsage = {};
  if (input.tagSetUsage && typeof input.tagSetUsage === "object" && !Array.isArray(input.tagSetUsage)) {
    for (const [key, value] of Object.entries(input.tagSetUsage).slice(0, 10000)) {
      if (key.length <= 1024 && Number.isSafeInteger(value) && value > 0) {
        Object.defineProperty(settings.tagSetUsage, key, { value: Math.min(value, 1000000), enumerable: true, writable: true, configurable: true });
      }
    }
  }
  settings.replaceUnderscoresForOutput = Boolean(input.replaceUnderscoresForOutput);
  if (typeof input.libraryFile === "string") {
    settings.libraryFile = input.libraryFile.trim().replace(/\.json$/iu, "").slice(0, 64);
  }
  if (typeof input.tagSetFile === "string") {
    settings.tagSetFile = input.tagSetFile.trim().replace(/\.json$/iu, "").slice(0, 64);
  }
  if (typeof input.filter === "string") {
    settings.filter = input.filter.trim().slice(0, 64);
  }
  if (Number.isFinite(Number(input.exampleListHeight))) {
    settings.exampleListHeight = Math.min(520, Math.max(96, Math.round(Number(input.exampleListHeight))));
  }
  if (Number.isFinite(Number(input.tagSetListHeight))) {
    settings.tagSetListHeight = Math.min(720, Math.max(96, Math.round(Number(input.tagSetListHeight))));
  }
  if (Number.isFinite(Number(input.promptTextHeight))) {
    settings.promptTextHeight = Math.min(420, Math.max(96, Math.round(Number(input.promptTextHeight))));
  }
  if (Number.isFinite(Number(input.tagListHeight))) {
    settings.tagListHeight = Math.min(720, Math.max(96, Math.round(Number(input.tagListHeight))));
  }
  if (Number.isFinite(Number(input.leftPaneWidthPercent))) {
    settings.leftPaneWidthPercent = Math.min(70, Math.max(25, Number(input.leftPaneWidthPercent)));
  }
  if (Object.hasOwn(input, "catalogOpen")) {
    settings.catalogOpen = Boolean(input.catalogOpen);
  }
  if (Number.isFinite(Number(input.catalogPanePercent))) {
    settings.catalogPanePercent = Math.min(72, Math.max(25, Number(input.catalogPanePercent)));
  }
  if (Object.hasOwn(input, "showSectionTranslationsInList")) {
    settings.showSectionTranslationsInList = Boolean(input.showSectionTranslationsInList);
  }
  return settings;
}

function sanitizeTranslation(value) {
  return String(value ?? "").trim().split(/\s+/u)
    .filter((token) => !/^(null|undefined)$/iu.test(token)).join(" ").trim();
}

function sanitizeTag(tag) {
  const rawValue = String(tag?.value || "").slice(0, 10000).trim();
  const legacyDisabled = /^.+\S\s+(?:null|undefined)$/iu.test(rawValue);
  const value = legacyDisabled ? rawValue.replace(/\s+(?:null|undefined)$/iu, "").trim() : rawValue;
  const translation = sanitizeTranslation(tag?.translation);
  const rawSeparator = String(tag?.separatorAfter || "");
  return {
    id: String(tag?.id || "").slice(0, 80),
    value,
    enabled: legacyDisabled ? false : tag?.enabled !== false,
    translation: translation.slice(0, 10000),
    translatedTo: String(tag?.translatedTo || "").slice(0, 16),
    type: String(tag?.type || "normal").slice(0, 32),
    lineBreakAfter: Math.max(0, Math.min(20, Math.floor(Number(tag?.lineBreakAfter) || 0))),
    separatorAfter: ["；", "，", "、", "。", "．"].includes(rawSeparator) ? rawSeparator : "",
  };
}

function sanitizeSection(section, index = 0) {
  const tags = Array.isArray(section?.tags) ? section.tags : [];
  return {
    id: String(section?.id || `sec-${index + 1}`).slice(0, 80),
    title: String(section?.title || "").slice(0, 200).trim(),
    role: section?.role === "negative" ? "negative" : "positive",
    mode: section?.mode === "prose" ? "prose" : "tags",
    proseText: String(section?.proseText || "").slice(0, 40000),
    translation: String(section?.translation || "").slice(0, 40000),
    translatedTo: String(section?.translatedTo || "").slice(0, 16),
    enabled: section?.enabled !== false,
    collapsed: Boolean(section?.collapsed),
    socketInput: Boolean(section?.socketInput),
    socketOutput: Boolean(section?.socketOutput),
    trailingSeparator: Boolean(section?.trailingSeparator),
    tags: tags.slice(0, 2000).map(sanitizeTag),
  };
}

export function sanitizeEditorState(input = {}) {
  const state = input && typeof input === "object" ? input : {};
  const rawTags = Array.isArray(state.tags) ? state.tags : Array.isArray(state.positive) ? state.positive : [];
  const tags = rawTags.slice(0, 2000).map(sanitizeTag);
  const trailingSeparator = Boolean(state.trailingSeparator);
  const rawSections = Array.isArray(state.sections) && state.sections.length
    ? state.sections.slice(0, 64).map((section, index) => sanitizeSection(section, index))
    : [{
        id: "sec-1",
        title: "",
        role: "positive",
        enabled: true,
        collapsed: false,
        trailingSeparator,
        tags,
      }];
  const activeSectionId = rawSections.some((sec) => sec.id === state.activeSectionId)
    ? String(state.activeSectionId)
    : rawSections[0].id;
  return {
    version: 1,
    trailingSeparator,
    tags,
    sections: rawSections,
    activeSectionId,
    outputFormat: ["structured", "json"].includes(state.outputFormat) ? state.outputFormat : "tags",
    wrapBraces: Boolean(state.wrapBraces),
    includeNegativeInPrompt: Boolean(state.includeNegativeInPrompt),
    settings: sanitizeSettings(state.settings),
  };
}

export function parseImportedState(text) {
  if (typeof text !== "string" || new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) {
    throw new Error("Import JSON exceeds the 1 MB limit");
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Import JSON is invalid");
  }
  if (!parsed || parsed.schema !== "prompt-workbench/editor-state" || parsed.version !== 1) {
    throw new Error("Unsupported editor-state schema");
  }
  return sanitizeEditorState(parsed.state);
}

export function exportEditorState(state) {
  return JSON.stringify(
    {
      schema: "prompt-workbench/editor-state",
      version: 1,
      state: sanitizeEditorState(state),
    },
    null,
    2,
  );
}
