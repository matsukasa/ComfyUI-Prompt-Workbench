import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { PromptEditor } from "./prompt_editor.js?v=20261120-split-mcp";
import { PromptEditor as UpstreamPromptEditor } from "./upstream/prompt_editor.js?v=20261120-split-mcp";
import { initializeUiLanguage } from "./i18n.js";

const EXTENSION_NAME = "prompt.prompt-workbench";

function ensureStyles() {
  const id = "prompt-workbench-styles";
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = new URL("./prompt_workbench.css?v=20261120-split-mcp", import.meta.url).href;
  document.head.append(link);
}

function applyMcpExecutionFeedback(node, message) {
  if (!node || !message || typeof message !== "object") return;
  const writeWidget = (name, raw) => {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value !== "string") return;
    const widget = node.widgets?.find((item) => item.name === name);
    if (widget && widget.value !== value) {
      widget.value = value;
      widget.callback?.(value, node, widget);
    }
  };
  writeWidget("merged_preview", message.merged_preview);
  writeWidget("sections_schema", message.sections_schema);
  node.graph?.setDirtyCanvas?.(true, true);
}

app.registerExtension({
  name: EXTENSION_NAME,
  async setup() {
    ensureStyles();
    await initializeUiLanguage();
  },
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name === "PromptWorkbenchMCP") {
      const previousExecuted = nodeType.prototype.onExecuted;
      nodeType.prototype.onExecuted = function onExecuted(message) {
        const result = previousExecuted?.apply(this, arguments);
        applyMcpExecutionFeedback(this, message);
        return result;
      };
      return;
    }
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
          this.promptWorkbenchEditor = new PromptEditor(this, { prompt, negative, outputFormat }, api);
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
  },
});
