import { describe, expect, it } from "vitest";
import { calculateTax } from "../tax";
import type { TaxProfile } from "../types";

const profile = (overrides: Partial<TaxProfile> = {}): TaxProfile => ({
  accountType: "custom",
  foreignWithholdingRate: 0,
  domesticTaxRate: 0,
  domesticTaxBaseMode: "afterForeignTax",
  ...overrides,
});

describe("calculateTax", () => {
  it("税率0なら税引前と税引後が一致する", () => {
    expect(calculateTax(100, profile())).toEqual({
      grossDividend: 100,
      foreignTax: 0,
      foreignTaxCredit: 0,
      domesticTax: 0,
      netDividend: 100,
    });
  });

  it("国内税だけを控除する", () => {
    expect(calculateTax(100, profile({ domesticTaxRate: 0.2 })).netDividend).toBeCloseTo(80);
  });

  it("外国税だけを控除する", () => {
    expect(calculateTax(100, profile({ foreignWithholdingRate: 0.1 })).netDividend).toBeCloseTo(90);
  });

  it("外国税控除後を国内課税ベースにする", () => {
    const result = calculateTax(100, profile({ foreignWithholdingRate: 0.1, domesticTaxRate: 0.2 }));
    expect(result.domesticTax).toBeCloseTo(18);
    expect(result.netDividend).toBeCloseTo(72);
  });

  it("税引前総額を国内課税ベースにする", () => {
    const result = calculateTax(100, profile({
      foreignWithholdingRate: 0.1,
      domesticTaxRate: 0.2,
      domesticTaxBaseMode: "grossDividend",
    }));
    expect(result.domesticTax).toBeCloseTo(20);
    expect(result.netDividend).toBeCloseTo(70);
  });

  it("NISAは国内税を0にし外国税は残す", () => {
    const result = calculateTax(100, profile({
      accountType: "nisa",
      foreignWithholdingRate: 0.1,
      domesticTaxRate: 0.2,
    }));
    expect(result.foreignTax).toBeCloseTo(10);
    expect(result.domesticTax).toBe(0);
    expect(result.netDividend).toBeCloseTo(90);
  });

  it("外国税額控除の回収見込率を税引後配当へ加算する", () => {
    const result = calculateTax(100, profile({
      foreignWithholdingRate: 0.1,
      foreignTaxCreditRate: 1,
      domesticTaxRate: 0.2,
    }));
    expect(result.foreignTax).toBeCloseTo(10);
    expect(result.foreignTaxCredit).toBeCloseTo(10);
    expect(result.netDividend).toBeCloseTo(82);
  });

  it("NISAでは外国税額控除を加算しない", () => {
    const result = calculateTax(100, profile({
      accountType: "nisa",
      foreignWithholdingRate: 0.1,
      foreignTaxCreditRate: 1,
    }));
    expect(result.foreignTaxCredit).toBe(0);
    expect(result.netDividend).toBeCloseTo(90);
  });

  it("0%と100%の境界を扱う", () => {
    expect(calculateTax(100, profile({ foreignWithholdingRate: 0 })).netDividend).toBe(100);
    expect(calculateTax(100, profile({ foreignWithholdingRate: 1 })).netDividend).toBe(0);
  });
});
