import { describe, expect, it } from "vitest";
import { simulateDividendInvestment } from "../simulate";
import { createInput } from "./fixtures";

describe("simulateDividendInvestment", () => {
  it("初期投資だけを費用・成長なしで保有する", () => {
    const result = simulateDividendInvestment(createInput(
      { currentPrice: 100, annualDividendPerShare: 0 },
      { initialInvestmentJpy: 1_000 },
    ), { calculateXirr: false });

    expect(result.summary.endingShares).toBe(10);
    expect(result.summary.endingMarketValueJpy).toBe(1_000);
    expect(result.summary.endingTotalWealthJpy).toBe(1_000);
  });

  it("毎月積立だけを月初購入する", () => {
    const result = simulateDividendInvestment(createInput(
      { currentPrice: 100, annualDividendPerShare: 0 },
      { initialInvestmentJpy: 0, monthlyContributionJpy: 1_000 },
    ), { calculateXirr: false });

    expect(result.summary.endingShares).toBe(120);
    expect(result.summary.cumulativeContributionJpy).toBe(12_000);
  });

  it("再投資率0%では配当を全額現金で受け取る", () => {
    const result = simulateDividendInvestment(createInput(
      {
        currentPrice: 100,
        annualDividendPerShare: 12,
        distributionSchedule: {
          paymentMonths: Array.from({ length: 12 }, (_, index) => index + 1),
          weights: Array(12).fill(1 / 12),
        },
      },
      { initialInvestmentJpy: 1_000, dividendReinvestmentRate: 0 },
    ), { calculateXirr: false });

    expect(result.summary.endingShares).toBe(10);
    expect(result.summary.cumulativeCashDividendJpy).toBeCloseTo(120);
    expect(result.summary.cumulativeReinvestedDividendJpy).toBe(0);
  });

  it("再投資率100%では配当を同じ銘柄へ再投資する", () => {
    const result = simulateDividendInvestment(createInput(
      {
        currentPrice: 100,
        annualDividendPerShare: 12,
        distributionSchedule: {
          paymentMonths: Array.from({ length: 12 }, (_, index) => index + 1),
          weights: Array(12).fill(1 / 12),
        },
      },
      { initialInvestmentJpy: 1_000, dividendReinvestmentRate: 1 },
    ), { calculateXirr: false });

    expect(result.summary.endingShares).toBeGreaterThan(11.2);
    expect(result.summary.cumulativeCashDividendJpy).toBe(0);
    expect(result.summary.endingTotalWealthJpy).toBeGreaterThan(1_120);
  });

  it("再投資率50%では受取分と再投資配分を分離する", () => {
    const result = simulateDividendInvestment(createInput(
      { currentPrice: 100, annualDividendPerShare: 10 },
      { initialInvestmentJpy: 1_000, dividendReinvestmentRate: 0.5 },
    ), { calculateXirr: false });

    expect(result.summary.cumulativeCashDividendJpy).toBeCloseTo(result.summary.cumulativeReinvestedDividendJpy);
    expect(result.summary.cumulativeNetDividendJpy).toBeCloseTo(
      result.summary.cumulativeCashDividendJpy + result.summary.cumulativeReinvestedDividendJpy,
    );
  });

  it("端数株あり・なしで期末口数が変わる", () => {
    const fractional = simulateDividendInvestment(createInput(
      { currentPrice: 300, annualDividendPerShare: 0 },
      { initialInvestmentJpy: 1_000, fractionalSharesAllowed: true },
    ), { calculateXirr: false });
    const whole = simulateDividendInvestment(createInput(
      { currentPrice: 300, annualDividendPerShare: 0 },
      { initialInvestmentJpy: 1_000, fractionalSharesAllowed: false },
    ), { calculateXirr: false });

    expect(fractional.summary.endingShares).toBeCloseTo(10 / 3);
    expect(whole.summary.endingShares).toBe(3);
    expect(whole.monthly.at(-1)?.unusedJpy).toBe(100);
  });

  it("分配頻度により再投資タイミングの差が生じる", () => {
    const annual = simulateDividendInvestment(createInput(
      { currentPrice: 100, annualDividendPerShare: 12, distributionSchedule: { paymentMonths: [1], weights: [1] } },
      { initialInvestmentJpy: 1_000, dividendReinvestmentRate: 1 },
    ), { calculateXirr: false });
    const monthly = simulateDividendInvestment(createInput(
      {
        currentPrice: 100,
        annualDividendPerShare: 12,
        distributionSchedule: {
          paymentMonths: Array.from({ length: 12 }, (_, index) => index + 1),
          weights: Array(12).fill(1 / 12),
        },
      },
      { initialInvestmentJpy: 1_000, dividendReinvestmentRate: 1 },
    ), { calculateXirr: false });

    expect(annual.summary.endingShares).not.toBeCloseTo(monthly.summary.endingShares);
  });

  it("期末売却ONでは売却費用を控除する", () => {
    const input = createInput(
      { currentPrice: 100, annualDividendPerShare: 0, costs: { sellFeeRate: 0.01, sellFixedFeeJpy: 10 } },
      { initialInvestmentJpy: 1_000 },
    );
    const held = simulateDividendInvestment(input, { calculateXirr: false });
    const liquidated = simulateDividendInvestment({
      ...input,
      settings: { ...input.settings, liquidateAtEnd: true },
    }, { calculateXirr: false });

    expect(held.summary.endingMarketValueJpy).toBe(1_000);
    expect(liquidated.summary.endingMarketValueJpy).toBe(980);
    expect(liquidated.warnings.some((warning) => warning.code === "capitalGainsTaxExcluded")).toBe(true);
  });

  it("50年間でもNaN・Infinity・負の口数を出さない", () => {
    const result = simulateDividendInvestment(createInput(
      {
        currentPrice: 100,
        annualDividendPerShare: 4,
        growth: { stableDividendGrowthRate: 0.03, annualPriceGrowthRate: 0.04 },
      },
      { initialInvestmentJpy: 1_000, monthlyContributionJpy: 100, years: 50, dividendReinvestmentRate: 1 },
    ), { calculateXirr: false });

    expect(result.monthly).toHaveLength(600);
    result.monthly.forEach((row) => {
      expect(row.shares).toBeGreaterThanOrEqual(0);
      Object.values(row).filter((value) => typeof value === "number").forEach((value) => {
        expect(Number.isFinite(value)).toBe(true);
      });
    });
  });

  it("月次合計と年次集約が一致する", () => {
    const result = simulateDividendInvestment(createInput(
      { currentPrice: 100, annualDividendPerShare: 12 },
      { initialInvestmentJpy: 1_000, monthlyContributionJpy: 100, years: 2, dividendReinvestmentRate: 0.5 },
    ), { calculateXirr: false });
    const monthlyNet = result.monthly.reduce((total, row) => total + row.netDividendJpy, 0);
    const annualNet = result.annual.reduce((total, row) => total + row.netDividendJpy, 0);
    const monthlyFees = result.monthly.reduce((total, row) => total + row.buyFeesJpy, 0);
    const annualFees = result.annual.reduce((total, row) => total + row.buyFeesJpy, 0);

    expect(annualNet).toBeCloseTo(monthlyNet);
    expect(annualFees).toBeCloseTo(monthlyFees);
    expect(result.annual.at(-1)?.endingShares).toBeCloseTo(result.summary.endingShares);
  });
});
