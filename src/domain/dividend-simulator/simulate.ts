import { aggregateAnnualResults, safeRatio } from "./aggregate";
import { calculateLiquidation, getFxRates } from "./costs";
import {
  getAnnualDividendPerShareAtMonth,
  getFxRateAtMonth,
  getGrossDistributionNative,
  growPriceOneMonth,
} from "./growth";
import { calculateJpyPurchase, calculateNativePurchase } from "./purchase";
import { calculateForwardNetAnnualDividendJpy, calculateTax, getNetTaxFactor } from "./tax";
import type {
  MonthlyResult,
  SimulationInput,
  SimulationResult,
  SimulationWarning,
  XirrCashFlow,
} from "./types";
import { assertValidSimulationInput } from "./validation";
import { calculateXirr } from "./xirr";

export interface SimulationOptions {
  calculateXirr?: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDateParts(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

function addMonths(date: string, months: number): string {
  const { year, month, day } = parseDateParts(date);
  const targetMonthStart = new Date(Date.UTC(year, month - 1 + months, 1));
  const targetYear = targetMonthStart.getUTCFullYear();
  const targetMonth = targetMonthStart.getUTCMonth();
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const result = new Date(Date.UTC(targetYear, targetMonth, Math.min(day, lastDay)));
  return result.toISOString().slice(0, 10);
}

function getMonthEnd(date: string, monthIndex: number): string {
  const nextMonth = Date.parse(`${addMonths(date, monthIndex + 1)}T00:00:00Z`);
  return new Date(nextMonth - DAY_MS).toISOString().slice(0, 10);
}

function getCalendarMonth(date: string): number {
  return Number(date.slice(5, 7));
}

function sum(monthly: MonthlyResult[], key: keyof MonthlyResult): number {
  return monthly.reduce(
    (total, row) => total + (typeof row[key] === "number" ? row[key] : 0),
    0,
  );
}

function buildWarnings(input: SimulationInput, monthly: MonthlyResult[]): SimulationWarning[] {
  const { asset, settings } = input;
  const warnings: SimulationWarning[] = [];

  if (asset.growth.annualPriceGrowthRate <= -0.2) {
    warnings.push({ code: "largeNegativePriceGrowth", message: "価格の年間変化が大きくマイナスです。" });
  }
  if (asset.growth.initialDividendGrowthRate > 0.15 || asset.growth.stableDividendGrowthRate > 0.15) {
    warnings.push({ code: "highDividendGrowth", message: "配当の年間変化が高めです。" });
  }
  const belowContribution = monthly.find((row) => row.marketValueJpy < row.contributedJpy);
  if (belowContribution) {
    warnings.push({
      code: "marketValueBelowContribution",
      message: "評価額が投資額を下回る月があります。",
      monthIndex: belowContribution.monthIndex,
    });
  }
  if (getNetTaxFactor(asset.tax) <= 0) {
    warnings.push({ code: "nonPositiveNetTaxFactor", message: "手取り配当が0以下です。" });
  }
  if (settings.targetNetAnnualDividendJpy !== undefined && settings.targetNetAnnualDividendJpy > 0) {
    const reached = monthly.some((row) => row.forwardNetAnnualDividendJpy >= settings.targetNetAnnualDividendJpy!);
    if (!reached) warnings.push({ code: "targetNotReached", message: "設定期間内に目標へ届きません。" });
  }
  if (settings.liquidateAtEnd) {
    warnings.push({ code: "capitalGainsTaxExcluded", message: "期末売却額に譲渡益税は含みません。" });
  }
  const foreignTaxCreditRate = asset.tax.foreignTaxCreditRate ?? 0;
  if (asset.tax.foreignWithholdingRate > 0 && asset.tax.accountType !== "nisa" && foreignTaxCreditRate === 0) {
    warnings.push({ code: "foreignTaxCreditExcluded", message: "外国税額控除は含みません。" });
  }
  if (asset.tax.foreignWithholdingRate > 0 && foreignTaxCreditRate > 0) {
    warnings.push({ code: "foreignTaxCreditEstimated", message: "外国税額控除は入力率による概算です。" });
  }

  return warnings;
}

export function simulateDividendInvestment(
  input: SimulationInput,
  options: SimulationOptions = {},
): SimulationResult {
  assertValidSimulationInput(input);
  const { asset, settings } = input;
  const monthCount = settings.years * 12;
  const monthly: MonthlyResult[] = [];
  const cashFlows: XirrCashFlow[] = [];
  let priceNative = asset.currentPrice;
  let shares = 0;
  let unusedJpy = settings.initialInvestmentJpy;
  let unusedNative = 0;
  let cumulativeCashDividendJpy = 0;
  let cumulativeContributionJpy = settings.initialInvestmentJpy;
  let targetReachedMonthIndex: number | null = null;

  if (settings.initialInvestmentJpy > 0) {
    cashFlows.push({ date: settings.startDate, amount: -settings.initialInvestmentJpy });
  }

  for (let monthIndex = 0; monthIndex < monthCount; monthIndex += 1) {
    const monthStartDate = addMonths(settings.startDate, monthIndex);
    const monthEndDate = getMonthEnd(settings.startDate, monthIndex);
    const baseFx = getFxRateAtMonth(
      asset.currency,
      settings.initialFxJpyPerCurrency,
      settings.annualFxChangeRate,
      monthIndex,
    );
    const fxRates = getFxRates(asset.currency, baseFx, asset.costs.fxSpreadRate);
    const annualDividendPerShareNative = getAnnualDividendPerShareAtMonth(
      asset.annualDividendPerShare,
      asset.growth,
      monthIndex,
    );

    unusedJpy += settings.monthlyContributionJpy;
    cumulativeContributionJpy += settings.monthlyContributionJpy;
    if (settings.monthlyContributionJpy > 0) {
      cashFlows.push({ date: monthStartDate, amount: -settings.monthlyContributionJpy });
    }

    const primaryPurchase = calculateJpyPurchase({
      availableJpy: unusedJpy,
      priceNative,
      fxRates,
      fractionalSharesAllowed: settings.fractionalSharesAllowed,
      costs: asset.costs,
    });
    shares += primaryPurchase.units;
    unusedJpy = primaryPurchase.unusedJpy;

    const grossDividendNative = getGrossDistributionNative(
      shares,
      annualDividendPerShareNative,
      asset.distributionSchedule,
      getCalendarMonth(monthStartDate),
    );
    const tax = calculateTax(grossDividendNative, asset.tax);
    const reinvestmentAllocationNative = tax.netDividend * settings.dividendReinvestmentRate;
    const cashDividendNative = tax.netDividend * (1 - settings.dividendReinvestmentRate);
    const reinvestmentPurchase = calculateNativePurchase({
      availableNative: unusedNative + reinvestmentAllocationNative,
      priceNative,
      baseFxJpyPerCurrency: fxRates.base,
      fractionalSharesAllowed: settings.fractionalSharesAllowed,
      costs: asset.costs,
    });
    shares += reinvestmentPurchase.units;
    unusedNative = reinvestmentPurchase.unusedNative;

    const cashDividendJpy = cashDividendNative * fxRates.sell;
    cumulativeCashDividendJpy += cashDividendJpy;
    if (cashDividendJpy > 0) cashFlows.push({ date: monthEndDate, amount: cashDividendJpy });

    const endingPriceNative = growPriceOneMonth(asset, priceNative);
    const endingBaseFx = getFxRateAtMonth(
      asset.currency,
      settings.initialFxJpyPerCurrency,
      settings.annualFxChangeRate,
      monthIndex + 1,
    );
    const endingFxRates = getFxRates(asset.currency, endingBaseFx, asset.costs.fxSpreadRate);
    const marketValueJpy = shares * endingPriceNative * endingFxRates.base;
    const totalWealthJpy = marketValueJpy
      + unusedJpy
      + unusedNative * endingFxRates.base
      + cumulativeCashDividendJpy;
    const forwardNetAnnualDividendJpy = calculateForwardNetAnnualDividendJpy(
      shares * annualDividendPerShareNative,
      asset.tax,
      endingFxRates.sell,
    );

    if (
      targetReachedMonthIndex === null
      && settings.targetNetAnnualDividendJpy !== undefined
      && forwardNetAnnualDividendJpy >= settings.targetNetAnnualDividendJpy
    ) {
      targetReachedMonthIndex = monthIndex;
    }

    monthly.push({
      monthIndex,
      date: monthEndDate,
      priceNative: endingPriceNative,
      fxJpyPerCurrency: endingFxRates.base,
      annualDividendPerShareNative,
      shares,
      contributedJpy: cumulativeContributionJpy,
      grossDividendJpy: grossDividendNative * fxRates.base,
      foreignTaxJpy: tax.foreignTax * fxRates.base,
      foreignTaxCreditJpy: tax.foreignTaxCredit * fxRates.base,
      domesticTaxJpy: tax.domesticTax * fxRates.base,
      netDividendJpy: tax.netDividend * fxRates.base,
      reinvestedDividendJpy: reinvestmentAllocationNative * fxRates.base,
      cashDividendJpy,
      buyFeesJpy: primaryPurchase.buyFeeJpy + reinvestmentPurchase.buyFeeJpy,
      fxCostsJpy: primaryPurchase.fxCostJpy + cashDividendNative * (fxRates.base - fxRates.sell),
      unusedJpy,
      unusedNative,
      marketValueJpy,
      totalWealthJpy,
      forwardNetAnnualDividendJpy,
    });

    priceNative = endingPriceNative;
  }

  const last = monthly.at(-1)!;
  const endingFxRates = getFxRates(asset.currency, last.fxJpyPerCurrency, asset.costs.fxSpreadRate);
  const liquidation = calculateLiquidation(last.shares, last.priceNative, endingFxRates, asset.costs);
  const endingMarketValueJpy = settings.liquidateAtEnd
    ? liquidation.liquidationValueJpy
    : last.marketValueJpy;
  const endingTotalWealthJpy = endingMarketValueJpy
    + last.unusedJpy
    + last.unusedNative * endingFxRates.base
    + cumulativeCashDividendJpy;
  const finalExternalValueJpy = endingMarketValueJpy
    + last.unusedJpy
    + last.unusedNative * endingFxRates.base;
  if (finalExternalValueJpy > 0) {
    cashFlows.push({ date: last.date, amount: finalExternalValueJpy });
  }

  const forwardGrossAnnualDividendJpy = last.shares
    * last.annualDividendPerShareNative
    * endingFxRates.base;
  const forwardNetAnnualDividendJpy = calculateForwardNetAnnualDividendJpy(
    last.shares * last.annualDividendPerShareNative,
    asset.tax,
    endingFxRates.sell,
  );
  const totalGainJpy = endingTotalWealthJpy - cumulativeContributionJpy;

  const summary = {
    cumulativeContributionJpy,
    endingShares: last.shares,
    endingPriceNative: last.priceNative,
    endingMarketValueJpy,
    endingTotalWealthJpy,
    totalGainJpy,
    cumulativeGrossDividendJpy: sum(monthly, "grossDividendJpy"),
    cumulativeForeignTaxJpy: sum(monthly, "foreignTaxJpy"),
    cumulativeForeignTaxCreditJpy: sum(monthly, "foreignTaxCreditJpy"),
    cumulativeDomesticTaxJpy: sum(monthly, "domesticTaxJpy"),
    cumulativeNetDividendJpy: sum(monthly, "netDividendJpy"),
    cumulativeCashDividendJpy,
    cumulativeReinvestedDividendJpy: sum(monthly, "reinvestedDividendJpy"),
    cumulativeBuyFeesJpy: sum(monthly, "buyFeesJpy"),
    cumulativeFxCostsJpy: sum(monthly, "fxCostsJpy"),
    endingSaleFeeJpy: settings.liquidateAtEnd ? liquidation.saleFeeJpy : 0,
    endingLiquidationFxCostJpy: settings.liquidateAtEnd ? liquidation.fxCostJpy : 0,
    forwardGrossAnnualDividendJpy,
    forwardNetAnnualDividendJpy,
    grossYieldOnCost: safeRatio(forwardGrossAnnualDividendJpy, cumulativeContributionJpy),
    netYieldOnCost: safeRatio(forwardNetAnnualDividendJpy, cumulativeContributionJpy),
    cumulativeTotalReturn: safeRatio(totalGainJpy, cumulativeContributionJpy),
    xirr: options.calculateXirr === false ? null : calculateXirr(cashFlows),
    principalRetention: safeRatio(endingMarketValueJpy, cumulativeContributionJpy),
    unitValueRetention: safeRatio(last.priceNative, asset.currentPrice),
    targetReachedMonthIndex,
  };

  return {
    monthly,
    annual: aggregateAnnualResults(monthly),
    summary,
    warnings: buildWarnings(input, monthly),
  };
}
