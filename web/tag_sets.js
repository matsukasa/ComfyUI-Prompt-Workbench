const MAX_TEXT = 200;
const MAX_TAG_TEXT = 10000;
const LEVELS = ["large", "medium", "small"];

function text(value, max = MAX_TEXT) {
  return String(value ?? "").trim().slice(0, max);
}

function key(value) {
  return text(value).normalize("NFKC").toLocaleLowerCase().replace(/[\s_]+/gu, " ");
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
      item.name, item.nameJa, item.nameEn, ...item.tags,
      large?.ja, large?.en, medium?.ja, medium?.en, small?.ja, small?.en,
    ]).includes(normalizedQuery);
  });
}
