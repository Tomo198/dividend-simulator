import type { AnnualResult, MonthlyResult } from "./types";

const sum = (rows: MonthlyResult[], key: keyof MonthlyResult) => rows.reduce(
  (total, row) => total + (typeof row[key] === "number" ? row[key] : 0),
  0,
);

export function aggregateAnnualResults(monthly: MonthlyResult[]): AnnualResult[] {
  const annual: AnnualResult[] = [];

  for (let start = 0; start < monthly.length; start += 12) {
    const rows = monthly.slice(start, start + 12);
    const first = rows[0];
    const last = rows.at(-1);
    if (!first || !last) continue;

    annual.push({
      yearIndex: Math.floor(start / 12),
      periodStartDate: first.date,
      periodEndDate: last.date,
      contributedJpy: last.contributedJpy,
      grossDividendJpy: sum(rows, "grossDividendJpy"),
      foreignTaxJpy: sum(rows, "foreignTaxJpy"),
      foreignTaxCreditJpy: sum(rows, "foreignTaxCreditJpy"),
      domesticTaxJpy: sum(rows, "domesticTaxJpy"),
      netDividendJpy: sum(rows, "netDividendJpy"),
      reinvestedDividendJpy: sum(rows, "reinvestedDividendJpy"),
      cashDividendJpy: sum(rows, "cashDividendJpy"),
      buyFeesJpy: sum(rows, "buyFeesJpy"),
      fxCostsJpy: sum(rows, "fxCostsJpy"),
      endingShares: last.shares,
      endingPriceNative: last.priceNative,
      endingForwardYield: safeRatio(last.annualDividendPerShareNative, last.priceNative),
      endingFxJpyPerCurrency: last.fxJpyPerCurrency,
      endingMarketValueJpy: last.marketValueJpy,
      endingTotalWealthJpy: last.totalWealthJpy,
      forwardNetAnnualDividendJpy: last.forwardNetAnnualDividendJpy,
    });
  }

  return annual;
}

export function safeRatio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}
