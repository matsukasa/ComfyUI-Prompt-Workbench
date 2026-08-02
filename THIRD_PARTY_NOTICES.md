# Third-party notices

## Danbooru official API

- Service: <https://danbooru.donmai.us/>
- API help: <https://danbooru.donmai.us/wiki_pages/help:api>
- Endpoints used: `/tags.json`, `/wiki_pages.json`, `/tag_aliases.json`,
  `/tag_implications.json`

`tools/update_danbooru_tag_catalog.py` retrieves public tag metadata from the
official API only. Generated UI data contains tag IDs, names, post counts and
local classification metadata. Wiki bodies are used only during classification
and are not redistributed in generated JSON files. The normal ComfyUI runtime
does not contact Danbooru.

## sd-webui-prompt-all-in-one

- Project: <https://github.com/Physton/sd-webui-prompt-all-in-one>
- Audited commit: `d4b37aa4187b40466772b6282d8b28acd5ad77c9`
- License: MIT
- Copyright: Copyright (c) 2023 Physton

The following source data remains as a compatibility fallback until a complete
Danbooru catalog has been successfully generated:

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
