import type {
  DomesticTaxBaseMode,
  ReturnBasis,
  SimulationInput,
} from "@/src/domain/dividend-simulator";

export type TaxTreatment = "foreignCredit" | "noForeignCredit" | "nisa" | "custom";

export interface SimulatorFormValues {
  assetName: string;
  currentPrice: string;
  annualDividendPerShare: string;
  initialYieldPercent: string;
  initialInvestmentJpy: string;
  monthlyContributionJpy: string;
  years: string;
  stableDividendGrowthRatePercent: string;
  annualPriceGrowthRatePercent: string;
  dividendReinvestmentRatePercent: string;
  taxTreatment: TaxTreatment;
  expenseRatioPercent: string;
  returnBasis: ReturnBasis;
  foreignWithholdingRatePercent: string;
  foreignTaxCreditRatePercent: string;
  domesticTaxRatePercent: string;
  domesticTaxBaseMode: DomesticTaxBaseMode;
  targetAmount: string;
  targetPeriod: "monthly" | "annual";
  targetBasis: "gross" | "net";
  targetDeadlineEnabled: boolean;
  targetDeadlineYears: string;
  contributionPlanA: string;
  contributionPlanB: string;
  contributionPlanC: string;
}

export const INITIAL_FORM_VALUES: SimulatorFormValues = {
  assetName: "サンプルETF",
  currentPrice: "10000",
  annualDividendPerShare: "400",
  initialYieldPercent: "4",
  initialInvestmentJpy: "1000000",
  monthlyContributionJpy: "30000",
  years: "20",
  stableDividendGrowthRatePercent: "2",
  annualPriceGrowthRatePercent: "3",
  dividendReinvestmentRatePercent: "100",
  taxTreatment: "noForeignCredit",
  expenseRatioPercent: "0",
  returnBasis: "netOfExpense",
  foreignWithholdingRatePercent: "0",
  foreignTaxCreditRatePercent: "0",
  domesticTaxRatePercent: "20.315",
  domesticTaxBaseMode: "afterForeignTax",
  targetAmount: "50000",
  targetPeriod: "monthly",
  targetBasis: "net",
  targetDeadlineEnabled: false,
  targetDeadlineYears: "10",
  contributionPlanA: "18000",
  contributionPlanB: "30000",
  contributionPlanC: "45000",
};

const numberValue = (value: string) => value.trim() === "" ? Number.NaN : Number(value);
const percentValue = (value: string) => numberValue(value) / 100;

const MONTHLY_DISTRIBUTION_SCHEDULE = {
  paymentMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  weights: Array.from({ length: 12 }, () => 1 / 12),
};

const INTERNAL_START_DATE = "2000-01-01";

export function calculateYieldPercent(price: string, annualDividend: string): string {
  const priceValue = numberValue(price);
  const dividendValue = numberValue(annualDividend);
  if (!(priceValue > 0) || !Number.isFinite(dividendValue)) return "";
  return String(Number(((dividendValue / priceValue) * 100).toFixed(6)));
}

export function calculateAnnualDividend(price: string, yieldPercent: string): string {
  const priceValue = numberValue(price);
  const yieldValue = numberValue(yieldPercent);
  if (!(priceValue > 0) || !Number.isFinite(yieldValue)) return "";
  return String(Number((priceValue * yieldValue / 100).toFixed(6)));
}

export function annualizeTargetAmount(values: SimulatorFormValues): number {
  const amount = numberValue(values.targetAmount);
  return values.targetPeriod === "monthly" ? amount * 12 : amount;
}

export function buildContributionPlanValues(monthlyContributionJpy: string): [string, string, string] {
  const contribution = numberValue(monthlyContributionJpy);
  if (!Number.isFinite(contribution) || contribution <= 0) return ["10000", "30000", "50000"];
  return [0.6, 1, 1.5].map((multiplier) => String(Math.round(contribution * multiplier))) as [string, string, string];
}

export function buildSimulationInput(values: SimulatorFormValues): SimulationInput {
  const accountType = values.taxTreatment === "nisa"
    ? "nisa"
    : values.taxTreatment === "custom"
      ? "custom"
      : "taxable";
  const domesticTaxRate = values.taxTreatment === "nisa"
    ? 0
    : values.taxTreatment === "custom"
      ? percentValue(values.domesticTaxRatePercent)
      : 0.20315;
  const foreignTaxCreditRate = values.taxTreatment === "foreignCredit"
    ? 1
    : values.taxTreatment === "custom"
      ? percentValue(values.foreignTaxCreditRatePercent)
      : 0;
  return {
    asset: {
      id: "single-asset",
      name: values.assetName,
      assetType: "etf",
      currency: "JPY",
      currentPrice: numberValue(values.currentPrice),
      annualDividendPerShare: numberValue(values.annualDividendPerShare),
      distributionSchedule: MONTHLY_DISTRIBUTION_SCHEDULE,
      growth: {
        highGrowthYears: 0,
        initialDividendGrowthRate: percentValue(values.stableDividendGrowthRatePercent),
        stableDividendGrowthRate: percentValue(values.stableDividendGrowthRatePercent),
        dividendEvents: [],
        annualPriceGrowthRate: percentValue(values.annualPriceGrowthRatePercent),
        returnBasis: values.returnBasis,
      },
      tax: {
        accountType,
        foreignWithholdingRate: percentValue(values.foreignWithholdingRatePercent),
        foreignTaxCreditRate,
        domesticTaxRate,
        domesticTaxBaseMode: values.taxTreatment === "custom"
          ? values.domesticTaxBaseMode
          : "afterForeignTax",
      },
      costs: {
        expenseRatio: percentValue(values.expenseRatioPercent),
        buyFeeRate: 0,
        buyFixedFeeJpy: 0,
        sellFeeRate: 0,
        sellFixedFeeJpy: 0,
        fxSpreadRate: 0,
      },
    },
    settings: {
      startDate: INTERNAL_START_DATE,
      initialInvestmentJpy: numberValue(values.initialInvestmentJpy),
      monthlyContributionJpy: numberValue(values.monthlyContributionJpy),
      years: numberValue(values.years),
      dividendReinvestmentRate: percentValue(values.dividendReinvestmentRatePercent),
      fractionalSharesAllowed: true,
      initialFxJpyPerCurrency: 1,
      annualFxChangeRate: 0,
      liquidateAtEnd: false,
    },
  };
}
