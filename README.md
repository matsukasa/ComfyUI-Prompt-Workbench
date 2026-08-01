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
- 0.05 / 0.1 / 0.25刻みの重み調整（LoRA強度は変更しません）
- Ctrl / Cmd・Shift・チェックボックスによる複数選択と一括操作
- ブラウザセッション内のUndo / Redo
- 原文・翻訳・状態・種別・重複・ブラックリストによる絞り込み
- 重複検出と選択タグの一括操作
- 大分類・中分類・小分類によるカテゴリー管理とユーザータグの追加・編集・削除
- 出典付き内蔵プロンプト例115カテゴリー・3,595項目、日本語・英語検索、一括追加
- ローカル辞書、LibreTranslate、DeepL、OpenAI互換の翻訳アダプター
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
7. 最下部の`例から追加`でカテゴリーや英語 / 日本語を検索し、タグ例を追加します。
8. `prompt`出力を必要なノードのSTRING入力へ接続します。

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

## 内蔵例の出典

内蔵例は `Physton/sd-webui-prompt-all-in-one` の
`group_tags/default.yaml`と`group_tags/ja_JP.yaml`から、`人物 / 二次元キャラクター`
の62項目と漢服カテゴリー149項目を除いた115グループ・3,595項目を変換しました。取得元コミット、変更内容、MITライセンスは
[第三者表記](THIRD_PARTY_NOTICES.md)に記録しています。

元プロジェクトと作者のPhyston氏、タグデータ貢献者に感謝します。

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
