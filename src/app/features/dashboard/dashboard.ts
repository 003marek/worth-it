import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { DashboardLayout } from '../../core/models/worth-it.model';
import { StorageService } from '../../core/services/storage.service';
import { WorthItStore } from '../../core/stores/worth-it.store';
import { EmptyState } from '../../shared/components/empty-state/empty-state';
import { MetricTile } from '../../shared/components/metric-tile/metric-tile';
import { ProgressCard } from '../../shared/components/progress-card/progress-card';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { MonthsPipe } from '../../shared/pipes/months.pipe';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    DatePipe,
    DecimalPipe,
    RouterLink,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    MoneyPipe,
    MonthsPipe,
    MetricTile,
    ProgressCard,
    EmptyState,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dashboard {
  protected readonly store = inject(WorthItStore);
  private readonly storage = inject(StorageService);

  readonly isLoadingDemo = signal(false);

  readonly currency = computed(() => this.store.settings().baseCurrency || 'PLN');

  readonly currentLayout = computed<DashboardLayout>(
    () => this.store.settings().defaultDashboard || 'goal_first'
  );

  readonly isEmptyDatabase = computed(() => {
    return this.store.goals().length === 0 && this.store.assets().length === 0;
  });

  readonly cushionStatus = computed(() => this.store.financialCushionStatus());

  readonly wealthSummary = computed(() => this.store.wealthSummary());

  readonly monthlySurplusSummary = computed(() =>
    this.store.monthlySurplusSummary()
  );

  readonly monthlySurplus = computed(
    () => this.store.monthlySurplusSummary().monthlySurplus
  );

  readonly completedGoalsCount = computed(
    () => this.store.completedGoals().length
  );

  readonly activeGoalSummary = computed(() => {
    const active = this.store.activeGoal();
    if (!active) return null;
    return (
      this.store.goalsWithFunding().find((g) => g.goal.id === active.id) ?? null
    );
  });

  readonly upcomingGoalsFunding = computed(() => {
    const upcoming = this.store.upcomingGoals();
    if (!upcoming.length) return [];
    const ids = new Set(upcoming.map((g) => g.id));
    return this.store.goalsWithFunding().filter((g) => ids.has(g.goal.id));
  });

  readonly totalWealthHint = computed(() => {
    const summary = this.wealthSummary();
    if (summary.pendingAdjustments !== 0) {
      const sign = summary.pendingAdjustments > 0 ? '+' : '';
      return `Assets: ${summary.recordedAssetsTotal} PLN ${sign}${summary.pendingAdjustments} PLN pending`;
    }
    return 'Sum of recorded asset balances';
  });

  readonly assetBreakdown = computed(() => {
    const assets = this.store.assets();
    const total = this.wealthSummary().recordedAssetsTotal;
    return assets.map((a) => {
      const rate =
        a.exchangeRateToBase && a.exchangeRateToBase > 0
          ? a.exchangeRateToBase
          : 1;
      const baseValue = (Number(a.balance) || 0) * rate;
      const percentOfTotal = total > 0 ? (baseValue / total) * 100 : 0;
      return {
        ...a,
        baseValue,
        percentOfTotal,
      };
    });
  });

  async onLayoutChange(layout: DashboardLayout): Promise<void> {
    await this.store.updateSettings({ defaultDashboard: layout });
  }

  async loadDemoData(): Promise<void> {
    this.isLoadingDemo.set(true);
    try {
      await this.storage.seedDemoData(false);
      await this.store.reload();
    } finally {
      this.isLoadingDemo.set(false);
    }
  }

  formatAssetType(type: string): string {
    switch (type) {
      case 'bank_account':
        return 'Bank Account';
      case 'cash':
        return 'Physical Cash';
      case 'stocks_etf':
        return 'Stocks / ETF';
      case 'employer_stock':
        return 'Employer Stock';
      case 'retirement':
        return 'Retirement (IKE/IKZE)';
      case 'other':
        return 'Other Asset';
      default:
        return type;
    }
  }
}
