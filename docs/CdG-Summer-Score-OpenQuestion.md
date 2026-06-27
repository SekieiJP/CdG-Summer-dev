# 夏期スコア仕様確認メモ

**ステータス**: 解決済み

## 背景

- `docs/CdG-Summer-Spec.md` §19.2 の擬似コードは、PRO結果計算が経理を含む5観点採点に見える。
- 一方で、仕様本文の「春期準拠」、`Spring-resource/CdG-Spring-dev/game/js/scoreManager.js`、`game/data/rankSummerPro.csv` は、PROを4観点採点として扱っている。
- 4観点の内訳は、動員 / 退塾 / 入退差 / 満足。
- FRESHは春期準拠アルゴリズムで矛盾がなく、この質問の対象外。

## 質問

夏期PROの結果計算は、どちらを正としますか。

### 選択肢A

春期実装 / 既存CSV準拠の4観点採点にする。  
対象観点: 動員 / 退塾 / 入退差 / 満足  
既存の `game/data/rankSummerPro.csv` をそのまま利用できる。

### 選択肢B

経理を独立加点した5観点採点にする。  
この場合は、経理スコア列・各観点閾値・総合ランク閾値の再定義が必要。

## 推奨

**A** を推奨。  
理由: 仕様本文の春期準拠方針、Spring-resource実装、既存 `rankSummerPro.csv` が一致しており、差分が最小のため。

## 回答

- 決定: **選択肢A: 春期と同じ4観点評価**
- 決定日: **2026-06-27**
- 決定理由: 仕様本文の春期準拠方針、`Spring-resource/CdG-Spring-dev/game/js/scoreManager.js`、既存の `game/data/rankSummerPro.csv` がいずれも4観点評価で整合しており、差分を最小にできるため。

## 決定内容

- PRO称号は、`game/data/rankSummerPro.csv` の称号列を正として扱う。

## 関連ファイル

- `docs/CdG-Summer-Spec.md`
  - §9 ゲーム終了処理とスコア計算
  - §19 スコア計算アルゴリズム
  - §19.2 難易度別擬似コード
- `Spring-resource/CdG-Spring-dev/game/js/scoreManager.js`
- `Spring-resource/CdG-Spring-dev/game/README.md`
  - 「ランクシステム（PRO）」
- `game/data/rankSummerPro.csv`
