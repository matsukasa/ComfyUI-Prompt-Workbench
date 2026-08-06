const UI_LANGUAGE_STORAGE_KEY = "prompt-workbench/ui-language";
const DEFAULT_UI_LANGUAGE = "ja";

let localeManifest = [{ code: "ja", label: "日本語", file: "ja.json" }];
let activeLocale = DEFAULT_UI_LANGUAGE;
let messages = {};

function normalizeLocale(value) {
  return String(value || "").trim().toLocaleLowerCase().replace(/_/gu, "-");
}

function interpolate(template, params = {}) {
  return String(template).replace(/\{([a-zA-Z][\w]*)\}/gu, (match, name) => (
    Object.hasOwn(params, name) ? String(params[name]) : match
  ));
}

export function translateUi(key, params = {}) {
  return interpolate(messages[key] ?? key, params);
}

export function getUiLanguage() {
  return activeLocale;
}

export function getAvailableUiLanguages() {
  return localeManifest.map(({ code, label }) => ({ code, label }));
}

export function resolveUiLanguage(requested, available, browserLanguage = "") {
  const codes = new Set((available || []).map((item) => normalizeLocale(item.code)));
  const candidates = [requested, browserLanguage].map(normalizeLocale).filter(Boolean);
  for (const candidate of candidates) {
    if (codes.has(candidate)) return candidate;
    const base = candidate.split("-")[0];
    if (codes.has(base)) return base;
  }
  return codes.has(DEFAULT_UI_LANGUAGE) ? DEFAULT_UI_LANGUAGE : ([...codes][0] || DEFAULT_UI_LANGUAGE);
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`UI locale request failed (${response.status})`);
  const body = await response.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("UI locale JSON must be an object");
  return body;
}

export async function initializeUiLanguage() {
  const baseUrl = new URL("./locales/", import.meta.url);
  try {
    const manifest = await fetchJson(new URL("manifest.json", baseUrl));
    const locales = Array.isArray(manifest.locales) ? manifest.locales : [];
    const valid = locales.filter((item) => /^[a-z]{2,3}(?:-[a-z0-9]+)*$/iu.test(item?.code || "")
      && /^[\w.-]+\.json$/iu.test(item?.file || "") && String(item?.label || "").trim());
    if (valid.length) localeManifest = valid;
  } catch (error) {
    console.warn("[Prompt Workbench] UI locale manifest could not be loaded; Japanese fallback is active.", error);
  }

  let stored = "";
  try { stored = window.localStorage?.getItem(UI_LANGUAGE_STORAGE_KEY) || ""; } catch {}
  activeLocale = resolveUiLanguage(stored, localeManifest, globalThis.navigator?.language || "");
  const selected = localeManifest.find((item) => normalizeLocale(item.code) === activeLocale);
  if (!selected) return activeLocale;
  try {
    const loaded = await fetchJson(new URL(selected.file, baseUrl));
    messages = loaded.messages && typeof loaded.messages === "object" && !Array.isArray(loaded.messages)
      ? loaded.messages : loaded;
  } catch (error) {
    messages = {};
    console.warn(`[Prompt Workbench] UI locale '${activeLocale}' could not be loaded; source text fallback is active.`, error);
  }
  return activeLocale;
}

export function saveUiLanguage(value) {
  const next = resolveUiLanguage(value, localeManifest);
  try { window.localStorage?.setItem(UI_LANGUAGE_STORAGE_KEY, next); } catch {}
  return next;
}

export const UI_LANGUAGE_KEY = UI_LANGUAGE_STORAGE_KEY;
