import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { form, FormField, FormRoot, min } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Goal, GoalFundingSummary } from '../../core/models/worth-it.model';
import { FinancialCalculatorService } from '../../core/services/financial-calculator.service';
import { WorthItStore } from '../../core/stores/worth-it.store';
import { EmptyState } from '../../shared/components/empty-state/empty-state';
import { FieldErrors } from '../../shared/components/field-errors/field-errors';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { MonthsPipe } from '../../shared/pipes/months.pipe';

export interface WhatIfSimulationModel {
  extraMonthlySavings: number;
  oneTimeWindfall: number;
}

export interface UpcomingWaterfallItem extends GoalFundingSummary {
  cumulativeFundingRequired: number;
  simulatedTimeline?: GoalFundingSummary;
}

export interface MilestoneProjection {
  months: number;
  label: string;
  baselineAvailableWealth: number;
  simulatedAvailableWealth: number;
  baselineCompletedGoals: Goal[];
  simulatedCompletedGoals: Goal[];
}

@Component({
  selector: 'app-projections',
  standalone: true,
  imports: [
    DatePipe,
    DecimalPipe,
    RouterLink,
    FormRoot,
    FormField,
    FieldErrors,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MoneyPipe,
    MonthsPipe,
    EmptyState,
  ],
  templateUrl: './projections.html',
  styleUrl: './projections.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Projections {
  protected readonly store = inject(WorthItStore);
  private readonly calculator = inject(FinancialCalculatorService);

  readonly currency = computed(() => this.store.settings().baseCurrency || 'PLN');

  readonly wealthSummary = computed(() => this.store.wealthSummary());

  readonly cushionStatus = computed(() => this.store.financialCushionStatus());

  readonly monthlySurplusSummary = computed(() =>
    this.store.monthlySurplusSummary()
  );

  readonly monthlySurplus = computed(
    () => this.store.monthlySurplusSummary().monthlySurplus
  );

  /** 1. Signal Forms model signal for interactive What-If simulation */
  readonly simModel = signal<WhatIfSimulationModel>({
    extraMonthlySavings: 0,
    oneTimeWindfall: 0,
  });

  /** 2. Signal form definition with schema validation */
  readonly simForm = form(
    this.simModel,
    (path) => {
      min(path.oneTimeWindfall, 0, { message: 'Must be ≥ 0' });
    },
    {
      submission: {
        action: async () => undefined,
      },
    }
  );

  readonly isSimulationActive = computed(() => {
    const extra = Number(this.simModel().extraMonthlySavings) || 0;
    const windfall = Number(this.simModel().oneTimeWindfall) || 0;
    return extra !== 0 || windfall !== 0;
  });

  readonly simulatedMonthlySurplus = computed(() => {
    const extra = Number(this.simModel().extraMonthlySavings) || 0;
    return this.monthlySurplus() + extra;
  });

  readonly windfall = computed(() => {
    return Math.max(0, Number(this.simModel().oneTimeWindfall) || 0);
  });

  readonly windfallToCushion = computed(() => {
    return Math.min(this.windfall(), this.wealthSummary().cushionDeficit);
  });

  readonly simulatedCushionDeficit = computed(() => {
    return Math.max(
      0,
      this.wealthSummary().cushionDeficit - this.windfallToCushion()
    );
  });

  readonly windfallToGoals = computed(() => {
    return this.windfall() - this.windfallToCushion();
  });

  readonly simulatedAvailableForGoals = computed(() => {
    return this.wealthSummary().availableForGoals + this.windfallToGoals();
  });

  readonly simulatedCushionMonths = computed(() => {
    return this.calculator.calculateCushionCompletionMonths(
      this.simulatedCushionDeficit(),
      this.simulatedMonthlySurplus()
    );
  });

  readonly simulatedCushionDate = computed(() => {
    return this.calculator.calculateDateFromNow(this.simulatedCushionMonths());
  });

  readonly simulatedGoalsTimeline = computed(() => {
    const goals = this.store.goals();
    return this.calculator.calculateGoalsFundingSummary(
      goals,
      this.simulatedAvailableForGoals(),
      this.simulatedCushionDeficit(),
      this.simulatedMonthlySurplus()
    );
  });

  readonly activeGoalFunding = computed(() => {
    const active = this.store.activeGoal();
    if (!active) return null;
    return (
      this.store.goalsWithFunding().find((g) => g.goal.id === active.id) ?? null
    );
  });

  readonly simulatedActiveGoalFunding = computed(() => {
    const active = this.store.activeGoal();
    if (!active) return null;
    return (
      this.simulatedGoalsTimeline().find((g) => g.goal.id === active.id) ?? null
    );
  });

  readonly upcomingWaterfallItems = computed<UpcomingWaterfallItem[]>(() => {
    const upcoming = this.store.upcomingGoals();
    if (!upcoming.length) return [];
    const baselineFunding = this.store.goalsWithFunding();
    const simFunding = this.simulatedGoalsTimeline();

    let cumulative = this.wealthSummary().cushionDeficit;
    const active = this.store.activeGoal();
    if (active) {
      const activeItem = baselineFunding.find((g) => g.goal.id === active.id);
      if (activeItem) {
        cumulative += activeItem.remainingAmount;
      }
    }

    return upcoming.map((goal) => {
      const base = baselineFunding.find((g) => g.goal.id === goal.id);
      const sim = simFunding.find((g) => g.goal.id === goal.id);
      const remaining = base?.remainingAmount ?? goal.targetAmount;
      cumulative += remaining;
      return {
        goal,
        currentProgress: base?.currentProgress ?? 0,
        remainingAmount: remaining,
        progressPercent: base?.progressPercent ?? 0,
        isFullyFunded: base?.isFullyFunded ?? false,
        estimatedCompletionMonths: base?.estimatedCompletionMonths ?? null,
        estimatedCompletionDate: base?.estimatedCompletionDate ?? null,
        cumulativeFundingRequired: cumulative,
        simulatedTimeline: sim,
      };
    });
  });

  readonly milestoneSchedule = computed<MilestoneProjection[]>(() => {
    const horizons = [
      { months: 6, label: '6 Months' },
      { months: 12, label: '1 Year' },
      { months: 24, label: '2 Years' },
      { months: 36, label: '3 Years' },
      { months: 60, label: '5 Years' },
    ];

    const baselineAvailable = this.wealthSummary().availableForGoals;
    const baselineSurplus = this.monthlySurplus();
    const baselineCushionDeficit = this.wealthSummary().cushionDeficit;
    const baselineGoals = this.store.goalsWithFunding();

    const simAvailable = this.simulatedAvailableForGoals();
    const simSurplus = this.simulatedMonthlySurplus();
    const simCushionDeficit = this.simulatedCushionDeficit();
    const simGoals = this.simulatedGoalsTimeline();

    return horizons.map(({ months, label }) => {
      const baselineWealth = Math.max(
        0,
        Math.round(
          (baselineAvailable + baselineSurplus * months - baselineCushionDeficit) *
            100
        ) / 100
      );
      const simulatedWealth = Math.max(
        0,
        Math.round(
          (simAvailable + simSurplus * months - simCushionDeficit) * 100
        ) / 100
      );

      const baselineCompleted = baselineGoals
        .filter(
          (g) =>
            g.goal.isCompleted ||
            (g.estimatedCompletionMonths !== null &&
              g.estimatedCompletionMonths <= months)
        )
        .map((g) => g.goal);

      const simulatedCompleted = simGoals
        .filter(
          (g) =>
            g.goal.isCompleted ||
            (g.estimatedCompletionMonths !== null &&
              g.estimatedCompletionMonths <= months)
        )
        .map((g) => g.goal);

      return {
        months,
        label,
        baselineAvailableWealth: baselineWealth,
        simulatedAvailableWealth: simulatedWealth,
        baselineCompletedGoals: baselineCompleted,
        simulatedCompletedGoals: simulatedCompleted,
      };
    });
  });

  resetSimulation(): void {
    this.simModel.set({ extraMonthlySavings: 0, oneTimeWindfall: 0 });
    this.simForm().reset();
  }
}
