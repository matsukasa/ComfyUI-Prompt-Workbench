import json
import re

POSITIVE_SECTION_KEYS = ("quality", "subject", "composition", "style", "trigger")
NEGATIVE_SECTION_KEYS = ("quality", "anatomy", "style")
DEFAULT_MERGE_ORDER = ",".join(POSITIVE_SECTION_KEYS)
SECTION_DISPLAY_TITLES = {
    "quality": "Quality",
    "subject": "Subject",
    "composition": "Composition",
    "style": "Style",
    "trigger": "Trigger",
    "anatomy": "Anatomy",
}


def normalize_output_prompt(prompt):
    value = "" if prompt is None else str(prompt)
    value = re.sub(r"[ \t]*,?[ \t]*(?:\r\n|\r|\n)+[ \t]*", ", ", value).strip()
    # Drop empty segments ("a, , b" / "a,,b"); an escaped comma (\,) is a
    # literal character inside a tag and never starts a segment boundary.
    value = re.sub(r"(?<!\\),\s*(?:,\s*)+", ", ", value)
    value = re.sub(r"^(?:,\s*)+", "", value)
    value = re.sub(r"(?:,\s*)+$", "", value).rstrip()
    return f"{value}," if value else ""


def normalize_structured_prompt(prompt):
    """Normalize line endings and outer whitespace while keeping section layout."""
    value = "" if prompt is None else str(prompt)
    value = value.replace("\r\n", "\n").replace("\r", "\n")
    lines = [line.rstrip() for line in value.split("\n")]
    return "\n".join(lines).strip()


def _coerce_enabled(value, default=True):
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    text = str(value).strip().lower()
    if text in ("0", "false", "no", "off", ""):
        return False
    if text in ("1", "true", "yes", "on"):
        return True
    return default


def _unescape_separator(separator):
    if separator is None:
        return ", "
    text = str(separator)
    if text == "":
        return ", "
    return (
        text.replace("\\r\\n", "\n")
        .replace("\\n", "\n")
        .replace("\\t", "\t")
    )


def _split_tag_items(text):
    raw = "" if text is None else str(text)
    if not raw.strip():
        return []
    # Split on newlines or unescaped commas while keeping A1111 weights like (tag:1.2) intact.
    flattened = re.sub(r"(?:\r\n|\r|\n)+", ",", raw)
    parts = re.split(r"(?<!\\),", flattened)
    return [part.strip() for part in parts if part.strip()]


def _normalize_section_text(text, normalize_tags=True):
    raw = "" if text is None else str(text)
    if not raw.strip():
        return ""
    if not normalize_tags:
        return normalize_structured_prompt(raw)
    items = _split_tag_items(raw)
    return ", ".join(items)


def _merge_unique_tags(first_text, second_text, normalize_tags=True):
    seen = set()
    merged = []
    for item in _split_tag_items(first_text) + _split_tag_items(second_text):
        key = re.sub(r"\s+", " ", item.strip().lower())
        if key not in seen:
            seen.add(key)
            merged.append(item)
    return ", ".join(merged)


def _resolve_trigger_text(sec_trigger, xy_trigger_sync="off", xy_trigger_input="", normalize_tags=True):
    base = "" if sec_trigger is None else str(sec_trigger)
    incoming = "" if xy_trigger_input is None else str(xy_trigger_input)
    mode = str(xy_trigger_sync or "off").strip().lower()
    if mode == "off" or not incoming.strip():
        return _normalize_section_text(base, normalize_tags=normalize_tags)
    if mode == "replace":
        return _normalize_section_text(incoming, normalize_tags=normalize_tags)
    if mode == "prepend":
        return _merge_unique_tags(incoming, base, normalize_tags=normalize_tags)
    if mode == "append":
        return _merge_unique_tags(base, incoming, normalize_tags=normalize_tags)
    return _normalize_section_text(base, normalize_tags=normalize_tags)


def _parse_merge_order(merge_order, valid_keys):
    raw = "" if merge_order is None else str(merge_order)
    ordered = []
    for token in re.split(r"[\s,]+", raw.strip()):
        key = token.strip().lower()
        if key.startswith("sec_"):
            key = key[4:]
        if key in valid_keys and key not in ordered:
            ordered.append(key)
    for key in valid_keys:
        if key not in ordered:
            ordered.append(key)
    return ordered


