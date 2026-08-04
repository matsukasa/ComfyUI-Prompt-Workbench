# Third-party notices

## qdlabs/danbooru-tags

- Dataset: <https://huggingface.co/datasets/qdlabs/danbooru-tags>
- License declared by the dataset card: Apache-2.0
- Files used: `tags.parquet`, or `tags.jsonl` when no Parquet reader is available

This dataset was used to prepare the bundled static tag-catalog snapshot.
Raw source files and acquisition tools are not distributed with the node.

## a1111-sd-webui-tagcomplete

- Project: <https://github.com/DominikDoom/a1111-sd-webui-tagcomplete>
- File used: `tags/danbooru.csv`
- Audited main commit: `4170882f90b47be130a0ff9314f663c230b9153d`
- License: MIT

The TagComplete CSV was used only to supplement aliases in the bundled static
snapshot. The CSV and its acquisition tools are not distributed with the node.

## sd-webui-prompt-all-in-one

- Project: <https://github.com/Physton/sd-webui-prompt-all-in-one>
- Audited commit: `d4b37aa4187b40466772b6282d8b28acd5ad77c9`
- License: MIT
- Copyright: Copyright (c) 2023 Physton

The following source data remains as the local compatibility fallback:

- `group_tags/default.yaml` and `group_tags/ja_JP.yaml` -> 134 groups and 3,744
  entries in `data/prompt_examples.json`; the 62-entry
  `人物 / 二次元キャラクター` group is intentionally excluded
- selected English/Japanese tag pairs -> the offline translation helper in
  `data/translations.json`

The prompt-group data was converted to JSON and second-level groups were
flattened into bilingual categories for the ComfyUI editor. Entries retain the
upstream order, grouping and translations. The single group named above is the
only content exclusion.
No JavaScript, Vue, CSS, icon, Python translator, history or favorite
implementation was copied.

The upstream MIT license follows:

> MIT License
>
> Copyright (c) 2023 Physton
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.
