import { describe, expect, it } from "vitest";
import { validateSimulationInput } from "../validation";
import { createInput } from "./fixtures";

describe("validateSimulationInput", () => {
  it("価格0を拒否する", () => {
    const issues = validateSimulationInput(createInput({ currentPrice: 0 }));
    expect(issues.some((issue) => issue.path === "asset.currentPrice")).toBe(true);
  });

  it("運用年数を1〜50年に制限する", () => {
    const tooShort = validateSimulationInput(createInput({}, { years: 0 }));
    const tooLong = validateSimulationInput(createInput({}, { years: 51 }));
    expect(tooShort.some((issue) => issue.path === "settings.years")).toBe(true);
    expect(tooLong.some((issue) => issue.path === "settings.years")).toBe(true);
  });

  it("実在しない日付を拒否する", () => {
    const issues = validateSimulationInput(createInput({}, { startDate: "2026-02-31" }));
    expect(issues.some((issue) => issue.path === "settings.startDate")).toBe(true);
  });

  it("税率と再投資率を0〜1に制限する", () => {
    const issues = validateSimulationInput(createInput(
      { tax: { domesticTaxRate: 1.1 } },
      { dividendReinvestmentRate: -0.1 },
    ));
    expect(issues.some((issue) => issue.path === "asset.tax.domesticTaxRate")).toBe(true);
    expect(issues.some((issue) => issue.path === "settings.dividendReinvestmentRate")).toBe(true);
  });

  it("目標期限を運用期間内に制限する", () => {
    const issues = validateSimulationInput(createInput({}, { years: 1, targetDeadlineMonthIndex: 12 }));
    expect(issues.some((issue) => issue.path === "settings.targetDeadlineMonthIndex")).toBe(true);
  });
});
