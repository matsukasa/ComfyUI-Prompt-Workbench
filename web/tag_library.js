import { translateUi as t } from "./i18n.js";

const LEVELS = ["large", "medium", "small"];
const MAX_EDITS = 4000;

export const EMPTY_LIBRARY_EDITS = Object.freeze({ categories: [], tags: [] });

function text(value, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}

function cloneEdits(edits) {
  return {
    categories: (edits?.categories || []).map((entry) => ({ ...entry })),
    tags: (edits?.tags || []).map((entry) => ({ ...entry })),
  };
}

export function sanitizeLibraryEdits(input = {}) {
  const categories = Array.isArray(input?.categories) ? input.categories : [];
  const tags = Array.isArray(input?.tags) ? input.tags : [];
  return {
    categories: categories.slice(0, MAX_EDITS).map((entry) => ({
      id: text(entry?.id, 120),
      level: LEVELS.includes(entry?.level) ? entry.level : "small",
      parentId: text(entry?.parentId, 120),
      en: text(entry?.en),
      ja: text(entry?.ja),
      deleted: Boolean(entry?.deleted),
      custom: Boolean(entry?.custom),
    })).filter((entry) => entry.id),
    tags: tags.slice(0, MAX_EDITS).map((entry) => {
      const sanitized = {
        id: text(entry?.id, 160),
        categoryId: text(entry?.categoryId, 120),
        prompt: text(entry?.prompt, 10000),
        ja: text(entry?.ja, 10000),
        deleted: Boolean(entry?.deleted),
        custom: Boolean(entry?.custom),
      };
      if (Number.isInteger(entry?.order) && entry.order >= 0) sanitized.order = Math.min(entry.order, MAX_EDITS);
      return sanitized;
    }).filter((entry) => entry.id),
  };
}

function key(value) {
  return text(value).toLocaleLowerCase().replace(/[^a-z0-9\p{L}]+/gu, "-").replace(/^-|-$/gu, "") || "category";
}

function groupName(label, parent, language) {
  const full = text(label?.[language]);
  const prefix = text(parent?.[language]);
  if (!full) return language === "ja" ? "名称なし" : "Untitled";
  if (prefix && full.startsWith(`${prefix} /`)) return full.slice(prefix.length + 2).trim() || (language === "ja" ? "一般" : "General");
  return full;
}

