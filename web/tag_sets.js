const MAX_TEXT = 200;
const MAX_TAG_TEXT = 10000;
const LEVELS = ["large", "medium", "small"];
export const MAX_TAG_SETS = 2000;

export function validateTagSetCatalog(source) {
  if (!source || source.schema_version !== 1 || !Array.isArray(source.major_categories)) {
    throw new Error("Tag set file must contain schema_version: 1 and major_categories");
  }
  if (new TextEncoder().encode(JSON.stringify(source)).length > 4 * 1024 * 1024) throw new Error("Tag set file exceeds the 4 MB limit");
  let categoryCount = 0;
  let setCount = 0;
  const categoryIds = new Set();
  const category = (item, children) => {
    if (!item || !Array.isArray(item[children])) throw new Error(`Every tag set category must contain ${children}`);
    categoryCount += 1;
    const id = text(item.id, 120);
    if (id && categoryIds.has(id)) throw new Error(`Duplicate tag set category id: ${id}`);
    if (id) categoryIds.add(id);
    return item[children];
  };
  for (const major of source.major_categories) {
    for (const medium of category(major, "medium_categories")) {
      for (const small of category(medium, "small_categories")) {
        const sets = category(small, "sets");
        setCount += sets.length;
        for (const item of sets) {
          if (!item || !Array.isArray(item.tags) || !item.tags.length || item.tags.length > 100) {
            throw new Error("A tag set must contain 1 to 100 tags");
          }
          if (item.tags.some((tag) => typeof tag !== "string" || !tag.trim() || [...tag].length > MAX_TAG_TEXT)) {
            throw new Error("Every tag in a set must be a non-empty string of at most 10000 characters");
          }
          for (const [field, limit] of Object.entries({ id: 160, name: 200, name_ja: 200, name_en: 200,
            creator: 200, description: 10000, source_url: 1000, image_url: 1000, image_path: 1000 })) {
            if (field in item && (typeof item[field] !== "string" || [...item[field]].length > limit)) {
              throw new Error(`Invalid tag set field: ${field}`);
            }
          }
        }
      }
    }
  }
  if (categoryCount > 500) throw new Error("Tag set file contains too many categories");
  if (setCount > MAX_TAG_SETS) throw new Error(`Tag set file contains too many sets (maximum ${MAX_TAG_SETS})`);
}

export function normalizeTagSetIds(source) {
  validateTagSetCatalog(source);
  const result = JSON.parse(JSON.stringify(source));
  const sets = result.major_categories.flatMap((a) => a.medium_categories.flatMap((b) => b.small_categories.flatMap((c) => c.sets)));
  const reserved = new Set(sets.map((item) => text(item.id, 160)).filter(Boolean));
  const used = new Set();
  for (const item of sets) {
    const id = text(item.id, 160);
    if (!id) continue;
    if (used.has(id)) {
      let suffix = 2;
      let replacement;
      do { replacement = `${id.slice(0, 140)}:duplicate:${suffix++}`; } while (used.has(replacement) || reserved.has(replacement));
      item.id = replacement;
      if (!Array.isArray(result.warnings)) result.warnings = [];
      result.warnings.push(`Duplicate tag set id migrated: ${id} -> ${replacement}`);
    }
    used.add(item.id);
  }
  return result;
}

function text(value, max = MAX_TEXT) {
  return String(value ?? "").trim().slice(0, max);
}

function key(value) {
  return text(value, MAX_TAG_TEXT).normalize("NFKC").toLocaleLowerCase().replace(/[\s_]+/gu, " ");
}

function searchableText(parts) {
  return parts.filter(Boolean).map(key).join(" ");
}

function emptyCatalog(warnings = []) {
  return { schema_version: 1, major_categories: [], warnings };
}

export async function fetchTagSetCatalog(api) {
  const response = await api.fetchApi("/prompt_workbench/tag_sets");
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || `Failed to load tag sets (${response.status})`);
  }
  return body && typeof body === "object" ? body : emptyCatalog(["Tag set response was not an object"]);
}

