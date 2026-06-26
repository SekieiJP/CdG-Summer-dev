# CdG-Summer-dev

「カードで学習塾 夏期講習編」の開発リポジトリです。

この作業フォルダには前作「春期講習編」のコードや検証データが残っていますが、GitHub 上の `SekieiJP/CdG-Summer-dev` では夏期講習編の成果物だけを管理します。春期由来のファイルは参照元として扱い、必要なものだけを夏期仕様に合わせてコピー・改修します。

## 主要ドキュメント

- [リポジトリ資産管理方針](docs/CdG-Summer-Repository-Policy.md)
- [夏期講習編 仕様書](docs/CdG-Summer-Spec.md)
- [実装計画](docs/CdG-Summer-Implementation-Plan.md)
- [不明事項回答](docs/CdG-Summer-OpenQuestions-answer.txt)

## 公開対象

GitHub Pages は `.github/workflows/static.yml` で `public/` だけを公開します。春期由来の `game/`, `solver/`, `gas/` などは公開対象に含めません。

現在の `public/index.html` は、夏期講習編のゲーム全体フローを確認するためのUIモックアップです。

## 初期整備方針

1. 仕様と実装計画を `docs/` に集約する。
2. UIモックアップは `public/` に置き、Pagesで確認可能にする。
3. 春期コードは直接公開せず、夏期実装に必要な単位で改修済みファイルとして追加する。
4. ランクCSVは春期版を直接使わず、`rankSummerFresh.csv` / `rankSummerPro.csv` として夏期用に新設する。
