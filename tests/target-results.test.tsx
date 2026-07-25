import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { simulateDividendInvestment } from "@/src/domain/dividend-simulator";
import { buildSimulationInput, INITIAL_FORM_VALUES } from "@/app/simulator-model";
import { TargetResults } from "@/app/target-results";

describe("TargetResults", () => {
  it("固定fixtureから必要額・達成時期・期限積立・3案を表示する", () => {
    const form = {
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
      taxTreatment: "custom" as const,
      domesticTaxRatePercent: "0",
      expenseRatioPercent: "0",
      targetAmount: "100",
      targetPeriod: "annual" as const,
      targetBasis: "net" as const,
      targetDeadlineEnabled: true,
      targetDeadlineYears: "1",
      contributionPlanA: "0",
      contributionPlanB: "100",
      contributionPlanC: "200",
    };
    const input = buildSimulationInput(form);
    const result = simulateDividendInvestment(input, { calculateXirr: false });
    const html = renderToStaticMarkup(<TargetResults form={form} input={input} baseResult={result} />);

    expect(html).toContain("今、必要な投資額");
    expect(html).toContain("達成済み");
    expect(html).toContain("必要な積立");
    expect(html).toContain("プラン 3");
    expect(html).not.toContain("算出不可");
  });
});
