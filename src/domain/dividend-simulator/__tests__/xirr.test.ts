import { describe, expect, it } from "vitest";
import { simulateDividendInvestment } from "../simulate";
import { calculateXirr } from "../xirr";
import { createInput } from "./fixtures";

describe("calculateXirr", () => {
  it("既知の1年投資を解く", () => {
    const result = calculateXirr([
      { date: "2026-01-01", amount: -1_000 },
      { date: "2027-01-01", amount: 1_100 },
    ]);
    expect(result).toBeCloseTo(0.1, 7);
  });

  it("複数積立の入金時期を反映する", () => {
    const cashFlows = [
      { date: "2026-01-01", amount: -1_000 },
      { date: "2026-07-02", amount: -1_000 },
      { date: "2027-01-01", amount: 2_100 },
    ];
    const result = calculateXirr(cashFlows);
    expect(result).not.toBeNull();
    const npv = cashFlows.reduce((total, cashFlow) => {
      const days = (Date.parse(`${cashFlow.date}T00:00:00Z`) - Date.parse("2026-01-01T00:00:00Z")) / 86_400_000;
      return total + cashFlow.amount / (1 + result!) ** (days / 365);
    }, 0);
    expect(npv).toBeCloseTo(0, 6);
  });

  it("正負キャッシュフローが揃わなければnull", () => {
    expect(calculateXirr([{ date: "2026-01-01", amount: 100 }])).toBeNull();
    expect(calculateXirr([{ date: "2026-01-01", amount: -100 }])).toBeNull();
  });

  it("複数解がある場合はnull", () => {
    expect(calculateXirr([
      { date: "2026-01-01", amount: -100 },
      { date: "2027-01-01", amount: 230 },
      { date: "2028-01-01", amount: -132 },
    ])).toBeNull();
  });

  it("再投資配当を外部キャッシュフローへ重複計上しない", () => {
    const result = simulateDividendInvestment(createInput(
      {
        currentPrice: 100,
        annualDividendPerShare: 10,
        distributionSchedule: { paymentMonths: [12], weights: [1] },
      },
      { initialInvestmentJpy: 1_000, dividendReinvestmentRate: 1 },
    ));
    expect(result.summary.cumulativeCashDividendJpy).toBe(0);
    expect(result.summary.endingMarketValueJpy).toBe(1_100);
    expect(result.summary.xirr).toBeCloseTo(0.1, 2);
  });
});
