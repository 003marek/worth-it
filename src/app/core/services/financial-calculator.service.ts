import { Injectable } from '@angular/core';
import {
  Asset,
  ExpenseCategory,
  ExpenseRecord,
  FinancialCushionSettings,
  FinancialCushionStatus,
  Goal,
  GoalFundingSummary,
  IncomeRecord,
  IncomeSource,
  MonthlySurplusSummary,
  ProjectionSummary,
  WealthSummary,
} from '../models/worth-it.model';

@Injectable({
  providedIn: 'root',
})
export class FinancialCalculatorService {
  /**
   * Average days in a Gregorian month (365.25 / 12) for date projection.
   */
  private readonly DAYS_PER_MONTH = 30.4375;

  /**
   * Asset balance converted to the base currency using its manual exchange rate (default 1).
   */
  assetValueInBase(asset: Asset): number {
    const rate = Number(asset.exchangeRateToBase);
    const safeRate = Number.isFinite(rate) && rate > 0 ? rate : 1;
    return (Number(asset.balance) || 0) * safeRate;
  }

  /**
   * Recorded assets total = sum of all recorded asset balances (converted to base currency).
   */
  calculateTotalWealth(assets: Asset[]): number {
    if (!assets || assets.length === 0) return 0;
    const sum = assets.reduce((acc, a) => acc + this.assetValueInBase(a), 0);
    return Math.round(sum * 100) / 100;
  }

  /**
   * Goal-eligible wealth = sum of assets where isGoalEligible === true.
   */
  calculateGoalEligibleWealth(assets: Asset[]): number {
    if (!assets || assets.length === 0) return 0;
    const sum = assets
      .filter((a) => a.isGoalEligible)
      .reduce((acc, a) => acc + this.assetValueInBase(a), 0);
    return Math.round(sum * 100) / 100;
  }

  /**
   * Excluded wealth = sum of assets where isGoalEligible === false.
   */
  calculateExcludedWealth(assets: Asset[]): number {
    if (!assets || assets.length === 0) return 0;
    const sum = assets
      .filter((a) => !a.isGoalEligible)
      .reduce((acc, a) => acc + this.assetValueInBase(a), 0);
    return Math.round(sum * 100) / 100;
  }

  /**
   * Pending adjustments (spec §7.2 accounting rule):
   * actual income records add to wealth and actual expense records subtract from it,
   * but ONLY while they are not yet reflected in a manually updated asset balance.
   * Expected (non-actual) records never affect actual wealth (spec §16.9).
   * Users do not pick an account for expenses, so adjustments apply to goal-eligible wealth.
   */
  calculatePendingAdjustments(
    incomeRecords: IncomeRecord[] = [],
    expenseRecords: ExpenseRecord[] = []
  ): number {
    const income = incomeRecords
      .filter((r) => r.isActual && !r.isReflectedInBalances)
      .reduce((acc, r) => acc + (Number(r.amount) || 0), 0);
    const expenses = expenseRecords
      .filter((r) => r.isActual && !r.isReflectedInBalances)
      .reduce((acc, r) => acc + (Number(r.amount) || 0), 0);
    return Math.round((income - expenses) * 100) / 100;
  }

  /**
   * Financial Cushion Target = cushion.isEnabled ? (averageMonthlyExpenses * coverageMonths) : 0.
   */
  calculateCushionTarget(
    cushion: FinancialCushionSettings | null | undefined
  ): number {
    if (!cushion || !cushion.isEnabled) return 0;
    const monthlyExp = Math.max(0, Number(cushion.averageMonthlyExpenses) || 0);
    const months = Math.max(0, Number(cushion.coverageMonths) || 0);
    return Math.round(monthlyExp * months * 100) / 100;
  }

  /**
   * Financial Cushion funded amount = min(goalEligibleWealth, cushionTarget).
   */
  calculateCushionFunded(
    goalEligibleWealth: number,
    cushionTarget: number
  ): number {
    if (cushionTarget <= 0) return 0;
    const safeEligible = Math.max(0, goalEligibleWealth);
    return Math.min(safeEligible, cushionTarget);
  }

