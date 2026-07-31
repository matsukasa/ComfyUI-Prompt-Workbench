import {
  adjustTagWeight,
  canonicalTagKey,
  classifyTag,
  compileBlacklist,
  createTag,
  findDuplicateKeys,
  matchesBlacklist,
  normalizePromptTags,
  outputPrompt,
  parsePrompt,
} from "./prompt_parser.js";
import {
  DEFAULT_SETTINGS,
  exportEditorState,
  parseImportedState,
  sanitizeEditorState,
} from "./settings.js";
import { translateTags } from "./translation.js";

const STATE_KEY = "promptAllInOneState";
const MAX_RENDERED_TAGS = 250;
const COLOR_DEFAULTS = {
  normal: "#7b8794", disabled: "#6b7280", lora: "#3b82f6", lycoris: "#a855f7",
  embedding: "#14b8a6", wildcard: "#eab308", duplicate: "#f59e0b",
  blacklist: "#ef4444", missing: "#ef4444", error: "#dc2626",
};

function element(tagName, options = {}, children = []) {
  const node = document.createElement(tagName);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = String(options.text);
  if (options.type) node.type = options.type;
  if (options.title) node.title = options.title;
  if (options.ariaLabel) node.setAttribute("aria-label", options.ariaLabel);
  for (const [name, value] of Object.entries(options.dataset || {})) node.dataset[name] = value;
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child) node.append(child);
  }
  return node;
}

function button(label, action, title = label) {
  const control = element("button", {
    className: "paio-button",
    text: label,
    type: "button",
    title,
  });
  control.addEventListener("click", action);
  return control;
}

function download(name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const area = document.createElement("textarea");
  area.value = text;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.append(area);
  area.select();
  document.execCommand("copy");
  area.remove();
}

