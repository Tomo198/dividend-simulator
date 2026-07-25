import { getFxRates } from "./costs";
import { calculateJpyPurchase } from "./purchase";
import { simulateDividendInvestment } from "./simulate";
import { calculateForwardNetAnnualDividendJpy, getNetTaxFactor } from "./tax";
import type { MonthlyResult, SimulationInput, SimulationResult } from "./types";
import { assertValidSimulationInput } from "./validation";

const MAX_INITIAL_INVESTMENT_JPY = 1_000_000_000_000_000;
export const MAX_MONTHLY_CONTRIBUTION_JPY = 100_000_000;

export type TargetDividendBasis = "gross" | "net";

export interface RequiredInitialInvestmentResult {
  requiredInvestmentJpy: number;
  requiredShares: number;
  approximateInvestmentJpy: number;
  forwardGrossAnnualDividendJpy: number;
  forwardNetAnnualDividendJpy: number;
  forwardTargetAnnualDividendJpy: number;
}

export interface RequiredMonthlyContributionResult {
  requiredMonthlyContributionJpy: number;
  forwardGrossAnnualDividendJpy: number;
  forwardNetAnnualDividendJpy: number;
  forwardTargetAnnualDividendJpy: number;
}

export interface RequiredMonthlyContributionOptions {
  targetAnnualDividendJpy?: number;
  deadlineMonthIndex?: number;
  basis?: TargetDividendBasis;
}

interface ForwardDividendAmounts {
  gross: number;
  net: number;
}

function targetAmount(amounts: ForwardDividendAmounts, basis: TargetDividendBasis) {
  return basis === "gross" ? amounts.gross : amounts.net;
}

function forwardAnnualDividendForInvestment(
  input: SimulationInput,
  investmentJpy: number,
): ForwardDividendAmounts & { shares: number } {
  const { asset, settings } = input;
  const fxRates = getFxRates(
    asset.currency,
    asset.currency === "JPY" ? 1 : settings.initialFxJpyPerCurrency,
    asset.costs.fxSpreadRate,
  );
  const purchase = calculateJpyPurchase({
    availableJpy: investmentJpy,
    priceNative: asset.currentPrice,
    fxRates,
    fractionalSharesAllowed: settings.fractionalSharesAllowed,
    costs: asset.costs,
  });
  const grossDividendNative = purchase.units * asset.annualDividendPerShare;

  return {
    shares: purchase.units,
    gross: grossDividendNative * fxRates.sell,
    net: calculateForwardNetAnnualDividendJpy(grossDividendNative, asset.tax, fxRates.sell),
  };
}

export function getForwardAnnualDividendJpyAtMonth(
  input: SimulationInput,
  month: MonthlyResult,
  basis: TargetDividendBasis = "net",
): number {
  const fxRates = getFxRates(
    input.asset.currency,
    month.fxJpyPerCurrency,
    input.asset.costs.fxSpreadRate,
  );
  const grossDividendNative = month.shares * month.annualDividendPerShareNative;
  const amounts = {
    gross: grossDividendNative * fxRates.sell,
    net: calculateForwardNetAnnualDividendJpy(grossDividendNative, input.asset.tax, fxRates.sell),
  };
  return targetAmount(amounts, basis);
}

export function findTargetReachedMonthIndex(
  input: SimulationInput,
  result: SimulationResult,
  targetAnnualDividendJpy: number,
  basis: TargetDividendBasis = "net",
): number | null {
  const reached = result.monthly.find((month) => (
    getForwardAnnualDividendJpyAtMonth(input, month, basis) >= targetAnnualDividendJpy
  ));
  return reached?.monthIndex ?? null;
}

