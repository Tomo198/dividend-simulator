import type { CostProfile } from "./types";
import type { FxRates } from "./costs";

export interface JpyPurchaseInput {
  availableJpy: number;
  priceNative: number;
  fxRates: FxRates;
  fractionalSharesAllowed: boolean;
  costs: CostProfile;
}

export interface JpyPurchaseResult {
  units: number;
  assetNotionalJpy: number;
  buyFeeJpy: number;
  totalCashJpy: number;
  unusedJpy: number;
  fxCostJpy: number;
}

export interface NativePurchaseInput {
  availableNative: number;
  priceNative: number;
  baseFxJpyPerCurrency: number;
  fractionalSharesAllowed: boolean;
  costs: CostProfile;
}

export interface NativePurchaseResult {
  units: number;
  assetNotionalNative: number;
  buyFeeNative: number;
  buyFeeJpy: number;
  totalCashNative: number;
  unusedNative: number;
}

const clampTinyRemainder = (value: number) => Math.abs(value) < 1e-9 ? 0 : Math.max(0, value);

export function calculateJpyPurchase(input: JpyPurchaseInput): JpyPurchaseResult {
  const { availableJpy, priceNative, fxRates, fractionalSharesAllowed, costs } = input;
  if (priceNative <= 0 || fxRates.buy <= 0) {
    return {
      units: 0,
      assetNotionalJpy: 0,
      buyFeeJpy: 0,
      totalCashJpy: 0,
      unusedJpy: availableJpy,
      fxCostJpy: 0,
    };
  }
  const maxAssetNotionalJpy = Math.max(
    0,
    (availableJpy - costs.buyFixedFeeJpy) / (1 + costs.buyFeeRate),
  );
  const rawUnits = maxAssetNotionalJpy / fxRates.buy / priceNative;
  const units = fractionalSharesAllowed ? rawUnits : Math.floor(rawUnits);

  if (!(units > 0)) {
    return {
      units: 0,
      assetNotionalJpy: 0,
      buyFeeJpy: 0,
      totalCashJpy: 0,
      unusedJpy: availableJpy,
      fxCostJpy: 0,
    };
  }

  const assetNotionalJpy = units * priceNative * fxRates.buy;
  const buyFeeJpy = costs.buyFixedFeeJpy + assetNotionalJpy * costs.buyFeeRate;
  const totalCashJpy = assetNotionalJpy + buyFeeJpy;

  return {
    units,
    assetNotionalJpy,
    buyFeeJpy,
    totalCashJpy,
    unusedJpy: clampTinyRemainder(availableJpy - totalCashJpy),
    fxCostJpy: units * priceNative * (fxRates.buy - fxRates.base),
  };
}

export function calculateNativePurchase(input: NativePurchaseInput): NativePurchaseResult {
  const { availableNative, priceNative, baseFxJpyPerCurrency, fractionalSharesAllowed, costs } = input;
  if (priceNative <= 0 || baseFxJpyPerCurrency <= 0) {
    return {
      units: 0,
      assetNotionalNative: 0,
      buyFeeNative: 0,
      buyFeeJpy: 0,
      totalCashNative: 0,
      unusedNative: availableNative,
    };
  }
  const fixedFeeNative = costs.buyFixedFeeJpy / baseFxJpyPerCurrency;
  const maxAssetNotionalNative = Math.max(
    0,
    (availableNative - fixedFeeNative) / (1 + costs.buyFeeRate),
  );
  const rawUnits = maxAssetNotionalNative / priceNative;
  const units = fractionalSharesAllowed ? rawUnits : Math.floor(rawUnits);

  if (!(units > 0)) {
    return {
      units: 0,
      assetNotionalNative: 0,
      buyFeeNative: 0,
      buyFeeJpy: 0,
      totalCashNative: 0,
      unusedNative: availableNative,
    };
  }

  const assetNotionalNative = units * priceNative;
  const buyFeeNative = fixedFeeNative + assetNotionalNative * costs.buyFeeRate;
  const totalCashNative = assetNotionalNative + buyFeeNative;

  return {
    units,
    assetNotionalNative,
    buyFeeNative,
    buyFeeJpy: buyFeeNative * baseFxJpyPerCurrency,
    totalCashNative,
    unusedNative: clampTinyRemainder(availableNative - totalCashNative),
  };
}
