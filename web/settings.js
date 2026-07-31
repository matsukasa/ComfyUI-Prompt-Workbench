export const DEFAULT_SETTINGS = Object.freeze({
  weightStep: 0.05,
  weightMin: 0.05,
  weightMax: 2,
  duplicatePolicy: "skip",
  translationProvider: "local",
  localLanguage: "ja",
  outputLanguage: "en",
  autoTranslate: false,
  blacklist: [],
  blacklistAction: "warn",
  tagColors: {},
  filter: "all",
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
  if (["local", "libretranslate", "deepl", "openai"].includes(input.translationProvider)) {
    settings.translationProvider = input.translationProvider;
  }
  if (["en", "ja"].includes(input.outputLanguage)) settings.outputLanguage = input.outputLanguage;
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
  return settings;
}

function sanitizeTag(tag) {
  return {
    id: String(tag?.id || "").slice(0, 80),
    value: String(tag?.value || "").slice(0, 10000),
    enabled: tag?.enabled !== false,
    translation: String(tag?.translation || "").slice(0, 10000),
    translatedTo: String(tag?.translatedTo || "").slice(0, 16),
    type: String(tag?.type || "normal").slice(0, 32),
  };
}

export function sanitizeEditorState(input = {}) {
  const state = input && typeof input === "object" ? input : {};
  return {
    version: 1,
    activeSide: state.activeSide === "negative" ? "negative" : "positive",
    positive: Array.isArray(state.positive) ? state.positive.slice(0, 2000).map(sanitizeTag) : [],
    negative: Array.isArray(state.negative) ? state.negative.slice(0, 2000).map(sanitizeTag) : [],
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
