# ComfyUI-Prompt-Workbench

単一のPromptをタグ単位で編集する、ComfyUI用カスタムノードです。
標準の複数行STRINGウィジェットを実行時の正本として保ちつつ、ノード内に
並べ替え・無効化・重み調整・翻訳・検索などの編集UIを追加します。

> [!IMPORTANT]
> 本プロジェクトは `sd-webui-prompt-all-in-one` の作者によるComfyUI版では
> ありません。ユーザー体験を調査し、ComfyUI向けに独立して再設計したものです。

## スクリーンショット

スクリーンショットはまだ収録していません。ComfyUI実機での最終確認後、
`docs/images/prompt-all-in-one.png` へ追加する予定です。

## 主な機能

- 単一プロンプトを編集し、接続先を限定しないSTRINGとして出力
- 括弧・引用符・エスケープを追跡するステートマシン型パーサー
- タグのドラッグ並べ替え、インライン編集、無効化、削除、コピー
- ノード内ではComfyUI標準の右クリックメニューを抑止し、タグ専用メニューと入力欄の文字編集メニューだけを表示
- 0.05 / 0.1 / 0.25刻みの重み調整（LoRA強度は変更しません）
- Ctrl / Cmd・Shift・チェックボックスによる複数選択と一括操作
- ブラウザセッション内のUndo / Redo
- 原文・翻訳・状態・種別・重複・ブラックリストによる絞り込み
- 重複検出と選択タグの一括操作
- 大分類・中分類・小分類によるカテゴリー管理とユーザータグの追加・編集・削除
- Danbooru公式APIから生成する14大分類のタグカタログ、英語タグ名・日本語分類名検索、一括追加
- 無料自動翻訳（ローカル辞書→MyMemory）、完全オフライン辞書、LibreTranslate、DeepL、OpenAI互換の翻訳アダプター
- 原文 / 日本語 / 両方の表示切り替えと、選択・全体をまとめた翻訳メニュー
- 完全一致・大小文字無視・部分一致・正規表現ブラックリスト
- LoRA、LyCORIS、Embedding、Wildcard、Dynamic Prompt、BREAKの識別
- TXT / 状態JSONのインポート・エクスポート（1 MB上限）
- ComfyUIのライト / ダークテーマ追従とタグ種別ごとの色設定

プロンプト履歴、お気に入り、お気に入りフォルダ、それらの保存データやUIは
意図的に実装していません。

## インストール

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

### ComfyUI Manager登録前の手動インストール

まだManagerレジストリへ登録していません。公開Git URLがある場合は
`custom_nodes`でcloneし、ない場合はフォルダを手動コピーしてください。
`requirements.txt`の追加インストールは不要です。

## 使い方

1. ノード検索で `Prompt Workbench` を追加します。
2. 上部の本文欄または追加欄へタグを入力します。
3. 本文欄は`Ctrl+Enter`または`タグへ反映`、追加欄はEnterで確定します。
4. タグボタンをドラッグして順序を変更し、クリックで有効 / 無効を切り替えます。
5. ダブルクリックで編集、Ctrl / CmdまたはShift+クリックで複数選択、右クリックで
   重み・翻訳・コピー・移動・削除を操作します。
6. `表示`で原文 / 日本語 / 両方を切り替え、`翻訳`メニューから選択タグまたは全タグを翻訳します。
7. 最下部の`タグを追加`を開き、カテゴリーや英語 / 日本語を検索してタグを追加します。
8. 設定のタグ管理では、タグ行左端の`⋮⋮`をドラッグして小分類内の表示順を変更できます。
9. 編集したタグ集を残す場合は、タグ管理上部で名前を入力して`別名で保存`します。
10. `prompt`出力を必要なノードのSTRING入力へ接続します。

無効タグはUI状態としてワークフローに残りますが、STRING出力からは除外されます。
ブラウザ拡張が読み込めないAPI / ヘッドレス実行では、保存済みSTRINGがそのまま
出力されます。

## 入力と同期

