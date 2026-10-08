const PALETTE = Object.freeze(["#dd7a7a", "#b17fdb", "#7f8ddf", "#7eba74", "#d3c766", "#59bfc6", "#e6a564", "#e55c91"]);
export const CATEGORY_DEFAULTS = Object.freeze({
  "catalog_major:person_body": PALETTE[0],
  "catalog_major:expression_action": PALETTE[3],
  "catalog_major:clothing_accessory": PALETTE[2],
  "catalog_major:place_nature": PALETTE[4],
  "catalog_major:objects_living": PALETTE[6],
  "catalog_major:composition_view": PALETTE[5],
  "catalog_major:style_quality": PALETTE[1],
  "catalog_major:adult": PALETTE[7],
  "tagset_major:people": PALETTE[0],
  "tagset_major:outfit_uniform_work": PALETTE[2],
  "tagset_major:composition": PALETTE[5],
  "tagset:major:1": PALETTE[4],
  "tagset:major:3": PALETTE[1],
});
export const UNKNOWN_CATEGORY_COLOR = "#b2b9c0";
export function validCategoryColor(value) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : null;
}
export function sanitizeCategoryColors(value) {
  const colors = { overrides: {}, unknown: null };
  if (!value || typeof value !== "object") return colors;
  if (value.overrides && typeof value.overrides === "object" && !Array.isArray(value.overrides)) {
    for (const [id, color] of Object.entries(value.overrides).slice(0, 1000)) {
      if (id && id.length <= 160 && !["__proto__", "constructor", "prototype"].includes(id) && validCategoryColor(color)) colors.overrides[id] = validCategoryColor(color);
    }
  }
  colors.unknown = validCategoryColor(value.unknown);
  return colors;
}
export function categoryColorId(category) {
  if (!category || /^(未分類|分類不明|uncategorized|unclassified|unknown)$/i.test(category.ja || category.en || "")) return "";
  return String(category.colorId ?? category.id ?? "").replace(/^danbooru:/, "");
}
export function defaultCategoryColor(id) {
  if (!id) return UNKNOWN_CATEGORY_COLOR;
  if (Object.hasOwn(CATEGORY_DEFAULTS, id)) return CATEGORY_DEFAULTS[id];
  let hash = 2166136261;
  for (const character of id) hash = Math.imul(hash ^ character.codePointAt(0), 16777619) >>> 0;
  return PALETTE[hash % PALETTE.length];
}
export function categoryBaseColor(id, settings) {
  return validCategoryColor(id ? settings?.overrides?.[id] : settings?.unknown) || defaultCategoryColor(id);
}
export function majorCategory(library, categoryId) {
  const categories = new Map((library?.categories || []).map((item) => [item.id, item]));
  const visited = new Set();
  let category = categories.get(categoryId);
  while (category && !visited.has(category.id)) {
    if (category.level === "large") return category;
    visited.add(category.id);
    category = categories.get(category.parentId);
  }
  return null;
}
export function categoryPromptKey(value) {
  return String(value || "").trim().normalize("NFKC").replace(/[_\s]+/gu, " ").toLowerCase();
}
export function tagCategoryIndex(library) {
  const index = new Map();
  for (const tag of library?.tags || []) {
    const id = categoryColorId(majorCategory(library, tag.categoryId));
    for (const value of [tag.prompt, ...(tag.aliases || [])]) {
      const key = categoryPromptKey(value);
      if (index.has(key) && index.get(key) !== id) index.set(key, "");
      else if (!index.has(key)) index.set(key, id);
    }
  }
  return index;
}
function channels(hex) { return [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16)); }
function mix(first, second, amount) {
  return "#" + first.map((value, index) => Math.round(value * (1 - amount) + second[index] * amount).toString(16).padStart(2, "0")).join("");
}
function luminance(hex) {
  const values = channels(hex).map((value) => value / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
}
function contrast(first, second) {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
function readablePalette(background, hover, border) {
  const white = "#f6f7f9", black = "#171b22";
  const score = (ink) => Math.min(contrast(ink, background), contrast(ink, hover));
  const ink = score(white) >= score(black) ? white : black;
  const target = ink === white ? [0, 0, 0] : [255, 255, 255];
  while (contrast(ink, background) < 4.5) background = mix(channels(background), target, 0.05);
  while (contrast(ink, hover) < 4.5) hover = mix(channels(hover), target, 0.05);
  return { background, hover, border, ink };
}
export function categoryPalette(base) {
  const color = channels(validCategoryColor(base) || UNKNOWN_CATEGORY_COLOR);
  return {
    dark: readablePalette(mix(color, [29, 33, 39], 0.28), mix(color, [29, 33, 39], 0.20), mix(color, [255, 255, 255], 0.12)),
    light: readablePalette(mix(color, [255, 255, 255], 0.72), mix(color, [255, 255, 255], 0.62), mix(color, [80, 84, 90], 0.2)),
  };
}
export function applyCategoryColor(control, id, settings) {
  control.classList.add("paio-category-colored");
  control.dataset.colorCategory = id;
  control.dataset.colorBase = categoryBaseColor(id, settings);
  const palettes = categoryPalette(control.dataset.colorBase);
  for (const [theme, palette] of Object.entries(palettes)) {
    for (const [role, color] of Object.entries(palette)) control.style.setProperty(`--paio-category-${theme}-${role}`, color);
  }
}
