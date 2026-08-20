# ComfyUI-Prompt-Workbench

[日本語](README.md) | [English](README_EN.md)

ComfyUI でプロンプトをタグ単位に分解し、並べ替え、無効化、重み調整、翻訳、検索をまとめて行うカスタムノードです。
実行時の正本は ComfyUI 標準の複数行 `STRING` ウィジェットに残し、その上に編集しやすいタグ UI を重ねます。
UI が使えない環境でも、保存済みの `STRING` はそのまま出力できます。

## デモ

<video src="docs/assets/comfyui_prompt_workbench_intro.mp4" controls></video>

GitHub 上で動画が表示されない場合は、
[`docs/assets/comfyui_prompt_workbench_intro.mp4`](docs/assets/comfyui_prompt_workbench_intro.mp4)
を開いてください。

![Prompt Workbench ノード本体の画面](docs/assets/prompt-workbench-main-node.png)

> [!IMPORTANT]
> 本プロジェクトは、[Physton 氏](https://github.com/Physton)による
> [sd-webui-prompt-all-in-one](https://github.com/Physton/sd-webui-prompt-all-in-one)の
> 公式 ComfyUI 版ではありません。
> 直感的で強力なプロンプト編集体験を公開してくださった Physton 氏に、心より感謝いたします。
> 本ノードは、その体験を参考にしながら ComfyUI 向けに独立して設計したものです。

## まず何ができるか

- 単一のプロンプトを編集し、接続先を限定しない `STRING` として出力できます。
- タグをドラッグで並べ替え、クリックで有効 / 無効を切り替えられます。
- タグの編集、削除、コピー、重複検出、複数選択、一括操作に対応しています。
- タグ重み、LoRA、LyCORIS の強度を `0.05` / `0.1` / `0.25` 刻みで調整できます。
- 原文、翻訳、状態、種別、重複、ブラックリストでタグを絞り込めます。
- 大分類、中分類、小分類を持つローカルタグカタログからタグを検索・追加できます。
- ローカル辞書、MyMemory、LibreTranslate、DeepL、OpenAI 互換 API を使った翻訳に対応しています。
- 原文 / 日本語 / 両方の表示を切り替えられます。
- 日本語タグを英語タグへ置換する翻訳ボタンがあります。
- LoRA、LyCORIS、Embedding、Wildcard、Dynamic Prompt、`BREAK` を識別します。
- TXT と状態 JSON のインポート / エクスポートに対応しています。
- ComfyUI のライト / ダークテーマに追従し、タグ種別ごとに色を設定できます。

タグの解析には、括弧、引用符、エスケープを追跡するステートマシン型パーサーを使っています。
ノード内では ComfyUI 標準の右クリックメニューを抑止し、タグ専用メニューと入力欄の文字編集メニューだけを表示します。

## インストール

### ComfyUI Manager から入れる

通常は ComfyUI Manager からのインストールを推奨します。

1. ComfyUI を起動し、`Manager` を開きます。
2. `Custom Nodes Manager` を開きます。
3. `ComfyUI Prompt Workbench` または `prompt-workbench` を検索します。
4. 検索結果の `Install` を押します。
5. インストールが終わったら ComfyUI を再起動します。

Registry の公開ページは [ComfyUI Prompt Workbench](https://registry.comfy.org/nodes/prompt-workbench) です。
追加依存関係はありません。

開発中の変更を含む最新版は [GitHub の `main` ブランチ](https://github.com/matsukasa/ComfyUI-Prompt-Workbench) です。
Manager 版は Registry への反映タイミングにより、GitHub 版より更新が遅れる場合があります。

### 手動で入れる

このフォルダを次の位置へ配置し、ComfyUI を再起動します。

```text
ComfyUI/custom_nodes/ComfyUI-Prompt-Workbench/
```

追加依存関係はありません。
翻訳の HTTP 通信には、ComfyUI に同梱されている `aiohttp` を使います。

### Portable 版に入れる

Portable 版では、Portable フォルダの中にある ComfyUI の `custom_nodes` へ配置します。

```text
ComfyUI_windows_portable/ComfyUI/custom_nodes/ComfyUI-Prompt-Workbench/
```

配置したら、`run_nvidia_gpu.bat` など普段使っている起動ファイルから ComfyUI を再起動してください。

### Stability Matrix に入れる

Stability Matrix は Package ごとに `custom_nodes` が分かれます。
実際に起動する Package のフォルダへ入れてください。

1. Stability Matrix で対象の ComfyUI Package を開きます。
2. Package のデータフォルダを開きます。
3. `ComfyUI/custom_nodes/` へ本フォルダを配置します。
4. Stability Matrix から ComfyUI を再起動します。

## 基本の使い方

1. ノード検索で `Prompt Workbench` を追加します。
2. 上部の本文欄、または下部の追加欄へタグを入力します。
3. 本文欄は `Ctrl+Enter` または `タグへ反映`、追加欄は Enter で確定します。
4. タグボタンをドラッグすると順序を変更できます。
5. タグボタンをクリックすると、有効 / 無効を切り替えられます。
6. ダブルクリックでタグを編集できます。
7. Ctrl / Cmd または Shift + クリックで複数選択できます。
8. 右クリックメニューから、重み、翻訳、コピー、移動、削除を操作できます。
9. `表示` で原文 / 日本語 / 両方を切り替えます。
10. `翻訳` ボタンを押すと、日本語タグは英語へ置換され、英語タグには日本語訳が追加されます。
11. `タグを追加` を開くと、カテゴリーや英語 / 日本語の名前からタグを検索して追加できます。
12. `prompt` 出力を、必要なノードの `STRING` 入力へ接続します。

無効タグはワークフロー内の UI 状態として残りますが、`STRING` 出力からは除外されます。
ブラウザ拡張を読み込めない API 実行やヘッドレス実行では、保存済みの `STRING` がそのまま出力されます。

## タグカタログを編集する

タグや大分類・中分類・小分類を本格的に編集したい場合は、専用のローカル Web アプリ
[ComfyUI Prompt Workbench Tag Editor](https://github.com/matsukasa/ComfyUI-Prompt-Workbench-Tag-Editor)
を使えます。

![ComfyUI Prompt Workbench Tag Editor の画面](docs/assets/prompt-workbench-tag-editor.png)

Tag Editor では、タグのドラッグ移動、並べ替え、分類名やタグ名の直接編集、複数選択、Undo / Redo、検索、重複検出、変更内容の確認、上書き保存、別名保存ができます。
`start-dev.bat` をダブルクリックすると起動できます。
ComfyUI 本体とは独立して動くため、ComfyUI を起動していなくても `data/tag_catalog.json` や `data/sfw_tag_catalog.json` などの JSON を開いて編集できます。

Prompt Workbench 内の `タグ管理` 画面でも、タグとカテゴリーを編集できます。
タグ行の左端にある `⋮⋮` をドラッグすると、小分類内の表示順を変更できます。
編集したタグ集を残す場合は、タグ管理画面で名前を入力し、`別名で保存` を押してください。

## 名前付きタグファイルを保存・読み込みする

タグ管理画面の下部から、編集結果を JSON ファイルとして保存できます。
`別名で保存` は同名ファイルを上書きせず、別名を求めます。
`上書き保存` は、現在使用している名前付きタグファイルを確認後に原子的に置き換えます。
内蔵デフォルトのカタログは上書きできません。

`ファイルを選んで読み込む` を押すと OS のファイル選択画面が開きます。
選択した JSON は検証後、ComfyUI のユーザーフォルダへ名前付きコピーとして保存され、そのタグ集へ切り替わります。
同名ファイルがある場合は、連番を増やさず ComfyUI 側の同名コピーを更新します。

保存済みワークフローが指定しているタグファイルが見つからない場合だけ、内蔵デフォルトへフォールバックします。
指定ファイルが存在するのに破損している場合は、データの取り違えを避けるため読込エラーにします。
未保存のタグ編集がある状態で別ファイルを読み込む場合は確認を表示し、OK を選んだ場合だけ編集内容を破棄します。

保存 JSON は Tag Editor と同じ `schema_version: 1` 形式です。
大分類、中分類、小分類、タグを `major_categories → medium_categories → small_categories → tags` として階層保存します。
変更していない分類とタグも含め、カタログ全体を書き出します。
従来のフラットな `prompt-workbench/tag-catalog` version 1 形式も引き続き読み込めます。

通常の ComfyUI では、名前付きファイルを ComfyUI ユーザーディレクトリ内の次の場所へ保存します。

```text
prompt_workbench/tag_catalogs/
```

ファイル名には文字、数字、空白、ハイフン、アンダースコアを使用できます。
パス区切りや Windows 予約名は使用できません。

Chrome / Edge 系ブラウザでは、同じセッション内で読み込み元のファイルハンドルを保持できる場合があります。
その場合、`別名で保存` は読み込み元の場所を初期位置として開きます。
非対応ブラウザでは通常のダウンロードへフォールバックします。
候補名は `元の名前_YYYYMMDD_HHMMSS.json` です。

## 内蔵タグカタログの扱い

`data/tag_catalog.json` は NSFW 系を含むフルタグカタログです。
11 大分類、40 中分類、163 小分類、4,120 タグを収録しています。

タグボタンは英語名と日本語訳を表示します。
検索には、英語名、エイリアス、日本語の大分類・中分類・小分類名を利用できます。
カタログの閲覧、検索、追加で外部タグサービスへ通信することはありません。

SFW / 一般向けのカタログは `data/sfw_tag_catalog.json` として残しています。
必要な場合は、ComfyUI 上の Prompt Workbench 設定から `Tag manager` を開き、`ファイルを選んで読み込む` で任意に読み込んでください。
読み込んだファイルは、ComfyUI のユーザーディレクトリ `prompt_workbench/tag_catalogs/` へ名前付きカタログとして保存されます。

Comfy Registry へ公開するパッケージでは、公開ワークフロー内で `data/sfw_tag_catalog.json` を `data/tag_catalog.json` として差し替えます。
そのため、Registry 同梱版の既定カタログは SFW 版です。

お気に入りは専用ファイルではなく、`状態JSONを書き出す` で保存する `prompt_workbench_state.json` の `settings.favorites` に含まれます。
カタログを差し替える前や別環境へ移す前は、この状態 JSON と使用中のタグカタログ JSON をあわせてバックアップしてください。

外部データの取得・更新スクリプト、API 認証設定、raw キャッシュ、中間生成物は同梱していません。
内蔵デフォルトとして読み込む固定カタログは `data/tag_catalog.json` です。
由来データの出典とライセンスは [第三者表記](THIRD_PARTY_NOTICES.md) に記録しています。

## 翻訳を使う

日本語への翻訳では、選択したプロバイダーに関係なく、最初に内蔵辞書と保存済みタグの日本語訳を使います。
見つからないタグだけを外部翻訳へ送信します。

既定の「無料翻訳（辞書→MyMemory）」では、不足分を MyMemory へ送信します。
外部送信を避けたい場合は「ローカル辞書のみ」を選んでください。

プロンプト本文に日本語タグがある場合、`翻訳` ボタンは最初にローカル辞書で英語を探します。
見つかったタグは本文内で英語へ置き換えます。
明示的な重み構文は維持されます。

Google Cloud Translation の公式 API には無料枠がありますが、Google Cloud プロジェクトと認証設定が必要です。
そのため、無設定の既定値にはしていません。

API キーはノード、ワークフロー、ブラウザ設定へ保存しません。
ComfyUI を起動するプロセスの環境変数で設定してください。

| Provider | Environment variables |
| --- | --- |
| Local dictionary | 不要 |
| LibreTranslate | `PROMPT_WORKBENCH_LIBRE_URL`、任意で `PROMPT_WORKBENCH_LIBRE_API_KEY` |
| DeepL | `PROMPT_WORKBENCH_DEEPL_API_KEY`、任意で `PROMPT_WORKBENCH_DEEPL_URL` |
| OpenAI 互換 | `PROMPT_WORKBENCH_OPENAI_API_KEY`、`PROMPT_WORKBENCH_OPENAI_MODEL`、任意で `PROMPT_WORKBENCH_OPENAI_BASE_URL` |

PowerShell で、現在の起動プロセスだけに設定する例です。
値は表示したり Git に保存したりしないでください。

```powershell
$env:PROMPT_WORKBENCH_DEEPL_API_KEY = "your-key"
```

設定後、同じ PowerShell から ComfyUI を起動します。
入力サイズ制限、30 秒以内のタイムアウト、同時実行数制限、簡易レート制限、メモリ内キャッシュを実装しています。
詳細は [翻訳プロバイダー](docs/translation-providers.md) を参照してください。

## UI 言語を切り替える

設定の `一般` → `UI言語` から、日本語または英語を選択できます。
選択結果はワークフローへ書き込まず、そのブラウザ内だけに保存します。
変更は ComfyUI の再読み込み後に反映されます。

UI 文言は `web/locales/` にあります。
`en.json` は全翻訳キーを含むテンプレートです。
`ja.json` は、日本語の元文を上書きしたい場合に使います。

既存言語の表示を変更する場合は、対応する JSON の `messages` にある値だけを書き換えてください。
新しい言語を追加する場合は `en.json` を複製して翻訳し、`web/locales/manifest.json` へ言語コード、表示名、ファイル名を追加します。
翻訳がないキーや言語ファイルを読み込めない場合は、日本語の元文へフォールバックします。

プロンプトタグ用の `data/translations.json` は UI 翻訳には使いません。

## 入力と同期の仕組み

タグボタンや追加操作は、対応する標準 `STRING` ウィジェットへ即時反映されます。
本文欄を直接編集した場合は、IME 入力中の誤解析を避けるため、明示的な反映操作を行います。
ワークフロー読込や外部操作で `STRING` 値が変わった場合も、エディターが変更を検出して再解析します。

完全なタグ状態は、バージョン付きの `node.properties.promptWorkbenchState` へ保存します。
実行用 `STRING` とは分離されます。

## セキュリティ

- ユーザー文字列は `innerHTML` へ渡さず、フォーム値または `textContent` で描画します。
- API キーはサーバープロセスの環境変数だけから取得します。
- インポート JSON はスキーマ、件数、文字列長、1 MB 上限を検証します。
- 正規表現は長さ制限と、危険なネスト量指定子の簡易拒否を行います。
- 翻訳 URL は、サーバー管理者が設定した HTTP(S) 環境変数だけを使います。
- `eval`、`new Function`、任意コード実行機構は使いません。

## 既知の制限

- ComfyUI のモデル一覧形式は構成により異なります。取得に失敗しても編集は使えますが、LoRA / Embedding の存在警告は表示されない場合があります。
- 素の Embedding 名は通常タグと区別できません。確実に識別したい場合は `embedding:name` 形式を使ってください。
- 大量タグは 250 件ずつ段階表示します。完全な仮想スクロールではありません。
- DeepL、LibreTranslate、OpenAI 互換は、有効な利用者設定がないため自動ライブ試験していません。
- AI によるプロンプト生成は初版の対象外です。
- V3 ノードスキーマへの移行は、安定版 API と互換性要件を再評価してから行います。

## トラブルシューティング

### ノードが見つからない

`custom_nodes/ComfyUI-Prompt-Workbench/__init__.py` の位置を確認してください。
あわせて、ComfyUI の起動ログに import error が出ていないか確認します。

### UI が表示されない

ブラウザを強制再読み込みしてください。
それでも表示されない場合は、`WEB_DIRECTORY = "./web"` が読まれているか確認します。
`STRING` 出力自体は UI がなくても動作します。

### 翻訳が失敗する

設定したプロバイダーの環境変数、URL、利用上限を確認してください。
確認後、タグの翻訳ボタンから再試行します。

### モデルなし警告が誤っている

ComfyUI の `/object_info` または `/embeddings` を取得できるか確認してください。
警告は実行を止めません。

## アンインストール

ComfyUI を終了し、`custom_nodes/ComfyUI-Prompt-Workbench` フォルダを別の場所へ退避するか削除してから再起動します。
既存ワークフローには未登録ノードとして残ります。
必要な場合は、アンインストール前に `STRING` を別ノードへコピーしてください。

## ライセンス

本プロジェクトは MIT License です。
第三者由来データの表記は [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) を参照してください。
