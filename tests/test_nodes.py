import importlib.util
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def load_module(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


nodes = load_module("prompt_aio_nodes", "nodes.py")
routes = load_module("prompt_aio_routes", "routes.py")


class PromptAllInOneNodeTests(unittest.TestCase):
    def test_schema_has_multiline_string_inputs_and_string_outputs(self):
        schema = nodes.PromptAllInOne.INPUT_TYPES()
        self.assertEqual(schema["required"]["prompt"][0], "STRING")
        self.assertTrue(schema["required"]["prompt"][1]["multiline"])
        self.assertEqual(nodes.PromptAllInOne.RETURN_TYPES, ("STRING",))

    def test_outputs_prompt_verbatim(self):
        node = nodes.PromptAllInOne()
        self.assertEqual(node.emit_prompt("a, b"), ("a, b",))

    def test_empty_and_none_values_do_not_fail(self):
        node = nodes.PromptAllInOne()
        self.assertEqual(node.emit_prompt(""), ("",))
        self.assertEqual(node.emit_prompt(None), ("",))

    def test_headless_import_does_not_require_frontend(self):
        self.assertIn("PromptAllInOne", nodes.NODE_CLASS_MAPPINGS)
        self.assertEqual(nodes.PromptAllInOne.CATEGORY, "prompt/Prompt All-in-One")


class TranslationTests(unittest.IsolatedAsyncioTestCase):
    async def test_local_dictionary_translation_and_cache(self):
        first, cached = await routes.translate_text("local", "masterpiece", target="ja")
        second, cached_again = await routes.translate_text("local", "masterpiece", target="ja")
        self.assertEqual(first, "傑作")
        self.assertEqual(second, "傑作")
        self.assertFalse(cached)
        self.assertTrue(cached_again)

    async def test_unknown_provider_is_rejected(self):
        with self.assertRaises(routes.TranslationError):
            await routes.translate_text("unknown", "hello", target="ja")

    async def test_oversized_text_is_rejected(self):
        with self.assertRaises(routes.TranslationError):
            await routes.translate_text("local", "x" * (routes.MAX_TEXT_LENGTH + 1), target="ja")


if __name__ == "__main__":
    unittest.main()
