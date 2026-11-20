import unittest

from nodes import (
    NODE_CLASS_MAPPINGS,
    NODE_DISPLAY_NAME_MAPPINGS,
    PromptWorkbench,
    PromptWorkbenchFork,
    normalize_output_prompt,
    normalize_structured_prompt,
)


class TestPromptWorkbenchNode(unittest.TestCase):
    def test_both_upstream_and_fork_nodes_are_registered(self):
        self.assertIs(NODE_CLASS_MAPPINGS["PromptWorkbench"], PromptWorkbench)
        self.assertIs(NODE_CLASS_MAPPINGS["PromptWorkbenchFork"], PromptWorkbenchFork)
        self.assertEqual(NODE_DISPLAY_NAME_MAPPINGS["PromptWorkbench"], "Prompt Workbench")
        self.assertEqual(NODE_DISPLAY_NAME_MAPPINGS["PromptWorkbenchFork"], "Prompt Workbench (Fork)")

    def test_upstream_node_keeps_single_prompt_io(self):
        inputs = PromptWorkbench.INPUT_TYPES()
        self.assertEqual(list(inputs.keys()), ["required"])
        self.assertEqual(list(inputs["required"].keys()), ["prompt"])
        self.assertEqual(PromptWorkbench.RETURN_TYPES, ("STRING",))
        self.assertEqual(PromptWorkbench.RETURN_NAMES, ("prompt",))
        node = PromptWorkbench()
        self.assertEqual(node.emit_prompt(prompt="1girl,\nsolo, , blue_eyes"), ("1girl, solo, blue_eyes,",))

    def test_tags_mode_flattens_newlines_and_normalizes_commas(self):
        node = PromptWorkbenchFork()
        prompt, negative = node.emit_prompt(
            prompt="1girl,\nsolo, , blue_eyes",
            negative="bad_hands\nworst_quality",
            output_format="tags",
        )
        self.assertEqual(prompt, "1girl, solo, blue_eyes,")
        self.assertEqual(negative, "bad_hands, worst_quality,")

    def test_structured_mode_preserves_headers_braces_and_newlines(self):
        node = PromptWorkbenchFork()
        raw_prompt = "{\n【任务与范式】\n4:3横向画幅；人像摄影。\n\n【构图与机位】\n平视全身近景。\n}"
        raw_neg = "ANIME假发质感，手部扭曲崩坏。"
        prompt, negative = node.emit_prompt(
            prompt=raw_prompt,
            negative=raw_neg,
            output_format="structured",
        )
        self.assertEqual(prompt, raw_prompt)
        self.assertEqual(negative, raw_neg)

    def test_json_mode_preserves_json_formatting(self):
        node = PromptWorkbenchFork()
        raw_json = '{\n  "shot": "50mm close-up"\n}'
        prompt, negative = node.emit_prompt(
            prompt=raw_json,
            negative="lowres",
            output_format="json",
        )
        self.assertEqual(prompt, raw_json)
        self.assertEqual(negative, "lowres")

    def test_normalize_helpers_handle_empty_and_crlf(self):
        self.assertEqual(normalize_output_prompt(None), "")
        self.assertEqual(normalize_structured_prompt("a  \r\n\r\nb \r\n"), "a\n\nb")


if __name__ == "__main__":
    unittest.main()
