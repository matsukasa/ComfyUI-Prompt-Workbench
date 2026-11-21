import json
import unittest

from nodes import (
    NODE_CLASS_MAPPINGS,
    NODE_DISPLAY_NAME_MAPPINGS,
    PromptWorkbench,
    PromptWorkbenchFork,
    PromptWorkbenchMCP,
    normalize_output_prompt,
    normalize_structured_prompt,
)


class TestPromptWorkbenchNode(unittest.TestCase):
    def test_upstream_fork_and_mcp_nodes_are_registered(self):
        self.assertIs(NODE_CLASS_MAPPINGS["PromptWorkbench"], PromptWorkbench)
        self.assertIs(NODE_CLASS_MAPPINGS["PromptWorkbenchFork"], PromptWorkbenchFork)
        self.assertIs(NODE_CLASS_MAPPINGS["PromptWorkbenchMCP"], PromptWorkbenchMCP)
        self.assertEqual(NODE_DISPLAY_NAME_MAPPINGS["PromptWorkbench"], "Prompt Workbench")
        self.assertEqual(NODE_DISPLAY_NAME_MAPPINGS["PromptWorkbenchFork"], "Prompt Workbench (Fork)")
        self.assertEqual(NODE_DISPLAY_NAME_MAPPINGS["PromptWorkbenchMCP"], "Prompt Workbench (MCP)")

    def test_upstream_node_keeps_single_prompt_io(self):
        inputs = PromptWorkbench.INPUT_TYPES()
        self.assertEqual(list(inputs.keys()), ["required"])
        self.assertEqual(list(inputs["required"].keys()), ["prompt"])
        self.assertEqual(PromptWorkbench.RETURN_TYPES, ("STRING",))
        self.assertEqual(PromptWorkbench.RETURN_NAMES, ("prompt",))
        node = PromptWorkbench()
        self.assertEqual(node.emit_prompt(prompt="1girl,\nsolo, , blue_eyes"), ("1girl, solo, blue_eyes,",))

    def test_fork_node_keeps_compact_layout_and_accepts_dynamic_section_sockets(self):
        inputs = PromptWorkbenchFork.INPUT_TYPES()
        self.assertEqual(list(inputs["required"].keys()), ["prompt"])
        self.assertEqual(list(inputs["optional"].keys()), ["negative", "output_format", "sections_payload"])
        self.assertIn("【Trigger】", inputs["optional"])
        self.assertEqual(inputs["optional"]["【Trigger】"], ("STRING", {"forceInput": True}))
        self.assertEqual(PromptWorkbenchFork.RETURN_TYPES, ("STRING", "STRING"))
        self.assertEqual(PromptWorkbenchFork.RETURN_NAMES, ("prompt", "negative"))

        payload = json.dumps({
            "version": 1,
            "wrap_braces": False,
            "include_negative_in_prompt": False,
            "sections": [
                {"id": "sec-1", "title": "【Subject】", "socket_name": "【Subject】", "socket_output": False, "role": "positive", "mode": "tags", "enabled": True, "text": "1girl"},
                {"id": "sec-2", "title": "【Trigger】", "socket_name": "【Trigger】", "socket_output": True, "role": "positive", "mode": "tags", "enabled": True, "text": "base_word"},
                {"id": "sec-3", "title": "【Disabled】", "socket_name": "【Disabled】", "socket_output": True, "role": "positive", "mode": "tags", "enabled": False, "text": "skip_me"},
                {"id": "sec-4", "title": "【Negative】", "socket_name": "【Negative】", "socket_output": False, "role": "negative", "mode": "tags", "enabled": True, "text": "lowres"},
            ],
        })
        node = PromptWorkbenchFork()
        prompt, negative, trigger_out, disabled_out = node.emit_prompt(
            prompt="1girl, base_word,",
            negative="lowres,",
            output_format="tags",
            sections_payload=payload,
            **{"【Trigger】": "lora_trigger, base_word", "【Disabled】": "should_not_appear"},
        )
        self.assertEqual(prompt, "1girl, base_word, lora_trigger,")
        self.assertEqual(negative, "lowres,")
        self.assertEqual(trigger_out, "base_word, lora_trigger")
        self.assertEqual(disabled_out, "")

        # Compact JSON.stringify format (no spaces after colons) with no dynamic inputs
        # must still return extra outputs so ComfyUI does not raise IndexError.
        compact_payload = json.dumps(json.loads(payload), separators=(",", ":"))
        prompt2, negative2, trigger_out2, disabled_out2 = node.emit_prompt(
            prompt="1girl, base_word,",
            negative="lowres,",
            output_format="tags",
            sections_payload=compact_payload,
        )
        self.assertEqual(prompt2, "1girl, base_word,")
        self.assertEqual(negative2, "lowres,")
        self.assertEqual(trigger_out2, "base_word")
        self.assertEqual(disabled_out2, "")

        # output_order keeps socket order aligned even when OUT was enabled out of section order,
        # and JSON mode strips section brackets and emits plain text for negative.
        ordered_payload = json.dumps({
            "version": 1,
            "wrap_braces": False,
            "include_negative_in_prompt": False,
            "output_order": ["sec-2", "sec-1"],
            "sections": [
                {"id": "sec-1", "title": "【Subject】", "socket_name": "【Subject】", "socket_output": True, "role": "positive", "mode": "tags", "enabled": True, "text": "1girl"},
                {"id": "sec-2", "title": "【Trigger】", "socket_name": "【Trigger】", "socket_output": True, "role": "positive", "mode": "tags", "enabled": True, "text": "base_word"},
                {"id": "sec-3", "title": "【Negative】", "socket_name": "【Negative】", "socket_output": False, "role": "negative", "mode": "tags", "enabled": True, "text": "lowres"},
            ],
        }, separators=(",", ":"))
        json_prompt, json_neg, out_first, out_second = node.emit_prompt(
            prompt="",
            negative="",
            output_format="json",
            sections_payload=ordered_payload,
            **{"【Trigger】": "lora_word"},
        )
        self.assertEqual(json.loads(json_prompt), {"Subject": "1girl", "Trigger": "base_word, lora_word"})
        self.assertEqual(json_neg, "lowres")
        self.assertEqual(out_first, "base_word, lora_word")
        self.assertEqual(out_second, "1girl")

        # Duplicate JSON key suffixes must never collide with an explicit suffixed title like A_3.
        collision_payload = json.dumps({
            "version": 1,
            "sections": [
                {"id": "s1", "title": "【A】", "socket_name": "【A】", "role": "positive", "mode": "tags", "enabled": True, "text": "first"},
                {"id": "s2", "title": "【A_3】", "socket_name": "【A_3】", "role": "positive", "mode": "tags", "enabled": True, "text": "second"},
                {"id": "s3", "title": "【A】", "socket_name": "【A】", "role": "positive", "mode": "tags", "enabled": True, "text": "third"},
            ],
        }, separators=(",", ":"))
        col_prompt, _ = node.emit_prompt(
            prompt="",
            negative="",
            output_format="json",
            sections_payload=collision_payload,
            **{"【A】": "extra"},
        )
        col_obj = json.loads(col_prompt)
        self.assertEqual(len(col_obj), 3)
        self.assertEqual(col_obj["A_3"], "second")

    def test_mcp_node_declares_stable_widgets_and_compact_default_outputs(self):
        opt = PromptWorkbenchMCP.INPUT_TYPES()["optional"]
        expected_widgets = [
            "negative",
            "output_format",
            "merge_order",
            "merge_separator",
            "normalize_tags",
            "sec_quality",
            "sec_quality_enabled",
            "sec_subject",
            "sec_subject_enabled",
            "sec_composition",
            "sec_composition_enabled",
            "sec_style",
            "sec_style_enabled",
            "sec_trigger",
            "sec_trigger_enabled",
            "neg_quality",
            "neg_quality_enabled",
            "neg_anatomy",
            "neg_anatomy_enabled",
            "neg_style",
            "neg_style_enabled",
            "xy_trigger_sync",
            "xy_trigger_input",
            "tag_suggestions_quality",
            "tag_suggestions_subject",
            "tag_suggestions_composition",
            "tag_suggestions_style",
            "tag_suggestions_trigger",
            "output_sections",
            "merged_preview",
            "sections_schema",
        ]
        for name in expected_widgets:
            self.assertIn(name, opt)
        self.assertEqual(PromptWorkbenchMCP.RETURN_TYPES, ("STRING", "STRING"))
        self.assertEqual(PromptWorkbenchMCP.RETURN_NAMES, ("prompt", "negative"))

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

    def test_mcp_sections_merge_bypass_weights_and_schema(self):
        node = PromptWorkbenchMCP()
        out = node.emit_prompt(
            sec_quality="masterpiece\n(best quality:1.2)",
            sec_subject="1girl, (silver_hair:1.15)",
            sec_composition="cowboy shot",
            sec_style="anime style",
            sec_trigger="my_lora_trigger",
            sec_trigger_enabled=0,
            neg_quality="worst quality, lowres",
            neg_anatomy="bad hands",
            neg_anatomy_enabled=False,
            neg_style="3d",
            merge_order="subject,quality,composition,style,trigger",
            tag_suggestions_subject="1girl, solo, long_hair",
            output_sections="sec_quality,sec_subject,sec_trigger,neg_anatomy,sections_schema",
        )
        res = out["result"]
        prompt, negative = res[0], res[1]
        self.assertEqual(prompt, "1girl, (silver_hair:1.15), masterpiece, (best quality:1.2), cowboy shot, anime style,")
        self.assertEqual(negative, "worst quality, lowres, 3d,")
        # Only requested output_sections appear after prompt & negative.
        self.assertEqual(len(res), 7)
        self.assertEqual(res[2], "masterpiece, (best quality:1.2)")
        self.assertEqual(res[3], "1girl, (silver_hair:1.15)")
        self.assertEqual(res[4], "")  # sec_trigger bypassed
        self.assertEqual(res[5], "")  # neg_anatomy bypassed

        # UI merged_preview and sections_schema stay consistent with emitted outputs.
        schema = json.loads(res[6])
        self.assertEqual(schema["merged_prompt"], prompt)
        self.assertEqual(schema["merged_negative"], negative)
        self.assertEqual(schema["merge_order"], ["subject", "quality", "composition", "style", "trigger"])
        trigger_entry = next(item for item in schema["positive"] if item["key"] == "trigger")
        self.assertEqual(trigger_entry["enabled"], False)
        self.assertEqual(trigger_entry["text"], "my_lora_trigger")
        subject_entry = next(item for item in schema["positive"] if item["key"] == "subject")
        self.assertEqual(subject_entry["suggestions"], "1girl, solo, long_hair")
        self.assertEqual(out["ui"]["sections_schema"][0], res[6])
        self.assertIn(prompt, out["ui"]["merged_preview"][0])
        self.assertIn(negative, out["ui"]["merged_preview"][0])

    def test_xy_trigger_sync_modes_and_custom_separator(self):
        node = PromptWorkbenchMCP()
        append_out = node.emit_prompt(
            sec_subject="1girl",
            sec_trigger="base_trigger",
            xy_trigger_sync="append",
            xy_trigger_input="lora_a_trigger, base_trigger",
            merge_separator=" | ",
            normalize_tags=False,
            output_sections="sec_trigger",
        )
        self.assertEqual(append_out["result"][0], "1girl | base_trigger, lora_a_trigger")
        self.assertEqual(append_out["result"][2], "base_trigger, lora_a_trigger")

        replace_out = node.emit_prompt(
            sec_subject="1girl",
            sec_trigger="base_trigger",
            xy_trigger_sync="replace",
            xy_trigger_input="lora_b_trigger",
        )
        self.assertEqual(len(replace_out["result"]), 2)
        self.assertEqual(replace_out["result"][0], "1girl, lora_b_trigger,")

        bypass_out = node.emit_prompt(
            sec_subject="1girl",
            sec_trigger="base_trigger",
            sec_trigger_enabled=False,
            xy_trigger_sync="replace",
            xy_trigger_input="lora_b_trigger",
            output_sections="sec_trigger",
        )
        self.assertEqual(bypass_out["result"][0], "1girl,")
        self.assertEqual(bypass_out["result"][2], "")

    def test_normalize_helpers_handle_empty_and_crlf(self):
        self.assertEqual(normalize_output_prompt(None), "")
        self.assertEqual(normalize_structured_prompt("a  \r\n\r\nb \r\n"), "a\n\nb")

    def test_fork_node_builds_nested_json_from_dotted_section_titles(self):
        node = PromptWorkbenchFork()
        payload = json.dumps(
            {
                "nest_roles": False,
                "sections": [
                    {"id": "s1", "title": "task", "role": "positive", "mode": "prose", "enabled": True, "text": "editorial portrait", "socket_output": True},
                    {"id": "s2", "title": "shot.composition", "role": "positive", "mode": "prose", "enabled": True, "text": "rule of thirds"},
                    {"id": "s3", "title": "shot.angle", "role": "positive", "mode": "prose", "enabled": True, "text": "eye-level"},
                    {"id": "s4", "title": "subject.core", "role": "positive", "mode": "prose", "enabled": True, "text": "young woman"},
                    {"id": "s5", "title": "negatives", "role": "negative", "mode": "tags", "enabled": True, "text": "blurry, lowres"},
                ],
            }
        )
        out_prompt, out_negative, out_task = node.emit_prompt(
            output_format="json",
            sections_payload=payload,
        )
        parsed = json.loads(out_prompt)
        self.assertEqual(parsed["task"], "editorial portrait")
        self.assertEqual(parsed["shot"], {"composition": "rule of thirds", "angle": "eye-level"})
        self.assertEqual(parsed["subject"], {"core": "young woman"})
        self.assertEqual(out_negative, "blurry, lowres")
        self.assertEqual(out_task, "editorial portrait")

        nested_role_payload = json.dumps(
            {
                "nest_roles": True,
                "sections": [
                    {"id": "s1", "title": "shot.framing", "role": "positive", "mode": "prose", "enabled": True, "text": "medium close-up", "socket_output": True},
                    {"id": "s2", "title": "negatives", "role": "negative", "mode": "tags", "enabled": True, "text": "watermark"},
                ],
            }
        )
        nested_prompt, _, _ = node.emit_prompt(output_format="json", sections_payload=nested_role_payload)
        nested_parsed = json.loads(nested_prompt)
        self.assertEqual(nested_parsed["positive"], {"shot": {"framing": "medium close-up"}})
        self.assertEqual(nested_parsed["negative"], {"negatives": "watermark"})

    def test_routes_multilingual_detection_chunking_and_phrase_catalog(self):
        import importlib.util
        import sys
        import types
        from pathlib import Path

        root = Path(__file__).resolve().parents[1]
        pkg_name = "_pw_test_pkg"
        if pkg_name not in sys.modules:
            pkg = types.ModuleType(pkg_name)
            pkg.__path__ = [str(root)]
            sys.modules[pkg_name] = pkg
        spec = importlib.util.spec_from_file_location(f"{pkg_name}.routes", root / "routes.py")
        routes = importlib.util.module_from_spec(spec)
        routes.__package__ = pkg_name
        spec.loader.exec_module(routes)

        # Issue #3: language detection & long-text chunking
        self.assertEqual(routes._detect_source_language("柔らかな自然光が差し込む", "en"), "ja")
        self.assertEqual(routes._detect_source_language("50mm标准焦段，平视全身近景", "ja"), "zh-CN")
        self.assertEqual(routes._detect_source_language("부드러운 자연광 포트레이트", "en"), "ko")
        self.assertEqual(routes._detect_source_language("soft key light from upper left", "ja"), "en")
        self.assertEqual(routes._normalize_deepl_lang("zh-CN"), "ZH")
        self.assertEqual(routes._normalize_deepl_lang("zh-TW"), "ZH")

        long_prose = " ".join(
            [f"Sentence number {i} describes cinematic lighting and shallow depth of field." for i in range(15)]
        )
        self.assertGreater(len(long_prose.encode("utf-8")), 500)
        chunks = routes._split_text_chunks(long_prose, max_bytes=450)
        self.assertGreater(len(chunks), 1)
        for chunk_text, _ in chunks:
            self.assertLessEqual(len(chunk_text.encode("utf-8")), 450)

        # Issue #6: phrase catalog loading & role-prioritized multilingual search
        catalog = routes.load_phrase_catalog()
        self.assertGreaterEqual(len(catalog), 10)
        lighting_hits = routes.search_phrases(role="lighting", language="ja", limit=10)
        self.assertTrue(lighting_hits)
        self.assertEqual(lighting_hits[0]["role"], "lighting")
        self.assertTrue(lighting_hits[0]["matched_role"])
        self.assertIn("en", lighting_hits[0]["text"])
        self.assertIn("ja", lighting_hits[0]["text"])
        self.assertIn("zh", lighting_hits[0]["text"])

        zh_hits = routes.search_phrases(query="胶片", language="zh", limit=5)
        self.assertTrue(any(hit["role"] == "camera" for hit in zh_hits))

    def test_pr9_codex_review_fixes_return_types_weighted_split_and_prose_preservation(self):
        from nodes import _merge_unique_tags

        # P1: DynamicReturnTypes supports slot >= 2 while keeping len == 2
        self.assertEqual(len(PromptWorkbenchFork.RETURN_TYPES), 2)
        self.assertEqual(PromptWorkbenchFork.RETURN_TYPES[2], "STRING")
        self.assertEqual(len(PromptWorkbenchMCP.RETURN_TYPES), 2)
        self.assertEqual(PromptWorkbenchMCP.RETURN_TYPES[6], "STRING")

        # P2: weighted groups containing commas are not split mid-group
        merged = _merge_unique_tags("(red hair, blue eyes:1.2)", "(red hair, green eyes:1.2)")
        self.assertEqual(merged, "(red hair, blue eyes:1.2), (red hair, green eyes:1.2)")

        # P2: prose mode preserves newlines and suppresses trailing comma in tags output format
        node = PromptWorkbenchFork()
        prose_payload = json.dumps(
            {
                "sections": [
                    {
                        "id": "s1",
                        "title": "Scene",
                        "role": "positive",
                        "mode": "prose",
                        "enabled": True,
                        "text": "Line one.\nLine two.",
                        "socket_output": True,
                    }
                ]
            }
        )
        out_prompt, _, out_scene = node.emit_prompt(output_format="tags", sections_payload=prose_payload)
        self.assertEqual(out_prompt, "Line one.\nLine two.")
        self.assertEqual(out_scene, "Line one.\nLine two.")

        # No-dynamic-socket fallback also preserves prose formatting
        no_socket_payload = json.dumps(
            {
                "sections": [
                    {
                        "id": "s1",
                        "title": "Scene",
                        "role": "positive",
                        "mode": "prose",
                        "enabled": True,
                        "text": "Line one.\nLine two.",
                        "socket_output": False,
                    }
                ]
            }
        )
        fallback_prompt, _ = node.emit_prompt(
            prompt="Line one.\nLine two.",
            output_format="tags",
            sections_payload=no_socket_payload,
        )
        self.assertEqual(fallback_prompt, "Line one.\nLine two.")


if __name__ == "__main__":
    unittest.main()
