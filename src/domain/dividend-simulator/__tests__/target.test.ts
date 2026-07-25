import { describe, expect, it } from "vitest";
import { simulateDividendInvestment } from "../simulate";
import {
  calculateRequiredInitialInvestment,
  calculateRequiredMonthlyContribution,
  findTargetReachedMonthIndex,
} from "../target";
import { createInput } from "./fixtures";

describe("必要額逆算と目標達成月", () => {
  it("手数料なしでは解析式と二分探索結果が一致する", () => {
    const result = calculateRequiredInitialInvestment(createInput(
      { currentPrice: 100, annualDividendPerShare: 10 },
      { targetNetAnnualDividendJpy: 100 },
    ));
    expect(result?.approximateInvestmentJpy).toBeCloseTo(1_000);
    expect(result?.requiredInvestmentJpy).toBe(1_000);
  });

  it("端数株不可なら必要額が1口単位になる", () => {
    const result = calculateRequiredInitialInvestment(createInput(
      { currentPrice: 100, annualDividendPerShare: 10 },
      { fractionalSharesAllowed: false, targetNetAnnualDividendJpy: 15 },
    ));
    expect(result?.requiredShares).toBe(2);
    expect(result?.requiredInvestmentJpy).toBe(200);
  });

  it("固定手数料込みで不足しない最小額を返す", () => {
    const input = createInput(
      { currentPrice: 100, annualDividendPerShare: 10, costs: { buyFixedFeeJpy: 50 } },
      { targetNetAnnualDividendJpy: 100 },
    );
    const result = calculateRequiredInitialInvestment(input);
    const oneYenLess = simulateDividendInvestment({
      ...input,
      settings: {
        ...input.settings,
        initialInvestmentJpy: 1_049,
        targetNetAnnualDividendJpy: undefined,
      },
    }, { calculateXirr: false });
    expect(result?.requiredInvestmentJpy).toBe(1_050);
    expect(oneYenLess.summary.forwardNetAnnualDividendJpy).toBeLessThan(100);
  });

  it("利回り0なら算出不可", () => {
    expect(calculateRequiredInitialInvestment(createInput(
      { annualDividendPerShare: 0 },
      { targetNetAnnualDividendJpy: 100 },
    ))).toBeNull();
  });

  it("税引後係数0なら算出不可", () => {
    expect(calculateRequiredInitialInvestment(createInput(
      { tax: { foreignWithholdingRate: 1 } },
      { targetNetAnnualDividendJpy: 100 },
    ))).toBeNull();
  });

  it("初期時点で達成済みなら最初の月を返す", () => {
    const result = simulateDividendInvestment(createInput(
      { currentPrice: 100, annualDividendPerShare: 10 },
      { initialInvestmentJpy: 1_000, targetNetAnnualDividendJpy: 100 },
    ), { calculateXirr: false });
    expect(result.summary.targetReachedMonthIndex).toBe(0);
  });

  it("期間内未達ならnullと警告を返す", () => {
    const result = simulateDividendInvestment(createInput(
      { currentPrice: 100, annualDividendPerShare: 10 },
      { initialInvestmentJpy: 100, targetNetAnnualDividendJpy: 1_000 },
    ), { calculateXirr: false });
    expect(result.summary.targetReachedMonthIndex).toBeNull();
    expect(result.warnings.some((warning) => warning.code === "targetNotReached")).toBe(true);
  });

  it("達成後に減配しても初回達成月を保持する", () => {
    const result = simulateDividendInvestment(createInput(
      {
        currentPrice: 100,
        annualDividendPerShare: 10,
        growth: { dividendEvents: [{ monthIndex: 1, multiplier: 0.5 }] },
      },
      { initialInvestmentJpy: 1_000, targetNetAnnualDividendJpy: 100 },
    ), { calculateXirr: false });
    expect(result.summary.targetReachedMonthIndex).toBe(0);
    expect(result.monthly[1].forwardNetAnnualDividendJpy).toBe(50);
  });

  it("期限時点を満たす最小の毎月積立額を返す", () => {
    const input = createInput(
      { currentPrice: 100, annualDividendPerShare: 12 },
      {
        initialInvestmentJpy: 0,
        monthlyContributionJpy: 0,
        targetNetAnnualDividendJpy: 12,
        targetDeadlineMonthIndex: 0,
      },
    );
    const required = calculateRequiredMonthlyContribution(input);
    expect(required?.requiredMonthlyContributionJpy).toBe(100);

    const insufficient = simulateDividendInvestment({
      ...input,
      settings: { ...input.settings, monthlyContributionJpy: 99 },
    }, { calculateXirr: false });
    expect(insufficient.monthly[0].forwardNetAnnualDividendJpy).toBeLessThan(12);
  });

  it("初期投資だけで期限目標を満たすなら必要積立額0円", () => {
    const result = calculateRequiredMonthlyContribution(createInput(
      { currentPrice: 100, annualDividendPerShare: 10 },
      {
        initialInvestmentJpy: 1_000,
        targetNetAnnualDividendJpy: 100,
        targetDeadlineMonthIndex: 11,
      },
    ));
    expect(result?.requiredMonthlyContributionJpy).toBe(0);
  });

  it("税引前目標は税率の影響を受けずに逆算する", () => {
    const result = calculateRequiredInitialInvestment(createInput(
      {
        currentPrice: 100,
        annualDividendPerShare: 10,
        tax: { domesticTaxRate: 0.5 },
      },
      { targetNetAnnualDividendJpy: undefined },
    ), 100, "gross");
    expect(result?.requiredInvestmentJpy).toBe(1_000);
    expect(result?.forwardGrossAnnualDividendJpy).toBe(100);
    expect(result?.forwardNetAnnualDividendJpy).toBe(50);
  });

  it("税引前目標の初回達成月を判定する", () => {
    const input = createInput(
      { currentPrice: 100, annualDividendPerShare: 10, tax: { domesticTaxRate: 0.5 } },
      { initialInvestmentJpy: 1_000 },
    );
    const result = simulateDividendInvestment(input, { calculateXirr: false });
    expect(findTargetReachedMonthIndex(input, result, 100, "gross")).toBe(0);
    expect(findTargetReachedMonthIndex(input, result, 100, "net")).toBeNull();
  });

  it("税引前目標でも期限時点の最小積立額を返す", () => {
    const input = createInput(
      { currentPrice: 100, annualDividendPerShare: 10, tax: { domesticTaxRate: 0.5 } },
      { initialInvestmentJpy: 0 },
    );
    const result = calculateRequiredMonthlyContribution(input, {
      targetAnnualDividendJpy: 10,
      deadlineMonthIndex: 0,
      basis: "gross",
    });
    expect(result?.requiredMonthlyContributionJpy).toBe(100);
    expect(result?.forwardGrossAnnualDividendJpy).toBe(10);
  });
});
