import { describe, expect, it } from "vitest";
import { compareSimulationInputs } from "../compare";
import { simulateDividendInvestment } from "../simulate";
import { createInput } from "./fixtures";

describe("compareSimulationInputs", () => {
  it("3銘柄を同じ計算ロジックで比較し、同値をすべて強調する", () => {
    const input = createInput(
      { currentPrice: 100, annualDividendPerShare: 5 },
      { initialInvestmentJpy: 100_000, years: 10 },
    );
    const comparison = compareSimulationInputs([
      { id: "a", name: "銘柄A", input },
      { id: "b", name: "銘柄B", input },
      { id: "c", name: "銘柄C", input },
    ], { targetNetAnnualDividendJpy: 5_000 });
    const expected = simulateDividendInvestment(input);

    expect(comparison.items).toHaveLength(3);
    expect(comparison.items[0].result).toEqual(expected);
    expect(comparison.highlights.firstYearNetDividend).toEqual(["a", "b", "c"]);
    expect(comparison.highlights.tenthYearNetDividend).toEqual(["a", "b", "c"]);
    expect(comparison.highlights.endingTotalWealth).toEqual(["a", "b", "c"]);
    expect(comparison.highlights.lowestExpenseRatio).toEqual(["a", "b", "c"]);
    expect(comparison.highlights.fastestTarget).toEqual(["a", "b", "c"]);
    expect(comparison.highlights.principalRetention).toEqual(["a", "b", "c"]);
    expect(comparison.items.every((item) => item.stability.endingWealthTopCount === 4)).toBe(true);
    expect(comparison.items.every((item) => item.stability.endingDividendTopCount === 4)).toBe(true);
    expect(comparison.stressCaseCount).toBe(4);
  });

  it("経費控除前の価格成長率では高コスト側の期末結果が劣後する", () => {
    const commonAsset = {
      currentPrice: 100,
      annualDividendPerShare: 4,
      growth: { returnBasis: "grossBeforeExpense" as const, annualPriceGrowthRate: 0.05 },
    };
    const comparison = compareSimulationInputs([
      {
        id: "low-cost",
        name: "低コスト",
        input: createInput({ ...commonAsset, costs: { expenseRatio: 0.001 } }, { years: 10 }),
      },
      {
        id: "high-cost",
        name: "高コスト",
        input: createInput({ ...commonAsset, costs: { expenseRatio: 0.01 } }, { years: 10 }),
      },
    ]);

    expect(comparison.items[0].result.summary.endingTotalWealthJpy)
      .toBeGreaterThan(comparison.items[1].result.summary.endingTotalWealthJpy);
    expect(comparison.highlights.lowestExpenseRatio).toEqual(["low-cost"]);
  });

  it("3銘柄の比較指標、目標金額、ストレス集計を返す", () => {
    const comparison = compareSimulationInputs([
      {
        id: "income",
        name: "配当重視",
        input: createInput(
          { currentPrice: 100, annualDividendPerShare: 8, costs: { expenseRatio: 0.004 } },
          { initialInvestmentJpy: 100_000, monthlyContributionJpy: 5_000, years: 10 },
        ),
      },
      {
        id: "growth",
        name: "成長重視",
        input: createInput(
          {
            currentPrice: 100,
            annualDividendPerShare: 4,
            growth: { stableDividendGrowthRate: 0.08, annualPriceGrowthRate: 0.05 },
            costs: { expenseRatio: 0.002 },
          },
          { initialInvestmentJpy: 100_000, monthlyContributionJpy: 5_000, years: 10 },
        ),
      },
      {
        id: "low-cost",
        name: "低コスト",
        input: createInput(
          { currentPrice: 100, annualDividendPerShare: 3, costs: { expenseRatio: 0.001 } },
          { initialInvestmentJpy: 100_000, monthlyContributionJpy: 5_000, years: 10 },
        ),
      },
    ], { targetNetAnnualDividendJpy: 8_000 });

    expect(comparison.items).toHaveLength(3);
    expect(comparison.highlights.firstYearNetDividend).toContain("income");
    expect(comparison.highlights.lowestExpenseRatio).toEqual(["low-cost"]);
    expect(comparison.items.every((item) => item.requiredTargetInvestment !== null)).toBe(true);
    expect(comparison.items.every((item) => item.requiredMonthlyContribution !== null)).toBe(true);
    expect(comparison.items.every((item) => item.stability.endingWealthTopCount <= 4)).toBe(true);
    expect(comparison.items.every((item) => item.stability.endingDividendTopCount <= 4)).toBe(true);
    expect(comparison.items.every((item) => item.stability.targetMissCount <= 4)).toBe(true);
    expect(comparison.narratives).toHaveLength(5);
  });

  it("1件は単体エンジンと同じ結果になり、上限件数とIDを検証する", () => {
    const input = createInput();

    const single = compareSimulationInputs([{ id: "a", name: "A", input }]);
    expect(single.items).toHaveLength(1);
    expect(single.items[0].result).toEqual(simulateDividendInvestment(input));
    expect(() => compareSimulationInputs([
      { id: "a", name: "A", input },
      { id: "a", name: "B", input },
    ])).toThrow("IDは重複");
    expect(() => compareSimulationInputs([
      { id: "a", name: "A", input },
      { id: "b", name: "B", input },
      { id: "c", name: "C", input },
      { id: "d", name: "D", input },
    ])).toThrow("1〜3件");
  });
});
