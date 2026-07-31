# Source audit

## Scope

- Reference: `Physton/sd-webui-prompt-all-in-one`
- Audited commit: `d4b37aa4187b40466772b6282d8b28acd5ad77c9`
- Commit date: 2026-04-20
- License: MIT
- Audit date: 2026-08-01
- Handling: the reference checkout was read-only and remained outside this project.

The source project targets AUTOMATIC1111/Gradio and uses Vue 3, Vite, SortableJS,
Axios, js-yaml, PapaParse and several UI libraries. This project does not port
the Gradio integration or bundled frontend. It reimplements the relevant user
experience with ComfyUI's Python node and JavaScript extension APIs, without a
frontend build step or third-party JavaScript runtime dependencies.

## Sources inspected

- `README.MD`, `README_JP.MD`, `LICENSE`
- `src/src/components/phystonPrompt.vue`
- `src/src/components/blacklist.vue`
- `src/src/components/translateSetting.vue`
- `src/src/components/chatgptPrompt.vue`
- `src/src/mixins/phystonPrompt/tagMixin.js`
- `src/src/mixins/phystonPrompt/dropMixin.js`
- `src/src/mixins/phystonPrompt/groupTagsMixin.js`
- `src/src/mixins/phystonPrompt/headerMixin.js`
- `src/src/utils/splitTags.js`
- `scripts/physton_prompt/translate.py`
- `scripts/physton_prompt/get_translate_apis.py`
- `scripts/physton_prompt/get_group_tags.py`
- `scripts/physton_prompt/translator/*.py`
- `translate_apis.json`
- `group_tags/default.yaml`, `group_tags/ja_JP.yaml`
- `i18n.json`

## ComfyUI specification checked

The design follows the official custom-node documentation current at audit
time:

- Python nodes expose STRING inputs and outputs and remain executable in API or
  headless mode.
- `WEB_DIRECTORY` publishes the frontend files.
- `app.registerExtension` and `beforeRegisterNodeDef` attach the editor to the
  matching node type.
- CSS and JSON are loaded from the extension's published web directory.
- Built-in `/embeddings` and `/object_info` endpoints are used only as optional
  model-existence hints. Failure does not block editing.
- Custom translation routes use `PromptServer.instance.routes` and aiohttp.

The V3 node schema is documented as the forward-looking API, but the current
frontend extension and broad stable-install compatibility still make the V1
node mapping the safest baseline for this first release. The backend is kept
small so a future V3 entrypoint can be added without changing workflow data.

## Original feature inventory and disposition

| Original feature | Decision | ComfyUI implementation or reason |
| --- | --- | --- |
| Positive and negative prompt enhancement | Implement | One `Prompt All-in-One` node with two multiline STRING widgets and outputs. |
| Tag/chip view | Implement | DOM widget layered over the standard STRING widgets. |
| Drag sorting | Implement with changed mechanism | Native HTML drag events instead of SortableJS. |
| Inline tag editing | Implement | Safe form controls; user text is assigned through `value`/`textContent`. |
| Enable/disable tag | Implement | Disabled state is serialized in node properties and excluded from output. |
| Weight increase/decrease | Implement | Explicit-weight parser with configurable 0.05/0.1/0.25 step and bounds. |
| Multi-selection and bulk actions | Implement | Ctrl/Meta, Shift and checkboxes; enable, disable, delete, translate, weight, copy and cross-prompt move. |
| Prompt formatting | Implement | Preview/undo-oriented normalization and duplicate operations without semantic rewriting. |
| Prompt group/tag library | Implement with reduced initial data | A small, traceable JSON conversion from `group_tags/ja_JP.yaml`; searchable and extensible. |
| Translation | Implement with changed provider set | Server-side adapters for local dictionary, LibreTranslate, DeepL and OpenAI-compatible APIs. Unofficial legacy providers are not ported. |
| Translation cache | Implement | Bounded in-memory cache; no prompt history is written to disk. |
| Blacklist | Implement with changed rules | Exact, case-insensitive exact, substring and regex; warn, disable or delete. |
| LoRA/LyCORIS/Embedding highlighting | Implement | Syntax classification plus optional ComfyUI endpoint lookup. |
| Wildcard, dynamic prompt and BREAK recognition | Implement | Syntax classification independent of model lookup. |
| Tag colors and themes | Implement | CSS custom properties with automatic ComfyUI light/dark inheritance. |
| Search/filter | Implement | Display-only filters preserve output order and content. |
| Copy/import/export | Implement | Clipboard, TXT and schema-validated JSON with size limits and no secrets. |
| Browser-session undo/redo | Implement | Bounded in-memory snapshots only. |
| Prompt history | Do not implement | Explicitly excluded. No history button, data model, storage or placeholder. |
| Automatic input history | Do not implement | Explicitly excluded. |
| Favorites and favorite folders | Do not implement | Explicitly excluded. No favorite UI or storage. |
| ChatGPT prompt generation | Do not implement in v1 | Optional phase-two feature; omitted to protect core reliability and secret handling. |
| A1111 extra-network popup | Implement with changed specification | Non-blocking existence hints from ComfyUI endpoints; no A1111 card browser. |
| A1111 token counter | Do not implement | Tokenization depends on the connected CLIP/model and is outside a STRING editor's reliable scope. |
| A1111 style/theme extension system | Do not implement | ComfyUI theme variables and a compact settings panel replace it. |

