import { describe, expect, it } from "vitest";
import {
  getAnnualDividendPerShareAtMonth,
  getDistributionWeight,
  getFxRateAtMonth,
  getGrossDistributionNative,
  getMonthlyPriceFactor,
} from "../growth";
import { validateDistributionSchedule } from "../validation";
import { createAsset } from "./fixtures";

describe("配当・価格・為替成長", () => {
  it("増配率0なら年間配当を維持する", () => {
    const growth = createAsset().growth;
    expect(getAnnualDividendPerShareAtMonth(100, growth, 120)).toBe(100);
  });

  it("5%増配を年単位で複利計算する", () => {
    const growth = createAsset({ growth: { stableDividendGrowthRate: 0.05 } }).growth;
    expect(getAnnualDividendPerShareAtMonth(100, growth, 24)).toBeCloseTo(110.25);
  });

  it("2段階増配を指定年で切り替える", () => {
    const growth = createAsset({ growth: {
      highGrowthYears: 2,
      initialDividendGrowthRate: 0.1,
      stableDividendGrowthRate: 0.02,
    } }).growth;
    expect(getAnnualDividendPerShareAtMonth(100, growth, 36)).toBeCloseTo(123.42);
  });

  it("減配イベントを該当月の支払前に適用する", () => {
    const growth = createAsset({ growth: { dividendEvents: [{ monthIndex: 60, multiplier: 0.7 }] } }).growth;
    expect(getAnnualDividendPerShareAtMonth(100, growth, 59)).toBe(100);
    expect(getAnnualDividendPerShareAtMonth(100, growth, 60)).toBe(70);
  });

  it("倍率0のイベントで無配化する", () => {
    const growth = createAsset({ growth: { dividendEvents: [{ monthIndex: 0, multiplier: 0 }] } }).growth;
    expect(getAnnualDividendPerShareAtMonth(100, growth, 0)).toBe(0);
  });

  it("価格成長率0なら月次係数は1", () => {
    const asset = createAsset();
    expect(getMonthlyPriceFactor(asset.growth, asset.costs.expenseRatio)).toBe(1);
  });

  it("経費控除後モードでは経費率を再控除しない", () => {
    const asset = createAsset({ growth: { annualPriceGrowthRate: 0.12 }, costs: { expenseRatio: 0.01 } });
    expect(getMonthlyPriceFactor(asset.growth, asset.costs.expenseRatio)).toBeCloseTo(1.12 ** (1 / 12));
  });

  it("経費控除前モードでは経費率を1回だけ控除する", () => {
    const asset = createAsset({
      growth: { annualPriceGrowthRate: 0.12, returnBasis: "grossBeforeExpense" },
      costs: { expenseRatio: 0.01 },
    });
    expect(getMonthlyPriceFactor(asset.growth, asset.costs.expenseRatio) ** 12).toBeCloseTo(1.12 * 0.99);
  });

  it("為替変化0・プラス・マイナスを年率複利で扱う", () => {
    expect(getFxRateAtMonth("USD", 150, 0, 12)).toBe(150);
    expect(getFxRateAtMonth("USD", 150, 0.1, 12)).toBeCloseTo(165);
    expect(getFxRateAtMonth("USD", 150, -0.1, 12)).toBeCloseTo(135);
    expect(getFxRateAtMonth("JPY", 999, 0.5, 12)).toBe(1);
  });
});

describe("配当スケジュール", () => {
  it("年1回の合計が年間配当と一致する", () => {
    expect(getGrossDistributionNative(10, 40, { paymentMonths: [12], weights: [1] }, 12)).toBe(400);
  });

  it("年2回を均等配分する", () => {
    const schedule = { paymentMonths: [6, 12], weights: [0.5, 0.5] };
    expect(getGrossDistributionNative(10, 40, schedule, 6)).toBe(200);
  });

  it("年4回を不均等配分する", () => {
    const schedule = { paymentMonths: [3, 6, 9, 12], weights: [0.1, 0.2, 0.3, 0.4] };
    expect(getGrossDistributionNative(10, 40, schedule, 9)).toBe(120);
  });

  it("年12回を扱う", () => {
    const schedule = { paymentMonths: Array.from({ length: 12 }, (_, index) => index + 1), weights: Array(12).fill(1 / 12) };
    expect(Array.from({ length: 12 }, (_, index) => getDistributionWeight(schedule, index + 1)).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  it("比率合計が不正なら拒否する", () => {
    const issues = validateDistributionSchedule({ paymentMonths: [6, 12], weights: [0.4, 0.4] });
    expect(issues.some((issue) => issue.path.endsWith("weights"))).toBe(true);
  });

  it("非支払月は0", () => {
    expect(getDistributionWeight({ paymentMonths: [12], weights: [1] }, 11)).toBe(0);
  });
});
