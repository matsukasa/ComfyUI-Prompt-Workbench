const OPEN_TO_CLOSE = {
  "(": ")", "[": "]", "{": "}", "<": ">",
  "（": "）", "［": "］", "｛": "｝", "＜": "＞",
  "「": "」", "『": "』", "“": "”", "‘": "’",
};
const CLOSE_TO_OPEN = Object.fromEntries(
  Object.entries(OPEN_TO_CLOSE).map(([open, close]) => [close, open]),
);

let nextTagId = 1;

function normalizeLegacyDisabledValue(raw) {
  const text = String(raw ?? "").trim();
  const match = text.match(/^(.+\S)\s+(?:null|undefined)$/iu);
  return match ? { value: match[1].trim(), disabled: true } : { value: text, disabled: false };
}

export function normalizeTranslationText(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return text
    .split(/\s+/u)
    .filter((token) => !/^(null|undefined)$/iu.test(token))
    .join(" ")
    .trim();
}

export function createTag(raw, overrides = {}) {
  const legacy = normalizeLegacyDisabledValue(raw);
  const value = legacy.value;
  return {
    id: overrides.id || `paio-${nextTagId++}`,
    value,
    enabled: legacy.disabled ? false : overrides.enabled !== false,
    selected: Boolean(overrides.selected),
    translation: normalizeTranslationText(overrides.translation),
    translatedTo: String(overrides.translatedTo || ""),
    translationError: String(overrides.translationError || ""),
    translationErrorTarget: String(overrides.translationErrorTarget || ""),
    type: overrides.type || classifyTag(value),
    missingModel: Boolean(overrides.missingModel),
    blacklistMatch: Boolean(overrides.blacklistMatch),
  };
}

export function splitPrompt(text) {
  const input = String(text ?? "");
  if (!input.length) return { values: [], errors: [], trailingSeparator: false };

  const values = [];
  const errors = [];
  const stack = [];
  let buffer = "";
  let quote = null;
  let escaped = false;
  let lastWasSeparator = false;

  const push = () => {
    values.push(buffer.trim());
    buffer = "";
    lastWasSeparator = true;
  };

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];

    if (escaped) {
      buffer += character;
      escaped = false;
      lastWasSeparator = false;
      continue;
    }
    if (character === "\\") {
      buffer += character;
      escaped = true;
      lastWasSeparator = false;
      continue;
    }
    if (quote) {
      buffer += character;
      if (character === quote) quote = null;
      lastWasSeparator = false;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      buffer += character;
      lastWasSeparator = false;
      continue;
    }
    if (Object.hasOwn(OPEN_TO_CLOSE, character)) {
      stack.push(character);
      buffer += character;
      lastWasSeparator = false;
      continue;
    }
    if (Object.hasOwn(CLOSE_TO_OPEN, character)) {
      if (stack.at(-1) === CLOSE_TO_OPEN[character]) {
        stack.pop();
      } else {
        errors.push({ index, message: `Unexpected closing bracket: ${character}` });
      }
      buffer += character;
      lastWasSeparator = false;
      continue;
    }
    if (([",", "，", "、", "；", "。", "．", "\n", "\r"].includes(character)) && stack.length === 0) {
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      push();
      continue;
    }
    buffer += character;
    if (!/\s/.test(character)) lastWasSeparator = false;
  }

  if (escaped) errors.push({ index: input.length - 1, message: "Dangling escape" });
  if (quote) errors.push({ index: input.length, message: `Unclosed quote: ${quote}` });
  for (const open of stack.reverse()) {
    errors.push({ index: input.length, message: `Unclosed bracket: ${open}` });
  }

  if (buffer.length || lastWasSeparator) values.push(buffer.trim());
  return { values, errors, trailingSeparator: lastWasSeparator };
}

export function parsePrompt(text, previousTags = []) {
  const parsed = splitPrompt(text);
  const reusable = new Map();
  for (const tag of previousTags) {
    const key = tag.value;
    if (!reusable.has(key)) reusable.set(key, []);
    reusable.get(key).push(tag);
  }
  const tags = parsed.values.map((value) => {
    const old = reusable.get(value)?.shift();
    return createTag(value, old || {});
  });
  return { tags, errors: parsed.errors, trailingSeparator: parsed.trailingSeparator };
}

export function serializePrompt(tags, options = {}) {
  const includeDisabled = Boolean(options.includeDisabled);
  const preserveEmpty = Boolean(options.preserveEmpty);
  return (tags || [])
    .filter((tag) => includeDisabled || tag.enabled !== false)
    .map((tag) => String(tag.value ?? "").trim())
    .filter((value) => preserveEmpty || value.length > 0)
    .join(", ");
}

export function outputPrompt(tags, outputLanguage = "en") {
  return serializePrompt(
    (tags || []).map((tag) => ({
      ...tag,
      value:
        normalizeTranslationText(tag.translation) && tag.translatedTo === outputLanguage
          ? normalizeTranslationText(tag.translation)
          : tag.value,
    })),
  );
}