## Parser decision

The reference `src/src/utils/splitTags.js` recognizes several brackets and
special cases, but its active algorithm tracks only one opening/closing bracket
kind at a time and does not fully model quotes or general escape state. Copying
it would not satisfy this project's round-trip requirements.

This project therefore uses an independently written state machine that tracks:

- independent `()`, `[]`, `{}` and `<>` nesting;
- single and double quotes;
- backslash escape state;
- top-level commas and line breaks;
- empty entries and trailing separators as parse metadata.

Serialization canonicalizes separators to `, ` while preserving tag text,
order, meaningful nested syntax and disabled editor state.

## Translation provider audit

| Provider | API key | Status | Dependencies | Notes/test boundary |
| --- | --- | --- | --- | --- |
| Local dictionary | No | Implemented | None | Deterministic offline mapping for bundled examples; unit-testable. |
| LibreTranslate-compatible | Optional | Implemented | ComfyUI aiohttp | Configured by environment variables; endpoint health is not assumed. |
| DeepL | Yes | Implemented | ComfyUI aiohttp | Key read from `PROMPT_AIO_DEEPL_API_KEY`; no live-key test performed. |
| OpenAI-compatible | Yes | Implemented | ComfyUI aiohttp | Key and endpoint are environment-only; no live-key test performed. |
| Google unofficial/free | N/A | Unavailable | Would require unstable unofficial behavior | Intentionally not ported. |
| `translators` package provider set | Varies | Unavailable | Large optional dependency and unstable upstream endpoints | Intentionally not ported. |
| Microsoft/Amazon/Baidu/Tencent/etc. | Yes | Not in v1 | Provider-specific signing and SDK behavior | Adapter interface permits later additions. |
| mBART50 offline | No | Not in v1 | Large model and ML dependencies | Conflicts with the dependency-free first release. |

API keys are never accepted through normal node widgets, workflow JSON,
browser-side settings, import/export state or logs.

## Data reuse

Only a compact subset of English prompt tokens and Japanese translations is
converted from `group_tags/ja_JP.yaml`. The full YAML is not copied because it
is large, contains community-aggregated material with mixed provenance, and is
not necessary for a reliable first release. Exact source and commit attribution
is recorded in `THIRD_PARTY_NOTICES.md` and each converted data file.

No source JavaScript, Vue component, icon, CSS bundle, Python translator or
history/favorite code is copied.

## Compatibility substitutions

### Gradio textarea synchronization

- Original: watches and replaces A1111/Gradio prompt textareas.
- Direct port problem: ComfyUI stores node widget values in workflows and can
  execute them through its API without a browser.
- Substitute: standard multiline STRING widgets remain authoritative for node
  execution; the DOM editor synchronizes with them in both directions.
- UX impact: prompts travel with the node and connect directly to STRING inputs.
- Future extension: migrate the small backend definition to stable V3 schema
  after its compatibility floor is appropriate.

### Disabled tags

- Original: UI state is coupled to the page-side component state.
- Direct port problem: disabled tags must survive while the executable STRING
  intentionally excludes them.
- Substitute: output strings stay in widgets; complete tag state is stored in a
  versioned `node.properties.promptAllInOneState` object.
- UX impact: headless execution sees clean strings, while browser workflows can
  restore disabled chips.
- Future extension: a hidden versioned STRING widget can replace properties if
  ComfyUI standardizes extension-owned state inputs.

### Model existence checks

- Original: A1111 extra-network APIs enumerate LoRA, LyCORIS and embeddings.
- Direct port problem: ComfyUI installations and node packs expose different
  loaders and folder names.
- Substitute: best-effort reads of core `/embeddings` and `/object_info` data.
- UX impact: missing-model warnings can be unavailable, but editing never stops.
- Future extension: add adapters for documented model-library APIs as they
  stabilize.

### Translation configuration

- Original: many provider settings are stored through the extension backend.
- Direct port problem: node widgets and workflows are unsafe locations for API
  keys, and many free providers are explicitly described as unstable.
- Substitute: a small server adapter set reads environment variables only.
- UX impact: fewer providers, but clear failure states and no secret leakage.
- Future extension: add an ignored local configuration file only after a secure
  ComfyUI settings API is available and explicitly opted into.
