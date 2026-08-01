class PromptAllInOne:
    """Headless-safe STRING pass-through for the browser prompt editor."""

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
    CATEGORY = "prompt/Prompt All-in-One"
    DESCRIPTION = "Edit one prompt as structured tags and pass it through as STRING."

    def emit_prompt(self, prompt=""):
        value = "" if prompt is None else str(prompt)
        return (value,)


NODE_CLASS_MAPPINGS = {"PromptAllInOne": PromptAllInOne}
NODE_DISPLAY_NAME_MAPPINGS = {"PromptAllInOne": "Prompt All-in-One"}
