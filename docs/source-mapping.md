# Source mapping

| Reference source | Observed behavior | New implementation |
| --- | --- | --- |
| `src/src/utils/splitTags.js` | Split A1111 text into prompt items | Independently written nested state machine in `web/prompt_parser.js` |
| `phystonPrompt.vue` | Main Vue prompt editor and Gradio synchronization | Dependency-free DOM editor and ComfyUI widget synchronization |
| `tagMixin.js` | Weight controls and network classification | Pure weight/classification functions plus tag controls |
| `dropMixin.js` | Selection rectangle and bulk actions | Checkbox/Ctrl/Shift selection and in-flow bulk toolbar |
| `groupTagsMixin.js` | YAML prompt group browser | 134 YAML groups flattened into the JSON category/search dialog; `人物 / 二次元キャラクター` is excluded |
| `blacklist.vue` | Lists for prompt/network/translation blocking | Rule-based exact/iexact/substring/regex editor |
| `translate.py` and translators | Provider dispatch and cache | Four-provider aiohttp adapter with environment-only secrets |
| `history.*`, `favorite.*` | Persistent prompt history and favorites | Explicitly omitted |
| `chatgptPrompt.vue`, `gen_openai.py` | Prompt generation | Optional feature omitted from v1 |

No reference code was copied. The only adapted content is the small prompt-data
subset documented in `THIRD_PARTY_NOTICES.md`.
