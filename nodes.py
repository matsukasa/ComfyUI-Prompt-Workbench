class PromptAllInOne:
    """Headless-safe STRING pass-through for the browser prompt editor."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "positive_prompt": (
                    "STRING",
                    {"default": "", "multiline": True, "dynamicPrompts": True},
                ),
                "negative_prompt": (
                    "STRING",
                    {"default": "", "multiline": True, "dynamicPrompts": True},
                ),
            }
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("positive", "negative")
    FUNCTION = "emit_prompts"
    CATEGORY = "prompt/Prompt All-in-One"
    DESCRIPTION = "Edit positive and negative prompts as structured tags."

    def emit_prompts(self, positive_prompt="", negative_prompt=""):
        positive = "" if positive_prompt is None else str(positive_prompt)
        negative = "" if negative_prompt is None else str(negative_prompt)
        return (positive, negative)


NODE_CLASS_MAPPINGS = {"PromptAllInOne": PromptAllInOne}
NODE_DISPLAY_NAME_MAPPINGS = {"PromptAllInOne": "Prompt All-in-One"}
