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
    node, widgets: { prompt }, root: { style: {} }, settings: sanitizeSettings({}), render() {},
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

test("draw grows the outer node to contain the actual editor height", () => {
  const editor = attachEditor();
  editor.root.offsetHeight = 1100;
  editor.domWidget.options.onDraw?.(editor.domWidget);
  assert.equal(editor.domWidget.computeSize()[1], 1120);
  assert.ok(editor.node.size[1] >= 1120);
  assert.ok(editor.domWidget.computedHeight >= 1120);
  const size = [...editor.node.size];
  for (let frame = 0; frame < 5; frame++) editor.domWidget.options.onDraw?.(editor.domWidget);
  assert.deepEqual(editor.node.size, size, "height must not grow on every frame");
});

test("shorter content preserves a user-sized outer node", () => {
  const editor = attachEditor();
  editor.root.offsetHeight = 1100;
  editor.domWidget.options.onDraw?.(editor.domWidget);
  editor.node.setSize([800, 1600]);
  editor.root.offsetHeight = 600;
  editor.domWidget.options.onDraw?.(editor.domWidget);
  assert.equal(editor.node.size[1], 1600);
  assert.equal(editor.domWidget.computeSize()[1], 620);
  assert.equal(editor.root.style.height, "auto");
  assert.equal(editor.root.style.flex, "0 0 auto");
});

test("content resize observation updates bounds and disconnects when removed", () => {
  const previousObserver = globalThis.ResizeObserver;
  let callback, observedRoot, disconnected = false;
  globalThis.ResizeObserver = class {
    constructor(action) { callback = action; }
    observe(root) { observedRoot = root; }
    disconnect() { disconnected = true; }
  };
  try {
    const editor = attachEditor();
    assert.equal(observedRoot, editor.root);
    editor.root.offsetHeight = 1200;
    callback();
    assert.ok(editor.node.size[1] >= 1220);
    editor.node.onRemoved();
    assert.equal(disconnected, true);
    const size = [...editor.node.size];
    editor.root.offsetHeight = 1500;
    callback();
    assert.deepEqual(editor.node.size, size);
  } finally {
    if (previousObserver === undefined) delete globalThis.ResizeObserver;
    else globalThis.ResizeObserver = previousObserver;
  }
});
