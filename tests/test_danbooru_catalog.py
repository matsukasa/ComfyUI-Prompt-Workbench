import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

import danbooru_catalog as catalog


class FakeResponse:
    def __init__(self, status, body=None, headers=None):
        self.status_code = status
        self._body = body
        self.headers = {"Content-Type": "application/json", **(headers or {})}

    def raise_for_status(self):
        if self.status_code >= 400:
            raise catalog.requests.HTTPError(f"HTTP {self.status_code}")

    def json(self):
        return self._body


class FakeSession:
    def __init__(self, responses):
        self.headers = {}
        self.responses = list(responses)
        self.calls = 0

    def get(self, *_args, **_kwargs):
        self.calls += 1
        return self.responses.pop(0)


def valid_catalogs():
    majors = []
    full_tags = []
    for major_index in range(14):
        tags = []
        for rank in range(1, 21):
            name = f"tag_{major_index}_{rank}"
            count = 1000 - rank
            tags.append({"id": major_index * 100 + rank, "name": name, "post_count": count, "rank": rank})
            full_tags.append({"name": name, "post_count": count, "rank": rank, "danbooru_category": 0, "is_deprecated": False})
        majors.append({
            "id": f"major-{major_index}", "label_ja": "大", "description_ja": "説明",
            "medium_categories": [{
                "id": f"medium-{major_index}", "label_ja": "中", "description_ja": "説明",
                "small_categories": [{
                    "id": f"small-{major_index}", "label_ja": "小", "description_ja": "説明", "tags": tags,
                }],
            }],
        })
    return {"schema_version": 1, "major_categories": majors}, {"schema_version": 1, "tags": full_tags}


class DanbooruCatalogTests(unittest.TestCase):
    def test_retries_429_and_5xx_then_caches_without_credentials(self):
        with tempfile.TemporaryDirectory() as directory:
            with mock.patch.dict("os.environ", {"DANBOORU_USERNAME": "private-user", "DANBOORU_API_KEY": "private-key"}):
                client = catalog.DanbooruClient(Path(directory), request_interval=0, max_retries=3)
            client.session = FakeSession([
                FakeResponse(429, [], {"Retry-After": "0"}),
                FakeResponse(503, []),
                FakeResponse(200, [{"id": 1}]),
            ])
            body = client.get_json("/tags.json", {"limit": 1})
            self.assertEqual(body, [{"id": 1}])
            self.assertEqual(client.session.calls, 3)
            cache_text = "\n".join(path.read_text(encoding="utf-8") for path in Path(directory).glob("*.json"))
            self.assertNotIn("private-user", cache_text)
            self.assertNotIn("private-key", cache_text)
            cached_client = catalog.DanbooruClient(Path(directory), request_interval=0)
            cached_client.session = FakeSession([])
            self.assertEqual(cached_client.get_json("/tags.json", {"limit": 1}), [{"id": 1}])
            self.assertEqual(cached_client.session.calls, 0)

    def test_paginates_until_a_short_page(self):
        client = catalog.DanbooruClient(Path("unused"), request_interval=0)
        client.get_json = mock.Mock(side_effect=[[{"id": 1}, {"id": 2}], [{"id": 3}]])
        self.assertEqual(client.paginated("/tags.json", {"search[order]": "count", "limit": 2}), [
            {"id": 1}, {"id": 2}, {"id": 3},
        ])
        self.assertEqual(client.get_json.call_args_list[0].args[1]["page"], 1)
        self.assertEqual(client.get_json.call_args_list[1].args[1]["page"], 2)

    def test_validates_complete_catalog_and_rejects_short_leaf(self):
        ui, full = valid_catalogs()
        catalog.validate_catalogs(ui, full)
        ui["major_categories"][0]["medium_categories"][0]["small_categories"][0]["tags"].pop()
        with self.assertRaisesRegex(catalog.CatalogError, "exactly 20"):
            catalog.validate_catalogs(ui, full)

    def test_rejects_a_tag_assigned_to_multiple_categories(self):
        ui, full = valid_catalogs()
        first = ui["major_categories"][0]["medium_categories"][0]["small_categories"][0]["tags"][0]
        second = ui["major_categories"][1]["medium_categories"][0]["small_categories"][0]["tags"][0]
        old_name = second["name"]
        second["name"] = first["name"]
        for record in full["tags"]:
            if record["name"] == old_name:
                record["name"] = first["name"]
                break
        with self.assertRaisesRegex(catalog.CatalogError, "multiple categories"):
            catalog.validate_catalogs(ui, full)

    def test_atomic_writer_restores_previous_files_when_replace_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            first = Path(directory) / "first.json"
            second = Path(directory) / "second.json"
            first.write_text("old-first", encoding="utf-8")
            second.write_text("old-second", encoding="utf-8")
            real_replace = catalog.os.replace
            calls = 0

            def failing_replace(source, target):
                nonlocal calls
                calls += 1
                if calls == 2:
                    raise OSError("simulated")
                real_replace(source, target)

            with mock.patch.object(catalog.os, "replace", side_effect=failing_replace):
                with self.assertRaises(OSError):
                    catalog.atomic_write_outputs({first: "new-first", second: "new-second"})
            self.assertEqual(first.read_text(encoding="utf-8"), "old-first")
            self.assertEqual(second.read_text(encoding="utf-8"), "old-second")


if __name__ == "__main__":
    unittest.main()
