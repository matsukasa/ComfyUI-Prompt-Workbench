# Manual UI test checklist

Use a disposable workflow and test both ComfyUI light and dark themes.

- [ ] ComfyUI starts without `import failed`.
- [ ] `Prompt All-in-One` appears under `prompt/Prompt All-in-One`.
- [ ] Node creates with empty Positive and Negative tabs.
- [ ] Comma paste, newline paste and Enter addition create the expected tags.
- [ ] Nested syntax, quoted commas and escaped commas stay intact.
- [ ] Dragging changes tag order and STRING output order.
- [ ] Inline edit, enable/disable, delete and weight controls work.
- [ ] Ctrl/Cmd, Shift and checkbox selection work.
- [ ] Bulk enable, disable, delete, translate, weight, copy and move work.
- [ ] Undo/Redo restores deletion, formatting and weight changes.
- [ ] Example search works in English/Japanese and bulk-add destination works.
- [ ] Invalid blacklist regex reports an error without breaking the editor.
- [ ] Missing-model lookup failure does not block editing.
- [ ] Translation success is bilingual; failure shows retryable inline text.
- [ ] TXT and schema JSON import/export enforce the size/schema limits.
- [ ] Workflow save/reload restores disabled tags and translations.
- [ ] Node duplicate and copy/paste preserve independent state.
- [ ] Positive/Negative outputs connect to `CLIP Text Encode.text`.
- [ ] Queue execution returns the exact enabled output strings.
- [ ] Browser console has no errors.
- [ ] Keyboard focus is visible and reduced-motion mode has no required animation.
