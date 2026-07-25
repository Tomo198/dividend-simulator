import type { XirrCashFlow } from "./types";

interface NormalizedCashFlow {
  days: number;
  amount: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function normalizeCashFlows(cashFlows: XirrCashFlow[]): NormalizedCashFlow[] | null {
  const parsed = cashFlows
    .filter((cashFlow) => cashFlow.amount !== 0)
    .map((cashFlow) => ({
      time: cashFlow.date instanceof Date
        ? cashFlow.date.getTime()
        : Date.parse(`${cashFlow.date}T00:00:00Z`),
      amount: cashFlow.amount,
    }));

  if (parsed.length === 0 || parsed.some((cashFlow) => !Number.isFinite(cashFlow.time) || !Number.isFinite(cashFlow.amount))) {
    return null;
  }

  parsed.sort((left, right) => left.time - right.time);
  const firstTime = parsed[0].time;
  const merged = new Map<number, number>();
  parsed.forEach((cashFlow) => {
    const days = (cashFlow.time - firstTime) / DAY_MS;
    merged.set(days, (merged.get(days) ?? 0) + cashFlow.amount);
  });

  return [...merged.entries()]
    .map(([days, amount]) => ({ days, amount }))
    .filter((cashFlow) => cashFlow.amount !== 0);
}

function npv(rate: number, cashFlows: NormalizedCashFlow[]): number {
  return cashFlows.reduce(
    (total, cashFlow) => total + cashFlow.amount / (1 + rate) ** (cashFlow.days / 365),
    0,
  );
}

function bisectRoot(
  lowerRate: number,
  upperRate: number,
  cashFlows: NormalizedCashFlow[],
): number | null {
  let lower = lowerRate;
  let upper = upperRate;
  let lowerValue = npv(lower, cashFlows);

  for (let iteration = 0; iteration < 200; iteration += 1) {
    const middle = (lower + upper) / 2;
    const middleValue = npv(middle, cashFlows);
    if (!Number.isFinite(middleValue)) return null;
    if (Math.abs(middleValue) < 1e-8 || upper - lower < 1e-10) return middle;

    if (Math.sign(lowerValue) === Math.sign(middleValue)) {
      lower = middle;
      lowerValue = middleValue;
    } else {
      upper = middle;
    }
  }

  return null;
}

export function calculateXirr(cashFlows: XirrCashFlow[]): number | null {
  const normalized = normalizeCashFlows(cashFlows);
  if (!normalized) return null;
  if (!normalized.some((cashFlow) => cashFlow.amount > 0) || !normalized.some((cashFlow) => cashFlow.amount < 0)) {
    return null;
  }

  const roots: number[] = [];
  const brackets: Array<[number, number]> = [];
  const minimumLog = Math.log(0.000001);
  const maximumLog = Math.log(1_000_001);
  const sampleCount = 4096;
  let previousRate = Math.exp(minimumLog) - 1;
  let previousValue = npv(previousRate, normalized);

  for (let index = 1; index <= sampleCount; index += 1) {
    const currentLog = minimumLog + (maximumLog - minimumLog) * (index / sampleCount);
    const currentRate = Math.exp(currentLog) - 1;
    const currentValue = npv(currentRate, normalized);

    if (Number.isFinite(previousValue) && Math.abs(previousValue) < 1e-8) roots.push(previousRate);
    if (Number.isFinite(currentValue) && Number.isFinite(previousValue) && Math.sign(currentValue) !== Math.sign(previousValue)) {
      brackets.push([previousRate, currentRate]);
    }

    previousRate = currentRate;
    previousValue = currentValue;
  }

  brackets.forEach(([lower, upper]) => {
    const root = bisectRoot(lower, upper, normalized);
    if (root !== null) roots.push(root);
  });

  const uniqueRoots = roots
    .filter(Number.isFinite)
    .sort((left, right) => left - right)
    .filter((root, index, sorted) => index === 0 || Math.abs(root - sorted[index - 1]) > 1e-6);

  return uniqueRoots.length === 1 ? uniqueRoots[0] : null;
}