function openDialog(dialog) {
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

function closeDialog(dialog) {
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

export class PromptEditor {
  constructor(node, widgets, api) {
    this.node = node;
    this.widgets = widgets;
    this.api = api;
    this.activeSide = "positive";
    this.tags = { positive: [], negative: [] };
    this.settings = { ...DEFAULT_SETTINGS };
    this.filterText = "";
    this.filterMode = "all";
    this.undoStack = [];
    this.redoStack = [];
    this.lastSelectedIndex = null;
    this.dragIndex = null;
    this.renderLimit = MAX_RENDERED_TAGS;
    this.modelRegistry = { loras: null, embeddings: null };
    this.syncing = false;
    this.lastWidgetValues = { positive: "", negative: "" };
    this.restore();
    this.root = this.build();
    this.attach();
    this.loadModelRegistry();
    this.pollTimer = window.setInterval(() => this.syncFromWidgets(), 400);
  }

  get currentTags() {
    return this.tags[this.activeSide];
  }

  snapshot() {
    return typeof structuredClone === "function"
      ? structuredClone({ tags: this.tags, settings: this.settings, activeSide: this.activeSide })
      : JSON.parse(JSON.stringify({ tags: this.tags, settings: this.settings, activeSide: this.activeSide }));
  }

  pushUndo() {
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  restoreSnapshot(snapshot) {
    this.tags = snapshot.tags;
    this.settings = snapshot.settings;
    this.activeSide = snapshot.activeSide;
    this.syncToWidgets();
    this.render();
  }

  undo() {
    const snapshot = this.undoStack.pop();
    if (!snapshot) return this.setStatus("元に戻す操作はありません");
    this.redoStack.push(this.snapshot());
    this.restoreSnapshot(snapshot);
  }

  redo() {
    const snapshot = this.redoStack.pop();
    if (!snapshot) return this.setStatus("やり直す操作はありません");
    this.undoStack.push(this.snapshot());
    this.restoreSnapshot(snapshot);
  }

  restore() {
    const positiveValue = String(this.widgets.positive?.value || "");
    const negativeValue = String(this.widgets.negative?.value || "");
    const saved = this.node.properties?.[STATE_KEY];
    if (saved?.version === 1) {
      const state = sanitizeEditorState(saved);
      this.activeSide = state.activeSide;
      this.settings = state.settings;
      this.tags.positive = state.positive.map((tag) => createTag(tag.value, tag));
      this.tags.negative = state.negative.map((tag) => createTag(tag.value, tag));
      const savedPositive = outputPrompt(this.tags.positive, this.settings.outputLanguage);
      const savedNegative = outputPrompt(this.tags.negative, this.settings.outputLanguage);
      if (positiveValue !== savedPositive) this.tags.positive = parsePrompt(positiveValue).tags;
      if (negativeValue !== savedNegative) this.tags.negative = parsePrompt(negativeValue).tags;
    } else {
      this.tags.positive = parsePrompt(positiveValue).tags;
      this.tags.negative = parsePrompt(negativeValue).tags;
    }
    this.lastWidgetValues = { positive: positiveValue, negative: negativeValue };
    this.applyBlacklist(this.settings.blacklistAction !== "warn");
  }

  persist() {
    this.node.properties ||= {};
    this.node.properties[STATE_KEY] = sanitizeEditorState({
      version: 1,
      activeSide: this.activeSide,
      positive: this.tags.positive,
      negative: this.tags.negative,
      settings: this.settings,
    });
    this.node.graph?.setDirtyCanvas?.(true, true);
  }

  syncToWidgets() {
    this.syncing = true;
    for (const side of ["positive", "negative"]) {
      const value = outputPrompt(this.tags[side], this.settings.outputLanguage);
      const widget = this.widgets[side];
      if (widget && widget.value !== value) {
        widget.value = value;
        widget.callback?.(value, this.node, widget);
      }
      this.lastWidgetValues[side] = value;
    }
    this.persist();
    this.syncing = false;
  }

  syncFromWidgets() {
    if (this.syncing) return;
    let changed = false;
    for (const side of ["positive", "negative"]) {
      const value = String(this.widgets[side]?.value || "");
      if (value !== this.lastWidgetValues[side]) {
        this.tags[side] = parsePrompt(value, this.tags[side]).tags;
        this.lastWidgetValues[side] = value;
        changed = true;
      }
    }
    if (changed) {
      this.applyBlacklist(this.settings.blacklistAction !== "warn");
      this.persist();
      this.render();
      this.setStatus("STRINGウィジェットの変更を反映しました");
    }
  }

  build() {
    const root = element("section", { className: "paio-editor" });
    root.setAttribute("aria-label", "Prompt All-in-One editor");

    this.tabBar = element("div", { className: "paio-tabs", dataset: { role: "tabs" } });
    for (const side of ["positive", "negative"]) {
      const tab = button(side === "positive" ? "Positive" : "Negative", () => {
        this.activeSide = side;
        this.lastSelectedIndex = null;
        this.persist();
        this.render();
      });
      tab.dataset.side = side;
      tab.setAttribute("role", "tab");
      this.tabBar.append(tab);
    }

    this.addInput = element("textarea", { className: "paio-add-input" });
    this.addInput.rows = 2;
    this.addInput.placeholder = "タグを追加（カンマ・改行・Enter）";
    this.addInput.setAttribute("aria-label", "追加するプロンプトタグ");
    this.addInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        this.addFromInput();
      }
    });
    this.searchInput = element("input", { className: "paio-search" });
    this.searchInput.type = "search";
    this.searchInput.placeholder = "原文・翻訳を検索";
    this.searchInput.addEventListener("input", () => {
      this.filterText = this.searchInput.value;
      this.renderTags();
    });
    this.filterSelect = element("select", { className: "paio-select" });
    const filters = [
      ["all", "すべて"], ["enabled", "有効"], ["disabled", "無効"],
      ["normal", "通常"], ["lora", "LoRA"], ["embedding", "Embedding"],
      ["duplicate", "重複"], ["blacklist", "ブラックリスト"],
      ["untranslated", "未翻訳"],
    ];
    for (const [value, label] of filters) {
      const option = element("option", { text: label });
      option.value = value;
      this.filterSelect.append(option);
    }
    this.filterSelect.addEventListener("change", () => {
      this.filterMode = this.filterSelect.value;
      this.renderTags();
    });

    const addRow = element("div", { className: "paio-add-row" }, [
      this.addInput,
      button("追加", () => this.addFromInput()),
    ]);
    const tools = element("div", { className: "paio-toolbar" }, [
      this.searchInput,
      this.filterSelect,
      button("↶", () => this.undo(), "元に戻す"),
      button("↷", () => this.redo(), "やり直す"),
      button("整形", () => this.normalize(false)),
      button("重複削除", () => this.normalize(true)),
      button("全英訳", () => this.translateAll("en")),
      button("全和訳", () => this.translateAll(this.settings.localLanguage)),
      button("例", () => openDialog(this.examplesDialog)),
      button("禁止", () => openDialog(this.blacklistDialog), "ブラックリスト"),
      button("設定", () => openDialog(this.settingsDialog)),
      button("入出力", () => openDialog(this.ioDialog)),
    ]);

    this.bulkBar = element("div", { className: "paio-bulk" });
    this.tagList = element("div", { className: "paio-tags" });
    this.tagList.setAttribute("role", "list");
    this.status = element("p", { className: "paio-status", text: "準備完了" });
    this.status.setAttribute("aria-live", "polite");

    this.settingsDialog = this.buildSettingsDialog();
    this.examplesDialog = this.buildExamplesDialog();
    this.blacklistDialog = this.buildBlacklistDialog();
    this.ioDialog = this.buildIoDialog();

    root.append(
      this.tabBar,
      addRow,
      tools,
      this.bulkBar,
      this.tagList,
      this.status,
      this.settingsDialog,
      this.examplesDialog,
      this.blacklistDialog,
      this.ioDialog,
    );
    return root;
  }

  attach() {
    for (const widget of Object.values(this.widgets)) {
      if (!widget) continue;
      widget.hidden = true;
      widget.computeSize = () => [0, -4];
    }
    const domWidget = this.node.addDOMWidget("prompt_editor", "div", this.root, {
      serialize: false,
      hideOnZoom: false,
    });
    domWidget.computeSize = (width) => [width, 520];
    this.node.setSize([Math.max(this.node.size?.[0] || 0, 520), 620]);
    const previousRemoved = this.node.onRemoved;
    this.node.onRemoved = () => {
      clearInterval(this.pollTimer);
      previousRemoved?.apply(this.node);
    };
    this.render();
  }

  buildDialog(title) {
    const dialog = element("dialog", { className: "paio-dialog" });
    const heading = element("h3", { text: title });
    const close = button("閉じる", () => closeDialog(dialog));
    const body = element("div", { className: "paio-dialog-body" });
    dialog.append(heading, body, element("div", { className: "paio-dialog-footer" }, close));
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) closeDialog(dialog);
    });
    dialog.body = body;
    return dialog;
  }

  buildSettingsDialog() {
    const dialog = this.buildDialog("エディター設定");
    const step = element("select", { className: "paio-select" });
    for (const value of [0.05, 0.1, 0.25]) {
      const option = element("option", { text: value });
      option.value = value;
      step.append(option);
    }
    step.value = String(this.settings.weightStep);
    const duplicate = element("select", { className: "paio-select" });
    for (const [value, label] of [["allow", "許可"], ["skip", "追加しない"], ["move", "末尾へ移動"]]) {
      const option = element("option", { text: label });
      option.value = value;
      duplicate.append(option);
    }
    duplicate.value = this.settings.duplicatePolicy;
    const provider = element("select", { className: "paio-select" });
    for (const [value, label] of [["local", "ローカル辞書"], ["libretranslate", "LibreTranslate"], ["deepl", "DeepL"], ["openai", "OpenAI互換"]]) {
      const option = element("option", { text: label });
      option.value = value;
      provider.append(option);
    }
    provider.value = this.settings.translationProvider;
    const output = element("select", { className: "paio-select" });
    for (const [value, label] of [["en", "英語"], ["ja", "日本語"]]) {
      const option = element("option", { text: label });
      option.value = value;
      output.append(option);
    }
    output.value = this.settings.outputLanguage;
    const auto = element("input", { type: "checkbox" });
    auto.checked = this.settings.autoTranslate;
    const colorGrid = element("div", { className: "paio-color-grid" });
    const colorInputs = {};
    const colorLabels = {
      normal: "通常", disabled: "無効", lora: "LoRA", lycoris: "LyCORIS",
      embedding: "Embedding", wildcard: "ワイルドカード", duplicate: "重複",
      blacklist: "ブラックリスト", missing: "モデルなし", error: "翻訳エラー",
    };
    for (const [key, label] of Object.entries(colorLabels)) {
      const input = element("input");
      input.type = "color";
      input.value = this.settings.tagColors?.[key] || COLOR_DEFAULTS[key];
      colorInputs[key] = input;
      colorGrid.append(this.labeled(label, input));
    }
    const save = button("保存", () => {
      this.pushUndo();
      this.settings.weightStep = Number(step.value);
      this.settings.duplicatePolicy = duplicate.value;
      this.settings.translationProvider = provider.value;
      this.settings.outputLanguage = output.value;
      this.settings.autoTranslate = auto.checked;
      this.settings.tagColors = Object.fromEntries(Object.entries(colorInputs).map(([key, input]) => [key, input.value]));
      this.applyCustomColors();
      this.syncToWidgets();
      this.render();
      closeDialog(dialog);
      this.setStatus("設定を保存しました。APIキーはワークフローに保存されません");
    });
    dialog.body.append(
      this.labeled("重み刻み", step),
      this.labeled("重複時", duplicate),
      this.labeled("翻訳プロバイダー", provider),
      this.labeled("出力言語", output),
      this.labeled("入力時に自動翻訳", auto),
      element("p", { text: "タグ状態の色" }),
      colorGrid,
      save,
    );
    return dialog;
  }

  labeled(label, control) {
    return element("label", { className: "paio-field" }, [element("span", { text: label }), control]);
  }

  buildExamplesDialog() {
    const dialog = this.buildDialog("内蔵プロンプト例");
    const search = element("input", { className: "paio-search" });
    search.type = "search";
    search.placeholder = "英語・日本語を検索";
    const category = element("select", { className: "paio-select" });
    const target = element("select", { className: "paio-select" });
    for (const side of ["positive", "negative"]) {
      const option = element("option", { text: side === "positive" ? "Positiveへ" : "Negativeへ" });
      option.value = side;
      target.append(option);
    }
    const list = element("div", { className: "paio-example-list" });
    const selected = new Set();
    let data = null;
    const redraw = () => {
      list.replaceChildren();
      if (!data) return;
      const query = search.value.trim().toLocaleLowerCase();
      for (const group of data.categories || []) {
        if (category.value && category.value !== group.id) continue;
        for (const item of group.items || []) {
          const label = `${item.prompt} ${item.translation?.ja || ""}`;
          if (query && !label.toLocaleLowerCase().includes(query)) continue;
          const check = element("input", { type: "checkbox" });
          check.checked = selected.has(item.prompt);
          check.addEventListener("change", () => check.checked ? selected.add(item.prompt) : selected.delete(item.prompt));
          list.append(this.labeled(`${item.prompt} — ${item.translation?.ja || ""}`, check));
        }
      }
    };
    this.api.fetchApi("/prompt_all_in_one/examples")
      .then((response) => response.json())
      .then((body) => {
        data = body;
        const all = element("option", { text: "全カテゴリー" });
        all.value = "";
        category.append(all);
        for (const group of data.categories || []) {
          const option = element("option", { text: `${group.label?.ja || group.id} / ${group.label?.en || ""}` });
          option.value = group.id;
          category.append(option);
        }
        redraw();
      })
      .catch(() => this.setStatus("内蔵例を読み込めませんでした", true));
    search.addEventListener("input", redraw);
    category.addEventListener("change", redraw);
    const add = button("選択を追加", () => {
      this.pushUndo();
      this.addValues([...selected], target.value);
      selected.clear();
      redraw();
      this.setStatus("内蔵例を追加しました");
    });
    dialog.body.append(element("div", { className: "paio-toolbar" }, [search, category, target]), list, add);
    return dialog;
  }

  buildBlacklistDialog() {
    const dialog = this.buildDialog("ブラックリスト");
    const help = element("p", { text: "1行ごとに exact:tag / iexact:tag / contains:tag / regex:pattern" });
    const textarea = element("textarea", { className: "paio-dialog-textarea" });
    textarea.value = this.settings.blacklist.map((item) => `${item.mode}:${item.pattern}`).join("\n");
    const action = element("select", { className: "paio-select" });
    for (const [value, label] of [["warn", "警告のみ"], ["disable", "無効化"], ["delete", "削除"]]) {
      const option = element("option", { text: label });
      option.value = value;
      action.append(option);
    }
    action.value = this.settings.blacklistAction;
    const save = button("適用", () => {
      const entries = textarea.value.split(/\r?\n/u).filter(Boolean).slice(0, 200).map((line) => {
        const separator = line.indexOf(":");
        if (separator < 0) return { mode: "exact", pattern: line.trim() };
        return { mode: line.slice(0, separator).trim(), pattern: line.slice(separator + 1).trim() };
      });
      const compiled = compileBlacklist(entries);
      const errors = compiled.filter((entry) => entry.error);
      if (errors.length) {
        this.setStatus(`無効な正規表現: ${errors[0].error}`, true);
        return;
      }
      this.pushUndo();
      this.settings.blacklist = entries;
      this.settings.blacklistAction = action.value;
      this.applyBlacklist(true);
      this.syncToWidgets();
      this.render();
      closeDialog(dialog);
    });
    dialog.body.append(help, textarea, this.labeled("一致時の処理", action), save);
    return dialog;
  }

  buildIoDialog() {
    const dialog = this.buildDialog("コピー・インポート・エクスポート");
    const file = element("input");
    file.type = "file";
    file.accept = ".txt,.json,text/plain,application/json";
    file.addEventListener("change", async () => {
      const selected = file.files?.[0];
      if (!selected) return;
      if (selected.size > 1024 * 1024) return this.setStatus("ファイルは1 MB以下にしてください", true);
      const text = await selected.text();
      this.pushUndo();
      try {
        if (selected.name.toLocaleLowerCase().endsWith(".json")) {
          const state = parseImportedState(text);
          this.tags.positive = state.positive.map((tag) => createTag(tag.value, tag));
          this.tags.negative = state.negative.map((tag) => createTag(tag.value, tag));
          this.settings = state.settings;
          this.activeSide = state.activeSide;
        } else {
          this.tags[this.activeSide] = parsePrompt(text).tags;
        }
        this.applyBlacklist(this.settings.blacklistAction !== "warn");
        this.syncToWidgets();
        this.render();
        closeDialog(dialog);
        this.setStatus("インポートしました");
      } catch (error) {
        this.setStatus(error.message, true);
      }
    });
    const controls = [
      button("Positiveをコピー", () => this.copySide("positive")),
      button("Negativeをコピー", () => this.copySide("negative")),
      button("表示言語込みで選択をコピー", () => this.copySelected(true)),
      button("選択を英語でコピー", () => this.copySelectedLanguage("en")),
      button("TXTを書き出す", () => download(`${this.activeSide}_prompt.txt`, outputPrompt(this.currentTags, this.settings.outputLanguage), "text/plain;charset=utf-8")),
      button("状態JSONを書き出す", () => download("prompt_all_in_one_state.json", exportEditorState({ activeSide: this.activeSide, positive: this.tags.positive, negative: this.tags.negative, settings: this.settings }), "application/json;charset=utf-8")),
    ];
    dialog.body.append(file, element("div", { className: "paio-toolbar" }, controls));
    return dialog;
  }

  render() {
    this.applyCustomColors();
    for (const tab of this.tabBar.querySelectorAll("button")) {
      const active = tab.dataset.side === this.activeSide;
      tab.setAttribute("aria-selected", String(active));
      tab.classList.toggle("is-active", active);
      const count = this.tags[tab.dataset.side]?.length || 0;
      tab.textContent = `${tab.dataset.side === "positive" ? "Positive" : "Negative"} · ${count}`;
    }
    this.renderBulk();
    this.renderTags();
  }

  renderBulk() {
    this.bulkBar.replaceChildren();
    const selected = this.currentTags.filter((tag) => tag.selected);
    if (!selected.length) {
      this.bulkBar.hidden = true;
      return;
    }
    this.bulkBar.hidden = false;
    const actions = [
      button(`${selected.length}件選択`, () => this.clearSelection()),
      button("有効", () => this.bulkMutate((tag) => { tag.enabled = true; })),
      button("無効", () => this.bulkMutate((tag) => { tag.enabled = false; })),
      button("＋", () => this.bulkWeight(1), "重みを上げる"),
      button("－", () => this.bulkWeight(-1), "重みを下げる"),
      button("英訳", () => this.translateSelection("en")),
      button("和訳", () => this.translateSelection(this.settings.localLanguage)),
      button("コピー", () => this.copySelected(false)),
      button(this.activeSide === "positive" ? "→ Negative" : "→ Positive", () => this.moveSelected()),
      button("削除", () => this.deleteSelected()),
    ];
    this.bulkBar.append(...actions);
  }

  filteredTags() {
    const duplicates = findDuplicateKeys(this.currentTags);
    const cross = new Set(this.tags[this.activeSide === "positive" ? "negative" : "positive"].map((tag) => canonicalTagKey(tag.value)));
    const query = this.filterText.trim().toLocaleLowerCase();
    return this.currentTags.map((tag, index) => ({ tag, index })).filter(({ tag }) => {
      const haystack = `${tag.value} ${tag.translation}`.toLocaleLowerCase();
      if (query && !haystack.includes(query)) return false;
      const duplicate = duplicates.has(canonicalTagKey(tag.value)) || cross.has(canonicalTagKey(tag.value));
      if (this.filterMode === "enabled") return tag.enabled;
      if (this.filterMode === "disabled") return !tag.enabled;
      if (this.filterMode === "duplicate") return duplicate;
      if (this.filterMode === "blacklist") return tag.blacklistMatch;
      if (this.filterMode === "untranslated") return !tag.translation;
      if (this.filterMode !== "all") return tag.type === this.filterMode;
      return true;
    });
  }

  renderTags() {
    this.tagList.replaceChildren();
    const rows = this.filteredTags();
    const duplicates = findDuplicateKeys(this.currentTags);
    const otherSide = this.activeSide === "positive" ? "negative" : "positive";
    const cross = new Set(this.tags[otherSide].map((tag) => canonicalTagKey(tag.value)));
    for (const { tag, index } of rows.slice(0, this.renderLimit)) {
      const duplicate = duplicates.has(canonicalTagKey(tag.value)) || cross.has(canonicalTagKey(tag.value));
      this.tagList.append(this.renderTag(tag, index, duplicate));
    }
    if (!rows.length) {
      this.tagList.append(element("p", { className: "paio-empty", text: "一致するタグはありません" }));
    } else if (rows.length > this.renderLimit) {
      this.tagList.append(button(`さらに表示（残り ${rows.length - this.renderLimit}）`, () => {
        this.renderLimit += MAX_RENDERED_TAGS;
        this.renderTags();
      }));
    }
  }

  renderTag(tag, index, duplicate) {
    const row = element("div", { className: "paio-tag", dataset: { type: tag.type } });
    row.setAttribute("role", "listitem");
    row.draggable = true;
    row.classList.toggle("is-disabled", !tag.enabled);
    row.classList.toggle("is-selected", tag.selected);
    row.classList.toggle("is-duplicate", duplicate);
    row.classList.toggle("is-blacklisted", tag.blacklistMatch);
    row.classList.toggle("is-missing", tag.missingModel);
    row.classList.toggle("has-error", Boolean(tag.translationError));
    if (duplicate) row.title = "Positive/Negative内または両者間で重複しています";
    if (tag.missingModel) row.title = "モデル一覧に見つかりません（一覧取得失敗の可能性もあります）";

    const select = element("input", { type: "checkbox" });
    select.checked = tag.selected;
    select.setAttribute("aria-label", `${tag.value || "空タグ"}を選択`);
    select.addEventListener("click", (event) => {
      event.stopPropagation();
      this.selectIndex(index, event.shiftKey, event.ctrlKey || event.metaKey);
    });
    const drag = element("span", { className: "paio-drag", text: "⋮⋮", title: "ドラッグして並べ替え" });
    const editor = element("input", { className: "paio-tag-input" });
    editor.value = tag.value;
    editor.setAttribute("aria-label", "タグを編集");
    editor.addEventListener("change", () => {
      this.pushUndo();
      tag.value = editor.value.trim();
      tag.type = classifyTag(tag.value);
      this.applyBlacklist(this.settings.blacklistAction !== "warn");
      this.syncToWidgets();
      this.render();
    });
    editor.addEventListener("click", (event) => event.stopPropagation());
    const text = element("div", { className: "paio-tag-text" }, [editor]);
    if (tag.translation) text.append(element("small", { text: tag.translation }));
    if (tag.translationError) text.append(element("small", { className: "paio-error", text: tag.translationError }));
    const actions = element("div", { className: "paio-tag-actions" }, [
      button("＋", (event) => { event.stopPropagation(); this.weightOne(index, 1); }, "重みを上げる"),
      button("－", (event) => { event.stopPropagation(); this.weightOne(index, -1); }, "重みを下げる"),
      button("EN", (event) => { event.stopPropagation(); this.translateIndexes([index], "en"); }, "英語へ翻訳"),
      button("JA", (event) => { event.stopPropagation(); this.translateIndexes([index], this.settings.localLanguage); }, "ローカル言語へ翻訳"),
      button(tag.enabled ? "無効" : "有効", (event) => { event.stopPropagation(); this.toggleOne(index); }),
      button("複製", (event) => { event.stopPropagation(); copyText(tag.value); this.setStatus("タグをコピーしました"); }, "タグをコピー"),
      button("削除", (event) => { event.stopPropagation(); this.deleteOne(index); }),
    ]);
    row.append(select, drag, text, actions);
    row.addEventListener("click", (event) => this.selectIndex(index, event.shiftKey, event.ctrlKey || event.metaKey));
    row.addEventListener("dragstart", () => { this.dragIndex = index; row.classList.add("is-dragging"); });
    row.addEventListener("dragend", () => row.classList.remove("is-dragging"));
    row.addEventListener("dragover", (event) => event.preventDefault());
    row.addEventListener("drop", (event) => {
      event.preventDefault();
      if (this.dragIndex === null || this.dragIndex === index) return;
      this.pushUndo();
      const [moved] = this.currentTags.splice(this.dragIndex, 1);
      const target = this.dragIndex < index ? index - 1 : index;
      this.currentTags.splice(target, 0, moved);
      this.dragIndex = null;
      this.syncToWidgets();
      this.render();
    });
    return row;
  }

  addFromInput() {
    const value = this.addInput.value;
    if (!value.trim()) return;
    this.pushUndo();
    const parsed = parsePrompt(value);
    this.addValues(parsed.tags.map((tag) => tag.value), this.activeSide);
    this.addInput.value = "";
    if (parsed.errors.length) this.setStatus(`追加しましたが構文警告が${parsed.errors.length}件あります`, true);
    else this.setStatus("タグを追加しました");
  }

  addValues(values, side) {
    const target = this.tags[side];
    for (const raw of values) {
      const value = String(raw || "").trim();
      if (!value) continue;
      const key = canonicalTagKey(value);
      const existing = target.findIndex((tag) => canonicalTagKey(tag.value) === key);
      if (existing >= 0 && this.settings.duplicatePolicy === "skip") continue;
      if (existing >= 0 && this.settings.duplicatePolicy === "move") {
        target.push(target.splice(existing, 1)[0]);
        continue;
      }
      target.push(createTag(value));
    }
    this.applyBlacklist(this.settings.blacklistAction !== "warn");
    this.syncToWidgets();
    this.render();
    if (this.settings.autoTranslate) {
      const indexes = target.map((tag, index) => ({ tag, index })).filter(({ tag }) => !tag.translation).map(({ index }) => index);
      this.translateIndexes(indexes, "en", side);
    }
  }

  selectIndex(index, range, additive) {
    if (range && this.lastSelectedIndex !== null) {
      const [start, end] = [this.lastSelectedIndex, index].sort((a, b) => a - b);
      if (!additive) this.currentTags.forEach((tag) => { tag.selected = false; });
      for (let position = start; position <= end; position += 1) this.currentTags[position].selected = true;
    } else {
      if (!additive) this.currentTags.forEach((tag, position) => { if (position !== index) tag.selected = false; });
      this.currentTags[index].selected = !this.currentTags[index].selected;
      this.lastSelectedIndex = index;
    }
    this.persist();
    this.render();
  }

  clearSelection() {
    this.currentTags.forEach((tag) => { tag.selected = false; });
    this.lastSelectedIndex = null;
    this.persist();
    this.render();
  }

  bulkMutate(mutate) {
    this.pushUndo();
    this.currentTags.filter((tag) => tag.selected).forEach(mutate);
    this.syncToWidgets();
    this.render();
  }

  weightOne(index, direction) {
    this.pushUndo();
    const tag = this.currentTags[index];
    tag.value = adjustTagWeight(tag.value, this.settings.weightStep * direction, this.settings.weightMin, this.settings.weightMax);
    tag.type = classifyTag(tag.value);
    this.syncToWidgets();
    this.render();
  }

  bulkWeight(direction) {
    this.bulkMutate((tag) => {
      tag.value = adjustTagWeight(tag.value, this.settings.weightStep * direction, this.settings.weightMin, this.settings.weightMax);
      tag.type = classifyTag(tag.value);
    });
  }

  toggleOne(index) {
    this.pushUndo();
    this.currentTags[index].enabled = !this.currentTags[index].enabled;
    this.syncToWidgets();
    this.render();
  }

  deleteOne(index) {
    this.pushUndo();
    this.currentTags.splice(index, 1);
    this.syncToWidgets();
    this.render();
    this.setStatus("タグを削除しました。元に戻せます");
  }

  deleteSelected() {
    this.pushUndo();
    this.tags[this.activeSide] = this.currentTags.filter((tag) => !tag.selected);
    this.syncToWidgets();
    this.render();
    this.setStatus("選択タグを削除しました。元に戻せます");
  }

  moveSelected() {
    this.pushUndo();
    const destination = this.activeSide === "positive" ? "negative" : "positive";
    const moved = this.currentTags.filter((tag) => tag.selected).map((tag) => ({ ...tag, selected: false }));
    this.tags[this.activeSide] = this.currentTags.filter((tag) => !tag.selected);
    for (const tag of moved) {
      const key = canonicalTagKey(tag.value);
      const existing = this.tags[destination].findIndex((item) => canonicalTagKey(item.value) === key);
      if (existing >= 0 && this.settings.duplicatePolicy === "skip") continue;
      if (existing >= 0 && this.settings.duplicatePolicy === "move") this.tags[destination].splice(existing, 1);
      this.tags[destination].push(tag);
    }
    this.syncToWidgets();
    this.render();
  }

  normalize(removeDuplicates) {
    this.pushUndo();
    this.tags[this.activeSide] = normalizePromptTags(this.currentTags, { removeEmpty: true, removeDuplicates });
    this.syncToWidgets();
    this.render();
    this.setStatus(removeDuplicates ? "空タグと重複を整理しました。元に戻せます" : "区切りと空白を整形しました。元に戻せます");
  }

  async translateIndexes(indexes, target, side = this.activeSide) {
    const unique = [...new Set(indexes)].filter((index) => this.tags[side][index]);
    if (!unique.length) return;
    const values = unique.map((index) => this.tags[side][index].value);
    unique.forEach((index) => { this.tags[side][index].translationError = ""; });
    this.setStatus(`${values.length}件を翻訳中…`);
    try {
      const results = await translateTags(this.api, values, {
        provider: this.settings.translationProvider,
        source: "auto",
        target,
      });
      this.pushUndo();
      results.forEach((result, offset) => {
        const tag = this.tags[side][unique[offset]];
        if (!tag) return;
        tag.translation = String(result.translated || "");
        tag.translatedTo = target;
      });
      this.syncToWidgets();
      this.render();
      this.setStatus("翻訳しました");
    } catch (error) {
      unique.forEach((index) => { this.tags[side][index].translationError = error.message; });
      this.persist();
      this.render();
      this.setStatus(`${error.message}。同じ翻訳ボタンで再試行できます`, true);
    }
  }

  translateSelection(target) {
    const indexes = this.currentTags.map((tag, index) => tag.selected ? index : -1).filter((index) => index >= 0);
    return this.translateIndexes(indexes, target);
  }

  translateAll(target) {
    return this.translateIndexes(this.currentTags.map((_tag, index) => index), target);
  }

  async copySelected(withTranslation) {
    const selected = this.currentTags.filter((tag) => tag.selected);
    const value = withTranslation
      ? selected.map((tag) => tag.translation ? `${tag.value} (${tag.translation})` : tag.value).join(", ")
      : outputPrompt(selected, this.settings.outputLanguage);
    await copyText(value);
    this.setStatus("選択タグをコピーしました");
  }

  async copySelectedLanguage(language) {
    const selected = this.currentTags.filter((tag) => tag.selected);
    const value = selected.map((tag) => tag.translation && tag.translatedTo === language ? tag.translation : tag.value).join(", ");
    await copyText(value);
    this.setStatus(`${language.toUpperCase()}形式で選択タグをコピーしました`);
  }

  async copySide(side) {
    await copyText(outputPrompt(this.tags[side], this.settings.outputLanguage));
    this.setStatus(`${side === "positive" ? "Positive" : "Negative"}をコピーしました`);
  }

  applyBlacklist(mutate) {
    const compiled = compileBlacklist(this.settings.blacklist);
    for (const side of ["positive", "negative"]) {
      for (const tag of this.tags[side]) tag.blacklistMatch = matchesBlacklist(tag.value, compiled);
      if (!mutate) continue;
      if (this.settings.blacklistAction === "disable") {
        this.tags[side].filter((tag) => tag.blacklistMatch).forEach((tag) => { tag.enabled = false; });
      } else if (this.settings.blacklistAction === "delete") {
        this.tags[side] = this.tags[side].filter((tag) => !tag.blacklistMatch);
      }
    }
  }

  async loadModelRegistry() {
    try {
      const [embeddingResponse, objectResponse] = await Promise.all([
        this.api.fetchApi("/embeddings"),
        this.api.fetchApi("/object_info"),
      ]);
      if (embeddingResponse.ok) {
        const embeddings = await embeddingResponse.json();
        this.modelRegistry.embeddings = new Set((embeddings || []).map((item) => String(item).toLocaleLowerCase()));
      }
      if (objectResponse.ok) {
        const objectInfo = await objectResponse.json();
        const values = objectInfo?.LoraLoader?.input?.required?.lora_name?.[0];
        if (Array.isArray(values)) this.modelRegistry.loras = new Set(values.map((item) => String(item).replace(/\\/g, "/").toLocaleLowerCase()));
      }
      this.checkModels();
      this.renderTags();
    } catch {
      this.modelRegistry = { loras: null, embeddings: null };
    }
  }

  checkModels() {
    for (const side of ["positive", "negative"]) {
      for (const tag of this.tags[side]) {
        tag.missingModel = false;
        if (tag.type === "lora" && this.modelRegistry.loras) {
          const name = tag.value.match(/^<lora:([^:>]+)/i)?.[1]?.toLocaleLowerCase();
          tag.missingModel = Boolean(name) && ![...this.modelRegistry.loras].some((path) => path.endsWith(name) || path.endsWith(`${name}.safetensors`));
        } else if (tag.type === "embedding" && this.modelRegistry.embeddings) {
          const name = tag.value.replace(/^embedding:/i, "").toLocaleLowerCase();
          tag.missingModel = !this.modelRegistry.embeddings.has(name);
        }
      }
    }
  }

  applyCustomColors() {
    if (!this.root) return;
    for (const [key, value] of Object.entries(this.settings.tagColors || {})) {
      if (/^#[0-9a-f]{6}$/i.test(value)) this.root.style.setProperty(`--paio-color-${key}`, value);
    }
  }

  setStatus(message, error = false) {
    if (!this.status) return;
    this.status.textContent = String(message);
    this.status.classList.toggle("is-error", error);
  }
}