  /**
   * Cushion deficit = cushionTarget - cushionFunded.
   */
  calculateCushionDeficit(
    cushionTarget: number,
    cushionFunded: number
  ): number {
    return Math.max(0, Math.round((cushionTarget - cushionFunded) * 100) / 100);
  }

  /**
   * Cushion funded percentage (0 to 100).
   * When target is 0 (or disabled), percentage is 100.
   */
  calculateCushionPercent(
    cushionTarget: number,
    cushionFunded: number
  ): number {
    if (cushionTarget <= 0) return 100;
    const pct = (cushionFunded / cushionTarget) * 100;
    return Math.min(100, Math.max(0, Math.round(pct * 100) / 100));
  }

  /**
   * Completed-goal reserves = sum of (goal.reservedAmount ?? 0)
   * for completed goals with completionChoice === 'reserve'.
   */
  calculateReservedAmounts(goals: Goal[]): number {
    if (!goals || goals.length === 0) return 0;
    const sum = goals
      .filter((g) => g.isCompleted && g.completionChoice === 'reserve')
      .reduce((acc, g) => acc + (Number(g.reservedAmount) || 0), 0);
    return Math.round(sum * 100) / 100;
  }

  /**
   * Wealth available for goals = max(0, goalEligibleWealth - cushionFunded - completedGoalReserves).
   */
  calculateAvailableForGoals(
    goalEligibleWealth: number,
    cushionFunded: number,
    reservedAmounts: number
  ): number {
    const available = goalEligibleWealth - cushionFunded - reservedAmounts;
    return Math.max(0, Math.round(available * 100) / 100);
  }

  /**
   * Complete Wealth Summary computation.
   */
  calculateWealthSummary(
    assets: Asset[],
    goals: Goal[],
    cushion: FinancialCushionSettings | null | undefined,
    incomeRecords: IncomeRecord[] = [],
    expenseRecords: ExpenseRecord[] = []
  ): WealthSummary {
    const recordedAssetsTotal = this.calculateTotalWealth(assets);
    const pendingAdjustments = this.calculatePendingAdjustments(
      incomeRecords,
      expenseRecords
    );
    const totalWealth =
      Math.round((recordedAssetsTotal + pendingAdjustments) * 100) / 100;
    const goalEligibleWealth = Math.max(
      0,
      Math.round(
        (this.calculateGoalEligibleWealth(assets) + pendingAdjustments) * 100
      ) / 100
    );
    const excludedWealth = this.calculateExcludedWealth(assets);

    const cushionTarget = this.calculateCushionTarget(cushion);
    const cushionFunded = this.calculateCushionFunded(
      goalEligibleWealth,
      cushionTarget
    );
    const cushionDeficit = this.calculateCushionDeficit(
      cushionTarget,
      cushionFunded
    );
    const cushionPercent = this.calculateCushionPercent(
      cushionTarget,
      cushionFunded
    );
    const isCushionFullyFunded = cushionDeficit === 0;

    const reservedAmounts = this.calculateReservedAmounts(goals);
    const availableForGoals = this.calculateAvailableForGoals(
      goalEligibleWealth,
      cushionFunded,
      reservedAmounts
    );

    return {
      recordedAssetsTotal,
      pendingAdjustments,
      totalWealth,
      goalEligibleWealth,
      excludedWealth,
      cushionTarget,
      cushionFunded,
      cushionDeficit,
      cushionPercent,
      isCushionFullyFunded,
      reservedAmounts,
      availableForGoals,
    };
  }

  /**
   * Monthly expected income = sum of enabled income sources normalized to monthly.
   * - monthly: full amount
   * - annual: amount / 12
   * - one_time: 0 (one-off event, excluded from recurring monthly baseline)
   */
  calculateMonthlyIncome(incomeSources: IncomeSource[]): number {
    if (!incomeSources || incomeSources.length === 0) return 0;
    const sum = incomeSources
      .filter((s) => s.isEnabled)
      .reduce((acc, s) => {
        const amt = Number(s.amount) || 0;
        if (s.frequency === 'monthly') {
          return acc + amt;
        } else if (s.frequency === 'annual') {
          return acc + amt / 12;
        }
        return acc;
      }, 0);
    return Math.round(sum * 100) / 100;
  }

