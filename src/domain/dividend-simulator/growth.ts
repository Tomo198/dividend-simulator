import type {
  AssetAssumption,
  Currency,
  DistributionSchedule,
  GrowthAssumption,
} from "./types";

export function getAnnualDividendPerShareAtMonth(
  initialAnnualDividendPerShare: number,
  growth: GrowthAssumption,
  monthIndex: number,
): number {
  const yearIndex = Math.floor(monthIndex / 12);
  const highGrowthYears = Math.min(yearIndex, growth.highGrowthYears);
  const stableGrowthYears = Math.max(0, yearIndex - growth.highGrowthYears);
  const eventMultiplier = growth.dividendEvents
    .filter((event) => event.monthIndex <= monthIndex)
    .reduce((product, event) => product * event.multiplier, 1);

  return initialAnnualDividendPerShare
    * (1 + growth.initialDividendGrowthRate) ** highGrowthYears
    * (1 + growth.stableDividendGrowthRate) ** stableGrowthYears
    * eventMultiplier;
}

export function getMonthlyPriceFactor(growth: GrowthAssumption, expenseRatio: number): number {
  const growthFactor = (1 + growth.annualPriceGrowthRate) ** (1 / 12);
  if (growth.returnBasis === "netOfExpense") return growthFactor;
  return growthFactor * (1 - expenseRatio) ** (1 / 12);
}

export function getFxRateAtMonth(
  currency: Currency,
  initialFxJpyPerCurrency: number,
  annualFxChangeRate: number,
  monthIndex: number,
): number {
  if (currency === "JPY") return 1;
  return initialFxJpyPerCurrency * (1 + annualFxChangeRate) ** (monthIndex / 12);
}

export function getDistributionWeight(
  schedule: DistributionSchedule,
  calendarMonth: number,
): number {
  const index = schedule.paymentMonths.indexOf(calendarMonth);
  return index === -1 ? 0 : schedule.weights[index];
}

export function getGrossDistributionNative(
  shares: number,
  annualDividendPerShareNative: number,
  schedule: DistributionSchedule,
  calendarMonth: number,
): number {
  return shares
    * annualDividendPerShareNative
    * getDistributionWeight(schedule, calendarMonth);
}

export function growPriceOneMonth(asset: AssetAssumption, priceNative: number): number {
  return Math.max(0, priceNative * getMonthlyPriceFactor(asset.growth, asset.costs.expenseRatio));
}
