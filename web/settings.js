import { sanitizeLibraryEdits } from "./tag_library.js";

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
  filter: "all",
  libraryFile: "",
  libraryEdits: { categories: [], tags: [] },
});

const MAX_IMPORT_BYTES = 1024 * 1024;

export function sanitizeSettings(input = {}) {
  const settings = { ...DEFAULT_SETTINGS };
  if ([0.05, 0.1, 0.25].includes(Number(input.weightStep))) {
    settings.weightStep = Number(input.weightStep);
  }
  if (["allow", "skip", "move"].includes(input.duplicatePolicy)) {
    settings.duplicatePolicy = input.duplicatePolicy;
  }
  if (["local", "offline", "libretranslate", "deepl", "openai"].includes(input.translationProvider)) {
    settings.translationProvider = input.translationProvider;
  }
  if (["en", "ja"].includes(input.outputLanguage)) settings.outputLanguage = input.outputLanguage;
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
  if (typeof input.libraryFile === "string") {
    settings.libraryFile = input.libraryFile.trim().replace(/\.json$/iu, "").slice(0, 64);
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
  return {
    id: String(tag?.id || "").slice(0, 80),
    value,
    enabled: legacyDisabled ? false : tag?.enabled !== false,
    translation: translation.slice(0, 10000),
    translatedTo: String(tag?.translatedTo || "").slice(0, 16),
    type: String(tag?.type || "normal").slice(0, 32),
  };
}

export function sanitizeEditorState(input = {}) {
  const state = input && typeof input === "object" ? input : {};
  const tags = Array.isArray(state.tags) ? state.tags : Array.isArray(state.positive) ? state.positive : [];
  return {
    version: 1,
    tags: tags.slice(0, 2000).map(sanitizeTag),
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
  if (!parsed || parsed.schema !== "prompt-all-in-one/editor-state" || parsed.version !== 1) {
    throw new Error("Unsupported editor-state schema");
  }
  return sanitizeEditorState(parsed.state);
}

export function exportEditorState(state) {
  return JSON.stringify(
    {
      schema: "prompt-all-in-one/editor-state",
      version: 1,
      state: sanitizeEditorState(state),
    },
    null,
    2,
  );
}
