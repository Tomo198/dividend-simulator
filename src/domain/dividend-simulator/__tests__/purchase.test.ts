import { describe, expect, it } from "vitest";
import { getFxRates } from "../costs";
import { calculateJpyPurchase } from "../purchase";
import { createAsset } from "./fixtures";

describe("calculateJpyPurchase", () => {
  const calculate = (overrides: Partial<Parameters<typeof calculateJpyPurchase>[0]> = {}) => {
    const asset = createAsset();
    return calculateJpyPurchase({
      availableJpy: 1_050,
      priceNative: 100,
      fxRates: getFxRates("JPY", 1, 0),
      fractionalSharesAllowed: true,
      costs: asset.costs,
      ...overrides,
    });
  };

  it("手数料0で端数株を購入する", () => {
    const result = calculate();
    expect(result.units).toBeCloseTo(10.5);
    expect(result.unusedJpy).toBe(0);
  });

  it("端数株なしでは整数へ切り捨てる", () => {
    const result = calculate({ fractionalSharesAllowed: false });
    expect(result.units).toBe(10);
    expect(result.unusedJpy).toBe(50);
  });

  it("固定手数料を購入可能額から控除する", () => {
    const costs = createAsset({ costs: { buyFixedFeeJpy: 50 } }).costs;
    const result = calculate({ costs });
    expect(result.units).toBe(10);
    expect(result.buyFeeJpy).toBe(50);
  });

  it("率手数料を購入可能額から控除する", () => {
    const costs = createAsset({ costs: { buyFeeRate: 0.05 } }).costs;
    const result = calculate({ costs });
    expect(result.assetNotionalJpy).toBeCloseTo(1_000);
    expect(result.buyFeeJpy).toBeCloseTo(50);
  });

  it("固定手数料が原資以上なら購入せず繰り越す", () => {
    const costs = createAsset({ costs: { buyFixedFeeJpy: 1_050 } }).costs;
    const result = calculate({ costs });
    expect(result.units).toBe(0);
    expect(result.unusedJpy).toBe(1_050);
  });

  it("USD購入では買い為替とスプレッド費用を適用する", () => {
    const fxRates = getFxRates("USD", 150, 0.01);
    const result = calculate({ availableJpy: 15_150, priceNative: 100, fxRates });
    expect(result.units).toBeCloseTo(1);
    expect(result.fxCostJpy).toBeCloseTo(150);
  });

  it("端数株不可の未投資現金を保存する", () => {
    const result = calculate({ availableJpy: 999, fractionalSharesAllowed: false });
    expect(result.units).toBe(9);
    expect(result.unusedJpy).toBe(99);
  });
});
