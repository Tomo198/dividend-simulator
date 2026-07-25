import type {
  AssetAssumption,
  CostProfile,
  GrowthAssumption,
  SimulationInput,
  SimulationSettings,
  TaxProfile,
} from "../types";

type AssetOverrides = Omit<Partial<AssetAssumption>, "costs" | "growth" | "tax" | "distributionSchedule"> & {
  costs?: Partial<CostProfile>;
  growth?: Partial<GrowthAssumption>;
  tax?: Partial<TaxProfile>;
  distributionSchedule?: Partial<AssetAssumption["distributionSchedule"]>;
};

export function createAsset(overrides: AssetOverrides = {}): AssetAssumption {
  const base: AssetAssumption = {
    id: "fixture-jpy-etf",
    name: "固定fixture ETF",
    assetType: "etf",
    currency: "JPY",
    currentPrice: 1_000,
    annualDividendPerShare: 40,
    distributionSchedule: { paymentMonths: [12], weights: [1] },
    growth: {
      highGrowthYears: 0,
      initialDividendGrowthRate: 0,
      stableDividendGrowthRate: 0,
      dividendEvents: [],
      annualPriceGrowthRate: 0,
      returnBasis: "netOfExpense",
    },
    tax: {
      accountType: "custom",
      foreignWithholdingRate: 0,
      domesticTaxRate: 0,
      domesticTaxBaseMode: "afterForeignTax",
    },
    costs: {
      expenseRatio: 0,
      buyFeeRate: 0,
      buyFixedFeeJpy: 0,
      sellFeeRate: 0,
      sellFixedFeeJpy: 0,
      fxSpreadRate: 0,
    },
  };

  return {
    ...base,
    ...overrides,
    distributionSchedule: { ...base.distributionSchedule, ...overrides.distributionSchedule },
    growth: { ...base.growth, ...overrides.growth },
    tax: { ...base.tax, ...overrides.tax },
    costs: { ...base.costs, ...overrides.costs },
  };
}

export function createSettings(overrides: Partial<SimulationSettings> = {}): SimulationSettings {
  return {
    startDate: "2026-01-01",
    initialInvestmentJpy: 1_000_000,
    monthlyContributionJpy: 0,
    years: 1,
    dividendReinvestmentRate: 0,
    fractionalSharesAllowed: true,
    initialFxJpyPerCurrency: 1,
    annualFxChangeRate: 0,
    liquidateAtEnd: false,
    ...overrides,
  };
}

export function createInput(
  assetOverrides: AssetOverrides = {},
  settingsOverrides: Partial<SimulationSettings> = {},
): SimulationInput {
  return {
    asset: createAsset(assetOverrides),
    settings: createSettings(settingsOverrides),
  };
}
