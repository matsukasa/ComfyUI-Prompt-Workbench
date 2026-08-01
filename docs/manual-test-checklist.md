# Manual UI test checklist

Use a disposable workflow and test both ComfyUI light and dark themes.

- [ ] ComfyUI starts without `import failed`.
- [ ] `Prompt Workbench` appears under `prompt/Prompt Workbench`.
- [ ] Node creates with one empty prompt editor and no Positive/Negative tabs.
- [ ] Native prompt STRING widget stays serialized but is not visibly duplicated.
- [ ] Top prompt text applies with Ctrl+Enter/button and shows synced/dirty state.
- [ ] Comma paste, newline paste and Enter addition create the expected tags.
- [ ] Nested syntax, quoted commas and escaped commas stay intact.
- [ ] Dragging changes tag order and STRING output order.
- [ ] Click toggle, double-click inline edit and right-click actions work.
- [ ] Ctrl/Cmd and Shift selection work.
- [ ] Bulk enable, disable, delete, translate, weight and copy work.
- [ ] Undo/Redo restores deletion, formatting and weight changes.
- [ ] Example search works in English/Japanese and bulk-add works.
- [ ] Invalid blacklist regex reports an error without breaking the editor.
- [ ] Missing-model lookup failure does not block editing.
- [ ] Translation success is bilingual; failure shows retryable inline text.
- [ ] Original/Japanese/both display modes never render `null` or `undefined`.
- [ ] Disabled tags show the ⊘ mark, dashed outline and strikethrough without relying on color alone.
- [ ] TXT and schema JSON import/export enforce the size/schema limits.
- [ ] Workflow save/reload restores disabled tags and translations.
- [ ] Node duplicate and copy/paste preserve independent state.
- [ ] The prompt output connects to any required `CLIP Text Encode.text`.
- [ ] Queue execution returns the exact enabled output string.
- [ ] Browser console has no errors.
- [ ] Keyboard focus is visible and reduced-motion mode has no required animation.
