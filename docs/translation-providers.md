# Translation providers

| Provider | Key | Implemented | Availability rule | Extra dependency | Automated test |
| --- | --- | --- | --- | --- | --- |
| Free automatic (dictionary -> MyMemory) | No | Yes | Always; remote fallback needs internet | None beyond ComfyUI | Dictionary and parser tests |
| Local dictionary only | No | Yes | Always | None | Yes |
| LibreTranslate-compatible | Optional | Yes | `PROMPT_WORKBENCH_LIBRE_URL` set | None beyond ComfyUI | Adapter only |
| DeepL | Yes | Yes | `PROMPT_WORKBENCH_DEEPL_API_KEY` set | None beyond ComfyUI | Adapter only |
| OpenAI-compatible | Yes | Yes | `PROMPT_WORKBENCH_OPENAI_API_KEY` and `PROMPT_WORKBENCH_OPENAI_MODEL` set | None beyond ComfyUI | Adapter only |
| Google Cloud Translation | Yes | No | Google Cloud project and authentication required | Google Cloud setup | Not run |
| mBART50 | No | No | Large optional model omitted | Transformers/model files | Not run |

The UI never asks for or displays a key. `/prompt_workbench/providers` returns
availability booleans and reasons only. `/prompt_workbench/translate` accepts a
bounded list of text values and provider identifiers, but no URL or credential.

Remote providers share a three-request concurrency gate. Requests time out after
3-30 seconds, are limited per client to 30 calls per minute, and use a bounded
512-entry process-memory cache. Restarting ComfyUI clears the cache.

The default `local` provider checks the bundled English/Japanese dictionary
first. For an unknown tag it sends only that tag text to MyMemory's fixed HTTPS
`get` endpoint. Underscores are converted to spaces before the remote request.
Choose `offline` in settings to prevent all translation traffic. Individual
remote failures are returned per tag so the remainder of a batch can continue.
