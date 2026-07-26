"use client";

import { useMemo } from "react";
import {
  compareSimulationInputs,
  validateSimulationInput,
  type ComparisonAssetResult,
  type ComparisonHighlights,
  type ComparisonResult,
} from "@/src/domain/dividend-simulator";
import { LineChart, type ChartPoint, type ChartSeries } from "./charts";
import {
  annualizeComparisonTarget,
  buildComparisonInputs,
  createNextComparisonAsset,
  type CompareWorkspaceValues,
  type ComparisonAssetValues,
} from "./compare-model";
import { NumberField, SelectField } from "./form-fields";
import { calculateAnnualDividend, calculateYieldPercent, type TaxTreatment } from "./simulator-model";

interface ComparisonWorkspaceProps {
  value: CompareWorkspaceValues;
  onChange: (value: CompareWorkspaceValues) => void;
  onOpenSingle: (assetId: string) => void;
}

const jpyFormatter = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});
const numberFormatter = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 6 });
const formatJpy = (value: number) => jpyFormatter.format(Math.round(value));
const formatPercent = (value: number | null) => value === null ? "算出不可" : `${(value * 100).toFixed(2)}%`;
const formatCompactJpy = (value: number) => {
  const absolute = Math.abs(value);
  if (absolute >= 100_000_000) return `${Number((value / 100_000_000).toFixed(2))}億円`;
  if (absolute >= 10_000) return `${Number((value / 10_000).toFixed(1))}万円`;
  return `${Math.round(value).toLocaleString("ja-JP")}円`;
};

const CHART_COLORS = ["#0b7a55", "#316b9b", "#d39a2d"];

function formatReachedMonth(monthIndex: number | null): string {
  if (monthIndex === null) return "期間内に届かない";
  const totalMonths = monthIndex + 1;
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  if (years === 0) return `${months}か月目`;
  if (months === 0) return `${years}年目`;
  return `${years}年${months}か月目`;
}

function taxTreatmentLabel(value: TaxTreatment) {
  if (value === "foreignCredit") return "外国税控除あり";
  if (value === "noForeignCredit") return "外国税控除なし";
  if (value === "nisa") return "NISA";
  return "指定税率";
}

function buildComparisonChartData(result: ComparisonResult, value: "dividend" | "wealth"): ChartPoint[] {
  const rowCount = result.items[0]?.result.annual.length ?? 0;
  return Array.from({ length: rowCount }, (_, index) => {
    const point: ChartPoint = { label: `${index + 1}年` };
    result.items.forEach((item) => {
      const annual = item.result.annual[index];
      point[item.id] = value === "dividend"
        ? annual?.netDividendJpy ?? 0
        : annual?.endingTotalWealthJpy ?? 0;
    });
    return point;
  });
}

function highlightNames(ids: string[], result: ComparisonResult) {
  return ids.map((id) => result.items.find((item) => item.id === id)?.name ?? id).join("・");
}

interface MetricRow {
  label: string;
  values: string[];
  highlight?: keyof ComparisonHighlights;
}

