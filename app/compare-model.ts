import type { ComparisonInputItem } from "@/src/domain/dividend-simulator";
import {
  buildContributionPlanValues,
  buildSimulationInput,
  calculateYieldPercent,
  INITIAL_FORM_VALUES,
  type SimulatorFormValues,
  type TaxTreatment,
} from "./simulator-model";

export type ComparisonMode = "sameInvestment" | "sameTarget";

export interface ComparisonCommonValues {
  initialInvestmentJpy: string;
  monthlyContributionJpy: string;
  years: string;
  dividendReinvestmentRatePercent: string;
  targetMonthlyJpy: string;
}

export interface ComparisonAssetValues {
  id: string;
  assetName: string;
  currentPrice: string;
  annualDividendPerShare: string;
  initialYieldPercent: string;
  stableDividendGrowthRatePercent: string;
  annualPriceGrowthRatePercent: string;
  taxTreatment: TaxTreatment;
  expenseRatioPercent: string;
  returnBasis: SimulatorFormValues["returnBasis"];
  foreignWithholdingRatePercent: string;
  foreignTaxCreditRatePercent: string;
  domesticTaxRatePercent: string;
  domesticTaxBaseMode: SimulatorFormValues["domesticTaxBaseMode"];
}

export interface CompareWorkspaceValues {
  mode: ComparisonMode;
  common: ComparisonCommonValues;
  assets: ComparisonAssetValues[];
}

const ASSET_IDS = ["compare-a", "compare-b", "compare-c"] as const;

function assetFromForm(form: SimulatorFormValues, id: string): ComparisonAssetValues {
  return {
    id,
    assetName: form.assetName,
    currentPrice: form.currentPrice,
    annualDividendPerShare: form.annualDividendPerShare,
    initialYieldPercent: form.initialYieldPercent,
    stableDividendGrowthRatePercent: form.stableDividendGrowthRatePercent,
    annualPriceGrowthRatePercent: form.annualPriceGrowthRatePercent,
    taxTreatment: form.taxTreatment,
    expenseRatioPercent: form.expenseRatioPercent,
    returnBasis: form.returnBasis,
    foreignWithholdingRatePercent: form.foreignWithholdingRatePercent,
    foreignTaxCreditRatePercent: form.foreignTaxCreditRatePercent,
    domesticTaxRatePercent: form.domesticTaxRatePercent,
    domesticTaxBaseMode: form.domesticTaxBaseMode,
  };
}

export function createComparisonAsset(index: number): ComparisonAssetValues {
  const id = ASSET_IDS[index] ?? `compare-${index + 1}`;
  if (index === 1) {
    return {
      ...assetFromForm(INITIAL_FORM_VALUES, id),
      assetName: "配当成長サンプル",
      annualDividendPerShare: "300",
      initialYieldPercent: "3",
      stableDividendGrowthRatePercent: "5",
      annualPriceGrowthRatePercent: "5",
      expenseRatioPercent: "0.1",
    };
  }
  if (index === 2) {
    return {
      ...assetFromForm(INITIAL_FORM_VALUES, id),
      assetName: "高配当サンプル",
      annualDividendPerShare: "500",
      initialYieldPercent: "5",
      stableDividendGrowthRatePercent: "0",
      annualPriceGrowthRatePercent: "0",
      expenseRatioPercent: "0.2",
    };
  }
  return assetFromForm(INITIAL_FORM_VALUES, id);
}

export function createNextComparisonAsset(assets: ComparisonAssetValues[]): ComparisonAssetValues {
  const nextIndex = ASSET_IDS.findIndex((id) => !assets.some((asset) => asset.id === id));
  if (nextIndex === -1) throw new RangeError("銘柄は3件まで追加できます。");
  return createComparisonAsset(nextIndex);
}

export function createInitialComparisonWorkspace(
  form: SimulatorFormValues = INITIAL_FORM_VALUES,
): CompareWorkspaceValues {
  return {
    mode: "sameInvestment",
    common: {
      initialInvestmentJpy: form.initialInvestmentJpy,
      monthlyContributionJpy: form.monthlyContributionJpy,
      years: form.years,
      dividendReinvestmentRatePercent: form.dividendReinvestmentRatePercent,
      targetMonthlyJpy: form.targetPeriod === "monthly"
        ? form.targetAmount
        : String(Number(form.targetAmount) / 12),
    },
    assets: [
      assetFromForm(form, ASSET_IDS[0]),
      createComparisonAsset(1),
    ],
  };
}

