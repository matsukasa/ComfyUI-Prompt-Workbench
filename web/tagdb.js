const SUGGESTION_LIMIT = 10;
const SUGGESTION_DELAY_MS = 150;

export async function searchTagDb(api, query, { language = "ja", contains = false, limit = SUGGESTION_LIMIT, signal } = {}) {
  const params = new URLSearchParams({ q: query, language, limit: String(limit) });
  if (contains) params.set("contains", "1");
  try {
    const response = await api.fetchApi(`/prompt_workbench/tagdb/search?${params}`, { signal });
    if (!response.ok) return [];
    return (await response.json()).results || [];
  } catch {
    return [];
  }
}

export async function validateTagDb(api, tags) {
  try {
    const response = await api.fetchApi("/prompt_workbench/tagdb/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags }),
    });
    if (!response.ok) return null;
    const body = await response.json();
    return body.available ? body.results : null;
  } catch {
    return null;
  }
}

export function tagDbKey(value) {
  return String(value || "").trim().replace(/[_\s]+/gu, " ").toLocaleLowerCase();
}

export function promptTokenAt(text, caret) {
  const isSeparator = (character) => character === "," || character === "\n";
  let start = caret;
  while (start > 0 && !isSeparator(text[start - 1])) start -= 1;
  while (start < caret && /[\s([{]/u.test(text[start])) start += 1;
  return { start, end: caret, text: text.slice(start, caret) };
}

export function shouldSearchTagDb(text) {
  const value = String(text || "").trim();
  if (!value || /^</u.test(value) || /[:|{}]/u.test(value)) return false;
  return /[^\x00-\x7f]/u.test(value) || value.length >= 2;
}

export function attachTagSuggestions(input, { api, language, onPick }) {
  let menu = null;
  let items = [];
  let active = -1;
  let timer = 0;
  let abort = null;

  const close = () => {
    clearTimeout(timer);
    abort?.abort();
    menu?.remove();
    menu = null;
    items = [];
    active = -1;
  };

  const pick = (item) => {
    close();
    if (onPick) {
      onPick(item);
      return;
    }
    const token = promptTokenAt(input.value, input.selectionStart);
    const insertion = `${item.tag}, `;
    input.setRangeText(insertion, token.start, token.end, "end");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    close();
  };

  const highlight = () => {
    [...(menu?.children || [])].forEach((option, index) => {
      option.classList.toggle("is-active", index === active);
      if (index === active) option.scrollIntoView({ block: "nearest" });
    });
  };

  const show = () => {
    menu?.remove();
    menu = null;
    active = -1;
    if (!items.length) return;
    menu = document.createElement("div");
    menu.className = "paio-context-menu paio-tagdb-suggestions";
    menu.setAttribute("role", "listbox");
    for (const item of items) {
      const option = document.createElement("div");
      option.className = "paio-tagdb-option";
      option.setAttribute("role", "option");
      const name = document.createElement("span");
      name.className = "paio-tagdb-option-tag";
      name.textContent = item.tag;
      const translation = document.createElement("span");
      translation.className = "paio-tagdb-option-translation";
      translation.textContent = item.translations.join(" / ");
      const count = document.createElement("span");
      count.className = "paio-tagdb-option-count";
      count.textContent = item.count ? item.count.toLocaleString() : "";
      option.append(name, translation, count);
      option.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        pick(item);
      });
      menu.append(option);
    }
    const rect = input.getBoundingClientRect();
    menu.style.left = `${Math.max(6, Math.min(rect.left, window.innerWidth - 366))}px`;
    menu.style.top = `${rect.bottom + 2}px`;
    document.body.append(menu);
    const height = menu.getBoundingClientRect().height;
    if (rect.bottom + height + 8 > window.innerHeight) {
      menu.style.top = `${Math.max(6, rect.top - height - 2)}px`;
    }
  };

  input.addEventListener("input", () => {
    clearTimeout(timer);
    abort?.abort();
    const token = promptTokenAt(input.value, input.selectionStart);
    if (!shouldSearchTagDb(token.text)) {
      close();
      return;
    }
    timer = window.setTimeout(async () => {
      abort = new AbortController();
      const { signal } = abort;
      const results = await searchTagDb(api, token.text.trim(), { language: language(), signal });
      if (signal.aborted) return;
      items = results;
      show();
    }, SUGGESTION_DELAY_MS);
  });
  input.addEventListener("blur", close);
  // 既存の Enter 処理より先に受け取るため capture で登録する。
  input.addEventListener("keydown", (event) => {
    if (!menu || event.isComposing) return;
    const consume = () => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      consume();
      const step = event.key === "ArrowDown" ? 1 : -1;
      active = (active + step + items.length) % items.length;
      highlight();
    } else if (event.key === "Escape") {
      consume();
      close();
    } else if (event.key === "Tab" || (event.key === "Enter" && active >= 0 && !event.ctrlKey && !event.metaKey)) {
      consume();
      pick(items[Math.max(active, 0)]);
    }
  }, true);
}