export function buildTagLibrary(source = {}, rawEdits = EMPTY_LIBRARY_EDITS) {
  const edits = sanitizeLibraryEdits(rawEdits);
  const categories = new Map();
  const tags = new Map();
  const largeIds = new Map();
  const isDanbooruCatalog = Array.isArray(source.major_categories);
  const isStoredCatalog = source.schema === "prompt-workbench/tag-catalog" && source.version === 1;

  if (isStoredCatalog) {
    for (const category of source.categories || []) {
      const id = text(category?.id, 120);
      if (!id) continue;
      categories.set(id, {
        id,
        level: LEVELS.includes(category?.level) ? category.level : "small",
        parentId: text(category?.parentId, 120),
        en: text(category?.en),
        ja: text(category?.ja),
        builtin: true,
      });
    }
    for (const [index, tag] of (source.tags || []).entries()) {
      const id = text(tag?.id, 160) || `stored-tag:${index}`;
      tags.set(id, {
        id,
        categoryId: text(tag?.categoryId, 120),
        prompt: text(tag?.prompt, 10000),
        ja: text(tag?.ja, 10000),
        order: Number.isInteger(tag?.order) ? Math.max(0, tag.order) : index,
        builtin: true,
      });
    }
  }

  if (isDanbooruCatalog && !isStoredCatalog) {
    for (const major of source.major_categories) {
      const largeId = `danbooru:${text(major.id, 100)}`;
      categories.set(largeId, {
        id: largeId, level: "large", parentId: "", en: "", ja: text(major.label_ja), builtin: true,
      });
      for (const medium of major.medium_categories || []) {
        const mediumId = `danbooru:${text(medium.id, 100)}`;
        categories.set(mediumId, {
          id: mediumId, level: "medium", parentId: largeId, en: "", ja: text(medium.label_ja), builtin: true,
        });
        for (const small of medium.small_categories || []) {
          const smallId = `danbooru:${text(small.id, 100)}`;
          categories.set(smallId, {
            id: smallId, level: "small", parentId: mediumId, en: "", ja: text(small.label_ja), builtin: true,
          });
          (small.tags || []).forEach((item, index) => {
            const officialId = text(item.id, 80) || `${small.id}:${index}`;
            const id = `danbooru-tag:${officialId}`;
            tags.set(id, {
              id, categoryId: smallId, prompt: text(item.name, 10000),
              ja: text(item.translation_ja ?? item.ja, 10000),
              order: Number.isInteger(item.rank) ? Math.max(0, item.rank - 1) : index,
              postCount: Number.isInteger(item.post_count) ? Math.max(0, item.post_count) : 0,
              aliases: Array.isArray(item.aliases) ? item.aliases.map((alias) => text(alias, 200)).filter(Boolean) : [],
              builtin: true,
            });
          });
        }
      }
    }
  }

  for (const group of (isDanbooruCatalog || isStoredCatalog) ? [] : (source.categories || [])) {
    const parentKey = `${text(group.parent?.en)}\u0000${text(group.parent?.ja)}`;
    let largeId = largeIds.get(parentKey);
    if (!largeId) {
      largeId = `large:${key(group.parent?.en || group.parent?.ja)}`;
      let suffix = 2;
      while (categories.has(largeId)) largeId = `large:${key(group.parent?.en || group.parent?.ja)}-${suffix++}`;
      largeIds.set(parentKey, largeId);
      categories.set(largeId, {
        id: largeId, level: "large", parentId: "",
        en: text(group.parent?.en) || "Category", ja: text(group.parent?.ja) || "カテゴリー",
        builtin: true,
      });
    }
    const mediumId = `medium:${text(group.id, 80)}`;
    const smallId = `small:${text(group.id, 80)}:general`;
    categories.set(mediumId, {
      id: mediumId, level: "medium", parentId: largeId,
      en: groupName(group.label, group.parent, "en"),
      ja: groupName(group.label, group.parent, "ja"), builtin: true,
    });
    categories.set(smallId, {
      id: smallId, level: "small", parentId: mediumId,
      en: "General", ja: "一般", builtin: true,
    });
    (group.items || []).forEach((item, index) => {
      const id = `tag:${text(group.id, 80)}:${index}`;
      tags.set(id, {
        id, categoryId: smallId, prompt: text(item.prompt, 10000),
        ja: text(item.translation?.ja, 10000), order: index, builtin: true,
      });
    });
  }

  const customCategoryIds = new Set(edits.categories.filter((edit) => edit.custom && !edit.deleted).map((edit) => edit.id));
  const ensureCustomFallback = () => {
    if (!categories.has("custom:root")) categories.set("custom:root", { id: "custom:root", level: "large", parentId: "", en: "User", ja: "ユーザー定義", builtin: false, custom: true });
    if (!categories.has("custom:medium")) categories.set("custom:medium", { id: "custom:medium", level: "medium", parentId: "custom:root", en: "Custom", ja: "独自カテゴリー", builtin: false, custom: true });
    if (!categories.has("custom:small")) categories.set("custom:small", { id: "custom:small", level: "small", parentId: "custom:medium", en: "Tags", ja: "独自タグ", builtin: false, custom: true });
  };
  for (const edit of edits.categories) {
    if (edit.deleted) {
      categories.delete(edit.id);
      continue;
    }
    const existing = categories.get(edit.id);
    if (isDanbooruCatalog && !existing && !edit.custom) continue;
    const adjusted = { ...edit };
    if (isDanbooruCatalog && edit.custom && edit.parentId && !categories.has(edit.parentId) && !customCategoryIds.has(edit.parentId)) {
      ensureCustomFallback();
      adjusted.parentId = edit.level === "small" ? "custom:medium" : edit.level === "medium" ? "custom:root" : "";
    }
    categories.set(adjusted.id, {
      ...(existing || {}), ...adjusted,
      builtin: existing?.builtin || !edit.custom,
    });
  }
  for (const edit of edits.tags) {
    if (edit.deleted) {
      tags.delete(edit.id);
      continue;
    }
    const existing = tags.get(edit.id);
    if (isDanbooruCatalog && !existing && !edit.custom) continue;
    const adjusted = { ...edit };
    if (isDanbooruCatalog && edit.custom && !categories.has(edit.categoryId)) {
      ensureCustomFallback();
      adjusted.categoryId = "custom:small";
    }
    tags.set(edit.id, {
      ...(existing || {}), ...adjusted,
      builtin: existing?.builtin || !edit.custom,
    });
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const category of [...categories.values()]) {
      if (category.parentId && !categories.has(category.parentId)) {
        categories.delete(category.id);
        changed = true;
      }
    }
  }
  for (const tag of [...tags.values()]) {
    if (!tag.prompt || !categories.has(tag.categoryId)) tags.delete(tag.id);
  }

  const categoryList = [...categories.values()];
  const categoryOrder = new Map(categoryList.map((category, index) => [category.id, index]));
  const tagList = [...tags.values()];
  tagList.sort((left, right) => {
    const categoryDifference = (categoryOrder.get(left.categoryId) ?? MAX_EDITS) - (categoryOrder.get(right.categoryId) ?? MAX_EDITS);
    if (categoryDifference) return categoryDifference;
    return (Number.isInteger(left.order) ? left.order : MAX_EDITS) - (Number.isInteger(right.order) ? right.order : MAX_EDITS);
  });
  return { categories: categoryList, tags: tagList };
}