export function classifyTag(value) {
  const text = String(value || "").trim();
  if (!text) return "empty";
  if (/^<lora:[^>]+>$/i.test(text)) return "lora";
  if (/^<lyco:[^>]+>$/i.test(text)) return "lycoris";
  if (/^(embedding:)?[\w.-]+$/i.test(text) && /^embedding:/i.test(text)) return "embedding";
  if (/^__[^_].*__$/u.test(text)) return "wildcard";
  if (/^\{[\s\S]*\|[\s\S]*\}$/u.test(text)) return "dynamic";
  if (/^BREAK$/i.test(text)) return "break";
  if (/^(#|\/\/|\/\*)/.test(text)) return "comment";
  return "normal";
}

export function canonicalTagKey(value) {
  let text = String(value || "").trim();
  const explicit = parseExplicitWeight(text);
  if (explicit) text = explicit.body;
  while (
    (text.startsWith("(") && text.endsWith(")")) ||
    (text.startsWith("[") && text.endsWith("]"))
  ) {
    text = text.slice(1, -1).trim();
  }
  return text.replace(/\s+/g, " ").toLocaleLowerCase();
}

export function findDuplicateKeys(tags) {
  const counts = new Map();
  for (const tag of tags || []) {
    const key = canonicalTagKey(tag.value);
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([key]) => key));
}

export function parseExplicitWeight(value) {
  const text = String(value || "").trim();
  if (/^<(lora|lyco):/i.test(text)) return null;
  const match = text.match(/^([([])([\s\S]+):\s*(-?\d+(?:\.\d+)?)\s*([)\]])$/u);
  if (!match) return null;
  const pairs = { "(": ")", "[": "]" };
  if (pairs[match[1]] !== match[4]) return null;
  return {
    open: match[1],
    close: match[4],
    body: match[2],
    weight: Number(match[3]),
  };
}

export function parseAdapterStrength(value) {
  const text = String(value || "").trim();
  const match = text.match(/^<(lora|lyco):([^:<>]+):\s*(\d+(?:\.\d+)?)>$/iu);
  if (!match || !match[2].trim()) return null;
  return {
    type: match[1],
    name: match[2],
    weight: Number(match[3]),
  };
}

function roundWeight(value) {
  return Number(Number(value).toFixed(2));
}

export function getTagWeight(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const adapter = parseAdapterStrength(text);
  if (adapter) return adapter.weight;
  if (/^<(lora|lyco):/i.test(text)) return null;
  return parseExplicitWeight(text)?.weight ?? 1;
}

export function setTagWeight(value, weight, min = 0.05, max = 2) {
  const text = String(value || "").trim();
  if (!text) return text;
  const numericWeight = Number(weight);
  if (!Number.isFinite(numericWeight)) return text;
  const next = Math.min(max, Math.max(min, roundWeight(numericWeight)));
  const adapter = parseAdapterStrength(text);
  if (adapter) return `<${adapter.type}:${adapter.name}:${next.toFixed(2)}>`;
  if (/^<(lora|lyco):/i.test(text)) return text;
  const parsed = parseExplicitWeight(text);
  if (next === 1) return parsed ? parsed.body.trim() : text;
  const formatted = next.toFixed(2);
  if (parsed) return `${parsed.open}${parsed.body}:${formatted}${parsed.close}`;
  return `(${text}:${formatted})`;
}

export function adjustTagWeight(value, delta, min = 0.05, max = 2) {
  const text = String(value || "").trim();
  if (!text) return text;
  const adapter = parseAdapterStrength(text);
  if (!adapter && /^<(lora|lyco):/i.test(text)) return text;
  const parsed = parseExplicitWeight(text);
  const current = adapter?.weight ?? (parsed ? parsed.weight : 1);
  const next = Math.min(max, Math.max(min, roundWeight(current + Number(delta || 0))));
  const formatted = next.toFixed(2);
  if (adapter) return `<${adapter.type}:${adapter.name}:${formatted}>`;
  if (parsed) return `${parsed.open}${parsed.body}:${formatted}${parsed.close}`;
  return `(${text}:${formatted})`;
}

export function normalizePromptTags(tags, { removeEmpty = true, removeDuplicates = false } = {}) {
  const seen = new Set();
  const normalized = [];
  for (const original of tags || []) {
    const tag = createTag(String(original.value || "").trim(), original);
    if (removeEmpty && !tag.value) continue;
    const key = canonicalTagKey(tag.value);
    if (removeDuplicates && key && seen.has(key)) continue;
    if (key) seen.add(key);
    normalized.push(tag);
  }
  return normalized;
}

export function compileBlacklist(entries) {
  const compiled = [];
  for (const entry of entries || []) {
    if (!entry || typeof entry.pattern !== "string" || !entry.pattern.length) continue;
    const mode = ["exact", "iexact", "contains", "regex"].includes(entry.mode)
      ? entry.mode
      : "exact";
    let regex = null;
    let error = "";
    if (mode === "regex") {
      if (entry.pattern.length > 256) {
        error = "Regex is too long";
      } else if (/\([^)]*[+*][^)]*\)[+*{]/.test(entry.pattern)) {
        error = "Potentially expensive nested quantifier";
      } else {
        try {
          regex = new RegExp(entry.pattern, "u");
        } catch (exception) {
          error = exception.message;
        }
      }
    }
    compiled.push({ mode, pattern: entry.pattern, regex, error });
  }
  return compiled;
}

export function matchesBlacklist(value, compiled) {
  const text = String(value || "");
  return (compiled || []).some((entry) => {
    if (entry.error) return false;
    if (entry.mode === "exact") return text === entry.pattern;
    if (entry.mode === "iexact") return text.toLocaleLowerCase() === entry.pattern.toLocaleLowerCase();
    if (entry.mode === "contains") return text.includes(entry.pattern);
    return entry.regex?.test(text) || false;
  });
}
