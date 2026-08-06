import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { PromptEditor } from "./prompt_editor.js?v=20260806-i18n-context-menu-1";
import { initializeUiLanguage } from "./i18n.js";

const EXTENSION_NAME = "prompt.prompt-all-in-one";

function ensureStyles() {
  const id = "prompt-all-in-one-styles";
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = new URL("./prompt_all_in_one.css?v=20260804-bottom-save-actions-1", import.meta.url).href;
  document.head.append(link);
}

app.registerExtension({
  name: EXTENSION_NAME,
  async setup() {
    ensureStyles();
    await initializeUiLanguage();
  },
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "PromptAllInOne") return;
    const previousCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function onNodeCreated() {
      const result = previousCreated?.apply(this, arguments);
      const prompt = this.widgets?.find((widget) => widget.name === "prompt");
      if (prompt && typeof this.addDOMWidget === "function") {
        this.promptAllInOneEditor = new PromptEditor(this, { prompt }, api);
      }
      return result;
    };
    const previousConfigured = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function onConfigure() {
      const result = previousConfigured?.apply(this, arguments);
      const stabilize = () => this.promptAllInOneEditor?.stabilizeLayout();
      stabilize();
      queueMicrotask(stabilize);
      requestAnimationFrame(stabilize);
      return result;
    };
  },
});