export function calculateRequiredInitialInvestment(
  input: SimulationInput,
  targetAnnualDividendJpy = input.settings.targetNetAnnualDividendJpy,
  basis: TargetDividendBasis = "net",
): RequiredInitialInvestmentResult | null {
  assertValidSimulationInput(input);
  if (targetAnnualDividendJpy === undefined) return null;
  if (targetAnnualDividendJpy <= 0) {
    return {
      requiredInvestmentJpy: 0,
      requiredShares: 0,
      approximateInvestmentJpy: 0,
      forwardGrossAnnualDividendJpy: 0,
      forwardNetAnnualDividendJpy: 0,
      forwardTargetAnnualDividendJpy: 0,
    };
  }

  const initialYield = input.asset.annualDividendPerShare / input.asset.currentPrice;
  const netTaxFactor = getNetTaxFactor(input.asset.tax);
  const targetFactor = basis === "gross" ? 1 : netTaxFactor;
  if (initialYield <= 0 || targetFactor <= 0) return null;

  const approximateInvestmentJpy = targetAnnualDividendJpy / (initialYield * targetFactor);
  let upper = Math.min(MAX_INITIAL_INVESTMENT_JPY, Math.max(1, Math.ceil(approximateInvestmentJpy)));
  while (
    upper < MAX_INITIAL_INVESTMENT_JPY
    && targetAmount(forwardAnnualDividendForInvestment(input, upper), basis) < targetAnnualDividendJpy
  ) {
    upper = Math.min(MAX_INITIAL_INVESTMENT_JPY, upper * 2);
  }
  if (targetAmount(forwardAnnualDividendForInvestment(input, upper), basis) < targetAnnualDividendJpy) return null;

  let lower = 0;
  while (lower < upper) {
    const middle = Math.floor((lower + upper) / 2);
    if (targetAmount(forwardAnnualDividendForInvestment(input, middle), basis) >= targetAnnualDividendJpy) {
      upper = middle;
    } else {
      lower = middle + 1;
    }
  }

  const exact = forwardAnnualDividendForInvestment(input, lower);
  return {
    requiredInvestmentJpy: lower,
    requiredShares: exact.shares,
    approximateInvestmentJpy,
    forwardGrossAnnualDividendJpy: exact.gross,
    forwardNetAnnualDividendJpy: exact.net,
    forwardTargetAnnualDividendJpy: targetAmount(exact, basis),
  };
}

export function calculateRequiredMonthlyContribution(
  input: SimulationInput,
  options: RequiredMonthlyContributionOptions = {},
): RequiredMonthlyContributionResult | null {
  assertValidSimulationInput(input);
  const target = options.targetAnnualDividendJpy ?? input.settings.targetNetAnnualDividendJpy;
  const deadline = options.deadlineMonthIndex ?? input.settings.targetDeadlineMonthIndex;
  const basis = options.basis ?? "net";
  if (target === undefined || deadline === undefined || deadline >= input.settings.years * 12) return null;
  if (target <= 0) {
    return {
      requiredMonthlyContributionJpy: 0,
      forwardGrossAnnualDividendJpy: 0,
      forwardNetAnnualDividendJpy: 0,
      forwardTargetAnnualDividendJpy: 0,
    };
  }

  const evaluate = (monthlyContributionJpy: number) => {
    const result = simulateDividendInvestment({
      asset: input.asset,
      settings: {
        ...input.settings,
        monthlyContributionJpy,
        targetNetAnnualDividendJpy: undefined,
        targetDeadlineMonthIndex: undefined,
      },
    }, { calculateXirr: false });
    const month = result.monthly[deadline];
    const fxRates = getFxRates(input.asset.currency, month.fxJpyPerCurrency, input.asset.costs.fxSpreadRate);
    const grossDividendNative = month.shares * month.annualDividendPerShareNative;
    return {
      gross: grossDividendNative * fxRates.sell,
      net: calculateForwardNetAnnualDividendJpy(grossDividendNative, input.asset.tax, fxRates.sell),
    };
  };

  const initialOnly = evaluate(0);
  if (targetAmount(initialOnly, basis) >= target) {
    return {
      requiredMonthlyContributionJpy: 0,
      forwardGrossAnnualDividendJpy: initialOnly.gross,
      forwardNetAnnualDividendJpy: initialOnly.net,
      forwardTargetAnnualDividendJpy: targetAmount(initialOnly, basis),
    };
  }

  let upper = 1;
  while (upper < MAX_MONTHLY_CONTRIBUTION_JPY && targetAmount(evaluate(upper), basis) < target) upper *= 2;
  upper = Math.min(upper, MAX_MONTHLY_CONTRIBUTION_JPY);
  if (targetAmount(evaluate(upper), basis) < target) return null;

  let lower = 0;
  while (lower < upper) {
    const middle = Math.floor((lower + upper) / 2);
    if (targetAmount(evaluate(middle), basis) >= target) upper = middle;
    else lower = middle + 1;
  }

  const exact = evaluate(lower);
  return {
    requiredMonthlyContributionJpy: lower,
    forwardGrossAnnualDividendJpy: exact.gross,
    forwardNetAnnualDividendJpy: exact.net,
    forwardTargetAnnualDividendJpy: targetAmount(exact, basis),
  };
}