def _format_merged_sections(entries, output_format="tags", merge_separator=", ", normalize_tags=True):
    active = [(key, text) for key, text in entries if text]
    if not active:
        return ""
    if output_format == "json":
        return json.dumps({key: text for key, text in active}, ensure_ascii=False, indent=2)
    if output_format == "structured":
        blocks = [f"【{SECTION_DISPLAY_TITLES.get(key, key)}】\n{text}" for key, text in active]
        return normalize_structured_prompt("\n\n".join(blocks))
    sep = _unescape_separator(merge_separator)
    joined = sep.join(text for _, text in active)
    if normalize_tags:
        if "\n" in sep:
            lines = [normalize_output_prompt(text) for _, text in active]
            return normalize_structured_prompt(sep.join(line for line in lines if line))
        return normalize_output_prompt(joined)
    return joined


class PromptWorkbench:
    """Normalize the edited prompt before passing it to the next node."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "prompt": (
                    "STRING",
                    {"default": "", "multiline": True, "dynamicPrompts": True},
                ),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("prompt",)
    FUNCTION = "emit_prompt"
    CATEGORY = "prompt/Prompt Workbench"
    DESCRIPTION = "Edit structured tags and pass a flat, comma-terminated prompt as STRING."

    def emit_prompt(self, prompt=""):
        return (normalize_output_prompt(prompt),)


class DynamicOptionalInputs(dict):
    """Optional INPUT_TYPES mapping that accepts dynamic frontend-created STRING sockets."""

    def __contains__(self, key):
        return True

    def __getitem__(self, key):
        if super().__contains__(key):
            return super().__getitem__(key)
        return ("STRING", {"forceInput": True})


def _merge_dynamic_section_payload(sections_payload, dynamic_inputs, output_format="tags"):
    try:
        payload = json.loads(sections_payload) if sections_payload else None
    except (TypeError, ValueError, json.JSONDecodeError):
        return None
    if not isinstance(payload, dict) or not isinstance(payload.get("sections"), list):
        return None

    wrap_braces = bool(payload.get("wrap_braces"))
    include_neg = bool(payload.get("include_negative_in_prompt"))
    pos_blocks = []
    neg_blocks = []
    extra_outputs = []

    for index, raw_section in enumerate(payload["sections"]):
        if not isinstance(raw_section, dict):
            continue
        enabled = _coerce_enabled(raw_section.get("enabled"), default=True)
        wants_output = bool(raw_section.get("socket_output"))
        role = "negative" if raw_section.get("role") == "negative" else "positive"
        mode = "prose" if raw_section.get("mode") == "prose" else "tags"
        title = str(raw_section.get("title") or "").strip()
        socket_name = str(raw_section.get("socket_name") or title or f"Section {index + 1}").strip()
        base_text = str(raw_section.get("text") or "").strip()
        incoming = dynamic_inputs.get(socket_name)
        incoming_text = "" if incoming is None else str(incoming).strip()

        if incoming_text:
            if mode == "prose":
                if not base_text:
                    merged_text = incoming_text
                elif re.search(r"[,，。.;；]$", base_text):
                    merged_text = f"{base_text} {incoming_text}"
                else:
                    merged_text = f"{base_text}, {incoming_text}"
            else:
                merged_text = _merge_unique_tags(base_text, incoming_text, normalize_tags=True)
        else:
            merged_text = base_text

        if wants_output:
            extra_outputs.append(merged_text if enabled else "")

        if not enabled or not merged_text:
            continue
        entry = (title or f"section_{index + 1}", title, merged_text)
        if role == "negative":
            neg_blocks.append(entry)
            if include_neg:
                pos_blocks.append(entry)
        else:
            pos_blocks.append(entry)

    def render_blocks(blocks, apply_braces=False):
        if not blocks:
            return ""
        if output_format == "json":
            obj = {}
            for fallback_key, title, text in blocks:
                key = title or fallback_key
                if key in obj:
                    obj[key] = f"{obj[key]}\n{text}"
                else:
                    obj[key] = text
            return json.dumps(obj, ensure_ascii=False, indent=2)
        if output_format == "structured":
            rendered = [f"{title}\n{text}" if title else text for _, title, text in blocks]
            body = normalize_structured_prompt("\n\n".join(rendered))
            return f"{{\n{body}\n}}" if apply_braces and body else body
        return normalize_output_prompt(", ".join(text for _, _, text in blocks))

    return (
        render_blocks(pos_blocks, apply_braces=wrap_braces),
        render_blocks(neg_blocks, apply_braces=False),
        *extra_outputs,
    )


class PromptWorkbenchFork:
    """Normalize structured or multi-section prompts with optional dynamic section input sockets."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "prompt": (
                    "STRING",
                    {"default": "", "multiline": True, "dynamicPrompts": True},
                ),
            },
            "optional": DynamicOptionalInputs(
                {
                    "negative": (
                        "STRING",
                        {"default": "", "multiline": True, "dynamicPrompts": True},
                    ),
                    "output_format": (
                        ["tags", "structured", "json"],
                        {"default": "tags"},
                    ),
                    "sections_payload": (
                        "STRING",
                        {"default": "", "multiline": False},
                    ),
                }
            ),
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("prompt", "negative")
    FUNCTION = "emit_prompt"
    CATEGORY = "prompt/Prompt Workbench"
    DESCRIPTION = "Edit structured tags or multi-section prompts and pass STRING outputs."

    def emit_prompt(self, prompt="", negative="", output_format="tags", sections_payload="", **kwargs):
        dynamic_inputs = {
            str(key): str(val)
            for key, val in kwargs.items()
            if val is not None and str(val).strip() != ""
        }
        has_section_outputs = bool(sections_payload and '"socket_output": true' in str(sections_payload))
        if dynamic_inputs or has_section_outputs:
            merged = _merge_dynamic_section_payload(sections_payload, dynamic_inputs, output_format=output_format)
            if merged is not None:
                return merged
            if dynamic_inputs:
                extra = ", ".join(dynamic_inputs.values())
                prompt = f"{prompt}\n{extra}" if str(prompt or "").strip() else extra

        if output_format in ("structured", "json"):
            return (
                normalize_structured_prompt(prompt),
                normalize_structured_prompt(negative),
            )
        return (
            normalize_output_prompt(prompt),
            normalize_output_prompt(negative),
        )


