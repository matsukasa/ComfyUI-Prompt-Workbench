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
    tags: tags.slice(0, MAX_EDITS).map((entry) => ({
      id: text(entry?.id, 160),
      categoryId: text(entry?.categoryId, 120),
      prompt: text(entry?.prompt, 10000),
      ja: text(entry?.ja, 10000),
      deleted: Boolean(entry?.deleted),
      custom: Boolean(entry?.custom),
    })).filter((entry) => entry.id),
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

  for (const group of source.categories || []) {
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
        ja: text(item.translation?.ja, 10000), builtin: true,
      });
    });
  }

  for (const edit of edits.categories) {
    if (edit.deleted) {
      categories.delete(edit.id);
      continue;
    }
    const existing = categories.get(edit.id);
    categories.set(edit.id, {
      ...(existing || {}), ...edit,
      builtin: existing?.builtin || !edit.custom,
    });
  }
  for (const edit of edits.tags) {
    if (edit.deleted) {
      tags.delete(edit.id);
      continue;
    }
    const existing = tags.get(edit.id);
    tags.set(edit.id, {
      ...(existing || {}), ...edit,
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

  return { categories: [...categories.values()], tags: [...tags.values()] };
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
  upsert(edits.tags, {
    id: text(tag.id, 160), categoryId: text(tag.categoryId, 120),
    prompt: text(tag.prompt, 10000), ja: text(tag.ja, 10000),
    deleted: false, custom: Boolean(tag.custom),
  });
  return sanitizeLibraryEdits(edits);
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
    throw new Error("配下のタグがあるため、削除前に移動先の小分類を選択してください");
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
