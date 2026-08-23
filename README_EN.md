# ComfyUI-Prompt-Workbench

[日本語](README.md) | [English](README_EN.md)

A ComfyUI custom node for editing prompts as individual tags. It helps you reorder, disable, weight, translate, search, and manage prompt tags while still outputting a normal ComfyUI `STRING`.

The runtime source of truth remains the standard multiline `STRING` widget. Prompt Workbench adds a tag editing interface on top of it, so saved workflows can still output the stored `STRING` when the browser UI is unavailable.

## Demo

<video src="docs/assets/comfyui_prompt_workbench_intro.mp4" controls></video>

If GitHub does not display the video, open [`docs/assets/comfyui_prompt_workbench_intro.mp4`](docs/assets/comfyui_prompt_workbench_intro.mp4).

![Prompt Workbench node UI](docs/assets/prompt-workbench-main-node.png)

> [!IMPORTANT]
> This project is not an official ComfyUI version of
> [sd-webui-prompt-all-in-one](https://github.com/Physton/sd-webui-prompt-all-in-one),
> created by [Physton](https://github.com/Physton).
> We sincerely thank Physton for making such an intuitive and powerful prompt editing experience available.
> This node studies that experience and independently redesigns it for ComfyUI.

## Features

- Edit one prompt and output it as a general-purpose `STRING`.
- Reorder tags by dragging, and enable or disable tags by clicking.
- Inline tag editing, deletion, copying, duplicate detection, multi-selection, and bulk actions.
- Tag weight, LoRA, and LyCORIS strength controls with `0.05`, `0.1`, or `0.25` steps.
- Filtering by original text, translation, state, type, duplicates, and blocklist matches.
- Search and add tags from a fully local hierarchical tag catalogue.
- Search classified tag sets and add grouped tags at once.
- Tag set favourites, search, image display, and adjustable tag set list height.
- Translation through the local dictionary, MyMemory, LibreTranslate, DeepL, or an OpenAI-compatible API.
- Original, Japanese, and bilingual display modes.
- A translation button that replaces Japanese prompt tags with English tags.
- Recognition of LoRA, LyCORIS, Embedding, Wildcard, Dynamic Prompt, and `BREAK` syntax.
- TXT and state JSON Import / Export.
- ComfyUI light and dark theme integration, with configurable colours for each tag state.

Tag parsing uses a state-machine parser that tracks brackets, quotes, and escapes. Inside the node, ComfyUI's standard right-click menu is suppressed, while the tag-specific menu and native text editing menus in input fields are preserved.

## Installation

### ComfyUI Manager

ComfyUI Manager is recommended for normal installation.

1. Start ComfyUI and open `Manager`.
2. Open `Custom Nodes Manager`.
3. Search for `ComfyUI Prompt Workbench` or `prompt-workbench`.
4. Select `Install` in the search result.
5. Restart ComfyUI after installation completes.

The Registry listing is available at [ComfyUI Prompt Workbench](https://registry.comfy.org/nodes/prompt-workbench). No additional dependencies are required.

The latest development version is available from the [`main` branch on GitHub](https://github.com/matsukasa/ComfyUI-Prompt-Workbench). Manager releases may appear later than the GitHub version because they depend on Registry update timing.

### Standard ComfyUI

Place this folder at the following location, then restart ComfyUI:

```text
ComfyUI/custom_nodes/ComfyUI-Prompt-Workbench/
```

Translation HTTP requests use the `aiohttp` package included with ComfyUI.

### ComfyUI Portable

For the Portable build, place this folder under the Portable ComfyUI `custom_nodes` directory:

```text
ComfyUI_windows_portable/ComfyUI/custom_nodes/ComfyUI-Prompt-Workbench/
```

Then restart ComfyUI using your usual launcher, such as `run_nvidia_gpu.bat`.

### Stability Matrix

Stability Matrix has a separate `custom_nodes` directory for each package. Install the node into the package you actually run.

1. Open the target ComfyUI package in Stability Matrix.
2. Open the package data folder.
3. Place this folder under `ComfyUI/custom_nodes/`.
4. Restart ComfyUI from Stability Matrix.

## Basic Usage

1. Add `Prompt Workbench` from the node search.
2. Enter tags in the main text area or the add field at the bottom.
3. Apply the main text with `Ctrl+Enter` or `Apply to tags`; confirm the add field with Enter.
4. Drag tag buttons to reorder them.
5. Click a tag button to enable or disable it.
6. Double-click a tag to edit it inline.
7. Use Ctrl / Cmd or Shift + click for multi-selection.
8. Use the right-click menu for weight, translation, copy, move, and delete actions.
9. Use `Display` to switch between Original, Japanese, and Both.
10. Press `Translate` to replace Japanese tags with English and add Japanese translations to English tags.
11. Open `Add tags` to search by category, English name, or Japanese name.
12. Open the `Tag sets` tab to search classified tag sets and add grouped tags.
13. Connect the `prompt` output to any node that accepts a `STRING` input.

Disabled tags remain in the workflow as UI state, but are excluded from `STRING` output. During API or headless execution where the browser UI is unavailable, the saved `STRING` is output as-is.

## Tag Catalogue And Tag Sets

Prompt Workbench uses two local data sources.

- Tag catalogue: a dictionary for adding individual tags.
- Tag sets: classified groups of tags for adding common prompt patterns at once.

The currently bundled data is:

| Data | Top-level | Middle-level | Subcategories | Items |
| --- | ---: | ---: | ---: | ---: |
| Tag catalogue `data/tag_catalog.json` | 10 | 39 | 159 | 2,922 tags |
| Tag sets `data/tag_sets.json` | 5 | 17 | 46 | 323 sets |

Browsing, searching, and adding catalogue tags never contacts an external tag service. Tag sets are also loaded from local JSON.

### Using The Tag Catalogue

Open `Add tags` to use the tag catalogue. Search covers English names, aliases, and Japanese top-level, middle-level, and subcategory names. Tag buttons display the English name and Japanese translation.

The SFW/general-purpose catalogue remains available as `data/sfw_tag_catalog.json`. If you need it, load it from Prompt Workbench Settings -> Tag manager -> `Choose and load a file`. The loaded file is saved as a named catalogue under the ComfyUI user directory at:

```text
prompt_workbench/tag_catalogs/
```

For Comfy Registry packages, the publish workflow replaces `data/tag_catalog.json` with `data/sfw_tag_catalog.json` during packaging, so the Registry-bundled default catalogue is SFW.

### Using Tag Sets

Open the `Tag sets` tab to search classified tag sets and add them to the prompt. A tag set can include a name, Japanese name, English name, author, reference URL, image URL, image path, and tag contents. The UI can show the image, name, description, and tags before insertion.

Use the star button to mark a tag set as a favourite. Favourites are saved in node settings as `favoriteTagSets`. The tag set list can be resized, and its height is saved as `tagSetListHeight`.

The default tag set file is `data/tag_sets.json`. To use another tag set JSON file, load it from Prompt Workbench Settings -> Tag manager. The loaded file is saved as a named file under the ComfyUI user directory at:

```text
prompt_workbench/tag_sets/
```

## Editing The Catalogue In Prompt Workbench

Prompt Workbench's `Tag manager` screen can edit tags and categories inside ComfyUI. Drag the `⋮⋮` handle at the left of a tag row to reorder tags within the current subcategory. To keep catalogue edits, use `Save as` or `Overwrite` at the bottom of the Tag manager.

The built-in default catalogue cannot be overwritten. Named catalogues are saved under:

```text
prompt_workbench/tag_catalogs/
```

Saved JSON uses `schema_version: 1`. It stores top-level categories, middle-level categories, subcategories, and tags as `major_categories -> medium_categories -> small_categories -> tags`. The older flat `prompt-workbench/tag-catalog` version 1 format remains readable.

## Full Editing In Tag Editor

For larger catalogue or tag set maintenance, use the dedicated local web application:
[ComfyUI Prompt Workbench Tag Editor](https://github.com/matsukasa/ComfyUI-Prompt-Workbench-Tag-Editor).

![ComfyUI Prompt Workbench Tag Editor UI](docs/assets/prompt-workbench-tag-editor.png)

Tag Editor supports:

- Editing top-level, middle-level, and subcategories in the tag catalogue.
- Editing top-level, middle-level, and subcategories in tag sets.
- Dragging, reordering, and directly editing tags and tag sets.
- Multi-selection, Undo / Redo, search, and duplicate detection.
- Save preview, overwrite, and Save As.
- Differential ZIP Import / Export.

Import / Export is available from the gear menu in the top-right of Tag Editor. `Export diff` packages only the difference between Factory Default and the current edited state. If Factory Default cannot be loaded, the loaded state is used as the comparison base. Export targets are `Export tag catalogue only`, `Export tag sets only`, and `Export both`.

During Import, Tag Editor previews manifest validation, patch validation, Import target selection, repeated Import detection, conflict detection, change counts, errors, and progress phases before applying changes. When conflicts exist, you can stop while keeping the current settings, apply the Import-side data for conflicting entries, or skip only the conflicting entries for this Import. Top-level, middle-level, and subcategories added by another user are imported for both the tag catalogue and tag sets. Delete operations are not included in shared diffs, and old ZIP files that contain delete operations are ignored on Import. Default-origin items deleted by the current user are recorded in `prompt_workbench_meta`, so importing a later diff ZIP does not revive those deleted Default items.

Tags, tag catalogue categories, tag set categories, and tag sets are marked as `Default`, `Local`, or `Imported`; hover over a row to check its origin. Before applying an Import, Tag Editor writes the current JSON files as a backup ZIP. If applying the Import fails, the in-memory editing state is restored to the pre-Import state.

Tag Editor runs independently from ComfyUI, so you can edit files such as `data/tag_catalog.json`, `data/sfw_tag_catalog.json`, and `data/tag_sets.json` without starting ComfyUI.

## State JSON And Favourites

`Export state JSON` saves Prompt Workbench state as `prompt_workbench_state.json`. Tag catalogue favourites are included in `settings.favorites`. Tag set favourites are included in `settings.favoriteTagSets`.

Before replacing catalogues, replacing tag sets, or moving to another environment, back up the state JSON, the active tag catalogue JSON, and the active tag set JSON together.

## Translation

For Japanese translation, Prompt Workbench first checks the built-in dictionary and saved Japanese tag translations, regardless of the selected provider. Only missing tags are sent to an external service.

The default `Free translation (dictionary -> MyMemory)` mode sends only missing items to MyMemory. Select `Local dictionary only` if you do not want external requests.

When the prompt contains Japanese tags, the `Translate` button first searches the local dictionary for English equivalents. Found tags are replaced with English in the prompt text. Explicit weight syntax is preserved.

Google Cloud Translation offers a free tier, but it is not the default because it requires a Google Cloud project and authentication configuration.

API keys are not stored in nodes, workflows, or browser settings. Configure them as environment variables for the process that starts ComfyUI.

| Provider | Environment variables |
| --- | --- |
| Local dictionary | None |
| LibreTranslate | `PROMPT_WORKBENCH_LIBRE_URL`; optionally `PROMPT_WORKBENCH_LIBRE_API_KEY` |
| DeepL | `PROMPT_WORKBENCH_DEEPL_API_KEY`; optionally `PROMPT_WORKBENCH_DEEPL_URL` |
| OpenAI-compatible | `PROMPT_WORKBENCH_OPENAI_API_KEY`, `PROMPT_WORKBENCH_OPENAI_MODEL`; optionally `PROMPT_WORKBENCH_OPENAI_BASE_URL` |

PowerShell example that configures only the current process. Do not display or commit the value.

```powershell
$env:PROMPT_WORKBENCH_DEEPL_API_KEY = "your-key"
```

Start ComfyUI from the same PowerShell session after setting the variable. The implementation includes input-size limits, a timeout of at most 30 seconds, concurrency limits, basic rate limiting, and an in-memory cache. See [Translation providers](docs/translation-providers.md) for details.

## UI Language

Choose Japanese or English under Settings -> General -> UI language. The selection is stored only in the current browser, not in the workflow, and takes effect after reloading ComfyUI.

UI locale files are stored under `web/locales/`. `en.json` is the template containing every translation key. `ja.json` can override the Japanese source text. `data/translations.json` is a prompt-tag dictionary and is not used for UI localisation.

## Input And Synchronisation

Tag buttons and add actions are immediately synchronised to the corresponding standard `STRING` widget. Direct edits in the main text area require an explicit apply action to avoid parsing text during IME composition. The editor also detects and reparses `STRING` changes caused by workflow loading or external operations.

Complete tag state is stored in the versioned `node.properties.promptWorkbenchState`, separately from the executable `STRING`.

## Security

- User strings are rendered through form values or `textContent`, never passed to `innerHTML`.
- API keys are read only from server-process environment variables.
- Imported JSON is validated for schema, item counts, string lengths, and the 1 MB limit.
- Regular expressions have length limits and a basic rejection check for dangerous nested quantifiers.
- Translation URLs must be HTTP(S) environment-variable values configured by the server administrator.
- No `eval`, `new Function`, or arbitrary code execution mechanism is used.

## Known Limitations

- ComfyUI model-list formats vary by configuration. Editing remains available if lookup fails, but LoRA / Embedding existence warnings may be unavailable.
- A bare Embedding name cannot be reliably distinguished from a normal tag. Use `embedding:name` for explicit identification.
- Large prompts are progressively displayed in batches of 250 tags. This is not full virtual scrolling.
- DeepL, LibreTranslate, and OpenAI-compatible providers are not automatically live-tested because valid user configuration is unavailable.
- AI prompt generation is outside the scope of this node.
- Migration to the V3 node schema will be considered after stable APIs and compatibility requirements are reevaluated.

## Troubleshooting

### Node Not Found

Confirm the location of `custom_nodes/ComfyUI-Prompt-Workbench/__init__.py`, and check the ComfyUI startup log for import errors.

### UI Not Displayed

Force-reload the browser. If it still does not appear, confirm that `WEB_DIRECTORY = "./web"` is loaded. `STRING` output continues to work without the UI.

### Translation Fails

Check the configured provider environment variables, URL, and usage limits, then retry from the tag translation button.

### Incorrect Model-Missing Warning

Confirm that ComfyUI can serve `/object_info` or `/embeddings`. The warning does not block execution.

### Tag Sets Not Displayed

Check the tag set file status in Settings -> Tag manager. Corrupt JSON or unsupported schemas produce a load error. If no tag set file is selected, Prompt Workbench uses the bundled `data/tag_sets.json`.

## Uninstallation

Stop ComfyUI, move `custom_nodes/ComfyUI-Prompt-Workbench` to another location or delete it, then restart ComfyUI. Existing workflows retain an unregistered node, so copy the `STRING` to another node before uninstalling if necessary.

## License

This project is licensed under the MIT License. See [Third-party notices](THIRD_PARTY_NOTICES.md) for attribution and licensing of derived data.
