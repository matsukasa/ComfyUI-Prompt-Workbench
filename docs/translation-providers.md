# Translation providers

| Provider | Key | Implemented | Availability rule | Extra dependency | Automated test |
| --- | --- | --- | --- | --- | --- |
| Local dictionary | No | Yes | Always | None | Yes |
| LibreTranslate-compatible | Optional | Yes | `PROMPT_AIO_LIBRE_URL` set | None beyond ComfyUI | Adapter only |
| DeepL | Yes | Yes | `PROMPT_AIO_DEEPL_API_KEY` set | None beyond ComfyUI | Adapter only |
| OpenAI-compatible | Yes | Yes | `PROMPT_AIO_OPENAI_API_KEY` and `PROMPT_AIO_OPENAI_MODEL` set | None beyond ComfyUI | Adapter only |
| Upstream unofficial free providers | N/A | No | Unstable/non-contractual endpoints | Often `translators` | Not run |
| mBART50 | No | No | Large optional model omitted | Transformers/model files | Not run |

The UI never asks for or displays a key. `/prompt_all_in_one/providers` returns
availability booleans and reasons only. `/prompt_all_in_one/translate` accepts a
bounded list of text values and provider identifiers, but no URL or credential.

Remote providers share a three-request concurrency gate. Requests time out after
3-30 seconds, are limited per client to 30 calls per minute, and use a bounded
512-entry process-memory cache. Restarting ComfyUI clears the cache.
