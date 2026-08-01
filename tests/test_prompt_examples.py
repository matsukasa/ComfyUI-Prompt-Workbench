import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class PromptExamplesTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads(
            (ROOT / "data" / "prompt_examples.json").read_text(encoding="utf-8")
        )

    def test_contains_all_audited_upstream_entries(self):
        categories = self.data["categories"]
        item_count = sum(len(category["items"]) for category in categories)
        self.assertEqual(len(categories), 115)
        self.assertEqual(item_count, 3595)
        self.assertEqual(self.data["stats"]["primaryCategories"], 10)
        self.assertEqual(self.data["stats"]["categories"], 115)
        self.assertEqual(self.data["stats"]["items"], 3595)
        self.assertEqual(self.data["stats"]["excludedItems"], 211)
        self.assertNotIn(
            "人物 / 二次元キャラクター",
            [category["label"]["ja"] for category in categories],
        )
        self.assertNotIn("漢服", [category["parent"]["ja"] for category in categories])

    def test_source_is_pinned_and_every_item_is_searchable_text(self):
        source = self.data["source"]
        self.assertEqual(
            source["commit"], "d4b37aa4187b40466772b6282d8b28acd5ad77c9"
        )
        self.assertEqual(
            source["paths"],
            ["group_tags/default.yaml", "group_tags/ja_JP.yaml"],
        )
        for category in self.data["categories"]:
            self.assertTrue(category["label"]["en"])
            self.assertTrue(category["label"]["ja"])
            for item in category["items"]:
                self.assertIsInstance(item["prompt"], str)
                self.assertTrue(item["prompt"])
                self.assertIsInstance(item["translation"]["ja"], str)


if __name__ == "__main__":
    unittest.main()
