import { describe, expect, it } from "vitest";
import { simulateDividendInvestment, validateSimulationInput } from "@/src/domain/dividend-simulator";
import {
  buildSimulationInput,
  annualizeTargetAmount,
  buildContributionPlanValues,
  calculateAnnualDividend,
  calculateYieldPercent,
  INITIAL_FORM_VALUES,
} from "./simulator-model";

describe("simulator form model", () => {
  it("初期表示の簡単設定を有効な計算入力へ変換する", () => {
    const input = buildSimulationInput(INITIAL_FORM_VALUES);
    expect(validateSimulationInput(input)).toEqual([]);
    expect(input.asset.distributionSchedule.paymentMonths).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(input.asset.distributionSchedule.weights).toHaveLength(12);
    expect(input.asset.distributionSchedule.weights.reduce((total, weight) => total + weight, 0)).toBeCloseTo(1);
    expect(input.asset.tax.domesticTaxRate).toBeCloseTo(0.20315);
    expect(input.asset.currency).toBe("JPY");
    expect(input.settings.initialFxJpyPerCurrency).toBe(1);
    expect(input.settings.annualFxChangeRate).toBe(0);
    expect(input.asset.costs.fxSpreadRate).toBe(0);
  });

  it("画面の固定fixtureが計算エンジンの既知結果と一致する", () => {
    const input = buildSimulationInput({
      ...INITIAL_FORM_VALUES,
      currentPrice: "100",
      annualDividendPerShare: "10",
      initialYieldPercent: "10",
      initialInvestmentJpy: "1000",
      monthlyContributionJpy: "0",
      years: "1",
      stableDividendGrowthRatePercent: "0",
      annualPriceGrowthRatePercent: "0",
      dividendReinvestmentRatePercent: "0",
      taxTreatment: "custom",
      domesticTaxRatePercent: "0",
      expenseRatioPercent: "0",
    });
    const result = simulateDividendInvestment(input, { calculateXirr: false });

    expect(result.summary.endingShares).toBe(10);
    expect(result.summary.cumulativeNetDividendJpy).toBeCloseTo(100);
    expect(result.summary.endingTotalWealthJpy).toBeCloseTo(1_100);
  });

  it("価格・年間配当・利回りを片方向に同期する", () => {
    expect(calculateYieldPercent("1000", "40")).toBe("4");
    expect(calculateAnnualDividend("1000", "4")).toBe("40");
  });

  it("公開画面の価格変化を0%へ固定し、配当変化を年次利回りへ反映する", () => {
    const input = buildSimulationInput({
      ...INITIAL_FORM_VALUES,
      currentPrice: "100",
      annualDividendPerShare: "10",
      initialYieldPercent: "10",
      initialInvestmentJpy: "1000",
      monthlyContributionJpy: "0",
      years: "2",
      stableDividendGrowthRatePercent: "-10",
      annualPriceGrowthRatePercent: "10",
      dividendReinvestmentRatePercent: "0",
      taxTreatment: "custom",
      domesticTaxRatePercent: "0",
    });
    const result = simulateDividendInvestment(input, { calculateXirr: false });
    expect(input.asset.growth.annualPriceGrowthRate).toBe(0);
    expect(input.asset.growth.returnBasis).toBe("grossBeforeExpense");
    expect(result.annual[1].endingForwardYield).toBeLessThan(result.annual[0].endingForwardYield!);
  });

  it("外国税額控除を考慮する場合は外国税の全額回収を上限概算にする", () => {
    const input = buildSimulationInput({
      ...INITIAL_FORM_VALUES,
      taxTreatment: "foreignCredit",
      foreignWithholdingRatePercent: "10",
    });
    expect(input.asset.tax.accountType).toBe("taxable");
    expect(input.asset.tax.foreignTaxCreditRate).toBe(1);
  });

  it("NISA選択時は国内税率と外国税回収見込率を0として計算入力へ渡す", () => {
    const input = buildSimulationInput({
      ...INITIAL_FORM_VALUES,
      taxTreatment: "nisa",
      domesticTaxRatePercent: "20.315",
      foreignTaxCreditRatePercent: "100",
    });
    expect(input.asset.tax.domesticTaxRate).toBe(0);
    expect(input.asset.tax.foreignTaxCreditRate).toBe(0);
  });

  it("公開画面で省略した条件を共通の概算値へ固定する", () => {
    const input = buildSimulationInput(INITIAL_FORM_VALUES);
    expect(input.settings.startDate).toBe("2000-01-01");
    expect(input.settings.fractionalSharesAllowed).toBe(true);
    expect(input.settings.liquidateAtEnd).toBe(false);
    expect(input.asset.costs.buyFeeRate).toBe(0);
    expect(input.asset.costs.buyFixedFeeJpy).toBe(0);
    expect(input.asset.costs.sellFeeRate).toBe(0);
    expect(input.asset.costs.sellFixedFeeJpy).toBe(0);
    expect(input.asset.growth.highGrowthYears).toBe(0);
    expect(input.asset.growth.dividendEvents).toEqual([]);
    expect(input.asset.growth.initialDividendGrowthRate).toBe(input.asset.growth.stableDividendGrowthRate);
    expect(input.asset.growth.annualPriceGrowthRate).toBe(0);
    expect(input.asset.growth.returnBasis).toBe("grossBeforeExpense");
  });

  it("月額目標を年額へ換算する", () => {
    expect(annualizeTargetAmount({ ...INITIAL_FORM_VALUES, targetAmount: "50000", targetPeriod: "monthly" })).toBe(600_000);
    expect(annualizeTargetAmount({ ...INITIAL_FORM_VALUES, targetAmount: "600000", targetPeriod: "annual" })).toBe(600_000);
  });

  it("毎月積立額から0.6倍・1倍・1.5倍の候補を作る", () => {
    expect(buildContributionPlanValues("30000")).toEqual(["18000", "30000", "45000"]);
    expect(buildContributionPlanValues("0")).toEqual(["10000", "30000", "50000"]);
  });
});