export function syncComparisonFromSingle(
  workspace: CompareWorkspaceValues,
  form: SimulatorFormValues,
): CompareWorkspaceValues {
  return {
    ...workspace,
    common: {
      ...workspace.common,
      initialInvestmentJpy: form.initialInvestmentJpy,
      monthlyContributionJpy: form.monthlyContributionJpy,
      years: form.years,
      dividendReinvestmentRatePercent: form.dividendReinvestmentRatePercent,
      targetMonthlyJpy: form.targetPeriod === "monthly"
        ? form.targetAmount
        : String(Number(form.targetAmount) / 12),
    },
    assets: [assetFromForm(form, workspace.assets[0]?.id ?? ASSET_IDS[0]), ...workspace.assets.slice(1)],
  };
}

function formValuesForComparison(
  common: ComparisonCommonValues,
  asset: ComparisonAssetValues,
): SimulatorFormValues {
  return {
    ...INITIAL_FORM_VALUES,
    ...common,
    ...asset,
    targetAmount: common.targetMonthlyJpy,
    targetPeriod: "monthly",
  };
}

export function buildComparisonInputs(workspace: CompareWorkspaceValues): ComparisonInputItem[] {
  return workspace.assets.map((asset) => {
    const input = buildSimulationInput(formValuesForComparison(workspace.common, asset));
    return {
      id: asset.id,
      name: asset.assetName.trim() || "名称未設定",
      input: {
        ...input,
        asset: { ...input.asset, id: asset.id, name: asset.assetName.trim() || "名称未設定" },
      },
    };
  });
}

export function annualizeComparisonTarget(targetMonthlyJpy: string): number {
  return Number(targetMonthlyJpy) * 12;
}

export function recalculateAssetYield(asset: ComparisonAssetValues): ComparisonAssetValues {
  return {
    ...asset,
    initialYieldPercent: calculateYieldPercent(asset.currentPrice, asset.annualDividendPerShare),
  };
}

export function buildSingleFormFromComparison(
  base: SimulatorFormValues,
  workspace: CompareWorkspaceValues,
  assetId: string,
): SimulatorFormValues {
  const asset = workspace.assets.find((item) => item.id === assetId);
  if (!asset) throw new RangeError("単体表示する銘柄が見つかりません。");
  const [contributionPlanA, contributionPlanB, contributionPlanC] = buildContributionPlanValues(
    workspace.common.monthlyContributionJpy,
  );
  return {
    ...base,
    assetName: asset.assetName,
    currentPrice: asset.currentPrice,
    annualDividendPerShare: asset.annualDividendPerShare,
    initialYieldPercent: asset.initialYieldPercent,
    initialInvestmentJpy: workspace.common.initialInvestmentJpy,
    monthlyContributionJpy: workspace.common.monthlyContributionJpy,
    years: workspace.common.years,
    stableDividendGrowthRatePercent: asset.stableDividendGrowthRatePercent,
    annualPriceGrowthRatePercent: asset.annualPriceGrowthRatePercent,
    dividendReinvestmentRatePercent: workspace.common.dividendReinvestmentRatePercent,
    taxTreatment: asset.taxTreatment,
    expenseRatioPercent: asset.expenseRatioPercent,
    returnBasis: asset.returnBasis,
    foreignWithholdingRatePercent: asset.foreignWithholdingRatePercent,
    foreignTaxCreditRatePercent: asset.foreignTaxCreditRatePercent,
    domesticTaxRatePercent: asset.domesticTaxRatePercent,
    domesticTaxBaseMode: asset.domesticTaxBaseMode,
    targetAmount: workspace.common.targetMonthlyJpy,
    targetPeriod: "monthly",
    targetBasis: "net",
    contributionPlanA,
    contributionPlanB,
    contributionPlanC,
  };
}