タグボタンや追加操作は対応する標準STRINGウィジェットへ即時反映されます。本文欄を
直接編集した場合は、IME入力中の誤解析を避けるため明示的な反映操作を行います。ワークフロー
読込や外部操作でSTRING値が変わった場合も、エディターが変更を検出して再解析します。
完全なタグ状態はバージョン付き`node.properties.promptAllInOneState`へ保存され、
実行用STRINGとは分離されます。

## 翻訳設定

日本語への翻訳は、選択したプロバイダーに関係なく最初に内蔵辞書と保存済みタグの
日本語訳を使い、見つからないタグだけを外部翻訳へ送信します。既定の
「無料翻訳（辞書→MyMemory）」では不足分をMyMemoryへ送信します。
外部送信を行わない場合は「ローカル辞書のみ」を
選択してください。Google Cloud Translationの公式APIは無料枠がありますが、
Google Cloudプロジェクトと認証設定が必要なため、無設定の既定値にはしていません。

APIキーはノード、ワークフロー、ブラウザ設定へ保存しません。ComfyUIを起動する
プロセスの環境変数で設定してください。

| Provider | Environment variables |
| --- | --- |
| Local dictionary | 不要 |
| LibreTranslate | `PROMPT_AIO_LIBRE_URL`、任意で`PROMPT_AIO_LIBRE_API_KEY` |
| DeepL | `PROMPT_AIO_DEEPL_API_KEY`、任意で`PROMPT_AIO_DEEPL_URL` |
| OpenAI互換 | `PROMPT_AIO_OPENAI_API_KEY`、`PROMPT_AIO_OPENAI_MODEL`、任意で`PROMPT_AIO_OPENAI_BASE_URL` |

PowerShellで現在の起動プロセスだけへ設定する例（値は表示・Git保存しないでください）：

```powershell
$env:PROMPT_AIO_DEEPL_API_KEY = "your-key"
```

設定後、同じPowerShellからComfyUIを起動します。入力サイズ制限、30秒以内の
タイムアウト、同時実行数制限、簡易レート制限、メモリ内キャッシュを実装しています。
詳細は[翻訳プロバイダー](docs/translation-providers.md)を参照してください。

## 名前付きタグファイル

設定の`タグ管理`上部から、編集結果を新しい名前のJSONファイルとして保存できます。
同名ファイルは上書きせず、別名を求めます。ファイル選択後に`読み込む`を押すと、
そのファイルだけをタグ集として使用します。保存済みワークフローが指定している
ファイルが存在しない場合に限り、内蔵デフォルトへフォールバックします。存在する
指定ファイルが破損している場合は、データの取り違えを避けるため読込エラーにします。

通常のComfyUIでは、名前付きファイルをComfyUIユーザーディレクトリ内の
`prompt_workbench/tag_catalogs/`へ保存します。ファイル名には文字・数字・空白・
ハイフン・アンダースコアを使用でき、パス区切りやWindows予約名は使用できません。
編集中の差分がある状態では別ファイルへの切替を止めるため、先に`別名で保存`してください。

## Danbooruタグカタログ

更新ツールはDanbooru公式のTags、Wiki、Aliases、Implications APIだけを参照し、
Generalカテゴリの現行タグを14大分類へ分類します。各小分類は投稿数順の20タグで、
20件に満たない小分類は同じ中分類内でだけ統合します。「成人向け表現」も通常の
大分類として常時表示されます。タグボタンには正式な英語タグ名だけを表示し、
投稿数・順位・カテゴリパスは表示しません。

通常のComfyUI利用時はローカルJSONだけを読み、Danbooruへ通信しません。更新時だけ
次のコマンドを実行します。

Windowsでは`tools/run_danbooru_update.cmd`をダブルクリックすると、資格情報
ダイアログへDanbooruユーザー名とAPIキーを入力できます。APIキーは伏せ字で入力され、
ファイルやログへ保存せず、更新プロセス終了時に環境変数から除去されます。

コマンドラインから実行する場合は次のとおりです。

