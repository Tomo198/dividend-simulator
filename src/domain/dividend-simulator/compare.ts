import { safeRatio } from "./aggregate";
import { simulateDividendInvestment } from "./simulate";
import {
  calculateRequiredInitialInvestment,
  calculateRequiredMonthlyContribution,
  findTargetReachedMonthIndex,
  type RequiredInitialInvestmentResult,
  type RequiredMonthlyContributionResult,
} from "./target";
import type { SimulationInput, SimulationResult } from "./types";

export interface ComparisonInputItem {
  id: string;
  name: string;
  input: SimulationInput;
}

export interface ComparisonOptions {
  targetNetAnnualDividendJpy?: number;
}

export interface ComparisonStability {
  endingWealthTopCount: number;
  endingDividendTopCount: number;
  targetMissCount: number;
}

export interface ComparisonAssetResult extends ComparisonInputItem {
  result: SimulationResult;
  initialYield: number | null;
  firstYearNetDividendJpy: number;
  fifthYearNetDividendJpy: number | null;
  tenthYearNetDividendJpy: number | null;
  endingYearNetDividendJpy: number;
  unitValueRetention: number | null;
  requiredTargetInvestment: RequiredInitialInvestmentResult | null;
  requiredMonthlyContribution: RequiredMonthlyContributionResult | null;
  targetReachedMonthIndex: number | null;
  stability: ComparisonStability;
}

export interface ComparisonHighlights {
  firstYearNetDividend: string[];
  tenthYearNetDividend: string[];
  endingTotalWealth: string[];
  lowestExpenseRatio: string[];
  fastestTarget: string[];
  principalRetention: string[];
}

export interface ComparisonResult {
  items: ComparisonAssetResult[];
  highlights: ComparisonHighlights;
  narratives: string[];
  stressCaseCount: number;
}

interface StressCase {
  dividendChangePoint: number;
  priceChangePoint: number;
}

const STRESS_CASES: readonly StressCase[] = [
  { dividendChangePoint: 0, priceChangePoint: 0 },
  { dividendChangePoint: -0.03, priceChangePoint: 0 },
  { dividendChangePoint: 0, priceChangePoint: -0.03 },
  { dividendChangePoint: -0.03, priceChangePoint: -0.03 },
];

function tiedIds(
  items: ComparisonAssetResult[],
  value: (item: ComparisonAssetResult) => number | null,
  direction: "max" | "min",
): string[] {
  const rows = items
    .map((item) => ({ id: item.id, value: value(item) }))
    .filter((row): row is { id: string; value: number } => row.value !== null && Number.isFinite(row.value));
  if (rows.length === 0) return [];
  const best = direction === "max"
    ? Math.max(...rows.map((row) => row.value))
    : Math.min(...rows.map((row) => row.value));
  const tolerance = Math.max(1, Math.abs(best)) * 1e-10;
  return rows.filter((row) => Math.abs(row.value - best) <= tolerance).map((row) => row.id);
}

function applyStress(input: SimulationInput, stress: StressCase): SimulationInput {
  const dividendRate = Math.max(-0.9999, input.asset.growth.stableDividendGrowthRate + stress.dividendChangePoint);
  const priceRate = Math.max(-0.9999, input.asset.growth.annualPriceGrowthRate + stress.priceChangePoint);
  return {
    asset: {
      ...input.asset,
      growth: {
        ...input.asset.growth,
        initialDividendGrowthRate: dividendRate,
        stableDividendGrowthRate: dividendRate,
        annualPriceGrowthRate: priceRate,
      },
    },
    settings: input.settings,
  };
}

function namesFor(ids: string[], items: ComparisonAssetResult[]) {
  return ids.map((id) => items.find((item) => item.id === id)?.name ?? id).join("・");
}

function buildNarratives(items: ComparisonAssetResult[], highlights: ComparisonHighlights): string[] {
  const narratives = [
    highlights.firstYearNetDividend.length > 0
      ? `${namesFor(highlights.firstYearNetDividend, items)}は1年目の手取り配当が最大。`
      : null,
    highlights.tenthYearNetDividend.length > 0
      ? `${namesFor(highlights.tenthYearNetDividend, items)}は10年目の手取り配当が最大。`
      : null,
    highlights.endingTotalWealth.length > 0
      ? `${namesFor(highlights.endingTotalWealth, items)}は期末の総資産が最大。`
      : null,
    highlights.lowestExpenseRatio.length > 0
      ? `${namesFor(highlights.lowestExpenseRatio, items)}は経費率が最小。`
      : null,
    highlights.fastestTarget.length > 0
      ? `${namesFor(highlights.fastestTarget, items)}は目標達成が最速。`
      : null,
  ];
  return narratives.filter((item): item is string => item !== null).slice(0, 5);
}

