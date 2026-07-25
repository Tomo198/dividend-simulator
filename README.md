# 分配金・配当シミュレーター

ETF・高配当株の手取り配当、資産の推移、目標額を試算する独立Webアプリです。既存の積立・取り崩しシミュレーターやLIFECompassとは統合しません。

現在はフェーズ5Dまで完了しています。画面は円建てで、年間配当を12で割った月平均を表示します。単一銘柄の将来試算、目標からの逆算、1〜3銘柄の比較、端末内保存、JSONバックアップに対応しています。フェーズ5Dでは機能を変えず、見出し・入力ラベル・補足・結果名・注意書きを短く分かりやすい日本語へ統一しました。

## 必要環境

- Node.js `>=22.13.0`

## 起動

```bash
npm ci
npm run dev
```

ローカルURLは通常 `http://localhost:3000/` です。

## 検証

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

`npm run verify`でlint、型チェック、テストをまとめて実行できます。

## 構成方針

- React + TypeScript + Vite互換のvinext構成
- ルーティングはApp Routerを利用
- 計算ロジックは `src/domain/dividend-simulator/` に実装し、UIから分離
- 単一銘柄UIは `app/simulator.tsx` に実装し、入力変更時に同じ計算エンジンを呼び出す
- 目標逆算UIは `app/target-results.tsx` に分離し、税引前・税引後のどちらも同じ購入・税計算を再利用する
- 比較UIは `app/comparison-workspace.tsx`、比較の集約ロジックは `src/domain/dividend-simulator/compare.ts` に分離する
- 名前付き保存とJSONバックアップのUIは `app/workspace-save-panel.tsx`、保存・バックアップのスキーマと一覧操作は `app/workspace-storage.ts` に分離する
- UIから計算式を直接呼ばず、ドメイン関数の結果だけを表示
- 保存とJSONバックアップは端末内だけで処理し、D1、R2、認証、外部API、クラウド保存、URL共有は使用しない
- グラフは追加ライブラリを使わず、既存の軽量SVGコンポーネントを再利用

## 仕様変更

改善や矛盾が見つかった場合は、先に `docs/product-spec.md` を更新して合意し、その後でコードとテストへ反映します。設計書にない機能は追加しません。

正式仕様は [docs/product-spec.md](docs/product-spec.md)、作業ルールは [AGENTS.md](AGENTS.md) を参照してください。
