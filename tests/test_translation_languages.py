import unittest
from unittest.mock import AsyncMock, patch

import routes


class TranslationLanguageTests(unittest.IsolatedAsyncioTestCase):
    def test_source_language_detection_and_deepl_variants(self):
        self.assertEqual(routes._detect_source_language("soft light", "zh-CN"), "en")
        self.assertEqual(routes._detect_source_language("柔らかな光", "en"), "ja")
        self.assertEqual(routes._detect_source_language("柔和光线", "en"), "zh-CN")
        self.assertEqual(routes._normalize_deepl_language("zh-CN", target=True), "ZH-HANS")
        self.assertEqual(routes._normalize_deepl_language("zh-TW", target=True), "ZH-HANT")
        self.assertEqual(routes._normalize_deepl_language("zh-TW", target=False), "ZH")

    async def test_mymemory_uses_the_requested_chinese_variant(self):
        response = {"responseData": {"translatedText": "柔和光线"}, "responseStatus": 200}
        with patch.object(routes, "_get_json", new=AsyncMock(return_value=response)) as request:
            result = await routes._translate_mymemory(object(), "soft light", "auto", "zh-CN")

        self.assertEqual(result, "柔和光线")
        self.assertEqual(request.await_args.args[2]["langpair"], "en|zh-CN")


if __name__ == "__main__":
    unittest.main()
