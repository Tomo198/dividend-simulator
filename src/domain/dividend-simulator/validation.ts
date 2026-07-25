import type {
  AssetAssumption,
  DistributionSchedule,
  SimulationInput,
  SimulationSettings,
} from "./types";

export interface ValidationIssue {
  path: string;
  message: string;
}

export class SimulationValidationError extends Error {
  readonly issues: ValidationIssue[];

  constructor(issues: ValidationIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "));
    this.name = "SimulationValidationError";
    this.issues = issues;
  }
}

const isFiniteNumber = (value: number) => Number.isFinite(value);
const isRate = (value: number) => isFiniteNumber(value) && value >= 0 && value <= 1;
const isGrowthRate = (value: number) => isFiniteNumber(value) && value > -1;

function pushIf(
  issues: ValidationIssue[],
  condition: boolean,
  path: string,
  message: string,
) {
  if (condition) issues.push({ path, message });
}

export function validateDistributionSchedule(
  schedule: DistributionSchedule,
  path = "asset.distributionSchedule",
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { paymentMonths, weights } = schedule;

  pushIf(issues, paymentMonths.length === 0, `${path}.paymentMonths`, "支払月を1件以上指定してください");
  pushIf(issues, paymentMonths.length !== weights.length, path, "支払月と比率の件数を一致させてください");
  pushIf(
    issues,
    paymentMonths.some((month) => !Number.isInteger(month) || month < 1 || month > 12),
    `${path}.paymentMonths`,
    "支払月は1〜12の整数で指定してください",
  );
  pushIf(
    issues,
    new Set(paymentMonths).size !== paymentMonths.length,
    `${path}.paymentMonths`,
    "支払月を重複させないでください",
  );
  pushIf(
    issues,
    weights.some((weight) => !isRate(weight)),
    `${path}.weights`,
    "各回比率は0〜1で指定してください",
  );
  const totalWeight = weights.reduce((total, weight) => total + weight, 0);
  pushIf(
    issues,
    Math.abs(totalWeight - 1) > 0.0001,
    `${path}.weights`,
    "各回比率の合計を1にしてください",
  );

  return issues;
}

export function validateAssetAssumption(asset: AssetAssumption): ValidationIssue[] {
  const issues = validateDistributionSchedule(asset.distributionSchedule);

  pushIf(issues, asset.id.trim().length === 0, "asset.id", "IDは必須です");
  pushIf(issues, !isFiniteNumber(asset.currentPrice) || asset.currentPrice <= 0, "asset.currentPrice", "現在価格は1円以上で入力してください");
  pushIf(issues, !isFiniteNumber(asset.annualDividendPerShare) || asset.annualDividendPerShare < 0, "asset.annualDividendPerShare", "年間配当は0以上にしてください");
  pushIf(issues, !Number.isInteger(asset.growth.highGrowthYears) || asset.growth.highGrowthYears < 0 || asset.growth.highGrowthYears > 50, "asset.growth.highGrowthYears", "初期成長年数は0〜50の整数にしてください");
  pushIf(issues, !isGrowthRate(asset.growth.initialDividendGrowthRate), "asset.growth.initialDividendGrowthRate", "配当の年間変化は-100%より大きくしてください");
  pushIf(issues, !isGrowthRate(asset.growth.stableDividendGrowthRate), "asset.growth.stableDividendGrowthRate", "配当の年間変化は-100%より大きくしてください");
  pushIf(issues, !isGrowthRate(asset.growth.annualPriceGrowthRate), "asset.growth.annualPriceGrowthRate", "価格の年間変化は-100%より大きくしてください");

  asset.growth.dividendEvents.forEach((event, index) => {
    pushIf(issues, !Number.isInteger(event.monthIndex) || event.monthIndex < 0, `asset.growth.dividendEvents.${index}.monthIndex`, "月番号は0以上の整数にしてください");
    pushIf(issues, !isRate(event.multiplier), `asset.growth.dividendEvents.${index}.multiplier`, "イベント倍率は0〜1にしてください");
  });

  const rateEntries: Array<[string, number]> = [
    ["asset.tax.foreignWithholdingRate", asset.tax.foreignWithholdingRate],
    ["asset.tax.foreignTaxCreditRate", asset.tax.foreignTaxCreditRate ?? 0],
    ["asset.tax.domesticTaxRate", asset.tax.domesticTaxRate],
    ["asset.costs.expenseRatio", asset.costs.expenseRatio],
    ["asset.costs.buyFeeRate", asset.costs.buyFeeRate],
    ["asset.costs.sellFeeRate", asset.costs.sellFeeRate],
    ["asset.costs.fxSpreadRate", asset.costs.fxSpreadRate],
  ];
  rateEntries.forEach(([path, value]) => pushIf(issues, !isRate(value), path, "割合は0〜1にしてください"));

  pushIf(issues, !isFiniteNumber(asset.costs.buyFixedFeeJpy) || asset.costs.buyFixedFeeJpy < 0, "asset.costs.buyFixedFeeJpy", "固定手数料は0以上にしてください");
  pushIf(issues, !isFiniteNumber(asset.costs.sellFixedFeeJpy) || asset.costs.sellFixedFeeJpy < 0, "asset.costs.sellFixedFeeJpy", "固定手数料は0以上にしてください");

  return issues;
}

function isValidDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

export function validateSimulationSettings(settings: SimulationSettings): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  pushIf(issues, !isValidDate(settings.startDate), "settings.startDate", "日付はYYYY-MM-DD形式にしてください");
  pushIf(issues, !isFiniteNumber(settings.initialInvestmentJpy) || settings.initialInvestmentJpy < 0, "settings.initialInvestmentJpy", "初期投資は0円以上で入力してください");
  pushIf(issues, !isFiniteNumber(settings.monthlyContributionJpy) || settings.monthlyContributionJpy < 0, "settings.monthlyContributionJpy", "毎月積立は0円以上で入力してください");
  pushIf(issues, !Number.isInteger(settings.years) || settings.years < 1 || settings.years > 50, "settings.years", "運用期間は1〜50年で入力してください");
  pushIf(issues, !isRate(settings.dividendReinvestmentRate), "settings.dividendReinvestmentRate", "再投資率は0〜1にしてください");
  pushIf(issues, !isFiniteNumber(settings.initialFxJpyPerCurrency) || settings.initialFxJpyPerCurrency <= 0, "settings.initialFxJpyPerCurrency", "為替は0より大きくしてください");
  pushIf(issues, !isGrowthRate(settings.annualFxChangeRate), "settings.annualFxChangeRate", "為替変化率は-100%より大きくしてください");

  if (settings.targetNetAnnualDividendJpy !== undefined) {
    pushIf(issues, !isFiniteNumber(settings.targetNetAnnualDividendJpy) || settings.targetNetAnnualDividendJpy < 0, "settings.targetNetAnnualDividendJpy", "目標年額は0以上にしてください");
  }
  if (settings.targetDeadlineMonthIndex !== undefined) {
    pushIf(issues, !Number.isInteger(settings.targetDeadlineMonthIndex) || settings.targetDeadlineMonthIndex < 0, "settings.targetDeadlineMonthIndex", "期限月は0以上の整数にしてください");
    pushIf(issues, settings.targetDeadlineMonthIndex >= settings.years * 12, "settings.targetDeadlineMonthIndex", "期限月は運用期間内にしてください");
  }

  return issues;
}

export function validateSimulationInput(input: SimulationInput): ValidationIssue[] {
  return [
    ...validateAssetAssumption(input.asset),
    ...validateSimulationSettings(input.settings),
  ];
}

export function assertValidSimulationInput(input: SimulationInput): void {
  const issues = validateSimulationInput(input);
  if (issues.length > 0) throw new SimulationValidationError(issues);
}