  /**
   * Monthly expected expenses = sum of enabled expense categories (expectedMonthlyAmount).
   * If no enabled categories, fall back to cushion averageMonthlyExpenses or 0.
   */
  calculateMonthlyExpenses(
    expenseCategories: ExpenseCategory[],
    cushionSettings?: FinancialCushionSettings | null
  ): number {
    const enabled = (expenseCategories || []).filter((c) => c.isEnabled);
    if (enabled.length > 0) {
      const sum = enabled.reduce(
        (acc, c) => acc + (Number(c.expectedMonthlyAmount) || 0),
        0
      );
      return Math.round(sum * 100) / 100;
    }
    if (cushionSettings?.averageMonthlyExpenses) {
      return Math.max(0, Number(cushionSettings.averageMonthlyExpenses) || 0);
    }
    return 0;
  }

  /**
   * Monthly net savings / surplus = monthly expected income - monthly expected expenses.
   */
  calculateMonthlySurplus(
    monthlyIncome: number,
    monthlyExpenses: number
  ): number {
    return Math.round((monthlyIncome - monthlyExpenses) * 100) / 100;
  }

  /**
   * Monthly surplus summary grouping income, expenses, and net surplus.
   */
  calculateMonthlySurplusSummary(
    incomeSources: IncomeSource[],
    expenseCategories: ExpenseCategory[],
    cushionSettings?: FinancialCushionSettings | null
  ): MonthlySurplusSummary {
    const monthlyIncome = this.calculateMonthlyIncome(incomeSources);
    const monthlyExpenses = this.calculateMonthlyExpenses(
      expenseCategories,
      cushionSettings
    );
    const monthlySurplus = this.calculateMonthlySurplus(
      monthlyIncome,
      monthlyExpenses
    );
    return {
      monthlyIncome,
      monthlyExpenses,
      monthlySurplus,
    };
  }

  /**
   * Months to fund cushion deficit based on monthly surplus.
   */
  calculateCushionCompletionMonths(
    cushionDeficit: number,
    monthlySurplus: number
  ): number | null {
    if (cushionDeficit <= 0) return 0;
    if (monthlySurplus <= 0) return null;
    return Math.round((cushionDeficit / monthlySurplus) * 10) / 10;
  }

  /**
   * Formats a Date object to YYYY-MM-DD string.
   */
  formatDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /**
   * Calculates estimated completion date given months from referenceDate.
   */
  calculateDateFromNow(
    months: number | null,
    referenceDate?: Date
  ): string | null {
    if (
      months === null ||
      months === undefined ||
      !isFinite(months) ||
      months < 0
    ) {
      return null;
    }
    const ref = referenceDate ? new Date(referenceDate) : new Date();
    if (months === 0) {
      return this.formatDate(ref);
    }
    const totalDays = Math.round(months * this.DAYS_PER_MONTH);
    ref.setDate(ref.getDate() + totalDays);
    return this.formatDate(ref);
  }

  /**
   * Financial Cushion status object.
   */
  calculateFinancialCushionStatus(
    goalEligibleWealth: number,
    cushion: FinancialCushionSettings | null | undefined,
    monthlySurplus: number = 0,
    referenceDate?: Date
  ): FinancialCushionStatus {
    const isEnabled = !!cushion?.isEnabled;
    const target = this.calculateCushionTarget(cushion);
    const funded = this.calculateCushionFunded(goalEligibleWealth, target);
    const deficit = this.calculateCushionDeficit(target, funded);
    const percent = this.calculateCushionPercent(target, funded);
    const isFullyFunded = deficit === 0;

    let estimatedCompletionMonths: number | null = null;
    let estimatedCompletionDate: string | null = null;

    if (isFullyFunded) {
      estimatedCompletionMonths = 0;
      estimatedCompletionDate = null;
    } else if (monthlySurplus > 0) {
      const rawMonths = deficit / monthlySurplus;
      estimatedCompletionMonths = Math.round(rawMonths * 10) / 10;
      estimatedCompletionDate = this.calculateDateFromNow(
        rawMonths,
        referenceDate
      );
    }

    return {
      target,
      funded,
      deficit,
      percent,
      isFullyFunded,
      isEnabled,
      estimatedCompletionMonths,
      estimatedCompletionDate,
    };
  }

