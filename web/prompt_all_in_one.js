import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { PromptEditor } from "./prompt_editor.js";

const EXTENSION_NAME = "prompt.prompt-all-in-one";

function ensureStyles() {
  const id = "prompt-all-in-one-styles";
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = new URL("./prompt_all_in_one.css", import.meta.url).href;
  document.head.append(link);
}

app.registerExtension({
  name: EXTENSION_NAME,
  async setup() {
    ensureStyles();
  },
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "PromptAllInOne") return;
    const previousCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function onNodeCreated() {
      const result = previousCreated?.apply(this, arguments);
      const positive = this.widgets?.find((widget) => widget.name === "positive_prompt");
      const negative = this.widgets?.find((widget) => widget.name === "negative_prompt");
      if (positive && negative && typeof this.addDOMWidget === "function") {
        this.promptAllInOneEditor = new PromptEditor(this, { positive, negative }, api);
      }
      return result;
    };
  },
});