function upsert(list, entry) {
  const index = list.findIndex((item) => item.id === entry.id);
  if (index >= 0) list[index] = { ...list[index], ...entry };
  else list.push(entry);
}

export function saveCategoryEdit(rawEdits, category) {
  const edits = cloneEdits(sanitizeLibraryEdits(rawEdits));
  upsert(edits.categories, {
    id: text(category.id, 120), level: LEVELS.includes(category.level) ? category.level : "small",
    parentId: text(category.parentId, 120), en: text(category.en), ja: text(category.ja),
    deleted: false, custom: Boolean(category.custom),
  });
  return sanitizeLibraryEdits(edits);
}

export function saveTagEdit(rawEdits, tag) {
  const edits = cloneEdits(sanitizeLibraryEdits(rawEdits));
  const entry = {
    id: text(tag.id, 160), categoryId: text(tag.categoryId, 120),
    prompt: text(tag.prompt, 10000), ja: text(tag.ja, 10000),
    deleted: false, custom: Boolean(tag.custom),
  };
  if (Number.isInteger(tag.order) && tag.order >= 0) entry.order = Math.min(tag.order, MAX_EDITS);
  upsert(edits.tags, entry);
  return sanitizeLibraryEdits(edits);
}

export function reorderTagEdits(rawEdits, categoryTags, draggedId, targetId, position = "before") {
  const tags = Array.isArray(categoryTags) ? categoryTags.map((tag) => ({ ...tag })) : [];
  const dragged = tags.find((tag) => tag.id === draggedId);
  const target = tags.find((tag) => tag.id === targetId);
  if (!dragged || !target || dragged.id === target.id || dragged.categoryId !== target.categoryId) {
    return sanitizeLibraryEdits(rawEdits);
  }
  const draggedIndex = tags.findIndex((tag) => tag.id === dragged.id);
  const [moved] = tags.splice(draggedIndex, 1);
  const targetIndex = tags.findIndex((tag) => tag.id === target.id);
  tags.splice(targetIndex + (position === "after" ? 1 : 0), 0, moved);
  let edits = sanitizeLibraryEdits(rawEdits);
  tags.forEach((tag, order) => {
    edits = saveTagEdit(edits, { ...tag, order, custom: !tag.builtin });
  });
  return edits;
}

export function deleteTagEdit(rawEdits, tag) {
  const edits = cloneEdits(sanitizeLibraryEdits(rawEdits));
  upsert(edits.tags, { ...tag, deleted: true });
  return sanitizeLibraryEdits(edits);
}

export function deleteCategoryEdit(source, rawEdits, categoryId, destinationSmallId = "") {
  const library = buildTagLibrary(source, rawEdits);
  const byParent = new Map();
  for (const category of library.categories) {
    if (!byParent.has(category.parentId)) byParent.set(category.parentId, []);
    byParent.get(category.parentId).push(category);
  }
  const removedIds = new Set();
  const visit = (id) => {
    removedIds.add(id);
    for (const child of byParent.get(id) || []) visit(child.id);
  };
  visit(categoryId);
  const affectedTags = library.tags.filter((tag) => removedIds.has(tag.categoryId));
  const destination = library.categories.find((category) => category.id === destinationSmallId && category.level === "small");
  if (affectedTags.length && (!destination || removedIds.has(destination.id))) {
    throw new Error(t("配下のタグがあるため、削除前に移動先の小分類を選択してください"));
  }

  let edits = cloneEdits(sanitizeLibraryEdits(rawEdits));
  for (const tag of affectedTags) edits = saveTagEdit(edits, { ...tag, categoryId: destination.id, custom: !tag.builtin });
  for (const id of removedIds) {
    const category = library.categories.find((item) => item.id === id);
    upsert(edits.categories, { ...category, deleted: true, custom: !category?.builtin });
  }
  return sanitizeLibraryEdits(edits);
}

export function libraryToExampleData(library) {
  const categories = library.categories.filter((category) => category.level === "small").map((small) => {
    const medium = library.categories.find((category) => category.id === small.parentId);
    const large = library.categories.find((category) => category.id === medium?.parentId);
    return {
      id: small.id,
      parent: { en: large?.en || "", ja: large?.ja || "" },
      label: {
        en: [large?.en, medium?.en, small.en].filter(Boolean).join(" / "),
        ja: [large?.ja, medium?.ja, small.ja].filter(Boolean).join(" / "),
      },
      items: library.tags.filter((tag) => tag.categoryId === small.id).map((tag) => ({
        prompt: tag.prompt, translation: { ja: tag.ja }, id: tag.id,
      })),
    };
  });
  return { categories };
}

