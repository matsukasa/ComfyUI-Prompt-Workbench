import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { PromptEditor } from "./prompt_editor.js?v=20261120-mcp-sections";
import { PromptEditor as UpstreamPromptEditor } from "./upstream/prompt_editor.js?v=20261120-mcp-sections";
import { initializeUiLanguage } from "./i18n.js";

const EXTENSION_NAME = "prompt.prompt-workbench";
const FORK_EXTRA_WIDGET_NAMES = [
  "merge_order",
  "merge_separator",
  "normalize_tags",
  "sec_quality",
  "sec_quality_enabled",
  "sec_subject",
  "sec_subject_enabled",
  "sec_composition",
  "sec_composition_enabled",
  "sec_style",
  "sec_style_enabled",
  "sec_trigger",
  "sec_trigger_enabled",
  "neg_quality",
  "neg_quality_enabled",
  "neg_anatomy",
  "neg_anatomy_enabled",
  "neg_style",
  "neg_style_enabled",
  "xy_trigger_sync",
  "xy_trigger_input",
  "tag_suggestions_quality",
  "tag_suggestions_subject",
  "tag_suggestions_composition",
  "tag_suggestions_style",
  "tag_suggestions_trigger",
  "merged_preview",
  "sections_schema",
];

function ensureStyles() {
  const id = "prompt-workbench-styles";
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = new URL("./prompt_workbench.css?v=20261120-mcp-sections", import.meta.url).href;
  document.head.append(link);
}

app.registerExtension({
  name: EXTENSION_NAME,
  async setup() {
    ensureStyles();
    await initializeUiLanguage();
  },
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "PromptWorkbench" && nodeData.name !== "PromptWorkbenchFork") return;
    const isFork = nodeData.name === "PromptWorkbenchFork";
    const previousCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function onNodeCreated() {
      const result = previousCreated?.apply(this, arguments);
      const prompt = this.widgets?.find((widget) => widget.name === "prompt");
      if (prompt && typeof this.addDOMWidget === "function") {
        if (isFork) {
          const negative = this.widgets?.find((widget) => widget.name === "negative");
          const outputFormat = this.widgets?.find((widget) => widget.name === "output_format");
          const widgets = { prompt, negative, outputFormat };
          for (const name of FORK_EXTRA_WIDGET_NAMES) {
            const widget = this.widgets?.find((item) => item.name === name);
            if (widget) widgets[name] = widget;
          }
          this.promptWorkbenchEditor = new PromptEditor(this, widgets, api);
        } else {
          this.promptWorkbenchEditor = new UpstreamPromptEditor(this, { prompt }, api);
        }
      }
      return result;
    };
    const previousConfigured = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function onConfigure() {
      const result = previousConfigured?.apply(this, arguments);
      this.promptWorkbenchEditor?.configureFromNode();
      const stabilize = () => this.promptWorkbenchEditor?.stabilizeLayout();
      stabilize();
      queueMicrotask(stabilize);
      requestAnimationFrame(stabilize);
      return result;
    };
    if (isFork) {
      const previousExecuted = nodeType.prototype.onExecuted;
      nodeType.prototype.onExecuted = function onExecuted(message) {
        const result = previousExecuted?.apply(this, arguments);
        this.promptWorkbenchEditor?.applyExecutionFeedback?.(message);
        return result;
      };
    }
  },
});