function buildMetricRows(result: ComparisonResult): MetricRow[] {
  const values = (render: (item: ComparisonAssetResult) => string) => result.items.map(render);
  return [
    { label: "現在利回り", values: values((item) => formatPercent(item.initialYield)) },
    { label: "1年目の手取り配当", values: values((item) => formatJpy(item.firstYearNetDividendJpy)), highlight: "firstYearNetDividend" },
    { label: "経費率", values: values((item) => formatPercent(item.input.asset.costs.expenseRatio)), highlight: "lowestExpenseRatio" },
    { label: "5年目の手取り配当", values: values((item) => item.fifthYearNetDividendJpy === null ? "期間外" : formatJpy(item.fifthYearNetDividendJpy)) },
    { label: "10年目の手取り配当", values: values((item) => item.tenthYearNetDividendJpy === null ? "期間外" : formatJpy(item.tenthYearNetDividendJpy)), highlight: "tenthYearNetDividend" },
    { label: "期末年の手取り配当", values: values((item) => formatJpy(item.endingYearNetDividendJpy)) },
    { label: "累計受取配当", values: values((item) => formatJpy(item.result.summary.cumulativeCashDividendJpy)) },
    { label: "期末評価額", values: values((item) => formatJpy(item.result.summary.endingMarketValueJpy)) },
    { label: "受取配当込み資産", values: values((item) => formatJpy(item.result.summary.endingTotalWealthJpy)), highlight: "endingTotalWealth" },
    { label: "累積リターン", values: values((item) => formatPercent(item.result.summary.cumulativeTotalReturn)) },
    { label: "年率収益（入出金込み）", values: values((item) => formatPercent(item.result.summary.xirr)) },
    { label: "元本維持率", values: values((item) => formatPercent(item.result.summary.principalRetention)), highlight: "principalRetention" },
    { label: "1口価値維持率", values: values((item) => formatPercent(item.unitValueRetention)) },
    { label: "目標達成時期", values: values((item) => formatReachedMonth(item.targetReachedMonthIndex)), highlight: "fastestTarget" },
    {
      label: "期限内に必要な毎月積立",
      values: values((item) => item.requiredMonthlyContribution
        ? formatJpy(item.requiredMonthlyContribution.requiredMonthlyContributionJpy)
        : "算出不可"),
    },
    {
      label: "今、必要な投資額",
      values: values((item) => item.requiredTargetInvestment
        ? formatJpy(item.requiredTargetInvestment.requiredInvestmentJpy)
        : "算出不可"),
    },
    {
      label: "必要口数",
      values: values((item) => item.requiredTargetInvestment
        ? `${numberFormatter.format(item.requiredTargetInvestment.requiredShares)}口`
        : "算出不可"),
    },
  ];
}

