import { describe, expect, it } from "vitest";
import { validateSimulationInput } from "@/src/domain/dividend-simulator";
import {
  annualizeComparisonTarget,
  buildComparisonInputs,
  buildSingleFormFromComparison,
  createComparisonAsset,
  createInitialComparisonWorkspace,
  createNextComparisonAsset,
  recalculateAssetYield,
} from "./compare-model";
import { INITIAL_FORM_VALUES } from "./simulator-model";

describe("comparison form model", () => {
  it("既定で2銘柄を作り、同じ共通条件を全銘柄へ適用する", () => {
    const workspace = createInitialComparisonWorkspace();
    const inputs = buildComparisonInputs(workspace);

    expect(workspace.mode).toBe("sameInvestment");
    expect(inputs).toHaveLength(2);
    expect(inputs.every(({ input }) => validateSimulationInput(input).length === 0)).toBe(true);
    expect(inputs.map(({ input }) => input.settings.initialInvestmentJpy)).toEqual([1_000_000, 1_000_000]);
    expect(inputs.map(({ input }) => input.settings.monthlyContributionJpy)).toEqual([30_000, 30_000]);
    expect(inputs.map(({ input }) => input.settings.years)).toEqual([20, 20]);
    expect(inputs.map(({ input }) => input.settings.dividendReinvestmentRate)).toEqual([1, 1]);
    expect(inputs.map(({ input }) => input.asset.currency)).toEqual(["JPY", "JPY"]);
  });

  it("3銘柄目の個別条件とIDを追加できる", () => {
    const third = createComparisonAsset(2);
    const workspace = createInitialComparisonWorkspace();
    workspace.assets.push(third);
    const inputs = buildComparisonInputs(workspace);

    expect(inputs).toHaveLength(3);
    expect(new Set(inputs.map((item) => item.id)).size).toBe(3);
    expect(inputs[2].input.asset.name).toBe("高配当サンプル");
  });

  it("1件まで減らした後も重複しない銘柄を追加できる", () => {
    const workspace = createInitialComparisonWorkspace();
    workspace.assets = [workspace.assets[1]];
    const next = createNextComparisonAsset(workspace.assets);

    expect(next.id).not.toBe(workspace.assets[0].id);
  });

  it("比較条件を単一銘柄の詳細試算へ引き継ぐ", () => {
    const workspace = createInitialComparisonWorkspace();
    workspace.common.initialInvestmentJpy = "2500000";
    workspace.common.monthlyContributionJpy = "50000";
    workspace.common.targetMonthlyJpy = "30000";
    const single = buildSingleFormFromComparison(INITIAL_FORM_VALUES, workspace, workspace.assets[1].id);

    expect(single.assetName).toBe(workspace.assets[1].assetName);
    expect(single.initialInvestmentJpy).toBe("2500000");
    expect(single.monthlyContributionJpy).toBe("50000");
    expect(single.targetAmount).toBe("30000");
    expect(single.targetPeriod).toBe("monthly");
    expect(single.contributionPlanB).toBe("50000");
  });

  it("比較目標を年額化し、価格と配当から利回りを再計算する", () => {
    expect(annualizeComparisonTarget("50000")).toBe(600_000);
    const asset = recalculateAssetYield({
      ...createComparisonAsset(0),
      currentPrice: "1000",
      annualDividendPerShare: "40",
    });
    expect(asset.initialYieldPercent).toBe("4");
  });
});
