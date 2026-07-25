"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  simulateDividendInvestment,
  validateSimulationInput,
  type SimulationResult,
} from "@/src/domain/dividend-simulator";
import { LineChart, type ChartPoint } from "./charts";
import { ComparisonWorkspace } from "./comparison-workspace";
import {
  buildSingleFormFromComparison,
  createInitialComparisonWorkspace,
  syncComparisonFromSingle,
} from "./compare-model";
import { NumberField, SelectField } from "./form-fields";
import {
  buildSimulationInput,
  buildContributionPlanValues,
  calculateAnnualDividend,
  calculateYieldPercent,
  INITIAL_FORM_VALUES,
  type SimulatorFormValues,
  type TaxTreatment,
} from "./simulator-model";
import { TargetResults } from "./target-results";
import { WorkspaceSavePanel } from "./workspace-save-panel";
import {
  createEmptyNamedWorkspaceCollection,
  createWorkspaceBackup,
  deleteNamedWorkspace,
  mergeWorkspaceBackup,
  NAMED_WORKSPACES_STORAGE_KEY,
  normalizeWorkspaceName,
  parseNamedWorkspaceCollection,
  parseSavedWorkspace,
  parseWorkspaceBackup,
  serializeNamedWorkspaceCollection,
  serializeWorkspace,
  serializeWorkspaceBackup,
  upsertNamedWorkspace,
  WORKSPACE_STORAGE_KEY,
  type NamedWorkspaceCollectionV1,
  type NamedWorkspaceV1,
  type SavedWorkspaceV1,
  type WorkspaceMode,
} from "./workspace-storage";

const jpyFormatter = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});
const numberFormatter = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 6 });
const formatJpy = (value: number) => jpyFormatter.format(Math.round(value));
const formatCompactJpy = (value: number) => {
  const absolute = Math.abs(value);
  if (absolute >= 100_000_000) return `${Number((value / 100_000_000).toFixed(2))}億円`;
  if (absolute >= 10_000) return `${Number((value / 10_000).toFixed(1))}万円`;
  return `${Math.round(value).toLocaleString("ja-JP")}円`;
};
const formatPercent = (value: number | null) => value === null
  ? "算出不可"
  : `${(value * 100).toFixed(2)}%`;

function ToggleField({
  label,
  checked,
  onChange,
  description,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: string;
}) {
  return (
    <label className="toggle-field">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.currentTarget.checked)} />
      <span>
        <strong>{label}</strong>
        {description && <small>{description}</small>}
      </span>
    </label>
  );
}

function KpiCard({ label, value, note, emphasis }: { label: string; value: string; note?: string; emphasis?: boolean }) {
  return (
    <article className={`kpi-card${emphasis ? " kpi-card-emphasis" : ""}`}>
      <p>{label}</p>
      <strong>{value}</strong>
      {note && <span>{note}</span>}
    </article>
  );
}

function buildChartData(result: SimulationResult): ChartPoint[] {
  let cumulativeCash = 0;
  let cumulativeReinvested = 0;
  return result.annual.map((row) => {
    cumulativeCash += row.cashDividendJpy;
    cumulativeReinvested += row.reinvestedDividendJpy;
    return {
      label: `${row.yearIndex + 1}年`,
      netDividend: row.netDividendJpy,
      marketValue: row.endingMarketValueJpy,
      contribution: row.contributedJpy,
      totalWealth: row.endingTotalWealthJpy,
      cumulativeCash,
      cumulativeReinvested,
    };
  });
}

