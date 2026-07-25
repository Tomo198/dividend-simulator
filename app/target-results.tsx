"use client";

import { useMemo } from "react";
import {
  calculateRequiredInitialInvestment,
  calculateRequiredMonthlyContribution,
  findTargetReachedMonthIndex,
  simulateDividendInvestment,
  type SimulationInput,
  type SimulationResult,
} from "@/src/domain/dividend-simulator";
import { annualizeTargetAmount, type SimulatorFormValues } from "./simulator-model";

const jpyFormatter = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});
const unitFormatter = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 6 });

const formatJpy = (value: number) => jpyFormatter.format(Math.round(value));
const formatElapsed = (monthIndex: number) => {
  const months = monthIndex + 1;
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  if (years === 0) return `${remainingMonths}か月目`;
  if (remainingMonths === 0) return `${years}年目`;
  return `${years}年${remainingMonths}か月目`;
};

interface TargetResultsProps {
  form: SimulatorFormValues;
  input: SimulationInput;
  baseResult: SimulationResult;
}

interface TargetIssue {
  message: string;
}

function validateTargetValues(form: SimulatorFormValues, years: number): TargetIssue[] {
  const issues: TargetIssue[] = [];
  const targetAnnual = annualizeTargetAmount(form);
  if (!Number.isFinite(targetAnnual) || targetAnnual <= 0) {
    issues.push({ message: "目標配当は1円以上で入力してください。" });
  }
  if (form.targetDeadlineEnabled) {
    const deadlineYears = Number(form.targetDeadlineYears);
    if (!Number.isInteger(deadlineYears) || deadlineYears < 1 || deadlineYears > years) {
      issues.push({ message: `期限は1〜${years}年で入力してください。` });
    }
  }
  [form.contributionPlanA, form.contributionPlanB, form.contributionPlanC].forEach((value, index) => {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) {
      issues.push({ message: `プラン${index + 1}は0円以上で入力してください。` });
    }
  });
  return issues;
}

