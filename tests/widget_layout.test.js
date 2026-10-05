import assert from "node:assert/strict";
import test from "node:test";
import { PromptEditor } from "../web/prompt_editor.js";
import { sanitizeSettings } from "../web/settings.js";

function attachEditor(width = 800) {
  const prompt = { name: "prompt", value: "cat", options: {} };
  const node = {
    size: [width, 900], widgets: [prompt],
    graph: { setDirtyCanvas() {} },
    addDOMWidget(name, type, element, options) {
      const widget = { name, type, element, options, margin: 10 };
      this.widgets.push(widget);
      return widget;
    },
    setSize(size) {
      this.size = size;
      for (const widget of this.widgets) widget.options.afterResize?.call(widget, this);
    },
  };
  const editor = Object.assign(Object.create(PromptEditor.prototype), {
    node, widgets: { prompt }, root: {}, settings: sanitizeSettings({}), render() {},
  });
  editor.attach();
  return editor;
}

// ComfyUI_frontend v1.52.7 DomWidgets.vue uses widget.width before node.width.
function displayedWidth(editor) {
  return (editor.domWidget.width ?? editor.node.size[0]) - editor.domWidget.margin * 2;
}

test("DOM widget measurement has a finite width when called without arguments", () => {
  const editor = attachEditor();
  assert.deepEqual(editor.domWidget.computeSize(), [800, 690]);
  assert.deepEqual(editor.domWidget.computeSize(620), [620, 690]);
  editor.node.setSize([1000, 900]);
  assert.equal(editor.domWidget.computeSize()[0], 1000);
});

test("redraw restores node width after the frontend assigns a narrow widget width", () => {
  const editor = attachEditor();
  // WidgetLegacy.vue can assign a measured width before DOMWidgetImpl.draw().
  for (const narrowWidth of [250, 280, 250]) {
    editor.domWidget.width = narrowWidth;
    editor.domWidget.options.onDraw?.(editor.domWidget);
    assert.equal(displayedWidth(editor), 780);
    assert.equal(editor.node.size[0], 800);
  }
});

test("resizing and workflow stabilization keep the editor width in sync", () => {
  const editor = attachEditor();
  editor.domWidget.width = 250;
  editor.node.setSize([1000, 900]);
  assert.equal(displayedWidth(editor), 980);
  editor.node.setSize([600, 900]);
  assert.equal(displayedWidth(editor), 580);
  editor.node.size = [900, 900];
  editor.domWidget.width = 250;
  editor.stabilizeLayout();
  assert.equal(displayedWidth(editor), 880);
});

test("width synchronization keeps prompt serialization attached to the DOM widget", async () => {
  const editor = attachEditor();
  assert.deepEqual(editor.node.widgets, [editor.domWidget]);
  editor.domWidget.options.setValue("dog");
  editor.domWidget.options.onDraw?.(editor.domWidget);
  assert.equal(editor.domWidget.options.getValue(), "dog");
  assert.equal(await editor.domWidget.serializeValue(), "dog");
});