export function ComparisonWorkspace({ value, onChange, onOpenSingle }: ComparisonWorkspaceProps) {
  const isSingle = value.assets.length === 1;
  const calculation = useMemo(() => {
    const inputs = buildComparisonInputs(value);
    const issues = inputs.flatMap((item) => validateSimulationInput(item.input)
      .map((issue) => `${item.name}: ${issue.message}`));
    const target = annualizeComparisonTarget(value.common.targetMonthlyJpy);
    if (!Number.isFinite(target) || target <= 0) issues.push("目標配当は1円以上で入力してください。");
    if (issues.length > 0) return { issues, result: null };
    return { issues, result: compareSimulationInputs(inputs, { targetNetAnnualDividendJpy: target }) };
  }, [value]);

  const result = calculation.result;
  const series: ChartSeries[] = result
    ? result.items.map((item, index) => ({
        key: item.id,
        label: item.name,
        color: CHART_COLORS[index],
      }))
    : [];
  const dividendChartData = useMemo(
    () => result ? buildComparisonChartData(result, "dividend") : [],
    [result],
  );
  const wealthChartData = useMemo(
    () => result ? buildComparisonChartData(result, "wealth") : [],
    [result],
  );
  const metricRows = result ? buildMetricRows(result) : [];

  const setCommon = <Key extends keyof CompareWorkspaceValues["common"]>(
    key: Key,
    fieldValue: CompareWorkspaceValues["common"][Key],
  ) => onChange({ ...value, common: { ...value.common, [key]: fieldValue } });

  const updateAsset = (id: string, update: (asset: ComparisonAssetValues) => ComparisonAssetValues) => {
    onChange({
      ...value,
      assets: value.assets.map((asset) => asset.id === id ? update(asset) : asset),
    });
  };

  const setAssetField = <Key extends keyof ComparisonAssetValues>(
    id: string,
    key: Key,
    fieldValue: ComparisonAssetValues[Key],
  ) => updateAsset(id, (asset) => ({ ...asset, [key]: fieldValue }));

  const setAssetPrice = (id: string, price: string) => updateAsset(id, (asset) => ({
    ...asset,
    currentPrice: price,
    initialYieldPercent: calculateYieldPercent(price, asset.annualDividendPerShare),
  }));
  const setAssetDividend = (id: string, dividend: string) => updateAsset(id, (asset) => ({
    ...asset,
    annualDividendPerShare: dividend,
    initialYieldPercent: calculateYieldPercent(asset.currentPrice, dividend),
  }));
  const setAssetYield = (id: string, yieldPercent: string) => updateAsset(id, (asset) => ({
    ...asset,
    initialYieldPercent: yieldPercent,
    annualDividendPerShare: calculateAnnualDividend(asset.currentPrice, yieldPercent),
  }));

  return (
    <main className="comparison-workspace" id="comparison">
      <section className="comparison-input-panel" aria-labelledby="comparison-input-title">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">比較条件</p>
            <h2 id="comparison-input-title">
              {isSingle ? "1銘柄を確認" : `${value.assets.length}銘柄を比較`}
            </h2>
          </div>
          <span className="auto-update" aria-live="polite">自動更新</span>
        </div>

        {isSingle ? (
          <div className="comparison-single-note">
            <strong>1銘柄モード</strong>
            <span>配当・資産・目標を確認します。順位は表示しません。</span>
          </div>
        ) : (
        <div className="comparison-strategy" aria-label="比較方法">
          <button
            type="button"
            className={value.mode === "sameInvestment" ? "active" : ""}
            onClick={() => onChange({ ...value, mode: "sameInvestment" })}
            aria-pressed={value.mode === "sameInvestment"}
          >
            <strong>投資額をそろえる</strong>
            <span>配当・資産・収益を比較</span>
          </button>
          <button
            type="button"
            className={value.mode === "sameTarget" ? "active" : ""}
            onClick={() => onChange({ ...value, mode: "sameTarget" })}
            aria-pressed={value.mode === "sameTarget"}
          >
            <strong>目標配当をそろえる</strong>
            <span>必要額・口数・達成時期を比較</span>
          </button>
        </div>
        )}

        <fieldset className="comparison-common-fields">
          <legend>{isSingle ? "投資条件" : "共通の投資条件"}</legend>
          <div className="field-grid comparison-common-grid">
            <NumberField label="初期投資" value={value.common.initialInvestmentJpy} onChange={(next) => setCommon("initialInvestmentJpy", next)} suffix="円" min="0" step="10000" />
            <NumberField label="毎月積立" value={value.common.monthlyContributionJpy} onChange={(next) => setCommon("monthlyContributionJpy", next)} suffix="円" min="0" step="1000" />
            <NumberField label="運用期間" value={value.common.years} onChange={(next) => setCommon("years", next)} suffix="年" min="1" max="50" step="1" />
            <NumberField label="配当の再投資" value={value.common.dividendReinvestmentRatePercent} onChange={(next) => setCommon("dividendReinvestmentRatePercent", next)} suffix="%" min="0" max="100" />
            <NumberField label="手取り配当の目標" value={value.common.targetMonthlyJpy} onChange={(next) => setCommon("targetMonthlyJpy", next)} suffix="円／月" min="1" step="1000" help="必要額・達成時期の計算に使用" />
          </div>
          <p className="comparison-fairness-note">
            {isSingle
              ? "価格の値動きは0%とし、配当・資産・目標を試算します。"
              : "すべての銘柄に同じ条件を使い、価格の値動きは0%とします。"}
          </p>
        </fieldset>

        <div className="comparison-asset-grid">
          {value.assets.map((asset, index) => (
            <article className="comparison-asset-card" key={asset.id}>
              <div className="comparison-asset-heading">
                <div>
                  <span>銘柄 {String.fromCharCode(65 + index)}</span>
                  <strong>{asset.assetName.trim() || "名称未設定"}</strong>
                </div>
                <div className="comparison-asset-actions">
                  <button
                    type="button"
                    className="comparison-detail-button"
                    onClick={() => onOpenSingle(asset.id)}
                  >
                    詳しく見る
                  </button>
                  {value.assets.length > 1 && (
                    <button
                      type="button"
                      className="comparison-remove-button"
                      onClick={() => onChange({ ...value, assets: value.assets.filter((row) => row.id !== asset.id) })}
                      aria-label={`${asset.assetName || `銘柄${index + 1}`}を比較から外す`}
                    >
                      外す
                    </button>
                  )}
                </div>
              </div>
              <label className="field field-full">
                <span className="field-label">銘柄名 <small>任意</small></span>
                <input type="text" value={asset.assetName} onChange={(event) => setAssetField(asset.id, "assetName", event.currentTarget.value)} />
              </label>
              <div className="field-grid comparison-asset-fields">
                <NumberField label="現在価格" value={asset.currentPrice} onChange={(next) => setAssetPrice(asset.id, next)} suffix="円／口" min="0" />
                <NumberField label="1口あたり年間配当" value={asset.annualDividendPerShare} onChange={(next) => setAssetDividend(asset.id, next)} suffix="円" min="0" />
                <NumberField label="現在利回り" value={asset.initialYieldPercent} onChange={(next) => setAssetYield(asset.id, next)} suffix="%" min="0" />
                <NumberField label="配当の年間変化" value={asset.stableDividendGrowthRatePercent} onChange={(next) => setAssetField(asset.id, "stableDividendGrowthRatePercent", next)} suffix="%" min="-99.99" />
                <SelectField label="口座・税" value={asset.taxTreatment} onChange={(next) => setAssetField(asset.id, "taxTreatment", next as TaxTreatment)}>
                  <option value="foreignCredit">課税口座（外国税控除あり）</option>
                  <option value="noForeignCredit">課税口座（外国税控除なし）</option>
                  <option value="nisa">NISA</option>
                  <option value="custom">税率を指定</option>
                </SelectField>
              </div>
              <details className="advanced-settings comparison-advanced">
                <summary><span>税・経費を設定</span><small>{taxTreatmentLabel(asset.taxTreatment)}</small></summary>
                <div className="advanced-body">
                  <div className="field-grid comparison-advanced-grid">
                    <NumberField label="外国税率" value={asset.foreignWithholdingRatePercent} onChange={(next) => setAssetField(asset.id, "foreignWithholdingRatePercent", next)} suffix="%" min="0" max="100" />
                    {asset.taxTreatment === "custom" && (
                      <>
                        <NumberField label="国内税率" value={asset.domesticTaxRatePercent} onChange={(next) => setAssetField(asset.id, "domesticTaxRatePercent", next)} suffix="%" min="0" max="100" />
                        <NumberField label="外国税の控除率" value={asset.foreignTaxCreditRatePercent} onChange={(next) => setAssetField(asset.id, "foreignTaxCreditRatePercent", next)} suffix="%" min="0" max="100" />
                        <SelectField label="国内税の対象額" value={asset.domesticTaxBaseMode} onChange={(next) => setAssetField(asset.id, "domesticTaxBaseMode", next as ComparisonAssetValues["domesticTaxBaseMode"])}>
                          <option value="afterForeignTax">外国税控除後</option>
                          <option value="grossDividend">配当全額</option>
                        </SelectField>
                      </>
                    )}
                    <NumberField label="経費率（信託報酬など）" value={asset.expenseRatioPercent} onChange={(next) => setAssetField(asset.id, "expenseRatioPercent", next)} suffix="%／年" min="0" max="100" />
                  </div>
                </div>
              </details>
            </article>
          ))}
        </div>
        {value.assets.length < 3 && (
          <button
            type="button"
            className="comparison-add-button"
            onClick={() => onChange({ ...value, assets: [...value.assets, createNextComparisonAsset(value.assets)] })}
          >
            {isSingle ? "＋ 比較する銘柄を追加" : "＋ 銘柄を追加"}
          </button>
        )}
      </section>

      <section className="comparison-results-panel" aria-labelledby="comparison-results-title">
        <div className="results-heading">
          <div>
            <p className="panel-kicker">結果</p>
            <h2 id="comparison-results-title">
              {isSingle
                ? `${result?.items[0]?.name ?? "1銘柄"}の詳細`
                : value.mode === "sameInvestment"
                  ? "投資額をそろえて比較"
                  : "目標配当をそろえて比較"}
            </h2>
          </div>
          <p className="assumption-summary">{isSingle ? "円換算・長期試算" : "円換算・総合順位なし"}</p>
        </div>

        {!result ? (
          <div className="validation-panel" role="alert">
            <h3>入力を確認</h3>
            <p>修正すると自動で更新されます。</p>
            <ul>{calculation.issues.slice(0, 12).map((issue) => <li key={issue}>{issue}</li>)}</ul>
          </div>
        ) : (
          <>
            {!isSingle && <section aria-labelledby="highlights-title">
              <div className="section-heading">
                <div>
                  <p className="panel-kicker">比較ポイント</p>
                  <h2 id="highlights-title">項目ごとのトップ</h2>
                </div>
                <p>同率はすべて表示します。</p>
              </div>
              <div className="comparison-highlight-grid">
                <article><span>1年目の手取り最大</span><strong>{highlightNames(result.highlights.firstYearNetDividend, result) || "該当なし"}</strong></article>
                <article><span>10年目の手取り最大</span><strong>{highlightNames(result.highlights.tenthYearNetDividend, result) || "期間外"}</strong></article>
                <article><span>期末総資産が最大</span><strong>{highlightNames(result.highlights.endingTotalWealth, result) || "該当なし"}</strong></article>
                <article><span>経費率が最小</span><strong>{highlightNames(result.highlights.lowestExpenseRatio, result) || "該当なし"}</strong></article>
                <article><span>目標達成が最速</span><strong>{highlightNames(result.highlights.fastestTarget, result) || "期間内に届かない"}</strong></article>
                <article><span>元本維持率が最大</span><strong>{highlightNames(result.highlights.principalRetention, result) || "算出不可"}</strong></article>
              </div>
            </section>}

            <section className="comparison-table-section" aria-labelledby="comparison-table-title">
              <div className="section-heading">
                <div>
                  <p className="panel-kicker">数値一覧</p>
                  <h2 id="comparison-table-title">
                    {isSingle ? "配当・資産・目標" : "配当・資産・目標を比較"}
                  </h2>
                </div>
                <p>{value.common.years}年・目標月額{formatJpy(Number(value.common.targetMonthlyJpy))}</p>
              </div>
              <div className="table-scroll comparison-table-scroll" tabIndex={0} aria-label={isSingle ? "銘柄の詳細指標表" : "銘柄比較表、横方向にスクロールできます"}>
                <table className={`comparison-table${isSingle ? " comparison-table-single" : ""}`}>
                  <thead>
                    <tr>
                      <th scope="col">{isSingle ? "試算指標" : "比較指標"}</th>
                      {result.items.map((item) => <th scope="col" key={item.id}>{item.name}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {metricRows.map((row) => (
                      <tr key={row.label}>
                        <th scope="row">{row.label}</th>
                        {row.values.map((cell, index) => {
                          const item = result.items[index];
                          const highlighted = !isSingle && row.highlight
                            ? result.highlights[row.highlight].includes(item.id)
                            : false;
                          return <td className={highlighted ? "comparison-best-cell" : ""} key={item.id}>{cell}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="charts-section" aria-labelledby="comparison-charts-title">
              <div className="section-heading">
                <div>
                  <p className="panel-kicker">推移</p>
                  <h2 id="comparison-charts-title">
                    {isSingle ? "配当と資産の推移" : "配当と資産の推移を比較"}
                  </h2>
                </div>
                <p>{isSingle ? "入力条件での長期試算です。" : "すべて同じ投資条件です。"}</p>
              </div>
              <div className="charts-grid">
                <LineChart title="年間手取り配当" description="各年の税引後配当" data={dividendChartData} series={series} formatValue={formatCompactJpy} formatDetailValue={formatJpy} />
                <LineChart title="受取配当込み資産" description="評価額＋受け取った配当" data={wealthChartData} series={series} formatValue={formatCompactJpy} formatDetailValue={formatJpy} />
              </div>
            </section>

            {!isSingle && <>
            <section className="comparison-stability" aria-labelledby="stability-title">
              <div className="section-heading">
                <div>
                  <p className="panel-kicker">安定性</p>
                  <h2 id="stability-title">4つの条件で比較</h2>
                </div>
                <p>入力値と3つの弱気条件で確認します。</p>
              </div>
              <div className="comparison-stability-grid">
                {result.items.map((item) => (
                  <article key={item.id}>
                    <strong>{item.name}</strong>
                    <dl>
                      <div><dt>期末総資産が最大</dt><dd>{item.stability.endingWealthTopCount} / {result.stressCaseCount}</dd></div>
                      <div><dt>期末手取り配当が最大</dt><dd>{item.stability.endingDividendTopCount} / {result.stressCaseCount}</dd></div>
                      <div><dt>目標に届かない条件</dt><dd>{item.stability.targetMissCount} / {result.stressCaseCount}</dd></div>
                    </dl>
                  </article>
                ))}
              </div>
            </section>

            <section className="comparison-narratives" aria-labelledby="comparison-notes-title">
              <div>
                <p className="panel-kicker">要点</p>
                <h2 id="comparison-notes-title">主な違い</h2>
              </div>
              <ul>{result.narratives.map((narrative) => <li key={narrative}>{narrative}</li>)}</ul>
              <p>総合順位や購入推奨ではなく、入力条件による比較です。</p>
            </section>
            </>}
          </>
        )}
      </section>
    </main>
  );
}