```powershell
python -m pip install -r tools/requirements.txt
python tools/update_danbooru_tag_catalog.py --refresh
python tools/validate_danbooru_tag_catalog.py
```

認証なしでも取得できます。任意のBasic認証を使う場合は、ComfyUIやGitへ値を保存せず、
更新を実行するプロセスの環境変数`DANBOORU_USERNAME`と`DANBOORU_API_KEY`へ設定します。
更新ツールは固有User-Agent、4 req/s以下、タイムアウト、429・5xx再試行、ページキャッシュ、
原子的保存を使用します。取得または検証に失敗した場合、完成済みカタログは上書きしません。

生成物はUI用`data/danbooru_tag_catalog.json`、監査用
`data/danbooru_tag_catalog_full.json`、確認用`docs/danbooru_tag_catalog.md`です。
API仕様変更時はDanbooru公式の[APIヘルプ](https://danbooru.donmai.us/wiki_pages/help:api)、
[Tags](https://danbooru.donmai.us/wiki_pages/api:tags)、
[Wiki](https://danbooru.donmai.us/wiki_pages/api:wiki_pages)、
[Aliases](https://danbooru.donmai.us/wiki_pages/api:tag_aliases)、
[Implications](https://danbooru.donmai.us/wiki_pages/api:tag_implications)を確認してください。

### GitHub Actionsで更新する

ローカル回線がCloudflare Challengeで遮断される場合は、プライベートリポジトリの
`Update Danbooru tag catalog`ワークフローを手動実行できます。

1. GitHubの`Settings`→`Secrets and variables`→`Actions`を開きます。
2. Repository secretsへ`DANBOORU_USERNAME`と`DANBOORU_API_KEY`を登録します。
3. `Actions`→`Update Danbooru tag catalog`→`Run workflow`を実行します。
4. 成功後、実行ページのArtifactsから`danbooru-tag-catalog`をダウンロードします。
5. 展開した`data`と`docs`の3ファイルを同じ相対位置へ配置し、検証コマンドを実行します。

ワークフローは手動実行専用で、リポジトリ内容の書き込み権限を持ちません。Secretsは
公式API取得ステップだけへ渡し、生成物には含めません。Artifactの保存期間は7日です。

現在の配布ツリーには、公式API取得に成功するまで旧`prompt_examples.json`を読み込む
安全なフォールバックがあります。公式カタログの生成に成功すると、既存の
`/prompt_all_in_one/examples` URLの返却元だけが自動的に新JSONへ切り替わります。
旧データの出典とライセンスは[第三者表記](THIRD_PARTY_NOTICES.md)に記録しています。

## セキュリティ

- ユーザー文字列は`innerHTML`へ渡さず、フォーム値または`textContent`で描画
- APIキーはサーバープロセスの環境変数だけから取得
- インポートJSONはスキーマ、件数、文字列長、1 MB上限を検証
- 正規表現は長さ制限と危険なネスト量指定子の簡易拒否を実施
- 翻訳URLはサーバー管理者が設定したHTTP(S)環境変数だけを使用
- `eval`、`new Function`、任意コード実行機構は不使用

## テスト

```powershell
npm.cmd test
python -m unittest discover -s tests -p 'test_*.py' -v
```

Node.jsは本体の実行には不要で、JavaScriptテストを実行するときだけ必要です。

## 既知の制限

- ComfyUIのモデル一覧形式は構成により異なります。取得に失敗しても編集は使えますが、
  LoRA / Embeddingの存在警告は表示されない場合があります。
- 素のEmbedding名は通常タグと区別できないため、確実な識別には`embedding:name`形式を
  使用してください。
- 大量タグは250件ずつ段階表示します。これは完全な仮想スクロールではありません。
- DeepL、LibreTranslate、OpenAI互換は有効な利用者設定がないため自動ライブ試験していません。
- Danbooru公式APIがCloudflare Challengeを返す環境ではカタログ更新を完了できません。
  非公式一覧や古いCSVへは自動的に切り替えません。
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
