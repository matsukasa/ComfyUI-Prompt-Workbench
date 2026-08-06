import re


def normalize_output_prompt(prompt):
    value = "" if prompt is None else str(prompt)
    value = re.sub(r"[ \t]*,?[ \t]*(?:\r\n|\r|\n)+[ \t]*", ", ", value).strip()
    value = re.sub(r"^(?:,\s*)+", "", value)
    value = re.sub(r"(?:,\s*)+$", "", value).rstrip()
    return f"{value}," if value else ""


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


NODE_CLASS_MAPPINGS = {"PromptWorkbench": PromptWorkbench}
NODE_DISPLAY_NAME_MAPPINGS = {"PromptWorkbench": "Prompt Workbench"}
