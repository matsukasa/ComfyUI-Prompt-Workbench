# Architecture

## Data flow

```text
DOM editor state
  -> enabled tags + selected output language
  -> positive_prompt / negative_prompt STRING widgets
  -> Python PromptAllInOne.emit_prompts
  -> positive / negative STRING outputs
```

The two widgets are the execution source of truth. Full browser editing state,
including disabled tags and bilingual labels, is serialized separately under a
versioned node property. This makes API and headless execution independent from
the frontend while allowing the browser to restore non-output state.

## Modules

- `nodes.py`: headless-safe STRING node only.
- `routes.py`: bounded example and translation endpoints; no prompt persistence.
- `web/prompt_parser.js`: parser, serializer, weights, normalization, blacklist.
- `web/settings.js`: versioned editor-state and import validation.
- `web/translation.js`: abortable frontend translation client.
- `web/prompt_editor.js`: DOM UI, two-way synchronization and session undo.
- `web/prompt_all_in_one.js`: ComfyUI registration hook and stylesheet loading.

## Synchronization

UI mutations set a reentrancy guard, calculate output strings, call widget
callbacks and persist extension state. A low-frequency watcher detects values
changed by workflow loading or another extension. It ignores values just written
by this editor, preventing feedback loops.

## Degraded modes

- No frontend: Python returns saved strings unchanged.
- No translation provider: local editing remains available and an inline error
  offers retry.
- No model registry: syntax colors remain; missing-model warnings are skipped.
- Missing examples: the example dialog reports an error; existing prompts are
  unaffected.

## V3 migration

The first release uses stable V1 mappings for broad ComfyUI compatibility.
Migration should replace only `nodes.py` and registration exports after a stable
versioned Comfy API meets the supported installation floor. Widget names and
workflow state keys must stay unchanged or use the official node-replacement API.