export function buildTagSetLibrary(source = {}) {
  if (source.schema_version === 1) source = normalizeTagSetIds(source);
  const categories = [];
  const sets = [];
  const warnings = Array.isArray(source?.warnings) ? source.warnings.map((item) => text(item, 500)).filter(Boolean) : [];
  const majors = Array.isArray(source?.major_categories) ? source.major_categories : [];

  const addCategory = (id, level, parentId, labelJa, labelEn = "") => {
    const category = {
      id: text(id, 120),
      level: LEVELS.includes(level) ? level : "small",
      parentId: text(parentId, 120),
      ja: text(labelJa),
      en: text(labelEn),
    };
    if (!category.id) return null;
    categories.push(category);
    return category;
  };

  for (const [majorIndex, major] of majors.entries()) {
    if (!major || typeof major !== "object") {
      warnings.push(`Skipped invalid major category at ${majorIndex}`);
      continue;
    }
    const large = addCategory(major.id || `tagset:major:${majorIndex}`, "large", "", major.label_ja || major.name_ja || major.name, major.label_en || "");
    if (!large) continue;
    for (const [mediumIndex, medium] of (Array.isArray(major.medium_categories) ? major.medium_categories : []).entries()) {
      if (!medium || typeof medium !== "object") {
        warnings.push(`Skipped invalid medium category under ${large.id}`);
        continue;
      }
      const mediumCategory = addCategory(
        medium.id || `${large.id}:medium:${mediumIndex}`,
        "medium",
        large.id,
        medium.label_ja || medium.name_ja || medium.name,
        medium.label_en || "",
      );
      if (!mediumCategory) continue;
      for (const [smallIndex, small] of (Array.isArray(medium.small_categories) ? medium.small_categories : []).entries()) {
        if (!small || typeof small !== "object") {
          warnings.push(`Skipped invalid small category under ${mediumCategory.id}`);
          continue;
        }
        const smallCategory = addCategory(
          small.id || `${mediumCategory.id}:small:${smallIndex}`,
          "small",
          mediumCategory.id,
          small.label_ja || small.name_ja || small.name,
          small.label_en || "",
        );
        if (!smallCategory) continue;
        for (const [setIndex, item] of (Array.isArray(small.sets) ? small.sets : []).entries()) {
          if (!item || typeof item !== "object") {
            warnings.push(`Skipped invalid tag set under ${smallCategory.id}`);
            continue;
          }
          const tags = (Array.isArray(item.tags) ? item.tags : [])
            .map((tag) => text(tag, MAX_TAG_TEXT))
            .filter(Boolean);
          if (!tags.length) {
            warnings.push(`Skipped empty tag set under ${smallCategory.id}`);
            continue;
          }
          const id = text(item.id, 160) || `${smallCategory.id}:set:${setIndex}`;
          sets.push({
            id,
            categoryId: smallCategory.id,
            name: text(item.name || item.name_en || item.name_ja || id),
            nameJa: text(item.name_ja || item.name || id),
            nameEn: text(item.name_en || item.name || ""),
            creator: text(item.creator, 200),
            description: text(item.description, MAX_TAG_TEXT),
            sourceUrl: text(item.source_url, 1000),
            imageUrl: text(item.image_url, 1000),
            imagePath: text(item.image_path, 1000),
            tags,
            preview: tags.slice(0, 6).join(", "),
          });
        }
      }
    }
  }
  return { categories, sets, warnings };
}

export function resolveTagSetCategoryPath(library, requested = {}) {
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

export function tagSetFavoriteKey(value) {
  return text(value, 160).normalize("NFKC").toLocaleLowerCase();
}

export function filterTagSets(library, selectedSmallId, query = "") {
  const normalizedQuery = key(query);
  const categories = new Map((library?.categories || []).map((category) => [category.id, category]));
  return (library?.sets || []).filter((item) => {
    if (!normalizedQuery) return item.categoryId === selectedSmallId;
    const small = categories.get(item.categoryId);
    const medium = categories.get(small?.parentId);
    const large = categories.get(medium?.parentId);
    return searchableText([
      item.name, item.nameJa, item.nameEn, item.description, item.creator, ...item.tags,
      large?.ja, large?.en, medium?.ja, medium?.en, small?.ja, small?.en,
    ]).includes(normalizedQuery);
  });
}