export function compareSimulationInputs(
  inputs: ComparisonInputItem[],
  options: ComparisonOptions = {},
): ComparisonResult {
  if (inputs.length < 1 || inputs.length > 3) {
    throw new RangeError("確認・比較対象は1〜3件にしてください。");
  }
  if (new Set(inputs.map((item) => item.id)).size !== inputs.length) {
    throw new RangeError("比較対象のIDは重複できません。");
  }

  const target = options.targetNetAnnualDividendJpy;
  const baseItems = inputs.map((item): ComparisonAssetResult => {
    const result = simulateDividendInvestment(item.input);
    const endingYear = result.annual.at(-1);
    return {
      ...item,
      result,
      initialYield: safeRatio(item.input.asset.annualDividendPerShare, item.input.asset.currentPrice),
      firstYearNetDividendJpy: result.annual[0]?.netDividendJpy ?? 0,
      fifthYearNetDividendJpy: result.annual[4]?.netDividendJpy ?? null,
      tenthYearNetDividendJpy: result.annual[9]?.netDividendJpy ?? null,
      endingYearNetDividendJpy: endingYear?.netDividendJpy ?? 0,
      unitValueRetention: safeRatio(endingYear?.endingPriceNative ?? 0, item.input.asset.currentPrice),
      requiredTargetInvestment: target === undefined
        ? null
        : calculateRequiredInitialInvestment(item.input, target, "net"),
      requiredMonthlyContribution: target === undefined
        ? null
        : calculateRequiredMonthlyContribution(item.input, {
            targetAnnualDividendJpy: target,
            deadlineMonthIndex: item.input.settings.years * 12 - 1,
            basis: "net",
          }),
      targetReachedMonthIndex: target === undefined
        ? null
        : findTargetReachedMonthIndex(item.input, result, target, "net"),
      stability: { endingWealthTopCount: 0, endingDividendTopCount: 0, targetMissCount: 0 },
    };
  });

  STRESS_CASES.forEach((stress, stressIndex) => {
    const stressed = baseItems.map((item) => {
      const input = stressIndex === 0 ? item.input : applyStress(item.input, stress);
      const result = stressIndex === 0
        ? item.result
        : simulateDividendInvestment(input, { calculateXirr: false });
      return { item, input, result };
    });
    const wealthMaximum = Math.max(...stressed.map(({ result }) => result.summary.endingTotalWealthJpy));
    const dividendMaximum = Math.max(...stressed.map(({ result }) => result.summary.forwardNetAnnualDividendJpy));
    stressed.forEach(({ item, input, result }) => {
      if (Math.abs(result.summary.endingTotalWealthJpy - wealthMaximum) <= Math.max(1, wealthMaximum) * 1e-10) {
        item.stability.endingWealthTopCount += 1;
      }
      if (Math.abs(result.summary.forwardNetAnnualDividendJpy - dividendMaximum) <= Math.max(1, dividendMaximum) * 1e-10) {
        item.stability.endingDividendTopCount += 1;
      }
      if (target !== undefined && findTargetReachedMonthIndex(input, result, target, "net") === null) {
        item.stability.targetMissCount += 1;
      }
    });
  });

  const highlights: ComparisonHighlights = {
    firstYearNetDividend: tiedIds(baseItems, (item) => item.firstYearNetDividendJpy, "max"),
    tenthYearNetDividend: tiedIds(baseItems, (item) => item.tenthYearNetDividendJpy, "max"),
    endingTotalWealth: tiedIds(baseItems, (item) => item.result.summary.endingTotalWealthJpy, "max"),
    lowestExpenseRatio: tiedIds(baseItems, (item) => item.input.asset.costs.expenseRatio, "min"),
    fastestTarget: tiedIds(baseItems, (item) => item.targetReachedMonthIndex, "min"),
    principalRetention: tiedIds(baseItems, (item) => item.result.summary.principalRetention, "max"),
  };

  return {
    items: baseItems,
    highlights,
    narratives: buildNarratives(baseItems, highlights),
    stressCaseCount: STRESS_CASES.length,
  };
}
