import asyncio
import json
import os
import time
from collections import OrderedDict, defaultdict, deque
from pathlib import Path
from urllib.parse import urlparse

MAX_REQUEST_BYTES = 64 * 1024
MAX_TEXT_LENGTH = 8_000
MAX_BATCH_SIZE = 100
CACHE_LIMIT = 512
RATE_LIMIT = 30
RATE_WINDOW_SECONDS = 60

_CACHE = OrderedDict()
_RATE_BUCKETS = defaultdict(deque)
_REMOTE_SEMAPHORE = asyncio.Semaphore(3)
_ROUTES_REGISTERED = False


class TranslationError(RuntimeError):
    pass


def _load_dictionary():
    path = Path(__file__).with_name("data") / "translations.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def provider_status():
    return [
        {
            "id": "local",
            "label": "Local dictionary",
            "available": True,
            "api_key_required": False,
        },
        {
            "id": "libretranslate",
            "label": "LibreTranslate-compatible",
            "available": bool(os.getenv("PROMPT_AIO_LIBRE_URL")),
            "api_key_required": False,
            "reason": "PROMPT_AIO_LIBRE_URL is not set",
        },
        {
            "id": "deepl",
            "label": "DeepL",
            "available": bool(os.getenv("PROMPT_AIO_DEEPL_API_KEY")),
            "api_key_required": True,
            "reason": "PROMPT_AIO_DEEPL_API_KEY is not set",
        },
        {
            "id": "openai",
            "label": "OpenAI-compatible",
            "available": bool(
                os.getenv("PROMPT_AIO_OPENAI_API_KEY")
                and os.getenv("PROMPT_AIO_OPENAI_MODEL")
            ),
            "api_key_required": True,
            "reason": "PROMPT_AIO_OPENAI_API_KEY or PROMPT_AIO_OPENAI_MODEL is not set",
        },
    ]


def _validate_url(url):
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise TranslationError("Translation endpoint must be an http(s) URL")
    if parsed.username or parsed.password:
        raise TranslationError("Credentials are not allowed in translation URLs")
    return url.rstrip("/")


def _cache_key(provider, source, target, text):
    return (provider, source.lower(), target.lower(), text)


def _cache_get(key):
    if key not in _CACHE:
        return None
    value = _CACHE.pop(key)
    _CACHE[key] = value
    return value


def _cache_set(key, value):
    _CACHE[key] = value
    _CACHE.move_to_end(key)
    while len(_CACHE) > CACHE_LIMIT:
        _CACHE.popitem(last=False)


def _rate_limit(client_id):
    now = time.monotonic()
    bucket = _RATE_BUCKETS[client_id]
    while bucket and now - bucket[0] > RATE_WINDOW_SECONDS:
        bucket.popleft()
    if len(bucket) >= RATE_LIMIT:
        raise TranslationError("Translation rate limit reached; retry shortly")
    bucket.append(now)


def _local_translate(text, target):
    dictionary = _load_dictionary()
    table = dictionary.get(target.lower(), {})
    normalized = text.strip().lower()
    return table.get(normalized, text)


async def _post_json(session, url, payload, headers=None):
    async with session.post(url, json=payload, headers=headers or {}) as response:
        body = await response.text()
        if response.status >= 400:
            raise TranslationError(f"Translation service returned HTTP {response.status}")
        try:
            return json.loads(body)
        except json.JSONDecodeError as exc:
            raise TranslationError("Translation service returned invalid JSON") from exc