export function libraryToStoredCatalog(library) {
  return {
    schema: "prompt-workbench/tag-catalog",
    version: 1,
    categories: (library?.categories || []).map((category) => ({
      id: text(category.id, 120),
      level: LEVELS.includes(category.level) ? category.level : "small",
      parentId: text(category.parentId, 120),
      en: text(category.en),
      ja: text(category.ja),
    })),
    tags: (library?.tags || []).map((tag, index) => ({
      id: text(tag.id, 160),
      categoryId: text(tag.categoryId, 120),
      prompt: text(tag.prompt, 10000),
      ja: text(tag.ja, 10000),
      order: Number.isInteger(tag.order) ? tag.order : index,
    })),
  };
}

export function libraryToBundledCatalog(library, source = {}) {
  const categories = Array.isArray(library?.categories) ? library.categories : [];
  const tags = Array.isArray(library?.tags) ? library.tags : [];
  const sourceCategories = new Map();
  const sourceTags = new Map();
  const hasBundledSource = Array.isArray(source?.major_categories);

  if (hasBundledSource) {
    for (const major of source.major_categories) {
      sourceCategories.set(`danbooru:${text(major?.id, 100)}`, major);
      for (const medium of major?.medium_categories || []) {
        sourceCategories.set(`danbooru:${text(medium?.id, 100)}`, medium);
        for (const small of medium?.small_categories || []) {
          sourceCategories.set(`danbooru:${text(small?.id, 100)}`, small);
          for (const [index, item] of (small?.tags || []).entries()) {
            const officialId = text(item?.id, 80) || `${small?.id}:${index}`;
            sourceTags.set(`danbooru-tag:${officialId}`, item);
          }
        }
      }
    }
  }

  const categoriesByParent = new Map();
  for (const category of categories) {
    const children = categoriesByParent.get(category.parentId) || [];
    children.push(category);
    categoriesByParent.set(category.parentId, children);
  }
  const tagsByCategory = new Map();
  for (const tag of tags) {
    const children = tagsByCategory.get(tag.categoryId) || [];
    children.push(tag);
    tagsByCategory.set(tag.categoryId, children);
  }

  const categoryObject = (category, childKey, children) => {
    const original = sourceCategories.get(category.id) || {};
    const output = {
      ...original,
      id: original.id ?? category.id,
      label_ja: text(category.ja),
    };
    if (category.en || Object.hasOwn(original, "label_en")) output.label_en = text(category.en);
    output[childKey] = children;
    return output;
  };
  const tagObject = (tag) => {
    const original = sourceTags.get(tag.id) || {};
    const output = {
      ...original,
      id: original.id ?? tag.id,
      name: text(tag.prompt, 10000),
    };
    if (tag.ja || Object.hasOwn(original, "translation_ja")) output.translation_ja = text(tag.ja, 10000);
    if (tag.aliases?.length || Object.hasOwn(original, "aliases")) output.aliases = [...(tag.aliases || [])];
    if (Number.isInteger(tag.postCount) || Object.hasOwn(original, "post_count")) output.post_count = Number.isInteger(tag.postCount) ? tag.postCount : 0;
    return output;
  };
  const smallObject = (small) => categoryObject(
    small,
    "tags",
    (tagsByCategory.get(small.id) || []).map(tagObject),
  );
  const mediumObject = (medium) => categoryObject(
    medium,
    "small_categories",
    (categoriesByParent.get(medium.id) || []).filter((item) => item.level === "small").map(smallObject),
  );
  const majorCategories = (categoriesByParent.get("") || [])
    .filter((item) => item.level === "large")
    .map((major) => categoryObject(
      major,
      "medium_categories",
      (categoriesByParent.get(major.id) || []).filter((item) => item.level === "medium").map(mediumObject),
    ));

  const output = hasBundledSource ? { ...source } : { schema_version: 1 };
  output.schema_version = Number.isInteger(source?.schema_version) ? source.schema_version : 1;
  output.major_categories = majorCategories;
  if (output.stats && typeof output.stats === "object" && !Array.isArray(output.stats)) {
    output.stats = {
      ...output.stats,
      tags: tags.length,
      major_categories: categories.filter((item) => item.level === "large").length,
      medium_categories: categories.filter((item) => item.level === "medium").length,
      small_categories: categories.filter((item) => item.level === "small").length,
    };
  }
  return output;
}
