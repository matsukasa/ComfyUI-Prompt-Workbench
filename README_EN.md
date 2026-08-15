# ComfyUI-Prompt-Workbench

[日本語](README.md) | [English](README_EN.md)

A ComfyUI custom node for editing a single prompt as individual tags.
It keeps the standard multiline STRING widget as the runtime source of truth while adding an
in-node editing interface for reordering, disabling, weighting, translating, and searching tags.

> [!IMPORTANT]
> This project is not an official ComfyUI version of
> [sd-webui-prompt-all-in-one](https://github.com/Physton/sd-webui-prompt-all-in-one),
> created by [Physton](https://github.com/Physton). We sincerely thank Physton for making such an
> intuitive and powerful prompt-editing experience available. This project studies that user
> experience and independently redesigns it for ComfyUI.

## Features

- Edit one prompt and output it as a general-purpose STRING
- State-machine parser that tracks brackets, quotes, and escapes
- Drag-and-drop tag reordering, inline editing, disabling, deletion, and copying
- Suppresses ComfyUI's standard context menu inside the node while preserving the tag-specific
  menu and native text-editing menus in input fields
- Tag weight and LoRA/LyCORIS strength controls with 0.05, 0.1, or 0.25 steps
- Multi-selection and bulk actions using Ctrl/Cmd, Shift, and checkboxes
- Undo/Redo within the browser session
- Filtering by original text, translation, state, type, duplicates, and blocklist matches
- Duplicate detection and bulk actions for selected tags
- Top, middle, and subcategory management with user tag creation, editing, and deletion
- Fully local hierarchical tag catalog with English tag and Japanese category search and bulk add
- Free automatic translation (local dictionary → MyMemory), fully offline dictionary mode,
  LibreTranslate, DeepL, and OpenAI-compatible translation adapters
- Original/Japanese/bilingual display modes and one translation button that replaces Japanese
  prompt tags with English
- Exact, case-insensitive exact, substring, and regular-expression blocklist rules
- Recognition of LoRA, LyCORIS, Embedding, Wildcard, Dynamic Prompt, and BREAK syntax
- TXT and state JSON import/export with a 1 MB limit
- ComfyUI light/dark theme integration and configurable colors for each tag state

## Tag Catalog Editor

A dedicated local web application,
[ComfyUI Prompt Workbench Tag Editor](https://github.com/matsukasa/ComfyUI-Prompt-Workbench-Tag-Editor),
is also available for intuitive editing of tags and top, middle, and subcategories. It supports
dragging and reordering tags, direct editing of category and tag names, multi-selection,
Undo/Redo, search, duplicate detection, change review, overwrite, and Save As.

Double-click `start-dev.bat` to launch it. The editor runs independently from ComfyUI, so you can
open and edit supported JSON files such as `data/tag_catalog.json` or
`data/sfw_tag_catalog.json` without installing or starting ComfyUI.

## Installation

### ComfyUI Manager (recommended)

1. Start ComfyUI and open `Manager`.
2. Open `Custom Nodes Manager`.
3. Search for `ComfyUI Prompt Workbench` or `prompt-workbench`.
4. Select `Install` in the search result.
5. Restart ComfyUI after the installation completes.

Installation through ComfyUI Manager is recommended for normal use. However, the latest version,
including changes still under development, is available from the
[`main` branch on GitHub](https://github.com/matsukasa/ComfyUI-Prompt-Workbench). Registry updates
may appear in ComfyUI Manager later than the GitHub version.

The Registry listing is available at
[ComfyUI Prompt Workbench](https://registry.comfy.org/nodes/prompt-workbench). No additional
dependencies are required.

### Standard ComfyUI

Place this folder at the following location, then restart ComfyUI:

```text
ComfyUI/custom_nodes/ComfyUI-Prompt-Workbench/
```

No additional dependencies are required. Translation HTTP requests use the `aiohttp` package
included with ComfyUI.

### ComfyUI Portable

Place the folder at the following location relative to the Portable root:

```text
ComfyUI_windows_portable/ComfyUI/custom_nodes/ComfyUI-Prompt-Workbench/
```

Then restart ComfyUI using your usual launcher, such as `run_nvidia_gpu.bat`.

### Stability Matrix

1. Open the target ComfyUI package in Stability Matrix.
2. Open the package data folder.
3. Place this folder under `ComfyUI/custom_nodes/`.
4. Restart ComfyUI from Stability Matrix.

Each package has its own `custom_nodes` directory, so install it into the package you actually run.

## Usage

1. Add `Prompt Workbench` from the node search.
2. Enter tags in the prompt text area or the add field.
3. Apply the main text with `Ctrl+Enter` or `Apply to tags`; confirm the add field with Enter.
4. Drag tag buttons to reorder them, or click a tag to enable or disable it.
5. Double-click to edit, use Ctrl/Cmd or Shift+click for multi-selection, and right-click for
   weight, translation, copy, move, and delete actions.
6. Use `Display` to switch between Original, Japanese, and Both. Press `Translate` to replace
   Japanese tags with English and add Japanese translations to English tags. Replacements are
   applied to both the prompt text and STRING output.
7. Open `Add tags` at the bottom and search categories or English/Japanese text to add tags.
8. In Settings → Tag manager, drag the `⋮⋮` handle at the left of a tag row to reorder it within
   its subcategory.
9. To keep catalog edits, use `Save as` at the bottom of the Tag manager.
10. Connect the `prompt` output to any node that accepts a STRING input.

Disabled tags remain in the workflow as UI state but are excluded from STRING output. During API
or headless execution where the browser extension is unavailable, the saved STRING is output as-is.

## UI Localization

Choose Japanese or English under Settings → General → UI language. The selection is stored only in
the current browser, not in the workflow, and takes effect after reloading ComfyUI.

UI locale files are stored under `web/locales/`. `en.json` is the template containing every
translation key, while `ja.json` can override the Japanese source text. To change an existing
locale, edit only the values under `messages` in its JSON file. To add another language, copy and
translate `en.json`, then add its language code, display label, and filename to
`web/locales/manifest.json`. Missing translations or unreadable locale files fall back to the
Japanese source text. `data/translations.json` is a prompt-tag dictionary and is not used for UI
localization.

## Input and Synchronization

Tag buttons and add actions are immediately synchronized to the corresponding standard STRING
widget. Direct edits in the main text area require an explicit apply action to avoid parsing text
during IME composition. The editor also detects and reparses STRING changes caused by workflow
loading or external operations. Complete tag state is stored in the versioned
`node.properties.promptWorkbenchState`, separately from the executable STRING.

## Translation Settings

For Japanese translation, the editor first checks the built-in dictionary and saved Japanese tag
translations regardless of the selected provider. Only missing tags are sent to an external
service. The default Free translation (dictionary → MyMemory) mode sends only those missing items
to MyMemory.

When the prompt contains Japanese tags, the `Translate` button first searches the local dictionary
for English equivalents and replaces successfully translated tag text with English. Explicit
weight syntax is preserved. Select Local dictionary only if you do not want any external requests.
Google Cloud Translation offers a free tier, but it is not the default because it requires a
Google Cloud project and authentication configuration.

API keys are not stored in nodes, workflows, or browser settings. Configure them as environment
variables for the process that starts ComfyUI.

| Provider | Environment variables |
| --- | --- |
| Local dictionary | None |
| LibreTranslate | `PROMPT_WORKBENCH_LIBRE_URL`; optionally `PROMPT_WORKBENCH_LIBRE_API_KEY` |
| DeepL | `PROMPT_WORKBENCH_DEEPL_API_KEY`; optionally `PROMPT_WORKBENCH_DEEPL_URL` |
| OpenAI-compatible | `PROMPT_WORKBENCH_OPENAI_API_KEY`, `PROMPT_WORKBENCH_OPENAI_MODEL`; optionally `PROMPT_WORKBENCH_OPENAI_BASE_URL` |

PowerShell example that configures only the current process (do not display or commit the value):

```powershell
$env:PROMPT_WORKBENCH_DEEPL_API_KEY = "your-key"
```

Start ComfyUI from the same PowerShell session after setting the variable. The implementation
includes input-size limits, a timeout of at most 30 seconds, concurrency limits, basic rate
limiting, and an in-memory cache. See [Translation providers](docs/translation-providers.md) for
details.

## Named Tag Catalogs

Catalog edits can be saved as JSON from the bottom of Settings → Tag manager. Save As requests a
different name instead of overwriting a file with the same name. `Choose and load a file` opens the
operating system's file picker, validates the selected JSON, saves a named copy under the ComfyUI
user directory, and switches to that catalog. If a catalog with the same name already exists, its
ComfyUI-side copy is updated without appending a sequence number.

The built-in default is used only when a catalog referenced by a saved workflow is missing. If the
referenced file exists but is corrupt, loading fails to avoid silently substituting the wrong data.
When unsaved catalog edits exist, loading another file displays a confirmation. The editor discards
the changes and opens the picker only after confirmation; canceling preserves the edits.

Tag and category save controls are located at the bottom of the Tag manager. `Overwrite` atomically
replaces the currently selected named catalog after confirmation. The built-in default cannot be
overwritten. Saved JSON uses the same `schema_version: 1` format as the Tag Editor, storing top →
middle → subcategory → tag as
`major_categories → medium_categories → small_categories → tags`. The complete catalog is written,
including unchanged categories and tags. The older flat `prompt-workbench/tag-catalog` version 1
format remains readable.

`Save as` opens the operating system's save-location picker and proposes the source location as the
initial directory. Suggested filenames use `original_name_YYYYMMDD_HHMMSS.json`. Chrome- and
Edge-based browsers that can retain the source file handle during the session reopen that location;
other browsers fall back to a normal download. Loading and saving share the same folder history, so
after choosing `custom_nodes/ComfyUI-Prompt-Workbench/data` once, later operations open there again.

In a standard ComfyUI installation, named files are stored under the ComfyUI user directory at
`prompt_workbench/tag_catalogs/`. Filenames may contain letters, numbers, spaces, hyphens, and
underscores, but not path separators or Windows reserved names. Loading another file while edits are
in progress requires confirmation before those edits are discarded.

## Built-in Tag Catalog

`data/tag_catalog.json` is the full tag catalog, including NSFW-related tags. It contains 4,120
tags across 11 top-level, 40 middle-level, and 163 subcategories.

Tag buttons display the English name and Japanese translation, with the same information in the
hover text. Search covers English names, aliases, and Japanese top, middle, and subcategory names.
Browsing, searching, and adding catalog tags never contacts an external tag service.

The SFW/general-purpose catalog remains available as `data/sfw_tag_catalog.json`. If you need it,
load it in ComfyUI from Prompt Workbench Settings -> Tag manager -> `Choose and load a file`. The
loaded file is saved as a named catalog under the ComfyUI user directory at
`prompt_workbench/tag_catalogs/`.
For Comfy Registry packages, the publish workflow replaces `data/tag_catalog.json` with
`data/sfw_tag_catalog.json` during packaging, so the Registry-bundled default catalog is SFW.

Favorites do not use a dedicated favorites file. They are included in `settings.favorites` inside
the `prompt_workbench_state.json` file exported by `Export state JSON`. Before replacing catalogs
or moving to another environment, back up both this state JSON and the active tag catalog JSON.

External data fetch/update scripts, API authentication settings, raw caches, and intermediate
artifacts are not included. The built-in default catalog is `data/tag_catalog.json`.
Data sources and licenses are recorded in
[Third-party notices](THIRD_PARTY_NOTICES.md).

## Security

- User strings are rendered through form values or `textContent`, never passed to `innerHTML`
- API keys are read only from server-process environment variables
- Imported JSON is validated for schema, item counts, string lengths, and the 1 MB limit
- Regular expressions have length limits and a basic rejection check for dangerous nested quantifiers
- Translation URLs must be HTTP(S) environment-variable values configured by the server administrator
- No `eval`, `new Function`, or arbitrary code-execution mechanism

## Known Limitations

- ComfyUI model-list formats vary by configuration. Editing remains available if lookup fails, but
  LoRA/Embedding existence warnings may be unavailable.
- A bare Embedding name cannot be reliably distinguished from a normal tag. Use
  `embedding:name` for explicit identification.
- Large prompts are progressively displayed in batches of 250 tags. This is not full virtual scrolling.
- DeepL, LibreTranslate, and OpenAI-compatible providers are not automatically live-tested because
  valid user configuration is unavailable.
- AI prompt generation is outside the scope of the initial release.
- Migration to the V3 node schema will be considered after reevaluating stable APIs and compatibility
  requirements.

## Troubleshooting

- Node not found: confirm the location of
  `custom_nodes/ComfyUI-Prompt-Workbench/__init__.py` and check the startup log for import errors.
- UI not displayed: force-reload the browser and confirm that `WEB_DIRECTORY = "./web"` is loaded.
  STRING output continues to work without the UI.
- Translation fails: check the configured provider environment variables, URL, and usage limits,
  then retry from the tag translation button.
- Incorrect model-missing warning: confirm that ComfyUI can serve `/object_info` or `/embeddings`.
  The warning does not block execution.

## Uninstallation

Stop ComfyUI, move `custom_nodes/ComfyUI-Prompt-Workbench` to another location or delete it, then
restart ComfyUI. Existing workflows retain an unregistered node, so copy the STRING to another node
before uninstalling if necessary.

## License

This project is licensed under the MIT License. See
[Third-party notices](THIRD_PARTY_NOTICES.md) for attribution and licensing of derived data.
