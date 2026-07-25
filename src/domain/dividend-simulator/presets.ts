import type { TaxProfile } from "./types";

export const JAPAN_TAXABLE_TAX_PROFILE: Readonly<TaxProfile> = {
  accountType: "taxable",
  foreignWithholdingRate: 0,
  foreignTaxCreditRate: 0,
  domesticTaxRate: 0.20315,
  domesticTaxBaseMode: "afterForeignTax",
};

export const JAPAN_NISA_TAX_PROFILE: Readonly<TaxProfile> = {
  accountType: "nisa",
  foreignWithholdingRate: 0,
  foreignTaxCreditRate: 0,
  domesticTaxRate: 0,
  domesticTaxBaseMode: "afterForeignTax",
};
