import assert from "node:assert/strict";
import test from "node:test";

import { marqueePointerMatches } from "../web/prompt_editor.js";

test("marquee gestures ignore events from a different pointer", () => {
  assert.equal(marqueePointerMatches({ type: "pointermove", pointerId: 7 }, 7), true);
  assert.equal(marqueePointerMatches({ type: "pointerup", pointerId: 8 }, 7), false);
  assert.equal(marqueePointerMatches({ type: "pointercancel", pointerId: 8 }, 7), false);
  assert.equal(marqueePointerMatches({ type: "keyup", key: "Shift" }, 7), true);
});
