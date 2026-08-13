# ComfyUI-Prompt-Workbench

[日本語](README.md) | [English](README_EN.md)

単一のPromptをタグ単位で編集する、ComfyUI用カスタムノードです。
標準の複数行STRINGウィジェットを実行時の正本として保ちつつ、ノード内に
並べ替え・無効化・重み調整・翻訳・検索などの編集UIを追加します。

> [!IMPORTANT]
> 本プロジェクトは、[Physton氏](https://github.com/Physton)が開発した
> [sd-webui-prompt-all-in-one](https://github.com/Physton/sd-webui-prompt-all-in-one)の
> 公式ComfyUI版ではありません。直感的で強力なプロンプト編集体験を公開してくださった
> Physton氏に、心より感謝いたします。そのユーザー体験を調査し、ComfyUI向けに独立して
> 再設計したものです。

## 主な機能

- 単一プロンプトを編集し、接続先を限定しないSTRINGとして出力
- 括弧・引用符・エスケープを追跡するステートマシン型パーサー
- タグのドラッグ並べ替え、インライン編集、無効化、削除、コピー
- ノード内ではComfyUI標準の右クリックメニューを抑止し、タグ専用メニューと入力欄の文字編集メニューだけを表示
- 0.05 / 0.1 / 0.25刻みのタグ重み・LoRA・LyCORIS強度調整
- Ctrl / Cmd・Shift・チェックボックスによる複数選択と一括操作
- ブラウザセッション内のUndo / Redo
- 原文・翻訳・状態・種別・重複・ブラックリストによる絞り込み
- 重複検出と選択タグの一括操作
- 大分類・中分類・小分類によるカテゴリー管理とユーザータグの追加・編集・削除
- ローカル完結の大・中・小分類タグカタログ、英語タグ名・日本語分類名検索、一括追加
- 無料自動翻訳（ローカル辞書→MyMemory）、完全オフライン辞書、LibreTranslate、DeepL、OpenAI互換の翻訳アダプター
- 原文 / 日本語 / 両方の表示切り替えと、日本語タグを英語へ置換する単一の翻訳ボタン
- 完全一致・大小文字無視・部分一致・正規表現ブラックリスト
- LoRA、LyCORIS、Embedding、Wildcard、Dynamic Prompt、BREAKの識別
- TXT / 状態JSONのインポート・エクスポート（1 MB上限）
- ComfyUIのライト / ダークテーマ追従とタグ種別ごとの色設定

## タグカタログエディター

タグや大・中・小分類を直感的に編集できる専用のローカルWebアプリ
[ComfyUI Prompt Workbench Tag Editor](https://github.com/matsukasa/ComfyUI-Prompt-Workbench-Tag-Editor)
も用意しています。タグのドラッグ移動・並べ替え、分類名やタグ名の直接編集、複数選択、
Undo／Redo、検索、重複検出、変更内容の確認、上書き・別名保存に対応しています。

`start-dev.bat`をダブルクリックすると起動できます。ComfyUI本体とは独立して動作するため、
ComfyUIを起動していなくても`data/tag_catalog.json`などの対応JSONを開いて編集できます。

## インストール

### ComfyUI Managerから（推奨）

1. ComfyUIを起動し、`Manager`を開きます。
2. `Custom Nodes Manager`を開きます。
3. `ComfyUI Prompt Workbench`または`prompt-workbench`を検索します。
4. 検索結果の`Install`を押します。
5. インストール完了後、ComfyUIを再起動します。

通常はComfyUI Managerからのインストールを推奨します。ただし、開発中の変更を含む最新版は
[GitHubの`main`ブランチ](https://github.com/matsukasa/ComfyUI-Prompt-Workbench)です。
Manager版はRegistryへの反映により、GitHub版より更新が遅れる場合があります。

Registryの公開ページは[ComfyUI Prompt Workbench](https://registry.comfy.org/nodes/prompt-workbench)です。
追加依存関係はありません。

### 通常のComfyUI

このフォルダを次の位置へ配置し、ComfyUIを再起動します。

```text
ComfyUI/custom_nodes/ComfyUI-Prompt-Workbench/
```

追加依存関係はありません。翻訳のHTTP通信にはComfyUI同梱の`aiohttp`を使います。

### ComfyUI Portable版

Portable版のルートを基準に、次へフォルダを配置します。

```text
ComfyUI_windows_portable/ComfyUI/custom_nodes/ComfyUI-Prompt-Workbench/
```

その後、`run_nvidia_gpu.bat`など普段の起動ファイルから再起動してください。

### Stability Matrix

1. Stability Matrixで対象のComfyUI Packageを開きます。
2. Packageのデータフォルダを開きます。
3. `ComfyUI/custom_nodes/`へ本フォルダを配置します。
4. Stability MatrixからComfyUIを再起動します。

Packageごとに`custom_nodes`が分かれるため、実際に起動するPackageへ入れてください。

## 使い方

1. ノード検索で `Prompt Workbench` を追加します。
2. 上部の本文欄または追加欄へタグを入力します。
3. 本文欄は`Ctrl+Enter`または`タグへ反映`、追加欄はEnterで確定します。
4. タグボタンをドラッグして順序を変更し、クリックで有効 / 無効を切り替えます。
5. ダブルクリックで編集、Ctrl / CmdまたはShift+クリックで複数選択、右クリックで
   重み・翻訳・コピー・移動・削除を操作します。
6. `表示`で原文 / 日本語 / 両方を切り替えます。`翻訳`ボタンを押すと、日本語タグは英語へ置換され、英語タグには日本語訳が追加されます。置換結果はプロンプト本文とSTRING出力へ反映されます。
7. 最下部の`タグを追加`を開き、カテゴリーや英語 / 日本語を検索してタグを追加します。
8. 設定のタグ管理では、タグ行左端の`⋮⋮`をドラッグして小分類内の表示順を変更できます。
9. 編集したタグ集を残す場合は、タグ管理上部で名前を入力して`別名で保存`します。
10. `prompt`出力を必要なノードのSTRING入力へ接続します。

無効タグはUI状態としてワークフローに残りますが、STRING出力からは除外されます。
ブラウザ拡張が読み込めないAPI / ヘッドレス実行では、保存済みSTRINGがそのまま
出力されます。

## UIの多言語化

設定の`一般`→`UI言語`から日本語または英語を選択できます。選択結果はワークフローへ
書き込まず、そのブラウザ内だけに保存します。変更はComfyUIの再読み込み後に反映されます。

UI文言は`web/locales/`にあります。`en.json`が全翻訳キーを含むテンプレートで、`ja.json`は
日本語の元文を上書きしたい場合に使います。既存言語の表示を変更する場合は、対応するJSONの
`messages`にある値だけを書き換えてください。新しい言語を追加する場合は`en.json`を複製して
翻訳し、`web/locales/manifest.json`へ言語コード・表示名・ファイル名を追加します。
翻訳がないキーや言語ファイルを読み込めない場合は、日本語の元文へフォールバックします。
プロンプトタグ用の`data/translations.json`とは用途が異なるため、UI翻訳には使用しません。

## 入力と同期

タグボタンや追加操作は対応する標準STRINGウィジェットへ即時反映されます。本文欄を
直接編集した場合は、IME入力中の誤解析を避けるため明示的な反映操作を行います。ワークフロー
読込や外部操作でSTRING値が変わった場合も、エディターが変更を検出して再解析します。
完全なタグ状態はバージョン付き`node.properties.promptWorkbenchState`へ保存され、
実行用STRINGとは分離されます。

## 翻訳設定

日本語への翻訳は、選択したプロバイダーに関係なく最初に内蔵辞書と保存済みタグの
日本語訳を使い、見つからないタグだけを外部翻訳へ送信します。既定の
「無料翻訳（辞書→MyMemory）」では不足分をMyMemoryへ送信します。
プロンプト本文に日本語タグがある場合は、`翻訳`ボタンが最初にローカル辞書で英語を
検索し、成功したタグの本文を英語へ書き換えます。明示的な重み構文は維持されます。
外部送信を行わない場合は「ローカル辞書のみ」を
選択してください。Google Cloud Translationの公式APIは無料枠がありますが、
Google Cloudプロジェクトと認証設定が必要なため、無設定の既定値にはしていません。

APIキーはノード、ワークフロー、ブラウザ設定へ保存しません。ComfyUIを起動する
プロセスの環境変数で設定してください。

| Provider | Environment variables |
| --- | --- |
| Local dictionary | 不要 |
| LibreTranslate | `PROMPT_WORKBENCH_LIBRE_URL`、任意で`PROMPT_WORKBENCH_LIBRE_API_KEY` |
| DeepL | `PROMPT_WORKBENCH_DEEPL_API_KEY`、任意で`PROMPT_WORKBENCH_DEEPL_URL` |
| OpenAI互換 | `PROMPT_WORKBENCH_OPENAI_API_KEY`、`PROMPT_WORKBENCH_OPENAI_MODEL`、任意で`PROMPT_WORKBENCH_OPENAI_BASE_URL` |

PowerShellで現在の起動プロセスだけへ設定する例（値は表示・Git保存しないでください）：

```powershell
$env:PROMPT_WORKBENCH_DEEPL_API_KEY = "your-key"
```

設定後、同じPowerShellからComfyUIを起動します。入力サイズ制限、30秒以内の
タイムアウト、同時実行数制限、簡易レート制限、メモリ内キャッシュを実装しています。
詳細は[翻訳プロバイダー](docs/translation-providers.md)を参照してください。

## 名前付きタグファイル

設定の`タグ管理`画面下部から、編集結果をJSONファイルとして保存できます。
別名保存では同名ファイルを上書きせず、別名を求めます。`ファイルを選んで読み込む`を押すと
OSのファイル選択画面が開き、選択したJSONを検証してComfyUIのユーザーフォルダへ
名前付きコピーとして保存したうえで、そのタグ集へ切り替えます。同名ファイルがある
場合は連番を増やさず、ComfyUI側の同名コピーを更新します。保存済みワークフローが指定している
ファイルが存在しない場合に限り、内蔵デフォルトへフォールバックします。存在する
指定ファイルが破損している場合は、データの取り違えを避けるため読込エラーにします。
未保存のタグ編集がある状態で読み込む場合は確認を表示し、OKを選んだ場合だけ編集内容を
破棄してファイル選択画面を開きます。キャンセルした場合は編集内容を保持します。

タグとカテゴリーの保存操作はタグ管理画面の下部にあります。`上書き保存`は現在使用中の
名前付きタグファイルを確認後に原子的に置換します。内蔵デフォルトは上書きできません。
保存JSONはTag Editorと同じ`schema_version: 1`形式で、大分類 → 中分類 → 小分類 → タグを
`major_categories → medium_categories → small_categories → tags`として階層保存します。
変更していない分類とタグも含むカタログ全体を書き出します。従来のフラットな
`prompt-workbench/tag-catalog` version 1形式も引き続き読み込めます。
`別名で保存`ではOSの保存場所選択画面を開き、読み込み元の場所を初期位置として提案します。
候補名は`元の名前_YYYYMMDD_HHMMSS.json`です。同じセッション内で読み込み元のファイル
ハンドルを保持できるChrome・Edge系ブラウザでは元の場所を開き、非対応ブラウザでは通常の
ダウンロードへフォールバックします。読み込みと保存は同じフォルダ履歴を共有するため、
`custom_nodes/ComfyUI-Prompt-Workbench/data`を一度選ぶと、次回以降もその場所から開きます。

通常のComfyUIでは、名前付きファイルをComfyUIユーザーディレクトリ内の
`prompt_workbench/tag_catalogs/`へ保存します。ファイル名には文字・数字・空白・
ハイフン・アンダースコアを使用でき、パス区切りやWindows予約名は使用できません。
編集中の差分がある状態で別ファイルを読み込むときは、破棄確認を表示します。

## 内蔵タグカタログ

`data/tag_catalog.json`はComfyUI Registry同梱用のSFW/一般タグカタログです。9大分類・
31中分類・132小分類に3,430タグを収録しています。

タグボタンは英語名と日本語訳を表示し、ホバーにも同じ内容だけを表示します。検索では
英語名、エイリアス、日本語の大・中・小分類名を利用できます。カタログの閲覧・検索・追加で
外部タグサービスへ通信することはありません。

より広い作画用のフルカタログはRegistryパッケージには同梱していません。必要な場合だけGitHubリポジトリから
任意の拡張カタログファイルを取得し、ComfyUI上の
Prompt Workbench設定 → Tag manager → 「ファイルを選んで読み込む」から任意で読み込んでください。
読み込んだファイルはComfyUIのユーザーディレクトリ
`prompt_workbench/tag_catalogs/`へ名前付きカタログとして保存されます。

外部データの取得・更新スクリプト、API認証設定、rawキャッシュ、中間生成物は同梱していません。
内蔵デフォルトとして読み込む固定カタログは`data/tag_catalog.json`です。
由来データの出典とライセンスは[第三者表記](THIRD_PARTY_NOTICES.md)に記録しています。

## セキュリティ

- ユーザー文字列は`innerHTML`へ渡さず、フォーム値または`textContent`で描画
- APIキーはサーバープロセスの環境変数だけから取得
- インポートJSONはスキーマ、件数、文字列長、1 MB上限を検証
- 正規表現は長さ制限と危険なネスト量指定子の簡易拒否を実施
- 翻訳URLはサーバー管理者が設定したHTTP(S)環境変数だけを使用
- `eval`、`new Function`、任意コード実行機構は不使用

## 既知の制限

- ComfyUIのモデル一覧形式は構成により異なります。取得に失敗しても編集は使えますが、
  LoRA / Embeddingの存在警告は表示されない場合があります。
- 素のEmbedding名は通常タグと区別できないため、確実な識別には`embedding:name`形式を
  使用してください。
- 大量タグは250件ずつ段階表示します。これは完全な仮想スクロールではありません。
- DeepL、LibreTranslate、OpenAI互換は有効な利用者設定がないため自動ライブ試験していません。
- AIによるプロンプト生成は初版の対象外です。
- V3ノードスキーマへの移行は、安定版APIと互換性要件を再評価してから行います。

## トラブルシューティング

- ノードが見つからない: `custom_nodes/ComfyUI-Prompt-Workbench/__init__.py`の位置を確認し、
  起動ログにimport errorがないか確認します。
- UIが表示されない: ブラウザを強制再読込し、`WEB_DIRECTORY = "./web"`が読まれているか
  確認します。STRING出力自体はUIなしでも動作します。
- 翻訳が失敗する: 設定したプロバイダーの環境変数、URL、利用上限を確認し、タグの翻訳
  ボタンから再試行します。
- モデルなし警告が誤っている: ComfyUIの`/object_info`または`/embeddings`取得が可能か
  確認してください。警告は実行を止めません。

## アンインストール

ComfyUIを終了し、`custom_nodes/ComfyUI-Prompt-Workbench`フォルダを別の場所へ退避するか
削除してから再起動します。既存ワークフローには未登録ノードとして残るため、必要なら
アンインストール前にSTRINGを別ノードへコピーしてください。

## ライセンス

本プロジェクトはMIT Licenseです。第三者由来データの表記は
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)を参照してください。