async def translate_text(provider, text, source="auto", target="en", timeout=12):
    if not isinstance(text, str) or not text.strip():
        raise TranslationError("Translation text is empty")
    if len(text) > MAX_TEXT_LENGTH:
        raise TranslationError(f"Translation text exceeds {MAX_TEXT_LENGTH} characters")
    if provider not in {"local", "libretranslate", "deepl", "openai"}:
        raise TranslationError("Unknown translation provider")

    key = _cache_key(provider, source, target, text)
    cached = _cache_get(key)
    if cached is not None:
        return cached, True

    if provider == "local":
        result = _local_translate(text, target)
        _cache_set(key, result)
        return result, False

    try:
        import aiohttp
    except ImportError as exc:
        raise TranslationError("aiohttp is unavailable in this ComfyUI installation") from exc

    timeout = max(3, min(int(timeout), 30))
    client_timeout = aiohttp.ClientTimeout(total=timeout)
    async with _REMOTE_SEMAPHORE, aiohttp.ClientSession(timeout=client_timeout) as session:
        if provider == "libretranslate":
            base_url = _validate_url(os.getenv("PROMPT_AIO_LIBRE_URL", ""))
            payload = {"q": text, "source": source, "target": target, "format": "text"}
            api_key = os.getenv("PROMPT_AIO_LIBRE_API_KEY")
            if api_key:
                payload["api_key"] = api_key
            data = await _post_json(session, f"{base_url}/translate", payload)
            result = data.get("translatedText")
        elif provider == "deepl":
            api_key = os.getenv("PROMPT_AIO_DEEPL_API_KEY")
            if not api_key:
                raise TranslationError("DeepL API key is not configured")
            base_url = _validate_url(
                os.getenv("PROMPT_AIO_DEEPL_URL", "https://api-free.deepl.com/v2")
            )
            payload = {"text": [text], "target_lang": target.upper()}
            if source.lower() != "auto":
                payload["source_lang"] = source.upper()
            data = await _post_json(
                session,
                f"{base_url}/translate",
                payload,
                {"Authorization": f"DeepL-Auth-Key {api_key}"},
            )
            translations = data.get("translations") or []
            result = translations[0].get("text") if translations else None
        else:
            api_key = os.getenv("PROMPT_AIO_OPENAI_API_KEY")
            if not api_key:
                raise TranslationError("OpenAI-compatible API key is not configured")
            base_url = _validate_url(
                os.getenv("PROMPT_AIO_OPENAI_BASE_URL", "https://api.openai.com/v1")
            )
            model = os.getenv("PROMPT_AIO_OPENAI_MODEL")
            if not model:
                raise TranslationError("OpenAI-compatible model is not configured")
            payload = {
                "model": model,
                "temperature": 0,
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "Translate the supplied Stable Diffusion prompt tag to "
                            f"{target}. Return only the translation and preserve model syntax."
                        ),
                    },
                    {"role": "user", "content": text},
                ],
            }
            data = await _post_json(
                session,
                f"{base_url}/chat/completions",
                payload,
                {"Authorization": f"Bearer {api_key}"},
            )
            choices = data.get("choices") or []
            result = choices[0].get("message", {}).get("content") if choices else None

    if not isinstance(result, str) or not result.strip():
        raise TranslationError("Translation service returned an empty result")
    result = result.strip()[:MAX_TEXT_LENGTH]
    _cache_set(key, result)
    return result, False


def register_routes():
    global _ROUTES_REGISTERED
    if _ROUTES_REGISTERED:
        return

    from aiohttp import web
    from server import PromptServer

    routes = PromptServer.instance.routes

    @routes.get("/prompt_all_in_one/examples")
    async def get_examples(_request):
        path = Path(__file__).with_name("data") / "prompt_examples.json"
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return web.json_response({"error": "Prompt examples are unavailable"}, status=500)
        return web.json_response(data)

    @routes.get("/prompt_all_in_one/providers")
    async def get_providers(_request):
        return web.json_response({"providers": provider_status()})

    @routes.post("/prompt_all_in_one/translate")
    async def post_translate(request):
        if request.content_length and request.content_length > MAX_REQUEST_BYTES:
            return web.json_response({"error": "Request is too large"}, status=413)
        try:
            body = await request.json()
            provider = body.get("provider", "local")
            texts = body.get("texts")
            if not isinstance(texts, list) or not 1 <= len(texts) <= MAX_BATCH_SIZE:
                raise TranslationError("texts must be a non-empty bounded array")
            if not all(isinstance(item, str) for item in texts):
                raise TranslationError("Every translation item must be a string")
            _rate_limit(request.remote or "local")
            source = str(body.get("source", "auto"))[:16]
            target = str(body.get("target", "en"))[:16]
            timeout = body.get("timeout", 12)
            results = []
            for item in texts:
                translated, cached = await translate_text(provider, item, source, target, timeout)
                results.append({"source": item, "translated": translated, "cached": cached})
            return web.json_response({"results": results})
        except (TranslationError, ValueError, TypeError, json.JSONDecodeError) as exc:
            return web.json_response({"error": str(exc)}, status=400)
        except asyncio.TimeoutError:
            return web.json_response({"error": "Translation timed out"}, status=504)

    _ROUTES_REGISTERED = True
