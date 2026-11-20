import re


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


class PromptWorkbenchFork:
    """Normalize structured or multi-section prompts with optional negative output."""

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
            },
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("prompt", "negative")
    FUNCTION = "emit_prompt"
    CATEGORY = "prompt/Prompt Workbench"
    DESCRIPTION = "Edit structured tags or multi-section prompts and pass STRING outputs."

    def emit_prompt(self, prompt="", negative="", output_format="tags"):
        if output_format in ("structured", "json"):
            return (
                normalize_structured_prompt(prompt),
                normalize_structured_prompt(negative),
            )
        return (
            normalize_output_prompt(prompt),
            normalize_output_prompt(negative),
        )


NODE_CLASS_MAPPINGS = {
    "PromptWorkbench": PromptWorkbench,
    "PromptWorkbenchFork": PromptWorkbenchFork,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "PromptWorkbench": "Prompt Workbench",
    "PromptWorkbenchFork": "Prompt Workbench (Fork)",
}