  /**
   * Goals Funding Summary calculation.
   * Goals are sequential, ordered by 'order' ascending.
   * - Completed goals: progress = targetAmount, remaining = 0, fully funded.
   * - Uncompleted goals:
   *   - Active goal: first uncompleted goal.
   *   - Upcoming goals: subsequent uncompleted goals.
   *   - Wealth cascades through uncompleted goals.
   *   - Projections consider cushion deficit first, then accumulate goal remaining amounts.
   */
  calculateGoalsFundingSummary(
    goals: Goal[],
    availableGoalWealth: number,
    cushionDeficit: number = 0,
    monthlySurplus: number = 0,
    referenceDate?: Date
  ): GoalFundingSummary[] {
    if (!goals || goals.length === 0) return [];

    const sortedGoals = [...goals].sort((a, b) => a.order - b.order);
    let remainingWealthPool = Math.max(0, availableGoalWealth);
    let accumulatedDeficit = Math.max(0, cushionDeficit);

    return sortedGoals.map((goal) => {
      if (goal.isCompleted) {
        return {
          goal,
          currentProgress: goal.targetAmount,
          remainingAmount: 0,
          progressPercent: 100,
          isFullyFunded: true,
          estimatedCompletionMonths: 0,
          estimatedCompletionDate: null,
        };
      }

      // Skipped goals are kept for reference but excluded from the funding sequence.
      if (goal.isSkipped) {
        return {
          goal,
          currentProgress: 0,
          remainingAmount: Math.max(0, goal.targetAmount),
          progressPercent: 0,
          isFullyFunded: false,
          estimatedCompletionMonths: null,
          estimatedCompletionDate: null,
        };
      }

      const target = Math.max(0, goal.targetAmount);
      const currentProgress = Math.min(remainingWealthPool, target);
      const remainingAmount = Math.max(0, target - currentProgress);
      const progressPercent =
        target > 0
          ? Math.min(
              100,
              Math.max(0, Math.round(((currentProgress / target) * 100) * 100) / 100)
            )
          : 100;
      const isFullyFunded = currentProgress >= target;

      remainingWealthPool = Math.max(0, remainingWealthPool - currentProgress);

      let estimatedCompletionMonths: number | null = null;
      let estimatedCompletionDate: string | null = null;

      if (isFullyFunded) {
        estimatedCompletionMonths = 0;
        estimatedCompletionDate = null;
      } else if (monthlySurplus > 0) {
        accumulatedDeficit += remainingAmount;
        const rawMonths = accumulatedDeficit / monthlySurplus;
        estimatedCompletionMonths = Math.round(rawMonths * 10) / 10;
        estimatedCompletionDate = this.calculateDateFromNow(
          rawMonths,
          referenceDate
        );
      }

      return {
        goal,
        currentProgress,
        remainingAmount,
        progressPercent,
        isFullyFunded,
        estimatedCompletionMonths,
        estimatedCompletionDate,
      };
    });
  }

  /**
   * Complete Projection Summary.
   */
  calculateProjectionSummary(
    incomeSources: IncomeSource[],
    expenseCategories: ExpenseCategory[],
    cushion: FinancialCushionSettings | null | undefined,
    goals: Goal[],
    availableGoalWealth: number,
    cushionDeficit: number,
    referenceDate?: Date
  ): ProjectionSummary {
    const surplusSummary = this.calculateMonthlySurplusSummary(
      incomeSources,
      expenseCategories,
      cushion
    );
    const { monthlyIncome, monthlyExpenses, monthlySurplus } = surplusSummary;

    const cushionMonthsToFund = this.calculateCushionCompletionMonths(
      cushionDeficit,
      monthlySurplus
    );
    const cushionEstimatedCompletionDate =
      cushionMonthsToFund !== null && cushionMonthsToFund > 0
        ? this.calculateDateFromNow(cushionMonthsToFund, referenceDate)
        : null;

    const goalsTimeline = this.calculateGoalsFundingSummary(
      goals,
      availableGoalWealth,
      cushionDeficit,
      monthlySurplus,
      referenceDate
    );

    return {
      monthlyIncome,
      monthlyExpenses,
      monthlySurplus,
      cushionMonthsToFund,
      cushionEstimatedCompletionDate,
      goalsTimeline,
    };
  }
}