export function TargetResults({ form, input, baseResult }: TargetResultsProps) {
  const issues = validateTargetValues(form, input.settings.years);
  const targetAnnualDividendJpy = annualizeTargetAmount(form);
  const deadlineMonthIndex = form.targetDeadlineEnabled
    ? Number(form.targetDeadlineYears) * 12 - 1
    : undefined;

  const calculation = useMemo(() => {
    if (issues.length > 0) return null;
    const basis = form.targetBasis;
    const requiredInitial = calculateRequiredInitialInvestment(input, targetAnnualDividendJpy, basis);
    const currentReachedMonthIndex = findTargetReachedMonthIndex(
      input,
      baseResult,
      targetAnnualDividendJpy,
      basis,
    );
    const requiredMonthly = deadlineMonthIndex === undefined
      ? undefined
      : calculateRequiredMonthlyContribution(input, {
          targetAnnualDividendJpy,
          deadlineMonthIndex,
          basis,
        });
    const planAmounts = [
      Number(form.contributionPlanA),
      Number(form.contributionPlanB),
      Number(form.contributionPlanC),
    ];
    const plans = planAmounts.map((monthlyContributionJpy, index) => {
      const planInput: SimulationInput = {
        asset: input.asset,
        settings: {
          ...input.settings,
          monthlyContributionJpy,
          targetNetAnnualDividendJpy: undefined,
          targetDeadlineMonthIndex: undefined,
        },
      };
      const planResult = monthlyContributionJpy === input.settings.monthlyContributionJpy
        ? baseResult
        : simulateDividendInvestment(planInput, { calculateXirr: false });
      const reachedMonthIndex = findTargetReachedMonthIndex(
        planInput,
        planResult,
        targetAnnualDividendJpy,
        basis,
      );
      return {
        id: index + 1,
        monthlyContributionJpy,
        reachedMonthIndex,
        reachedMonth: reachedMonthIndex === null ? null : planResult.monthly[reachedMonthIndex],
      };
    });

    return {
      requiredInitial,
      currentReachedMonthIndex,
      currentReachedMonth: currentReachedMonthIndex === null ? null : baseResult.monthly[currentReachedMonthIndex],
      requiredMonthly,
      plans,
    };
  }, [
    baseResult,
    deadlineMonthIndex,
    form.contributionPlanA,
    form.contributionPlanB,
    form.contributionPlanC,
    form.targetBasis,
    input,
    issues.length,
    targetAnnualDividendJpy,
  ]);

  if (!calculation) {
    return (
      <div className="validation-panel" role="alert">
        <h3>目標を確認</h3>
        <p>修正すると自動で更新されます。</p>
        <ul>{issues.map((issue) => <li key={issue.message}>{issue.message}</li>)}</ul>
      </div>
    );
  }

  const required = calculation.requiredInitial;
  const shortage = required
    ? Math.max(0, required.requiredInvestmentJpy - input.settings.initialInvestmentJpy)
    : null;
  const targetPeriodLabel = form.targetPeriod === "monthly" ? "月額" : "年額";
  const targetBasisLabel = form.targetBasis === "net" ? "税引後" : "税引前";
  const targetDisplayAmount = form.targetPeriod === "monthly"
    ? targetAnnualDividendJpy / 12
    : targetAnnualDividendJpy;
  return (
    <div className="target-results" id="target-results">
      <section className="target-summary" aria-labelledby="target-summary-title">
        <div className="target-goal-label">
          <p>{targetBasisLabel}・{targetPeriodLabel}目標</p>
          <strong id="target-summary-title">{formatJpy(targetDisplayAmount)}</strong>
          <span>年額換算 {formatJpy(targetAnnualDividendJpy)}</span>
        </div>

        {required ? (
          <div className="target-primary-result">
            <p>今、必要な投資額</p>
            <strong>{formatJpy(required.requiredInvestmentJpy)}</strong>
            <span>現在価格・税率で概算</span>
          </div>
        ) : (
          <div className="target-unavailable" role="status">
            <strong>必要額を計算できません</strong>
            <p>{form.targetBasis === "net" ? "利回りまたは手取りが0です。" : "利回りが0です。"}</p>
          </div>
        )}
      </section>

      <div className="target-kpi-grid" aria-label="目標逆算の結果">
        <article>
          <p>不足額</p>
          <strong>{shortage === null ? "算出不可" : shortage === 0 ? "達成済み" : formatJpy(shortage)}</strong>
          <span>現在の投資額 {formatJpy(input.settings.initialInvestmentJpy)}</span>
        </article>
        <article>
          <p>必要口数</p>
          <strong>{required ? `${unitFormatter.format(required.requiredShares)}口` : "算出不可"}</strong>
          <span>端数口数で計算</span>
        </article>
        <article>
          <p>目標達成</p>
          <strong>{calculation.currentReachedMonthIndex === null ? "期間内に届かない" : formatElapsed(calculation.currentReachedMonthIndex)}</strong>
          <span>{calculation.currentReachedMonthIndex === null ? `${input.settings.years}年では届きません` : "運用開始から"}</span>
        </article>
        <article>
          <p>達成までの投資額</p>
          <strong>{calculation.currentReachedMonth ? formatJpy(calculation.currentReachedMonth.contributedJpy) : "—"}</strong>
          <span>初期投資＋積立</span>
        </article>
        <article>
          <p>達成時の評価額</p>
          <strong>{calculation.currentReachedMonth ? formatJpy(calculation.currentReachedMonth.marketValueJpy) : "—"}</strong>
          <span>受取配当・未投資現金を除く</span>
        </article>
        <article>
          <p>単純計算の必要額</p>
          <strong>{required ? formatJpy(required.approximateInvestmentJpy) : "—"}</strong>
          <span>現在利回りだけで概算</span>
        </article>
      </div>

      {form.targetDeadlineEnabled && (
        <section className="deadline-result" aria-labelledby="deadline-result-title">
          <div>
            <p className="panel-kicker">期限あり</p>
            <h3 id="deadline-result-title">{form.targetDeadlineYears}年以内に必要な積立</h3>
          </div>
          {calculation.requiredMonthly ? (
            <strong>{formatJpy(calculation.requiredMonthly.requiredMonthlyContributionJpy)}<small>／月</small></strong>
          ) : (
            <strong className="unavailable-value">算出不可</strong>
          )}
          <p>
            {calculation.requiredMonthly
              ? "現在の投資額から、期限内に届く最小額です。"
              : "この条件では必要額を計算できません。"}
          </p>
        </section>
      )}

      <section className="plan-comparison" aria-labelledby="plan-comparison-title">
        <div className="section-heading">
          <div>
            <p className="panel-kicker">積立プラン</p>
            <h2 id="plan-comparison-title">3つの積立額を比較</h2>
          </div>
          <p>積立額は左側で変更できます。</p>
        </div>
        <div className="plan-grid">
          {calculation.plans.map((plan) => (
            <article key={plan.id}>
              <span>プラン {plan.id}</span>
              <strong>{formatJpy(plan.monthlyContributionJpy)}<small>／月</small></strong>
              {plan.reachedMonth ? (
                <dl>
                  <div><dt>達成時期</dt><dd>{formatElapsed(plan.reachedMonthIndex!)}</dd></div>
                  <div><dt>累計投資額</dt><dd>{formatJpy(plan.reachedMonth.contributedJpy)}</dd></div>
                  <div><dt>評価額</dt><dd>{formatJpy(plan.reachedMonth.marketValueJpy)}</dd></div>
                </dl>
              ) : (
                <div className="plan-unreached">
                  <strong>期間内に届かない</strong>
                  <p>{input.settings.years}年では目標に届きません。</p>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="target-notes" aria-labelledby="target-notes-title">
        <h2 id="target-notes-title">計算の前提</h2>
        <ul>
          <li>達成時期は、その時点から1年間の想定手取りで判定します。</li>
          <li>入力した価格・配当・税率・将来設定が続く前提です。</li>
          <li>税額・外国税額控除・端数処理は概算です。</li>
        </ul>
      </section>
    </div>
  );
}
