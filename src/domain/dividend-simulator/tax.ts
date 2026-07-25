import type { TaxBreakdown, TaxProfile } from "./types";

export function calculateTax(grossDividend: number, profile: TaxProfile): TaxBreakdown {
  const gross = Math.max(0, grossDividend);
  const foreignTax = gross * profile.foreignWithholdingRate;
  const domesticTaxBase = profile.domesticTaxBaseMode === "afterForeignTax"
    ? gross - foreignTax
    : gross;
  const effectiveDomesticRate = profile.accountType === "nisa"
    ? 0
    : profile.domesticTaxRate;
  const domesticTax = domesticTaxBase * effectiveDomesticRate;
  const foreignTaxCreditRate = profile.accountType === "nisa"
    ? 0
    : profile.foreignTaxCreditRate ?? 0;
  const foreignTaxCredit = foreignTax * foreignTaxCreditRate;

  return {
    grossDividend: gross,
    foreignTax,
    foreignTaxCredit,
    domesticTax,
    netDividend: Math.max(0, gross - foreignTax - domesticTax + foreignTaxCredit),
  };
}

export function getNetTaxFactor(profile: TaxProfile): number {
  return calculateTax(1, profile).netDividend;
}

export function calculateForwardNetAnnualDividendJpy(
  grossAnnualDividendNative: number,
  profile: TaxProfile,
  sellFxJpyPerCurrency: number,
): number {
  return calculateTax(grossAnnualDividendNative, profile).netDividend * sellFxJpyPerCurrency;
}
