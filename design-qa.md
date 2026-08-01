# Design QA

- Source truth: `C:\Users\mtkw0\.codex\generated_images\019fb8d2-da86-7ba2-906f-4782d250e21a\exec-548baad7-9d9a-4c74-84f5-462816089496.png`
- Implementation screenshot: `artifacts/settings-hierarchy.png`
- Viewport: 1460 × 1040 px
- Runtime: Microsoft Edge headless, local HTTP harness using the real `PromptEditor`, stylesheet, and `data/prompt_examples.json`

## Visual and interaction evidence

- Left-side settings navigation matches the selected direction: General, Translation, and Tag Management.
- Tag Management exposes Tag and Category tabs, a large/medium/small hierarchy tree, tag previews, and a two-pane editor.
- Category names are editable in English and Japanese at every hierarchy level.
- Selecting a small category exposes add, edit, and delete controls for tags.
- Category deletion shows a required destination selector when descendant tags exist.
- The bundled Hanfu primary category is absent.
- The native prompt widget is hidden through `hidden`, zero-height sizing, and an empty draw callback.
- The harness DOM result was `PASS` after loading the real bundled data and selecting a small category.

## Deviations and rationale

- The implementation uses text labels instead of decorative icons so it remains legible inside ComfyUI and does not add an icon dependency.
- The tree is denser than the concept image because the real library contains thousands of tags; previews are limited to eight tags per small category while full tag editing stays in the right pane.
- Destructive category actions are grouped in a red-bordered area and require an explicit tag destination to prevent accidental data loss.

## Final result

final result: passed
