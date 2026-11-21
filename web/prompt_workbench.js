import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { PromptEditor, removeUnlinkedWidgetInput } from "./prompt_editor.js?v=20261120-socket-order-ui";
import { PromptEditor as UpstreamPromptEditor } from "./upstream/prompt_editor.js?v=20261120-socket-order-ui";
import { initializeUiLanguage } from "./i18n.js";

const EXTENSION_NAME = "prompt.prompt-workbench";
const MCP_NON_SOCKET_WIDGETS = [
  "prompt",
  "negative",
  "output_format",
  "merge_order",
  "merge_separator",
  "normalize_tags",
  "sec_quality_enabled",
  "sec_subject_enabled",
  "sec_composition_enabled",
  "sec_style_enabled",
  "sec_trigger_enabled",
  "neg_quality_enabled",
  "neg_anatomy_enabled",
  "neg_style_enabled",
  "xy_trigger_sync",
  "tag_suggestions_quality",
  "tag_suggestions_subject",
  "tag_suggestions_composition",
  "tag_suggestions_style",
  "tag_suggestions_trigger",
  "output_sections",
  "merged_preview",
  "sections_schema",
];
const MCP_SECTION_SOCKET_CANDIDATES = [
  "sec_quality",
  "sec_subject",
  "sec_composition",
  "sec_style",
  "sec_trigger",
  "neg_quality",
  "neg_anatomy",
  "neg_style",
];
const MCP_ALLOWED_EXTRA_OUTPUTS = new Set([
  "sec_quality",
  "sec_subject",
  "sec_composition",
  "sec_style",
  "sec_trigger",
  "neg_quality",
  "neg_anatomy",
  "neg_style",
  "sections_schema",
]);

function ensureStyles() {
  const id = "prompt-workbench-styles";
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = new URL("./prompt_workbench.css?v=20261120-socket-order-ui", import.meta.url).href;
  document.head.append(link);
}

function syncMcpDynamicOutputs(node) {
  if (!node || !Array.isArray(node.outputs)) return;
  const raw = String(node.widgets?.find((item) => item.name === "output_sections")?.value || "");
  const desired = [];
  for (const token of raw.split(/[\s,]+/)) {
    const key = token.trim().toLowerCase();
    if (MCP_ALLOWED_EXTRA_OUTPUTS.has(key) && !desired.includes(key)) desired.push(key);
  }
  const desiredSet = new Set(desired);
  const resolveGraphLink = (linkId) => {
    const links = node.graph?.links;
    if (!links) return null;
    if (typeof links.get === "function") return links.get(linkId) || null;
    return links[linkId] || null;
  };

  // Remove dynamic outputs (slot >= 2) that are no longer requested.
  for (let i = node.outputs.length - 1; i >= 2; i -= 1) {
    const output = node.outputs[i];
    const name = String(output?.name || "").trim().toLowerCase();
    if (!desiredSet.has(name)) {
      if (typeof node.removeOutput === "function") node.removeOutput(i);
      else node.outputs.splice(i, 1);
    }
  }

  // Add missing requested outputs.
  const existingByName = new Map(
    node.outputs.slice(2).map((output) => [String(output?.name || "").trim().toLowerCase(), output]),
  );
  for (const name of desired) {
    if (!existingByName.has(name) && typeof node.addOutput === "function") {
      const added = node.addOutput(name, "STRING");
      existingByName.set(name, added || node.outputs[node.outputs.length - 1]);
    }
  }

  // Reorder dynamic outputs to match desired order while updating graph link origin_slot.
  const fixedOutputs = node.outputs.slice(0, 2);
  const orderedDynamic = desired.map((name) => existingByName.get(name)).filter(Boolean);
  const nextOutputs = [...fixedOutputs, ...orderedDynamic];
  if (nextOutputs.length === node.outputs.length) {
    node.outputs.splice(0, node.outputs.length, ...nextOutputs);
    for (let slotIdx = 2; slotIdx < node.outputs.length; slotIdx += 1) {
      const output = node.outputs[slotIdx];
      if (Array.isArray(output?.links)) {
        for (const linkId of output.links) {
          const linked = resolveGraphLink(linkId);
          if (linked) linked.origin_slot = slotIdx;
        }
      }
    }
  }

  node.setDirtyCanvas?.(true, true);
  node.graph?.setDirtyCanvas?.(true, true);
  node.graph?.change?.();
}

function hookMcpOutputSectionsWidget(node) {
  const widget = node?.widgets?.find((item) => item.name === "output_sections");
  if (!widget || widget._paioOutputHooked) return;
  widget._paioOutputHooked = true;
  const previousCallback = widget.callback;
  widget.callback = function onOutputSectionsChanged() {
    const result = previousCallback?.apply(this, arguments);
    syncMcpDynamicOutputs(node);
    return result;
  };
}

function pruneUnusedMcpInputs(node) {
  if (!node) return;
  for (const name of MCP_NON_SOCKET_WIDGETS) {
    removeUnlinkedWidgetInput(node, name);
  }
  for (const name of MCP_SECTION_SOCKET_CANDIDATES) {
    const widget = node.widgets?.find((item) => item.name === name);
    if (!String(widget?.value || "").trim()) {
      removeUnlinkedWidgetInput(node, name);
    }
  }
  syncMcpDynamicOutputs(node);
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
  pruneUnusedMcpInputs(node);
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
      const previousCreated = nodeType.prototype.onNodeCreated;
      nodeType.prototype.onNodeCreated = function onNodeCreated() {
        const result = previousCreated?.apply(this, arguments);
        hookMcpOutputSectionsWidget(this);
        pruneUnusedMcpInputs(this);
        queueMicrotask(() => {
          hookMcpOutputSectionsWidget(this);
          pruneUnusedMcpInputs(this);
        });
        return result;
      };
      const previousConfigured = nodeType.prototype.onConfigure;
      nodeType.prototype.onConfigure = function onConfigure() {
        const result = previousConfigured?.apply(this, arguments);
        hookMcpOutputSectionsWidget(this);
        pruneUnusedMcpInputs(this);
        queueMicrotask(() => {
          hookMcpOutputSectionsWidget(this);
          pruneUnusedMcpInputs(this);
        });
        return result;
      };
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
          const sections_payload = this.widgets?.find((widget) => widget.name === "sections_payload");
          this.promptWorkbenchEditor = new PromptEditor(this, { prompt, negative, outputFormat, sections_payload }, api);
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
