import type { CostProfile, Currency } from "./types";

export interface FxRates {
  base: number;
  buy: number;
  sell: number;
}

export interface LiquidationResult {
  grossSaleJpy: number;
  saleFeeJpy: number;
  liquidationValueJpy: number;
  fxCostJpy: number;
}

export function getFxRates(
  currency: Currency,
  baseFxJpyPerCurrency: number,
  fxSpreadRate: number,
): FxRates {
  if (currency === "JPY") return { base: 1, buy: 1, sell: 1 };

  return {
    base: baseFxJpyPerCurrency,
    buy: baseFxJpyPerCurrency * (1 + fxSpreadRate),
    sell: baseFxJpyPerCurrency * (1 - fxSpreadRate),
  };
}

export function calculateLiquidation(
  shares: number,
  priceNative: number,
  fxRates: FxRates,
  costs: CostProfile,
): LiquidationResult {
  if (shares <= 0 || priceNative <= 0) {
    return { grossSaleJpy: 0, saleFeeJpy: 0, liquidationValueJpy: 0, fxCostJpy: 0 };
  }

  const grossSaleJpy = shares * priceNative * fxRates.sell;
  const saleFeeJpy = costs.sellFixedFeeJpy + grossSaleJpy * costs.sellFeeRate;
  const fxCostJpy = shares * priceNative * (fxRates.base - fxRates.sell);

  return {
    grossSaleJpy,
    saleFeeJpy,
    liquidationValueJpy: Math.max(0, grossSaleJpy - saleFeeJpy),
    fxCostJpy,
  };
}
