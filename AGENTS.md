# AGENTS.md instructions for ComfyUI-Prompt-Workbench

このファイルは、このリポジトリで作業する Codex へのプロジェクト固有ルールです。
共通の個人ルールに加えて、ここに書いた内容を優先して守ってください。

## 作業対象の境界

- ソースリポジトリと Stability Matrix の live install は、常に別々の checkout として扱う。
  - ソース: `D:\自作ComfyUIカスタムノード\ComfyUI-Prompt-Workbench`
  - live install: `D:\Stability Matrix\Data\Packages\ComfyUI\custom_nodes\ComfyUI-Prompt-Workbench`
- ソース側の `git status`、テスト、差分確認だけでは live install の検証完了とは言わない。
- 「ローカルも最新版」「Stability Matrix側も更新」「実インストール先も更新」と言われたら、live install の更新と検証も作業範囲に含める。
- live install に未コミット変更がある場合は、上書き・pull・merge の前に変更ファイル、影響範囲、退避方法を示す。必要なら `git stash push -u` で退避してから更新する。
- Prompt Workbench のカタログ、タグセット、Registry、UI、または live install を扱う作業では、調査段階から `prompt-workbench-guard` を使う。特に指定がない限り、カタログとタグセット確認の正はソースリポジトリ側とする。

## Windows / UTF-8

- Windows PowerShell では Bash 形式の heredoc（例: `python - <<'PY'`）を使わない。複数行の Python / Node 処理が必要な場合は、PowerShell の here-string、既存スクリプト、または `apply_patch` で作った一時スクリプトを使う。
- 日本語を含む JSON、Markdown、locale、catalog、tag set を読む・書く・テストするときは `windows-utf8-json` を使い、Python では `PYTHONUTF8=1` または `encoding="utf-8"` / `encoding="utf-8-sig"` を明示する。
- PowerShell のコマンド文字列に日本語データを直接埋め込んで書き込まない。文字化けや `?` 置換が疑われる場合は、JSON parse だけでなく代表値のコードポイントや `U+FFFD` / `??` 混入も確認する。
- Windows で `Get-Content` や差分出力に `繝`、`縺`、`蜒`、`譛`、`�` などの文字化けが見えた場合は `windows-mojibake-guard` を使い、その出力を編集根拠にしない。ASCII の関数名・ID・クラス名で位置を取り直すか、UTF-8 検査スクリプトで確認してから編集する。

## GitHub 同期

- `githubにアップロードして`、`コミットしてアップロードして`、`マージして`、`同期して` と言われたら、次を標準手順にする。
  1. `git status --short --branch` と差分を確認する。
  2. 変更対象が依頼範囲だけか確認する。
  3. 近いテスト、構文チェック、`git diff --check` を実行する。
  4. 明示的な依頼がある場合だけ `git commit` / `git push` を行う。
  5. push 後は local HEAD と remote HEAD を照合する。
  6. live install の更新も依頼されている場合は、source と live のコミット・主要ファイル hash を照合する。
- commit / push / workflow dispatch / Registry publish を実行したかどうかは、完了報告で明確に分けて書く。
- GitHub に載せる候補確認では `git ls-files -o --exclude-standard` を使う。`.gitignore` と `.comfyignore` の役割を混同しない。

## Comfy Registry

- Registry では、アップロード成功、バージョン審査状態、Active 化、ComfyUI-Manager からのインストール可否を別々に扱う。
- `Upload successful` や GitHub Actions 成功だけで Registry 公開完了とは言わない。
- `NodeVersionStatusPending`、`NodeVersionStatusFlagged`、`NodeStatusActive`、`latest_version`、install API の結果を混同しない。
- Pending / Flagged のものを Active と報告しない。
- Registry 状態を確認するときは、公式 API の `/nodes/{id}`、`/nodes/{id}/versions`、`/nodes/{id}/install` など現在の応答を確認し、推測で原因や数字を断定しない。

## カタログと同梱物

- Registry 同梱版は SFW / 一般タグを既定とし、成人向け・フルカタログを明示なしに Registry ZIP へ入れない。
- GitHub / ローカル / live install のフルカタログと、Registry 用 SFW カタログの目的を分けて扱う。
- `data/tag_catalog.json`、`data/sfw_tag_catalog.json`、`data/nsfw_full_tag_catalog.json` を変更するときは、事前に次を示す。
  - 対象ファイル
  - 変更件数
  - 重複・衝突リスク
  - バックアップまたは rollback 方法
  - 検証方法
- 大規模なタグ追加、分類変更、重複削除、SFW/NSFW 境界変更は、候補一覧と代表的な除外例を提示し、明示承認後にだけ書き込む。
- 重複検査では、trim、空白と `_` の揺れ、大文字小文字を正規化して比較する。変更後にも再検査する。
- catalog JSON は既存 schema、階層、ID、翻訳、CRLF / BOM 方針をできるだけ保つ。

## live 検証

- source と live install を同期した後は、少なくとも次を確認する。
  - source と live の HEAD または主要ファイル hash
  - `routes.py` / `__init__.py` の Python 構文
  - 主要 JavaScript の `node --check`
  - source 側で利用可能なら `npm test`
- ComfyUI が起動中で API 確認できる場合は、`/system_stats`、`/object_info/PromptWorkbench`、関連 web asset の HTTP 応答を確認する。
- UI 変更では、`npm run build` や構文チェックを「表示・操作確認」と混同しない。変更したコントロールをブラウザで確認していない場合は、未確認として明記する。
- ブラウザ UI、ComfyUI runtime、live install、Registry Active 状態は別々の確認項目として扱う。確認できた範囲と未確認の範囲を完了報告で分ける。

## 完了報告

- 完了報告では、次を分けて簡潔に書く。
  - 変更点
  - 対象ファイル
  - GitHub / Registry / live install の状態
  - 確認したこと
  - 未確認なこと
- Registry の状態や download 数は、確認日時と取得元 API を明記する。