export function DividendSimulator() {
  const [form, setForm] = useState<SimulatorFormValues>(INITIAL_FORM_VALUES);
  const [comparison, setComparison] = useState(() => createInitialComparisonWorkspace());
  const [activeMode, setActiveMode] = useState<WorkspaceMode>("single");
  const [saveName, setSaveName] = useState("");
  const [savedWorkspaces, setSavedWorkspaces] = useState<NamedWorkspaceCollectionV1>(
    createEmptyNamedWorkspaceCollection,
  );
  const [storageStatus, setStorageStatus] = useState("保存した試算はありません");
  const lastDividendInput = useRef<"dividend" | "yield">("dividend");
  const comparisonInitialized = useRef(false);

  useEffect(() => {
    const saved = parseSavedWorkspace(window.localStorage.getItem(WORKSPACE_STORAGE_KEY));
    const namedRaw = window.localStorage.getItem(NAMED_WORKSPACES_STORAGE_KEY);
    const named = parseNamedWorkspaceCollection(namedRaw) ?? createEmptyNamedWorkspaceCollection();
    if (!saved && namedRaw === null) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setSavedWorkspaces(named);
      if (saved) {
        setForm(saved.single);
        setComparison(saved.comparison);
        setActiveMode(saved.activeMode);
        comparisonInitialized.current = true;
        const savedAt = new Date(saved.savedAt);
        setStorageStatus(Number.isNaN(savedAt.getTime())
          ? "前回の作業を開きました"
          : `${savedAt.toLocaleString("ja-JP")}の作業を開きました`);
      } else if (named.items.length > 0) {
        setStorageStatus(`${named.items.length}件の保存を読み込みました`);
      } else if (namedRaw !== null) {
        setStorageStatus("保存一覧を読み込めませんでした");
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const changeMode = (mode: WorkspaceMode) => {
    if (mode === "compare" && !comparisonInitialized.current) {
      setComparison((current) => syncComparisonFromSingle(current, form));
      comparisonInitialized.current = true;
    }
    setActiveMode(mode);
  };

  const buildSavedWorkspace = (savedAt: Date): SavedWorkspaceV1 => ({
    schemaVersion: 1,
    savedAt: savedAt.toISOString(),
    activeMode,
    single: form,
    comparison,
  });

  const saveNamedWorkspace = () => {
    try {
      const savedAt = new Date();
      const workspace = buildSavedWorkspace(savedAt);
      const normalizedName = normalizeWorkspaceName(saveName);
      const wasExisting = savedWorkspaces.items.some((item) => item.name === normalizedName);
      const next = upsertNamedWorkspace(
        savedWorkspaces,
        normalizedName,
        workspace,
        window.crypto.randomUUID(),
      );
      window.localStorage.setItem(NAMED_WORKSPACES_STORAGE_KEY, serializeNamedWorkspaceCollection(next));
      window.localStorage.setItem(WORKSPACE_STORAGE_KEY, serializeWorkspace(workspace));
      setSavedWorkspaces(next);
      setSaveName(normalizedName);
      setStorageStatus(`「${normalizedName}」を${wasExisting ? "上書き" : "保存"}しました`);
    } catch {
      setStorageStatus("保存できません。ブラウザの設定を確認してください。");
    }
  };

  const restoreNamedWorkspace = (item: NamedWorkspaceV1) => {
    try {
      window.localStorage.setItem(WORKSPACE_STORAGE_KEY, serializeWorkspace(item.workspace));
      setForm(item.workspace.single);
      setComparison(item.workspace.comparison);
      setActiveMode(item.workspace.activeMode);
      comparisonInitialized.current = true;
      setSaveName(item.name);
      setStorageStatus(`「${item.name}」を開きました`);
    } catch {
      setStorageStatus("開けません。ブラウザの設定を確認してください。");
    }
  };

  const deleteSavedWorkspace = (item: NamedWorkspaceV1) => {
    if (!window.confirm(`「${item.name}」を削除しますか？`)) return;
    try {
      const next = deleteNamedWorkspace(savedWorkspaces, item.id);
      window.localStorage.setItem(NAMED_WORKSPACES_STORAGE_KEY, serializeNamedWorkspaceCollection(next));
      setSavedWorkspaces(next);
      setStorageStatus(`「${item.name}」を削除しました。開いている試算は変わりません`);
    } catch {
      setStorageStatus("削除できません。ブラウザの設定を確認してください。");
    }
  };

  const exportWorkspaceBackup = () => {
    if (savedWorkspaces.items.length === 0) {
      setStorageStatus("書き出せる保存がありません");
      return;
    }
    try {
      const exportedAt = new Date();
      const backup = createWorkspaceBackup(savedWorkspaces, exportedAt.toISOString());
      const blob = new Blob([serializeWorkspaceBackup(backup)], { type: "application/json;charset=utf-8" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      const date = [
        exportedAt.getFullYear(),
        String(exportedAt.getMonth() + 1).padStart(2, "0"),
        String(exportedAt.getDate()).padStart(2, "0"),
      ].join("-");
      link.href = url;
      link.download = `dividend-simulator-backup-${date}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setStorageStatus(`${savedWorkspaces.items.length}件を書き出しました`);
    } catch {
      setStorageStatus("JSONを書き出せませんでした");
    }
  };

  const importWorkspaceBackup = async (file: File) => {
    try {
      const backup = parseWorkspaceBackup(await file.text());
      if (!backup) {
        setStorageStatus("このJSONは読み込めません。形式を確認してください");
        return;
      }
      if (backup.items.length === 0) {
        setStorageStatus("このJSONに保存データはありません");
        return;
      }
      const overwriteCount = backup.items.filter((imported) => (
        savedWorkspaces.items.some((existing) => existing.name === imported.name)
      )).length;
      const message = overwriteCount > 0
        ? `${backup.items.length}件を読み込みます。同名の${overwriteCount}件は上書きされます。よろしいですか？`
        : `${backup.items.length}件を読み込みますか？`;
      if (!window.confirm(message)) {
        setStorageStatus("読み込みを取り消しました");
        return;
      }
      const next = mergeWorkspaceBackup(savedWorkspaces, backup);
      window.localStorage.setItem(NAMED_WORKSPACES_STORAGE_KEY, serializeNamedWorkspaceCollection(next));
      setSavedWorkspaces(next);
      setStorageStatus(`${backup.items.length}件を読み込みました。開いている試算は変わりません`);
    } catch {
      setStorageStatus("JSONを読み込めませんでした");
    }
  };

  const openSingleFromComparison = (assetId: string) => {
    setForm((current) => buildSingleFormFromComparison(current, comparison, assetId));
    setActiveMode("single");
  };

  const setField = <Key extends keyof SimulatorFormValues>(key: Key, value: SimulatorFormValues[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const setCurrentPrice = (value: string) => {
    setForm((current) => lastDividendInput.current === "yield"
      ? {
          ...current,
          currentPrice: value,
          annualDividendPerShare: calculateAnnualDividend(value, current.initialYieldPercent),
        }
      : {
          ...current,
          currentPrice: value,
          initialYieldPercent: calculateYieldPercent(value, current.annualDividendPerShare),
        });
  };

  const setAnnualDividend = (value: string) => {
    lastDividendInput.current = "dividend";
    setForm((current) => ({
      ...current,
      annualDividendPerShare: value,
      initialYieldPercent: calculateYieldPercent(current.currentPrice, value),
    }));
  };

  const setInitialYield = (value: string) => {
    lastDividendInput.current = "yield";
    setForm((current) => ({
      ...current,
      initialYieldPercent: value,
      annualDividendPerShare: calculateAnnualDividend(current.currentPrice, value),
    }));
  };

  const setMonthlyContribution = (value: string) => {
    const [planA, planB, planC] = buildContributionPlanValues(value);
    setForm((current) => ({
      ...current,
      monthlyContributionJpy: value,
      contributionPlanA: planA,
      contributionPlanB: planB,
      contributionPlanC: planC,
    }));
  };

  const calculation = useMemo(() => {
    const input = buildSimulationInput(form);
    const issues = validateSimulationInput(input);
    if (issues.length > 0) return { input, issues, result: null };
    return { input, issues, result: simulateDividendInvestment(input) };
  }, [form]);

  const result = calculation.result;
  const chartData = useMemo(() => result ? buildChartData(result) : [], [result]);
  const selectedYear = result ? Math.min(10, result.annual.length) : 0;
  const firstYear = result?.annual[0];
  const selectedYearResult = selectedYear > 0 ? result?.annual[selectedYear - 1] : undefined;
  const taxTreatmentLabel = form.taxTreatment === "foreignCredit"
    ? "外国税控除あり"
    : form.taxTreatment === "noForeignCredit"
      ? "外国税控除なし"
      : form.taxTreatment === "nisa"
        ? "NISA"
        : "指定税率";

  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="wordmark" href="#top" aria-label="ページ上部へ">
          分配金・配当シミュレーター
        </a>
        <span className="phase-badge">端末保存</span>
      </header>

      <section className="hero" id="top" aria-labelledby="hero-title">
        <p className="eyebrow">ETF・高配当株向け</p>
        <h1 id="hero-title">配当・分配シミュレーション</h1>
        <p>手取り配当、資産の推移、目標に必要な投資額が分かります。</p>
      </section>

      <nav className="mode-tabs" aria-label="試算モード">
        <button
          type="button"
          className={activeMode === "single" ? "active" : ""}
          onClick={() => changeMode("single")}
          aria-pressed={activeMode === "single"}
        >
          <span>01</span>
          将来を試算
        </button>
        <button
          type="button"
          className={activeMode === "target" ? "active" : ""}
          onClick={() => changeMode("target")}
          aria-pressed={activeMode === "target"}
        >
          <span>02</span>
          目標を逆算
        </button>
        <button
          type="button"
          className={activeMode === "compare" ? "active" : ""}
          onClick={() => changeMode("compare")}
          aria-pressed={activeMode === "compare"}
        >
          <span>03</span>
          銘柄を比較
        </button>
      </nav>

      <WorkspaceSavePanel
        name={saveName}
        items={savedWorkspaces.items}
        status={storageStatus}
        onNameChange={setSaveName}
        onSave={saveNamedWorkspace}
        onRestore={restoreNamedWorkspace}
        onDelete={deleteSavedWorkspace}
        onExport={exportWorkspaceBackup}
        onImport={importWorkspaceBackup}
      />

      {activeMode === "compare" ? (
        <ComparisonWorkspace value={comparison} onChange={setComparison} onOpenSingle={openSingleFromComparison} />
      ) : (
      <main className="workspace" id="simulator">
        <aside className="input-panel" aria-labelledby="input-title">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">条件</p>
              <h2 id="input-title">条件を入力</h2>
            </div>
            <span className="auto-update" aria-live="polite">自動更新</span>
          </div>

          <form onSubmit={(event) => event.preventDefault()} noValidate>
            <fieldset>
              <legend>基本情報</legend>
              <label className="field field-full">
                <span className="field-label">銘柄名 <small>任意</small></span>
                <input
                  type="text"
                  value={form.assetName}
                  onChange={(event) => setField("assetName", event.currentTarget.value)}
                  placeholder="例：サンプルETF"
                />
              </label>
              <div className="field-grid">
                <NumberField
                  label="現在価格"
                  value={form.currentPrice}
                  onChange={setCurrentPrice}
                  min="0"
                />
                <NumberField
                  label="1口あたり年間配当"
                  value={form.annualDividendPerShare}
                  onChange={setAnnualDividend}
                  min="0"
                  help="年額を入力（月平均は÷12）"
                />
                <NumberField
                  label="現在利回り"
                  value={form.initialYieldPercent}
                  onChange={setInitialYield}
                  suffix="%"
                  min="0"
                  help="価格・年間配当と連動"
                />
              </div>
            </fieldset>

            <fieldset>
              <legend>投資・将来設定</legend>
              <div className="field-grid">
                <NumberField label="初期投資" value={form.initialInvestmentJpy} onChange={(value) => setField("initialInvestmentJpy", value)} suffix="円" min="0" step="10000" />
                <NumberField label="毎月積立" value={form.monthlyContributionJpy} onChange={setMonthlyContribution} suffix="円" min="0" step="1000" />
                <NumberField label="運用期間" value={form.years} onChange={(value) => setField("years", value)} suffix="年" min="1" max="50" step="1" />
                <NumberField label="配当の年間変化" value={form.stableDividendGrowthRatePercent} onChange={(value) => setField("stableDividendGrowthRatePercent", value)} suffix="%" min="-99.99" help="マイナスで減配" />
                <NumberField label="価格の年間変化" value={form.annualPriceGrowthRatePercent} onChange={(value) => setField("annualPriceGrowthRatePercent", value)} suffix="%" min="-99.99" help="配当との差で利回りも変化" />
                <NumberField label="配当の再投資" value={form.dividendReinvestmentRatePercent} onChange={(value) => setField("dividendReinvestmentRatePercent", value)} suffix="%" min="0" max="100" />
                <SelectField label="口座・税" value={form.taxTreatment} onChange={(value) => setField("taxTreatment", value as TaxTreatment)} help="海外資産の税率は詳細設定で指定">
                  <option value="foreignCredit">課税口座（外国税控除あり）</option>
                  <option value="noForeignCredit">課税口座（外国税控除なし）</option>
                  <option value="nisa">NISA</option>
                  <option value="custom">税率を指定</option>
                </SelectField>
              </div>
            </fieldset>

            {activeMode === "target" && (
              <fieldset className="target-inputs">
                <legend>配当目標</legend>
                <div className="target-amount-row">
                  <NumberField
                    label="目標配当"
                    value={form.targetAmount}
                    onChange={(value) => setField("targetAmount", value)}
                    suffix="円"
                    min="1"
                    step="1000"
                  />
                  <SelectField
                    label="月額・年額"
                    value={form.targetPeriod}
                    onChange={(value) => setField("targetPeriod", value as SimulatorFormValues["targetPeriod"])}
                  >
                    <option value="monthly">月額</option>
                    <option value="annual">年額</option>
                  </SelectField>
                  <SelectField
                    label="受取額"
                    value={form.targetBasis}
                    onChange={(value) => setField("targetBasis", value as SimulatorFormValues["targetBasis"])}
                  >
                    <option value="net">税引後</option>
                    <option value="gross">税引前</option>
                  </SelectField>
                </div>
                <ToggleField
                  label="期限を決める"
                  checked={form.targetDeadlineEnabled}
                  onChange={(checked) => setField("targetDeadlineEnabled", checked)}
                  description="期限に必要な毎月積立を計算"
                />
                {form.targetDeadlineEnabled && (
                  <div className="nested-fields deadline-input">
                    <NumberField
                      label="達成期限"
                      value={form.targetDeadlineYears}
                      onChange={(value) => setField("targetDeadlineYears", value)}
                      suffix="年目まで"
                      min="1"
                      max={form.years}
                      step="1"
                    />
                  </div>
                )}
                <div className="plan-inputs">
                  <p>積立額を比べる</p>
                  <div className="field-grid">
                    <NumberField label="プラン 1" value={form.contributionPlanA} onChange={(value) => setField("contributionPlanA", value)} suffix="円" min="0" step="1000" />
                    <NumberField label="プラン 2" value={form.contributionPlanB} onChange={(value) => setField("contributionPlanB", value)} suffix="円" min="0" step="1000" />
                    <NumberField label="プラン 3" value={form.contributionPlanC} onChange={(value) => setField("contributionPlanC", value)} suffix="円" min="0" step="1000" />
                  </div>
                  <small>毎月積立をもとに3案を自動設定します。</small>
                </div>
              </fieldset>
            )}

            <details className="advanced-settings">
              <summary>
                <span>税・経費を設定</span>
                <small>詳細</small>
              </summary>
              <div className="advanced-body">
                <fieldset>
                  <legend>税・経費</legend>
                  <div className="field-grid">
                    <NumberField label="外国税率" value={form.foreignWithholdingRatePercent} onChange={(value) => setField("foreignWithholdingRatePercent", value)} suffix="%" min="0" max="100" help="国内商品は0%。海外資産は現地税率" />
                    {form.taxTreatment === "custom" && (
                      <>
                        <NumberField label="国内税率" value={form.domesticTaxRatePercent} onChange={(value) => setField("domesticTaxRatePercent", value)} suffix="%" min="0" max="100" />
                        <NumberField label="外国税の控除率" value={form.foreignTaxCreditRatePercent} onChange={(value) => setField("foreignTaxCreditRatePercent", value)} suffix="%" min="0" max="100" help="外国税額控除で戻る見込み" />
                        <SelectField label="国内税の対象額" value={form.domesticTaxBaseMode} onChange={(value) => setField("domesticTaxBaseMode", value as SimulatorFormValues["domesticTaxBaseMode"])}>
                          <option value="afterForeignTax">外国税控除後</option>
                          <option value="grossDividend">配当全額</option>
                        </SelectField>
                      </>
                    )}
                    <NumberField label="経費率（信託報酬など）" value={form.expenseRatioPercent} onChange={(value) => setField("expenseRatioPercent", value)} suffix="%／年" min="0" max="100" help="個別株は通常0%" />
                    {Number(form.expenseRatioPercent) > 0 && (
                      <SelectField label="価格変化率の基準" value={form.returnBasis} onChange={(value) => setField("returnBasis", value as SimulatorFormValues["returnBasis"])} help="控除後なら経費を重ねて引きません">
                        <option value="netOfExpense">経費を差し引いた後</option>
                        <option value="grossBeforeExpense">経費を差し引く前</option>
                      </SelectField>
                    )}
                  </div>
                  {form.taxTreatment === "foreignCredit" && (
                    <p className="setting-note">外国税を全額控除できる想定です。実際の控除額・時期は異なります。</p>
                  )}
                  {form.taxTreatment === "nisa" && (
                    <p className="setting-note">国内税は0%。海外資産では外国税がかかる場合があります。</p>
                  )}
                </fieldset>

              </div>
            </details>
          </form>
        </aside>

        <section className="results-panel" aria-labelledby="results-title">
          <div className="results-heading">
            <div>
              <p className="panel-kicker">結果</p>
              <h2 id="results-title">
                {form.assetName.trim() || "名称未設定"}の{activeMode === "target" ? "目標" : "将来"}
              </h2>
            </div>
            {result && (
              <p className="assumption-summary">
                {form.years}年・再投資{form.dividendReinvestmentRatePercent}%・{taxTreatmentLabel}
              </p>
            )}
          </div>

          {!result ? (
            <div className="validation-panel" role="alert">
              <h3>入力を確認</h3>
              <p>修正すると自動で更新されます。</p>
              <ul>
                {calculation.issues.slice(0, 8).map((issue) => (
                  <li key={`${issue.path}-${issue.message}`}>{issue.message}</li>
                ))}
              </ul>
            </div>
          ) : activeMode === "target" ? (
            <TargetResults form={form} input={calculation.input} baseResult={result} />
          ) : (
            <>
              <div className="kpi-grid" aria-label="主要な試算結果">
                <KpiCard label="1年目の手取り配当" value={formatJpy(firstYear?.netDividendJpy ?? 0)} note={formatCompactJpy(firstYear?.netDividendJpy ?? 0)} />
                <KpiCard label={`${selectedYear}年目の手取り配当`} value={formatJpy(selectedYearResult?.netDividendJpy ?? 0)} note={formatCompactJpy(selectedYearResult?.netDividendJpy ?? 0)} />
                <KpiCard label="期末の月平均配当" value={formatJpy(result.summary.forwardNetAnnualDividendJpy / 12)} note="想定年額÷12" />
                <KpiCard label="期末評価額" value={formatJpy(result.summary.endingMarketValueJpy)} note={formatCompactJpy(result.summary.endingMarketValueJpy)} />
                <KpiCard label="受取配当込み資産" value={formatJpy(result.summary.endingTotalWealthJpy)} note={formatCompactJpy(result.summary.endingTotalWealthJpy)} emphasis />
                <KpiCard label="投資額との差" value={formatJpy(result.summary.totalGainJpy)} note={`累積リターン ${formatPercent(result.summary.cumulativeTotalReturn)}`} />
              </div>

              <dl className="secondary-metrics">
                <div><dt>累計投資</dt><dd>{formatJpy(result.summary.cumulativeContributionJpy)}</dd></div>
                <div><dt>累計受取配当</dt><dd>{formatJpy(result.summary.cumulativeCashDividendJpy)}</dd></div>
                <div><dt>期末口数</dt><dd>{numberFormatter.format(result.summary.endingShares)}口</dd></div>
                <div><dt>累計投資への配当利回り</dt><dd>{formatPercent(result.summary.netYieldOnCost)}</dd></div>
                <div><dt>元本維持率</dt><dd>{formatPercent(result.summary.principalRetention)}</dd></div>
                <div><dt>年率収益（入出金込み）</dt><dd>{formatPercent(result.summary.xirr)}</dd></div>
              </dl>

              <section className="charts-section" aria-labelledby="charts-title">
                <div className="section-heading">
                  <div>
                    <p className="panel-kicker">推移</p>
                    <h2 id="charts-title">将来の推移</h2>
                  </div>
                  <p>下の年次表でも確認できます。</p>
                </div>
                <div className="charts-grid">
                  <LineChart
                    title="年間手取り配当"
                    description="各年の税引後配当"
                    data={chartData}
                    series={[{ key: "netDividend", label: "手取り配当", color: "#0b7a55" }]}
                    formatValue={formatCompactJpy}
                  />
                  <LineChart
                    title="資産の推移"
                    description="評価額・投資額・受取配当込み資産"
                    data={chartData}
                    series={[
                      { key: "marketValue", label: "評価額", color: "#0b7a55" },
                      { key: "contribution", label: "累計投資額", color: "#7b8984" },
                      { key: "totalWealth", label: "受取配当込み資産", color: "#d39a2d" },
                    ]}
                    formatValue={formatCompactJpy}
                  />
                  <LineChart
                    title="配当の受取と再投資"
                    description="受け取った配当と再投資した配当"
                    data={chartData}
                    series={[
                      { key: "cumulativeCash", label: "受取配当", color: "#316b9b" },
                      { key: "cumulativeReinvested", label: "再投資", color: "#a46b27" },
                    ]}
                    formatValue={formatCompactJpy}
                  />
                </div>
              </section>

              <section className="annual-section" aria-labelledby="annual-title">
                <div className="section-heading">
                  <div>
                    <p className="panel-kicker">年ごとの内訳</p>
                    <h2 id="annual-title">年次データ</h2>
                  </div>
                  <p>金額は表示時に丸めています。</p>
                </div>
                <div className="table-scroll" tabIndex={0} aria-label="年次結果表、横方向にスクロールできます">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">年</th>
                        <th scope="col">累計投資額</th>
                        <th scope="col">保有口数</th>
                        <th scope="col">1口価格</th>
                        <th scope="col">1口配当（年）</th>
                        <th scope="col">想定利回り</th>
                        <th scope="col">税引前配当</th>
                        <th scope="col">手取り配当</th>
                        <th scope="col">受取配当</th>
                        <th scope="col">再投資額</th>
                        <th scope="col">評価額</th>
                        <th scope="col">総資産</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.annual.map((row) => {
                        const month = result.monthly[Math.min((row.yearIndex + 1) * 12 - 1, result.monthly.length - 1)];
                        return (
                          <tr key={row.yearIndex}>
                            <th scope="row">{row.yearIndex + 1}年</th>
                            <td>{formatJpy(row.contributedJpy)}</td>
                            <td>{numberFormatter.format(row.endingShares)}</td>
                            <td>{formatJpy(row.endingPriceNative)}</td>
                            <td>{formatJpy(month.annualDividendPerShareNative)}</td>
                            <td>{formatPercent(row.endingForwardYield)}</td>
                            <td>{formatJpy(row.grossDividendJpy)}</td>
                            <td>{formatJpy(row.netDividendJpy)}</td>
                            <td>{formatJpy(row.cashDividendJpy)}</td>
                            <td>{formatJpy(row.reinvestedDividendJpy)}</td>
                            <td>{formatJpy(row.endingMarketValueJpy)}</td>
                            <td>{formatJpy(row.endingTotalWealthJpy)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="notes-section" aria-labelledby="notes-title">
                <div>
                  <p className="panel-kicker">注意</p>
                  <h2 id="notes-title">試算の前提</h2>
                </div>
                <ul className="basis-list">
                  <li>価格の年間変化は{form.returnBasis === "netOfExpense" ? "経費控除後" : "経費控除前"}で計算します。</li>
                  <li>利回りは配当と価格の変化に応じて毎年変わります。</li>
                  <li>月初の購入分も当月の配当対象とする概算です。</li>
                  <li>税額・端数処理・外国税額控除は概算です。</li>
                </ul>
                {result.warnings.length > 0 && (
                  <div className="warning-list" role="status">
                    <h3>確認事項</h3>
                    <ul>
                      {result.warnings.map((warning) => (
                        <li key={`${warning.code}-${warning.monthIndex ?? "all"}`}>
                          {warning.code === "marketValueBelowContribution"
                            ? "評価額が投資額を下回る年があります。元本払戻しを示すものではありません。"
                            : warning.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            </>
          )}
        </section>
      </main>
      )}

      <footer>
        本試算は入力条件による概算で、将来の成果を保証しません。税額は口座・商品・申告状況により異なります。
      </footer>
    </div>
  );
}
