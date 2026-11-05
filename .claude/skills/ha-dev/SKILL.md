---
name: ha-dev
description: hoshi-apps（HA）でアプリを新規作成・改造・一括改善するときの標準手順。「HAで〇〇アプリを作って」「HAの〇〇を直して」「HA全体を点検して直して」で使う。Fable の ha-builder（実装）と ha-reviewer（点検）を使い分け、機械検分を通してから PR にする。
---

# HA 開発手順（Fable 運用）

## 0. 前提
- 配信: main → GitHub Pages。作業は指定ブランチで行い、PR（下書き）経由で反映する。
- 道具（AI呼出0）:
  - `tools/ha_cleanroom_check.py <repo> <out>` … 全ページを 375/1280px で開き、開けない/横はみ出し/JSエラー/小さい文字/小さいタップを計測
  - `tools/ha_click_smoke.js <repo> <out.json> [app,...]` … 入力→全ボタン押下で JS エラーを拾う操作検分
  - `tools/ha_mobile_a11y_inject.py <repo>` … スマホ操作性ブロックを業務アプリへ冪等注入（`--remove` で撤去）
- CI（`.github/workflows/ha-check.yml`）が push/PR/毎晩 03:17 JST に上2つを回す。

## 1. 依頼の型を決める
| 型 | 進め方 |
|---|---|
| 新規アプリ | 仕様を1段落に要約 → ha-builder 1体 → apps.json に1エントリ追加（id, title, desc, icon, path, badge, biz=業務支援, date） |
| 既存アプリの改造 | 対象フォルダを限定して ha-builder 1体 |
| 全体の一括改善 | まず機械検分で対象を列挙 → アプリを重ならないように3〜5グループに分け、ha-builder を並行起動（各自のフォルダしか触らせない） |

## 2. 実装（ha-builder, model: fable）
- 渡すもの: 対象フォルダ、やること、受け入れ条件（例: click_smoke の pageerror 0）。
- 並行時は「担当フォルダ以外を編集しない」「コミットしない」を必ず書く。

## 3. 点検（ha-reviewer, model: fable）
- 実装と独立した目で `git diff` と実動作を確認。指摘「高」は直してから進む。
- 小さな修正（数行）は点検を省略してよい。データ形式に触れる変更は必ず点検する。

## 4. 統合と PR（メインのセッション）
1. `node tools/ha_click_smoke.js . /tmp/s.json` と `python3 tools/ha_cleanroom_check.py . /tmp/c` を通す（横はみ出し0・開けない0・新規 pageerror 0）。
2. 375px のスクリーンショットで前後比較（主要画面だけ）。
3. 利用者目線の要約でコミット → push → 下書き PR。マージは干場さんの判断。

## 5. 費用の目安
- ha-builder 1体あたり 1アプリの不具合修正で数万トークン。全体一括は「機械検分で対象を絞ってから」配る。
- Google Drive の大量移動のように1件ずつ許可が要る操作は、この手順の対象外。
