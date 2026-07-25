export type AssetType = "etf" | "stock" | "reit";
export type Currency = "JPY" | "USD";
export type AccountType = "taxable" | "nisa" | "custom";
export type ReturnBasis = "netOfExpense" | "grossBeforeExpense";
export type DomesticTaxBaseMode = "afterForeignTax" | "grossDividend";

export interface DividendEvent {
  monthIndex: number;
  multiplier: number;
  label?: string;
}

export interface DistributionSchedule {
  paymentMonths: number[];
  weights: number[];
}

export interface GrowthAssumption {
  highGrowthYears: number;
  initialDividendGrowthRate: number;
  stableDividendGrowthRate: number;
  dividendEvents: DividendEvent[];
  annualPriceGrowthRate: number;
  returnBasis: ReturnBasis;
}

export interface TaxProfile {
  accountType: AccountType;
  foreignWithholdingRate: number;
  foreignTaxCreditRate?: number;
  domesticTaxRate: number;
  domesticTaxBaseMode: DomesticTaxBaseMode;
}

export interface CostProfile {
  expenseRatio: number;
  buyFeeRate: number;
  buyFixedFeeJpy: number;
  sellFeeRate: number;
  sellFixedFeeJpy: number;
  fxSpreadRate: number;
}

export interface AssetAssumption {
  id: string;
  name: string;
  ticker?: string;
  assetType: AssetType;
  currency: Currency;
  currentPrice: number;
  annualDividendPerShare: number;
  distributionSchedule: DistributionSchedule;
  growth: GrowthAssumption;
  tax: TaxProfile;
  costs: CostProfile;
  sourceUpdatedAt?: string;
}

export interface SimulationSettings {
  startDate: string;
  initialInvestmentJpy: number;
  monthlyContributionJpy: number;
  years: number;
  dividendReinvestmentRate: number;
  fractionalSharesAllowed: boolean;
  initialFxJpyPerCurrency: number;
  annualFxChangeRate: number;
  liquidateAtEnd: boolean;
  targetNetAnnualDividendJpy?: number;
  targetDeadlineMonthIndex?: number;
}

export interface SimulationInput {
  asset: AssetAssumption;
  settings: SimulationSettings;
}

export interface MonthlyResult {
  monthIndex: number;
  date: string;
  priceNative: number;
  fxJpyPerCurrency: number;
  annualDividendPerShareNative: number;
  shares: number;
  contributedJpy: number;
  grossDividendJpy: number;
  foreignTaxJpy: number;
  foreignTaxCreditJpy: number;
  domesticTaxJpy: number;
  netDividendJpy: number;
  reinvestedDividendJpy: number;
  cashDividendJpy: number;
  buyFeesJpy: number;
  fxCostsJpy: number;
  unusedJpy: number;
  unusedNative: number;
  marketValueJpy: number;
  totalWealthJpy: number;
  forwardNetAnnualDividendJpy: number;
}

export interface AnnualResult {
  yearIndex: number;
  periodStartDate: string;
  periodEndDate: string;
  contributedJpy: number;
  grossDividendJpy: number;
  foreignTaxJpy: number;
  foreignTaxCreditJpy: number;
  domesticTaxJpy: number;
  netDividendJpy: number;
  reinvestedDividendJpy: number;
  cashDividendJpy: number;
  buyFeesJpy: number;
  fxCostsJpy: number;
  endingShares: number;
  endingPriceNative: number;
  endingForwardYield: number | null;
  endingFxJpyPerCurrency: number;
  endingMarketValueJpy: number;
  endingTotalWealthJpy: number;
  forwardNetAnnualDividendJpy: number;
}

export type SimulationWarningCode =
  | "largeNegativePriceGrowth"
  | "highDividendGrowth"
  | "marketValueBelowContribution"
  | "nonPositiveNetTaxFactor"
  | "targetNotReached"
  | "capitalGainsTaxExcluded"
  | "foreignTaxCreditExcluded"
  | "foreignTaxCreditEstimated";

export interface SimulationWarning {
  code: SimulationWarningCode;
  message: string;
  monthIndex?: number;
}

export interface SimulationSummary {
  cumulativeContributionJpy: number;
  endingShares: number;
  endingPriceNative: number;
  endingMarketValueJpy: number;
  endingTotalWealthJpy: number;
  totalGainJpy: number;
  cumulativeGrossDividendJpy: number;
  cumulativeForeignTaxJpy: number;
  cumulativeForeignTaxCreditJpy: number;
  cumulativeDomesticTaxJpy: number;
  cumulativeNetDividendJpy: number;
  cumulativeCashDividendJpy: number;
  cumulativeReinvestedDividendJpy: number;
  cumulativeBuyFeesJpy: number;
  cumulativeFxCostsJpy: number;
  endingSaleFeeJpy: number;
  endingLiquidationFxCostJpy: number;
  forwardGrossAnnualDividendJpy: number;
  forwardNetAnnualDividendJpy: number;
  grossYieldOnCost: number | null;
  netYieldOnCost: number | null;
  cumulativeTotalReturn: number | null;
  xirr: number | null;
  principalRetention: number | null;
  unitValueRetention: number | null;
  targetReachedMonthIndex: number | null;
}

export interface SimulationResult {
  monthly: MonthlyResult[];
  annual: AnnualResult[];
  summary: SimulationSummary;
  warnings: SimulationWarning[];
}

export interface TaxBreakdown {
  grossDividend: number;
  foreignTax: number;
  foreignTaxCredit: number;
  domesticTax: number;
  netDividend: number;
}

export interface XirrCashFlow {
  date: string | Date;
  amount: number;
}
