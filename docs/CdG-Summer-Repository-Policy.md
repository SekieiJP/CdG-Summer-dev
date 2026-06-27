# CdG-Summer-dev リポジトリ資産管理方針

> 対象リポジトリ: `SekieiJP/CdG-Summer-dev`
> 目的: 前作「カードで学習塾 春期講習編」の開発データを参照しつつ、続編「カードで学習塾 夏期講習編」の成果物だけを安全に GitHub 管理する。

---

## 1. 基本方針

この作業フォルダには春期講習編のコード、データ、検証ログ、solver 出力、GAS、既存ドキュメントが多く残っている。これらをそのまま `SekieiJP/CdG-Summer-dev` にアップロードすると、夏期講習編として未整理の実装・ログ・旧仕様が混在するため、初期公開対象にはしない。

`CdG-Summer-dev` は **夏期講習編の開発成果物を管理するリポジトリ** とし、春期資産は以下のどちらかで扱う。

- 夏期仕様に必要なものだけを選別してコピーし、夏期側のファイルとして管理する。
- コピー前の春期資産はローカル参照元または別リポジトリ参照として保持し、GitHub には含めない。

---

## 2. 資産分類

| 区分 | 扱い | 例 |
|---|---|---|
| S0: 夏期一次成果物 | GitHub 管理する | `docs/CdG-Summer-Spec.md`, `docs/CdG-Summer-Overview.txt`, `docs/CdG-Summer-OpenQuestions-answer.txt`, 本方針文書 |
| S0: 夏期公開モック | GitHub 管理する | `public/index.html`, `tests-public/`, `.github/workflows/static.yml` |
| S1: 夏期 Pages 公開ゲーム | GitHub 管理する | `game/index.html`, `game/js/`, `game/css/`, `game/data/` |
| S2: 非公開の参照資産 | 参照のみ。Pages artifact に含めない | `Spring-resource/`, `solver/`, `gas/`, 開発用 docs・テスト・設定 |
| S3: 春期固有・検証生成物 | 原則 GitHub 管理しない | `solver/`, `gas/`, `playwright-report/`, `test-results/`, `game/releaseNote.html`, 春期ルールブック |
| S4: ローカル・環境依存 | GitHub 管理しない | `.DS_Store`, `node_modules/`, `ga4tag.txt`, 一時ツール |

---

## 3. 推奨する初期リポジトリ構成

初期コミットは、実装移植前の「夏期仕様管理リポジトリ」として小さく作る。

```text
CdG-Summer-dev/
├── .github/
│   └── workflows/static.yml        # GitHub Pages は _site を組み立てて root と /game/ を公開
├── AGENTS.md
├── docs/
│   ├── CdG-Summer-Overview.txt
│   ├── CdG-Summer-OpenQuestions.txt
│   ├── CdG-Summer-OpenQuestions-answer.txt
│   ├── CdG-Summer-Spec.md
│   ├── CdG-Summer-Repository-Policy.md
│   └── CdG-Summer-Implementation-Plan.md
├── public/
│   └── index.html                  # 全体フロー確認用UIモック
├── tests-public/
│   └── mock-flow.spec.js           # UIモックの最小E2E
├── package.json
├── package-lock.json
├── playwright.config.js
└── README.md
```

Pages 公開では `public/` をルート `/`、`game/` を `/game/` として artifact に詰める。UIモックとその検証は `public/` と `tests-public/` で管理し、`game/` は夏期実装本体として公開する。一方で `Spring-resource/` はローカル参照専用とし、Pages artifact に含めない。

---

## 4. 春期資産の参照方法

### 4.1 ローカル参照元を残す

`Spring-resource/` のような春期由来ファイル群は、夏期実装中の参照元としてローカルに残してよい。ただし GitHub Pages の公開物には含めない。

推奨:

- 現在のフォルダを参照兼作業フォルダとして使う場合、GitHub へ push する前に公開対象を必ず `git status` と差分で確認する。
- より安全に進める場合、別の空フォルダに `CdG-Summer-dev` を作り、必要ファイルだけをコピーして GitHub に接続する。
- 春期参照一式を同じフォルダ内に置く場合は、`_spring-reference/` のようなローカル専用ディレクトリに退避し、`.gitignore` で除外する。

### 4.2 コピー時のルール

春期から夏期へコピーする場合は、ファイル単位で目的を明確にする。

- カードCSVは、回答済み仕様どおり `cards_fresh.csv` / `cards_pro.csv` を夏期でも流用する。
- ランクCSVは春期 `rankFresh.csv` / `rankPro.csv` を直接使わず、`rankSummerFresh.csv` / `rankSummerPro.csv` として新設する。
- JS/CSS/HTML は春期版をそのまま公開せず、夏期のフェーズ、8山札、スタッフ別講習デッキ、講習期トークンに対応させてから追加する。
- `solver/` のシミュレーション結果は設計参考に留め、必要な知見だけを新しい夏期設計メモへ要約する。
- `gas/` と `ga4tag.txt` は配信方式・計測方針が夏期用に確定するまで公開しない。

---

## 5. GitHub へ載せないもの

初期状態では以下を push 対象から外す。

- 春期版 `tests/` のE2E一式
- `solver/` 配下の探索ログ、JSON、スコア記録、分析メモ
- `gas/` 配下の春期用 Apps Script
- `playwright-report/`, `test-results/`
- `node_modules/`
- `.DS_Store`
- `ga4tag.txt`
- 春期ルールブック、春期 release note、春期 tutorial

これらを夏期で使う場合は、別名の夏期成果物として作り直すか、必要な部分だけをコピーしてレビュー可能な差分にする。

---

## 6. 作業フロー

1. `docs/CdG-Summer-Spec.md` を夏期仕様の正本として更新する。
2. 夏期の公開対象ファイルだけを初期コミットに含める。
3. 春期コードを参照して、夏期用 `game/` を小さい単位で作る。
4. コピーした資産は、PRまたはコミット説明で「春期からコピー」「夏期用に変更」「新規作成」を区別する。
5. 実装が進んだら、`tests/` は春期テストをそのまま持ち込まず、夏期の13ターン構成・講習期準備・SR/SSR復活・講習期トークンに合わせて再作成する。

---

## 7. push 前チェックリスト

- `git status --short` で春期固有ファイルが混ざっていないこと。
- `solver/`, `gas/`, `playwright-report/`, `test-results/`, `node_modules/`, `.DS_Store` が含まれていないこと。
- `game/` を Pages へ含める場合、公開対象が `game/index.html`, `game/js/`, `game/css/`, `game/data/` に閉じており、`Spring-resource/` を参照していないこと。
- `rankSummerFresh.csv` / `rankSummerPro.csv` が、春期 rank CSV の単純流用ではなく夏期用として扱われていること。
- `ga4tag.txt` や計測IDなど、公開可否の確認が必要な値を含めていないこと。
- `docs/CdG-Summer-Spec.md` と `docs/CdG-Summer-OpenQuestions-answer.txt` の用語が一致していること。

---

## 8. 現時点の判断

現時点では、`SekieiJP/CdG-Summer-dev` には **ドキュメント中心の最小構成で開始** するのがよい。春期資産はローカル参照元として残し、夏期仕様に必要なファイルだけを段階的にコピーする。

現時点では、ルート `/` は `public/` のモック、`/game/` は夏期実装本体として公開する。`Spring-resource/` と開発補助ファイル群は引き続き非公開の参照資産として扱う。