class PromptWorkbenchMCP:
    """MCP-friendly multi-section prompt workbench with stable widgets and per-section outputs."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "prompt": (
                    "STRING",
                    {"default": "", "multiline": True, "dynamicPrompts": True},
                ),
            },
            "optional": {
                "negative": (
                    "STRING",
                    {"default": "", "multiline": True, "dynamicPrompts": True},
                ),
                "output_format": (
                    ["tags", "structured", "json"],
                    {"default": "tags"},
                ),
                "merge_order": (
                    "STRING",
                    {"default": DEFAULT_MERGE_ORDER, "multiline": False},
                ),
                "merge_separator": (
                    "STRING",
                    {"default": ", ", "multiline": False},
                ),
                "normalize_tags": (
                    "BOOLEAN",
                    {"default": True},
                ),
                "sec_quality": (
                    "STRING",
                    {"default": "", "multiline": True, "dynamicPrompts": True},
                ),
                "sec_quality_enabled": ("BOOLEAN", {"default": True}),
                "sec_subject": (
                    "STRING",
                    {"default": "", "multiline": True, "dynamicPrompts": True},
                ),
                "sec_subject_enabled": ("BOOLEAN", {"default": True}),
                "sec_composition": (
                    "STRING",
                    {"default": "", "multiline": True, "dynamicPrompts": True},
                ),
                "sec_composition_enabled": ("BOOLEAN", {"default": True}),
                "sec_style": (
                    "STRING",
                    {"default": "", "multiline": True, "dynamicPrompts": True},
                ),
                "sec_style_enabled": ("BOOLEAN", {"default": True}),
                "sec_trigger": (
                    "STRING",
                    {"default": "", "multiline": True, "dynamicPrompts": True},
                ),
                "sec_trigger_enabled": ("BOOLEAN", {"default": True}),
                "neg_quality": (
                    "STRING",
                    {"default": "", "multiline": True, "dynamicPrompts": True},
                ),
                "neg_quality_enabled": ("BOOLEAN", {"default": True}),
                "neg_anatomy": (
                    "STRING",
                    {"default": "", "multiline": True, "dynamicPrompts": True},
                ),
                "neg_anatomy_enabled": ("BOOLEAN", {"default": True}),
                "neg_style": (
                    "STRING",
                    {"default": "", "multiline": True, "dynamicPrompts": True},
                ),
                "neg_style_enabled": ("BOOLEAN", {"default": True}),
                "xy_trigger_sync": (
                    ["off", "append", "replace", "prepend"],
                    {"default": "off"},
                ),
                "xy_trigger_input": (
                    "STRING",
                    {"default": "", "multiline": True},
                ),
                "tag_suggestions_quality": ("STRING", {"default": "", "multiline": True}),
                "tag_suggestions_subject": ("STRING", {"default": "", "multiline": True}),
                "tag_suggestions_composition": ("STRING", {"default": "", "multiline": True}),
                "tag_suggestions_style": ("STRING", {"default": "", "multiline": True}),
                "tag_suggestions_trigger": ("STRING", {"default": "", "multiline": True}),
                "output_sections": ("STRING", {"default": "", "multiline": False}),
                "merged_preview": ("STRING", {"default": "", "multiline": True}),
                "sections_schema": ("STRING", {"default": "", "multiline": True}),
            },
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("prompt", "negative")
    FUNCTION = "emit_prompt"
    CATEGORY = "prompt/Prompt Workbench"
    DESCRIPTION = "Edit structured tags or multi-section prompts and pass STRING outputs."

    def emit_prompt(
        self,
        prompt="",
        negative="",
        output_format="tags",
        merge_order=DEFAULT_MERGE_ORDER,
        merge_separator=", ",
        normalize_tags=True,
        sec_quality="",
        sec_quality_enabled=True,
        sec_subject="",
        sec_subject_enabled=True,
        sec_composition="",
        sec_composition_enabled=True,
        sec_style="",
        sec_style_enabled=True,
        sec_trigger="",
        sec_trigger_enabled=True,
        neg_quality="",
        neg_quality_enabled=True,
        neg_anatomy="",
        neg_anatomy_enabled=True,
        neg_style="",
        neg_style_enabled=True,
        xy_trigger_sync="off",
        xy_trigger_input="",
        tag_suggestions_quality="",
        tag_suggestions_subject="",
        tag_suggestions_composition="",
        tag_suggestions_style="",
        tag_suggestions_trigger="",
        output_sections="",
        merged_preview="",
        sections_schema="",
    ):
        norm_flag = _coerce_enabled(normalize_tags, default=True)
        xy_mode = str(xy_trigger_sync or "off").strip().lower()
        if xy_mode not in ("off", "append", "replace", "prepend"):
            xy_mode = "off"

        pos_raw = {
            "quality": "" if sec_quality is None else str(sec_quality),
            "subject": "" if sec_subject is None else str(sec_subject),
            "composition": "" if sec_composition is None else str(sec_composition),
            "style": "" if sec_style is None else str(sec_style),
            "trigger": "" if sec_trigger is None else str(sec_trigger),
        }
        pos_enabled = {
            "quality": _coerce_enabled(sec_quality_enabled, default=True),
            "subject": _coerce_enabled(sec_subject_enabled, default=True),
            "composition": _coerce_enabled(sec_composition_enabled, default=True),
            "style": _coerce_enabled(sec_style_enabled, default=True),
            "trigger": _coerce_enabled(sec_trigger_enabled, default=True),
        }
        neg_raw = {
            "quality": "" if neg_quality is None else str(neg_quality),
            "anatomy": "" if neg_anatomy is None else str(neg_anatomy),
            "style": "" if neg_style is None else str(neg_style),
        }
        neg_enabled = {
            "quality": _coerce_enabled(neg_quality_enabled, default=True),
            "anatomy": _coerce_enabled(neg_anatomy_enabled, default=True),
            "style": _coerce_enabled(neg_style_enabled, default=True),
        }
        suggestions = {
            "quality": "" if tag_suggestions_quality is None else str(tag_suggestions_quality),
            "subject": "" if tag_suggestions_subject is None else str(tag_suggestions_subject),
            "composition": "" if tag_suggestions_composition is None else str(tag_suggestions_composition),
            "style": "" if tag_suggestions_style is None else str(tag_suggestions_style),
            "trigger": "" if tag_suggestions_trigger is None else str(tag_suggestions_trigger),
        }

        pos_resolved = {}
        pos_outputs = {}
        for key in POSITIVE_SECTION_KEYS:
            if key == "trigger":
                resolved = _resolve_trigger_text(
                    pos_raw[key],
                    xy_trigger_sync=xy_mode,
                    xy_trigger_input=xy_trigger_input,
                    normalize_tags=norm_flag,
                )
            else:
                resolved = _normalize_section_text(pos_raw[key], normalize_tags=norm_flag)
            pos_resolved[key] = resolved
            pos_outputs[key] = resolved if pos_enabled[key] else ""

        neg_resolved = {}
        neg_outputs = {}
        for key in NEGATIVE_SECTION_KEYS:
            resolved = _normalize_section_text(neg_raw[key], normalize_tags=norm_flag)
            neg_resolved[key] = resolved
            neg_outputs[key] = resolved if neg_enabled[key] else ""

        order = _parse_merge_order(merge_order, POSITIVE_SECTION_KEYS)
        has_pos_sections = (
            any(text.strip() for text in pos_raw.values())
            or (xy_mode != "off" and bool(str(xy_trigger_input or "").strip()))
            or any(not flag for flag in pos_enabled.values())
        )
        has_neg_sections = (
            any(text.strip() for text in neg_raw.values())
            or any(not flag for flag in neg_enabled.values())
        )

        if has_pos_sections:
            final_prompt = _format_merged_sections(
                [(key, pos_outputs[key]) for key in order],
                output_format=output_format,
                merge_separator=merge_separator,
                normalize_tags=norm_flag,
            )
        elif output_format in ("structured", "json"):
            final_prompt = normalize_structured_prompt(prompt)
        elif norm_flag:
            final_prompt = normalize_output_prompt(prompt)
        else:
            final_prompt = normalize_structured_prompt(prompt)

        if has_neg_sections:
            final_negative = _format_merged_sections(
                [(key, neg_outputs[key]) for key in NEGATIVE_SECTION_KEYS],
                output_format=output_format,
                merge_separator=merge_separator,
                normalize_tags=norm_flag,
            )
        elif output_format in ("structured", "json"):
            final_negative = normalize_structured_prompt(negative)
        elif norm_flag:
            final_negative = normalize_output_prompt(negative)
        else:
            final_negative = normalize_structured_prompt(negative)

        preview_text = (
            f"[POSITIVE]\n{final_prompt}\n\n[NEGATIVE]\n{final_negative}"
            if final_negative
            else final_prompt
        )
        schema_payload = {
            "version": 1,
            "output_format": output_format,
            "merge_order": order,
            "merge_separator": ", " if merge_separator is None or merge_separator == "" else str(merge_separator),
            "normalize_tags": norm_flag,
            "xy_trigger_sync": xy_mode,
            "positive": [
                {
                    "key": key,
                    "widget": f"sec_{key}",
                    "enabled_widget": f"sec_{key}_enabled",
                    "suggestions_widget": f"tag_suggestions_{key}",
                    "enabled": pos_enabled[key],
                    "text": pos_resolved[key],
                    "suggestions": suggestions[key],
                }
                for key in order
            ],
            "negative": [
                {
                    "key": key,
                    "widget": f"neg_{key}",
                    "enabled_widget": f"neg_{key}_enabled",
                    "enabled": neg_enabled[key],
                    "text": neg_resolved[key],
                }
                for key in NEGATIVE_SECTION_KEYS
            ],
            "merged_prompt": final_prompt,
            "merged_negative": final_negative,
        }
        schema_json = json.dumps(schema_payload, ensure_ascii=False, indent=2)

        output_lookup = {
            "sec_quality": pos_outputs["quality"],
            "sec_subject": pos_outputs["subject"],
            "sec_composition": pos_outputs["composition"],
            "sec_style": pos_outputs["style"],
            "sec_trigger": pos_outputs["trigger"],
            "neg_quality": neg_outputs["quality"],
            "neg_anatomy": neg_outputs["anatomy"],
            "neg_style": neg_outputs["style"],
            "sections_schema": schema_json,
        }
        requested_outputs = []
        for token in re.split(r"[\s,]+", str(output_sections or "").strip()):
            key = token.strip().lower()
            if key in output_lookup:
                requested_outputs.append(output_lookup[key])

        return {
            "ui": {
                "merged_preview": [preview_text],
                "sections_schema": [schema_json],
            },
            "result": (
                final_prompt,
                final_negative,
                *requested_outputs,
            ),
        }


NODE_CLASS_MAPPINGS = {
    "PromptWorkbench": PromptWorkbench,
    "PromptWorkbenchFork": PromptWorkbenchFork,
    "PromptWorkbenchMCP": PromptWorkbenchMCP,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "PromptWorkbench": "Prompt Workbench",
    "PromptWorkbenchFork": "Prompt Workbench (Fork)",
    "PromptWorkbenchMCP": "Prompt Workbench (MCP)",
}
