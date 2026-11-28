import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("marquee mode preserves the selected marker geometry", async () => {
  const css = await readFile(new URL("../web/prompt_workbench.css", import.meta.url), "utf8");
  const rule = css.match(/\.paio-tags\.is-marquee-selecting \.paio-select-mark\s*\{([^}]*)\}/u)?.[1] || "";

  assert.doesNotMatch(rule, /display\s*:\s*none/u);
  assert.match(rule, /visibility\s*:\s*hidden/u);
});
