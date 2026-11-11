import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { form, FormField, FormRoot, min, required } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';
import {
  ExpenseCategory,
  ExpenseRecord,
  IncomeRecord,
  IncomeSource,
} from '../../core/models/worth-it.model';
import { WorthItStore } from '../../core/stores/worth-it.store';
import { ConfirmDialog } from '../../shared/components/confirm-dialog/confirm-dialog';
import { EmptyState } from '../../shared/components/empty-state/empty-state';
import { FieldErrors } from '../../shared/components/field-errors/field-errors';
import { MetricTile } from '../../shared/components/metric-tile/metric-tile';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { ExpenseCategoryDialog } from './expense-category-dialog';
import { ExpenseRecordDialog } from './expense-record-dialog';
import { IncomeRecordDialog } from './income-record-dialog';
import { IncomeSourceDialog } from './income-source-dialog';
import { SalaryUpdateDialog } from './salary-update-dialog';

@Component({
  selector: 'app-cashflow',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatTabsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    MatChipsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatCheckboxModule,
    MatTooltipModule,
    FormRoot,
    FormField,
    FieldErrors,
    MetricTile,
    EmptyState,
    MoneyPipe,
  ],
  template: `
    <div class="cashflow-page">
      <header class="page-header">
        <div>
          <h1 class="page-title">Cash Flow</h1>
          <p class="page-subtitle">
            Manage your regular income, living expense baseline, and actual spending (spec §6, §7).
          </p>
        </div>
      </header>

      <!-- 1. Top Summary Strip -->
      <section class="summary-grid" aria-label="Monthly Cash Flow Overview">
        <app-metric-tile
          label="Expected Monthly Income"
          [value]="store.monthlySurplusSummary().monthlyIncome"
          [currency]="baseCurrency()"
          icon="payments"
          hint="From active recurring sources"
        />

        <app-metric-tile
          label="Expected Monthly Expenses"
          [value]="store.monthlySurplusSummary().monthlyExpenses"
          [currency]="baseCurrency()"
          icon="shopping_bag"
          hint="Baseline recurring expenses"
        />

        <app-metric-tile
          label="Projected Monthly Surplus"
          [value]="store.monthlySurplusSummary().monthlySurplus"
          [currency]="baseCurrency()"
          [tone]="surplusTone()"
          icon="trending_up"
          hint="Funds cushion and active goals"
        />

        <app-metric-tile
          label="Pending Actual Adjustments"
          [value]="store.wealthSummary().pendingAdjustments"
          [currency]="baseCurrency()"
          [tone]="store.wealthSummary().pendingAdjustments >= 0 ? 'default' : 'negative'"
          icon="sync"
          hint="Unreflected actual records adjust current wealth"
        />
      </section>

      <!-- Pending Adjustments Action Banner -->
      @if (hasPendingAdjustments()) {
        <div class="pending-alert-banner">
          <div class="pending-alert-text">
            <mat-icon class="pending-icon">info</mat-icon>
            <span>
              You have <strong>{{ pendingCount() }} unreflected actual record(s)</strong> adjusting
              your total wealth by
              <strong>{{ store.wealthSummary().pendingAdjustments | money:baseCurrency() }}</strong>.
              Once your bank/asset balances are updated, mark them reflected so they aren't counted twice.
            </span>
          </div>
          <button
            mat-flat-button
            color="primary"
            class="reflect-btn"
            (click)="onMarkAllReflected()"
          >
            <mat-icon>done_all</mat-icon>
            Mark all reflected
          </button>
        </div>
      }

      <!-- 2. Main Tabs -->
      <mat-tab-group class="cashflow-tabs" animationDuration="200ms">
        <!-- =================== INCOME TAB =================== -->
        <mat-tab label="Income">
          <div class="tab-content">
            <!-- Income Sources Section -->
            <section class="section-card">
              <div class="section-header">
                <div>
                  <h2 class="section-title">Income Sources</h2>
                  <p class="section-desc">
                    Expected baseline used for monthly surplus and goal projection timelines (spec §6.1–6.3).
                  </p>
                </div>
                <button mat-flat-button color="primary" (click)="addIncomeSource()">
                  <mat-icon>add</mat-icon>
                  Add Income Source
                </button>
              </div>

              @if (sortedIncomeSources().length === 0) {
                <app-empty-state
                  icon="savings"
                  title="No income sources configured"
                  message="Add your salary or other recurring income streams to establish your baseline projection surplus."
                >
                  <button mat-stroked-button color="primary" (click)="addIncomeSource()">
                    Add Income Source
                  </button>
                </app-empty-state>
              } @else {
                <div class="items-list">
                  @for (source of sortedIncomeSources(); track source.id) {
                    <div class="item-row" [class.disabled-item]="!source.isEnabled">
                      <div class="item-main">
                        <div class="item-title-row">
                          <span class="item-name">{{ source.name }}</span>
                          <span class="badge" [class.badge-salary]="source.type === 'salary'">
                            {{ source.type === 'salary' ? 'Salary' : 'Other' }}
                          </span>
                          <span class="badge badge-freq">{{ source.frequency }}</span>
                          @if (!source.isEnabled) {
                            <span class="badge badge-inactive">Paused in projections</span>
                          }
                        </div>
                        <div class="item-meta">
                          <span class="item-amount">{{ source.amount | money:source.currency }}</span>
                          @if (source.effectiveDate) {
                            <span class="item-meta-detail">Effective: {{ source.effectiveDate }}</span>
                          }
                        </div>
                      </div>

                      <div class="item-actions">
                        <mat-slide-toggle
                          [checked]="source.isEnabled"
                          (change)="toggleIncomeSource(source, $event.checked)"
                          matTooltip="Toggle to include or exclude from future monthly projections without erasing history"
                        >
                          {{ source.isEnabled ? 'Active' : 'Paused' }}
                        </mat-slide-toggle>

                        @if (source.type === 'salary') {
                          <button
                            mat-stroked-button
                            class="update-salary-btn"
                            (click)="updateSalary(source)"
                            matTooltip="Update salary baseline and optionally preserve past baseline in history"
                          >
                            <mat-icon>price_change</mat-icon>
                            Update salary / amount
                          </button>
                        }

                        <button
                          mat-icon-button
                          (click)="editIncomeSource(source)"
                          aria-label="Edit income source"
                        >
                          <mat-icon>edit</mat-icon>
                        </button>

                        <button
                          mat-icon-button
                          color="warn"
                          (click)="deleteIncomeSource(source)"
                          aria-label="Delete income source"
                        >
                          <mat-icon>delete</mat-icon>
                        </button>
                      </div>
                    </div>
                  }
                </div>
              }
            </section>

            <!-- Actual & Historical Income Entries -->
            <section class="section-card">
              <div class="section-header">
                <div>
                  <h2 class="section-title">Actual & Historical Income Entries</h2>
                  <p class="section-desc">
                    Log received salary payments or historical notes. Actual records increase wealth until confirmed in account balances (spec §6.3 / §17).
                  </p>
                </div>
                <button mat-flat-button color="primary" (click)="recordIncome()">
                  <mat-icon>add_card</mat-icon>
                  Record received income / salary
                </button>
              </div>

              @if (sortedIncomeRecords().length === 0) {
                <app-empty-state
                  icon="receipt_long"
                  title="No income records logged"
                  message="Record your actual received salary or ad-hoc income when paid."
                >
                  <button mat-stroked-button color="primary" (click)="recordIncome()">
                    Record received income
                  </button>
                </app-empty-state>
              } @else {
                <div class="items-list">
                  @for (record of sortedIncomeRecords(); track record.id) {
                    <div class="item-row record-row">
                      <div class="item-main">
                        <div class="item-title-row">
                          <span class="item-name">{{ record.name }}</span>

                          @if (record.isActual && !record.isReflectedInBalances) {
                            <span class="status-chip chip-pending">
                              <mat-icon class="chip-icon">bolt</mat-icon>
                              Actual (adjusts wealth)
                            </span>
                          } @else if (record.isActual && record.isReflectedInBalances) {
                            <span class="status-chip chip-reflected">
                              <mat-icon class="chip-icon">check_circle</mat-icon>
                              Reflected in balances
                            </span>
                          } @else {
                            <span class="status-chip chip-expected">
                              <mat-icon class="chip-icon">info</mat-icon>
                              Expected note
                            </span>
                          }

                          <span class="badge">{{ record.type }}</span>
                        </div>

                        <div class="item-meta">
                          <span class="item-amount positive-val">
                            +{{ record.amount | money:record.currency }}
                          </span>
                          <span class="item-meta-detail">Received: {{ record.receivedDate }}</span>
                          @if (record.note) {
                            <span class="item-note">"{{ record.note }}"</span>
                          }
                        </div>
                      </div>

                      <div class="item-actions">
                        @if (record.isActual) {
                          <button
                            mat-button
                            class="toggle-reflect-btn"
                            [class.active-reflect]="record.isReflectedInBalances"
                            (click)="toggleIncomeRecordReflected(record)"
                            [matTooltip]="
                              record.isReflectedInBalances
                                ? 'Click to unreflect (adjusts wealth again)'
                                : 'Click to mark reflected once bank balance includes it'
                            "
                          >
                            <mat-icon>{{ record.isReflectedInBalances ? 'undo' : 'done' }}</mat-icon>
                            {{ record.isReflectedInBalances ? 'Unreflect' : 'Mark reflected' }}
                          </button>
                        }

                        <button
                          mat-icon-button
                          (click)="editIncomeRecord(record)"
                          aria-label="Edit income record"
                        >
                          <mat-icon>edit</mat-icon>
                        </button>

                        <button
                          mat-icon-button
                          color="warn"
                          (click)="deleteIncomeRecord(record)"
                          aria-label="Delete income record"
                        >
                          <mat-icon>delete</mat-icon>
                        </button>
                      </div>
                    </div>
                  }
                </div>
              }
            </section>
          </div>
        </mat-tab>

        <!-- =================== EXPENSES TAB =================== -->
        <mat-tab label="Expenses">
          <div class="tab-content">
            <!-- Monthly Comparison Summary Strip -->
            <section class="section-card comparison-card">
              <div class="comparison-header">
                <div>
                  <h2 class="section-title">Monthly Expense Tracking</h2>
                  <p class="section-desc">
                    Compare your actual spending against your baseline projection (spec §7.1, §7.2).
                  </p>
                </div>

                <div class="month-selector">
                  <button mat-icon-button (click)="prevMonth()" aria-label="Previous month">
                    <mat-icon>chevron_left</mat-icon>
                  </button>
                  <span class="current-month-display">{{ formatMonth(selectedMonth()) }}</span>
                  <button mat-icon-button (click)="nextMonth()" aria-label="Next month">
                    <mat-icon>chevron_right</mat-icon>
                  </button>
                </div>
              </div>

              <div class="comparison-body">
                <div class="comparison-stat">
                  <span class="stat-label">Expected baseline</span>
                  <span class="stat-val">
                    {{ store.monthlySurplusSummary().monthlyExpenses | money:baseCurrency() }}
                  </span>
                </div>
                <div class="comparison-divider">·</div>
                <div class="comparison-stat">
                  <span class="stat-label">Actual recorded this month</span>
                  <span class="stat-val highlight-val">
                    {{ actualExpensesInSelectedMonth() | money:baseCurrency() }}
                  </span>
                </div>
                <div class="comparison-divider">·</div>
                <div class="comparison-message">
                  @if (actualExpensesInSelectedMonth() > store.monthlySurplusSummary().monthlyExpenses) {
                    <span class="diff-tag tag-over">
                      <mat-icon>warning</mat-icon>
                      Exceeded baseline by {{ (actualExpensesInSelectedMonth() - store.monthlySurplusSummary().monthlyExpenses) | money:baseCurrency() }}
                    </span>
                  } @else if (actualExpensesInSelectedMonth() > 0) {
                    <span class="diff-tag tag-under">
                      <mat-icon>check_circle</mat-icon>
                      Within baseline
                    </span>
                  }
                  <span class="baseline-future-note">
                    Baseline for next month remains {{ store.monthlySurplusSummary().monthlyExpenses | money:baseCurrency() }}.
                  </span>
                </div>
              </div>
            </section>

            <!-- Simple Overall Monthly Baseline vs Categories Card -->
            <section class="section-card quick-baseline-card">
              <div class="section-header">
                <div>
                  <h2 class="section-title">Simple Overall Monthly Baseline</h2>
                  <p class="section-desc">
                    Prefer simplicity over managing categories? Set a single monthly spending baseline here (spec §7.1).
                  </p>
                </div>
              </div>

              <form [formRoot]="baselineForm" class="simple-baseline-form">
                <div class="baseline-inputs">
                  <mat-form-field appearance="outline" class="baseline-amount-field">
                    <mat-label>Overall monthly expense amount</mat-label>
                    <input
                      matInput
                      type="number"
                      step="0.01"
                      [formField]="baselineForm.amount"
                      placeholder="e.g. 6000"
                    />
                    <span matTextSuffix>{{ baseCurrency() }}</span>
                  </mat-form-field>

                  <mat-checkbox [formField]="baselineForm.syncCushion" class="cushion-sync-check">
                    Sync financial cushion average monthly expenses
                  </mat-checkbox>

                  <button
                    mat-flat-button
                    color="primary"
                    type="submit"
                    [disabled]="baselineForm().submitting()"
                  >
                    Save overall baseline
                  </button>
                </div>
                <app-field-errors [field]="baselineForm.amount" />
              </form>
            </section>

            <!-- Expense Categories Section -->
            <section class="section-card">
              <div class="section-header">
                <div>
                  <div class="title-with-pill">
                    <h2 class="section-title">Expense Categories</h2>
                    <span class="badge badge-sum">
                      Total: {{ categoriesBaselineTotal() | money:baseCurrency() }} / mo
                    </span>
                  </div>
                  <p class="section-desc">
                    Recurring monthly budgets. Reorder by priority or toggle active status.
                  </p>
                </div>
                <button mat-flat-button color="primary" (click)="addExpenseCategory()">
                  <mat-icon>add</mat-icon>
                  Add Category
                </button>
              </div>

              @if (sortedCategories().length === 0) {
                <app-empty-state
                  icon="category"
                  title="No expense categories configured"
                  message="Use the quick baseline above, or break your spending down into categories like Rent, Food, Utilities, Subscriptions, and Transport."
                >
                  <button mat-stroked-button color="primary" (click)="addExpenseCategory()">
                    Add Expense Category
                  </button>
                </app-empty-state>
              } @else {
                <div class="items-list">
                  @for (cat of sortedCategories(); track cat.id; let idx = $index) {
                    <div class="item-row" [class.disabled-item]="!cat.isEnabled">
                      <div class="reorder-controls">
                        <button
                          mat-icon-button
                          [disabled]="idx === 0"
                          (click)="moveCategoryUp(idx)"
                          aria-label="Move category up"
                          matTooltip="Move up"
                        >
                          <mat-icon>arrow_upward</mat-icon>
                        </button>
                        <button
                          mat-icon-button
                          [disabled]="idx === sortedCategories().length - 1"
                          (click)="moveCategoryDown(idx)"
                          aria-label="Move category down"
                          matTooltip="Move down"
                        >
                          <mat-icon>arrow_downward</mat-icon>
                        </button>
                      </div>

                      <div class="item-main">
                        <div class="item-title-row">
                          <span class="item-name">{{ cat.name }}</span>
                          @if (!cat.isEnabled) {
                            <span class="badge badge-inactive">Excluded from baseline</span>
                          }
                        </div>
                        <div class="item-meta">
                          <span class="item-amount">
                            {{ cat.expectedMonthlyAmount | money:cat.currency }} / month
                          </span>
                        </div>
                      </div>

                      <div class="item-actions">
                        <mat-slide-toggle
                          [checked]="cat.isEnabled"
                          (change)="toggleExpenseCategory(cat, $event.checked)"
                          matTooltip="Include or exclude from monthly baseline calculation"
                        >
                          {{ cat.isEnabled ? 'Active' : 'Paused' }}
                        </mat-slide-toggle>

                        <button
                          mat-icon-button
                          (click)="editExpenseCategory(cat)"
                          aria-label="Edit category"
                        >
                          <mat-icon>edit</mat-icon>
                        </button>

                        <button
                          mat-icon-button
                          color="warn"
                          (click)="deleteExpenseCategory(cat)"
                          aria-label="Delete category"
                        >
                          <mat-icon>delete</mat-icon>
                        </button>
                      </div>
                    </div>
                  }
                </div>
              }
            </section>

            <!-- Record Actual Expenses (Individual or Monthly Total) -->
            <section class="section-card">
              <div class="section-header">
                <div>
                  <h2 class="section-title">Recorded Expenses</h2>
                  <p class="section-desc">
                    Log actual expenses or monthly totals. Unreflected expenses immediately reduce current wealth to prevent double counting (spec §7.2 / §17).
                  </p>
                </div>
                <div class="action-buttons-group">
                  <button mat-stroked-button (click)="recordExpense('monthly_total')">
                    <mat-icon>calendar_view_month</mat-icon>
                    Log monthly total
                  </button>
                  <button mat-flat-button color="primary" (click)="recordExpense('individual')">
                    <mat-icon>receipt</mat-icon>
                    Record expense
                  </button>
                </div>
              </div>

              @if (sortedExpenseRecords().length === 0) {
                <app-empty-state
                  icon="receipt"
                  title="No expenses logged yet"
                  message="Record individual expenses or a single monthly total when reviewing your monthly finances."
                >
                  <button mat-stroked-button color="primary" (click)="recordExpense('individual')">
                    Record expense
                  </button>
                </app-empty-state>
              } @else {
                <div class="items-list">
                  @for (record of sortedExpenseRecords(); track record.id) {
                    <div class="item-row record-row">
                      <div class="item-main">
                        <div class="item-title-row">
                          <span class="item-name">{{ record.categoryName }}</span>

                          @if (record.goalId) {
                            <span class="status-chip chip-goal">
                              <mat-icon class="chip-icon">stars</mat-icon>
                              Goal spend
                            </span>
                          } @else if (record.isReflectedInBalances) {
                            <span class="status-chip chip-reflected">
                              <mat-icon class="chip-icon">check_circle</mat-icon>
                              Reflected in asset balance
                            </span>
                          } @else if (record.isActual) {
                            <span class="status-chip chip-pending-expense">
                              <mat-icon class="chip-icon">trending_down</mat-icon>
                              Deducted from wealth
                            </span>
                          } @else {
                            <span class="status-chip chip-expected">
                              <mat-icon class="chip-icon">info</mat-icon>
                              Expected
                            </span>
                          }
                        </div>

                        <div class="item-meta">
                          <span class="item-amount negative-val">
                            -{{ record.amount | money:record.currency }}
                          </span>
                          <span class="item-meta-detail">Date: {{ record.date }}</span>
                          @if (record.note) {
                            <span class="item-note">"{{ record.note }}"</span>
                          }
                        </div>
                      </div>

                      <div class="item-actions">
                        @if (record.isActual && !record.goalId) {
                          <button
                            mat-button
                            class="toggle-reflect-btn"
                            [class.active-reflect]="record.isReflectedInBalances"
                            (click)="toggleExpenseRecordReflected(record)"
                            [matTooltip]="
                              record.isReflectedInBalances
                                ? 'Click to unreflect (deducts from wealth again)'
                                : 'Click to mark reflected once bank balance includes it'
                            "
                          >
                            <mat-icon>{{ record.isReflectedInBalances ? 'undo' : 'done' }}</mat-icon>
                            {{ record.isReflectedInBalances ? 'Unreflect' : 'Mark reflected' }}
                          </button>
                        }

                        <button
                          mat-icon-button
                          (click)="editExpenseRecord(record)"
                          aria-label="Edit expense record"
                        >
                          <mat-icon>edit</mat-icon>
                        </button>

                        <button
                          mat-icon-button
                          color="warn"
                          (click)="deleteExpenseRecord(record)"
                          aria-label="Delete expense record"
                        >
                          <mat-icon>delete</mat-icon>
                        </button>
                      </div>
                    </div>
                  }
                </div>
              }
            </section>
          </div>
        </mat-tab>
      </mat-tab-group>
    </div>
  `,
  styles: `
    .cashflow-page {
      max-width: 1200px;
      margin: 0 auto;
      padding: 1.5rem 1rem 3rem;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 1rem;
    }

    .page-title {
      margin: 0;
      font-size: 1.75rem;
      font-weight: 700;
      color: var(--mat-sys-on-surface);
    }

    .page-subtitle {
      margin: 0.25rem 0 0;
      font-size: 0.9375rem;
      color: var(--mat-sys-on-surface-variant);
    }

    /* 1. Summary Grid */
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
      gap: 1rem;
    }

    /* Pending Alert Banner */
    .pending-alert-banner {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      padding: 0.875rem 1.25rem;
      border-radius: 12px;
      background-color: var(--mat-sys-surface-container-high);
      border-left: 4px solid var(--mat-sys-primary);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);

      @media (max-width: 768px) {
        flex-direction: column;
        align-items: stretch;
      }
    }

    .pending-alert-text {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-size: 0.875rem;
      color: var(--mat-sys-on-surface);
      line-height: 1.4;
    }

    .pending-icon {
      color: var(--mat-sys-primary);
      flex-shrink: 0;
    }

    .reflect-btn {
      white-space: nowrap;
      flex-shrink: 0;
    }

    /* Tabs */
    .cashflow-tabs {
      background-color: var(--mat-sys-surface);
    }

    .tab-content {
      padding: 1.5rem 0;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    /* Section Cards */
    .section-card {
      background-color: var(--mat-sys-surface-container-lowest, var(--mat-sys-surface));
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 16px;
      padding: 1.25rem 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 1rem;
      flex-wrap: wrap;
    }

    .section-title {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--mat-sys-on-surface);
    }

    .title-with-pill {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-wrap: wrap;
    }

    .section-desc {
      margin: 0.25rem 0 0;
      font-size: 0.875rem;
      color: var(--mat-sys-on-surface-variant);
      max-width: 680px;
    }

    .action-buttons-group {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    /* Item Rows */
    .items-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .item-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      padding: 0.875rem 1rem;
      border-radius: 10px;
      background-color: var(--mat-sys-surface-container-low);
      border: 1px solid var(--mat-sys-outline-variant);
      transition: background-color 0.15s ease;

      &:hover {
        background-color: var(--mat-sys-surface-container);
      }

      &.disabled-item {
        opacity: 0.65;
      }

      @media (max-width: 768px) {
        flex-direction: column;
        align-items: stretch;
      }
    }

    .reorder-controls {
      display: flex;
      flex-direction: column;
      gap: 0;
      margin-right: -0.25rem;
    }

    .item-main {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .item-title-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .item-name {
      font-weight: 600;
      font-size: 1rem;
      color: var(--mat-sys-on-surface);
    }

    .item-meta {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-wrap: wrap;
      font-size: 0.875rem;
    }

    .item-amount {
      font-weight: 600;
      color: var(--mat-sys-on-surface);

      &.positive-val {
        color: var(--worth-it-positive, #1b6b3a);
      }

      &.negative-val {
        color: var(--mat-sys-error);
      }
    }

    .item-meta-detail {
      color: var(--mat-sys-on-surface-variant);
      font-size: 0.8125rem;
    }

    .item-note {
      color: var(--mat-sys-on-surface-variant);
      font-style: italic;
      font-size: 0.8125rem;
    }

    .item-actions {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;

      @media (max-width: 768px) {
        justify-content: flex-end;
      }
    }

    .update-salary-btn {
      font-size: 0.8125rem;
    }

    .toggle-reflect-btn {
      font-size: 0.8125rem;

      &.active-reflect {
        color: var(--mat-sys-on-surface-variant);
      }
    }

    /* Badges & Chips */
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 0.125rem 0.5rem;
      border-radius: 6px;
      font-size: 0.6875rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      background-color: var(--mat-sys-surface-container-high);
      color: var(--mat-sys-on-surface-variant);

      &.badge-salary {
        background-color: var(--mat-sys-primary-container);
        color: var(--mat-sys-on-primary-container);
      }

      &.badge-freq {
        background-color: var(--mat-sys-surface-container);
      }

      &.badge-inactive {
        background-color: var(--mat-sys-error-container);
        color: var(--mat-sys-on-error-container);
      }

      &.badge-sum {
        background-color: var(--mat-sys-secondary-container);
        color: var(--mat-sys-on-secondary-container);
        font-size: 0.8125rem;
        padding: 0.25rem 0.625rem;
        text-transform: none;
      }
    }

    .status-chip {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.2rem 0.5rem;
      border-radius: 6px;
      font-size: 0.75rem;
      font-weight: 500;

      &.chip-pending {
        background-color: var(--mat-sys-primary-container);
        color: var(--mat-sys-on-primary-container);
      }

      &.chip-pending-expense {
        background-color: var(--mat-sys-error-container);
        color: var(--mat-sys-on-error-container);
      }

      &.chip-reflected {
        background-color: var(--mat-sys-surface-container-high);
        color: var(--mat-sys-on-surface-variant);
      }

      &.chip-goal {
        background-color: var(--mat-sys-tertiary-container);
        color: var(--mat-sys-on-tertiary-container);
      }

      &.chip-expected {
        background-color: var(--mat-sys-surface-variant);
        color: var(--mat-sys-on-surface-variant);
      }
    }

    .chip-icon {
      font-size: 1rem;
      width: 1rem;
      height: 1rem;
    }

    /* Monthly Comparison Card */
    .comparison-card {
      background: linear-gradient(
        to right,
        var(--mat-sys-surface-container-low),
        var(--mat-sys-surface-container)
      );
    }

    .comparison-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      flex-wrap: wrap;
    }

    .month-selector {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      background-color: var(--mat-sys-surface-container-high);
      border-radius: 20px;
      padding: 2px 8px;
    }

    .current-month-display {
      font-weight: 600;
      font-size: 0.875rem;
      min-width: 130px;
      text-align: center;
    }

    .comparison-body {
      display: flex;
      align-items: center;
      gap: 1rem;
      flex-wrap: wrap;
      font-size: 0.9375rem;
    }

    .comparison-stat {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .stat-label {
      font-size: 0.75rem;
      color: var(--mat-sys-on-surface-variant);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .stat-val {
      font-size: 1.125rem;
      font-weight: 700;
      color: var(--mat-sys-on-surface);

      &.highlight-val {
        color: var(--mat-sys-primary);
      }
    }

    .comparison-divider {
      font-size: 1.5rem;
      color: var(--mat-sys-outline);
    }

    .comparison-message {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
      margin-left: auto;
    }

    .diff-tag {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.25rem 0.625rem;
      border-radius: 6px;
      font-size: 0.8125rem;
      font-weight: 600;

      mat-icon {
        font-size: 1rem;
        width: 1rem;
        height: 1rem;
      }

      &.tag-over {
        background-color: var(--mat-sys-error-container);
        color: var(--mat-sys-on-error-container);
      }

      &.tag-under {
        background-color: var(--mat-sys-primary-container);
        color: var(--mat-sys-on-primary-container);
      }
    }

    .baseline-future-note {
      font-size: 0.8125rem;
      color: var(--mat-sys-on-surface-variant);
      font-style: italic;
    }

    /* Quick Baseline Card */
    .simple-baseline-form {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .baseline-inputs {
      display: flex;
      align-items: center;
      gap: 1rem;
      flex-wrap: wrap;
    }

    .baseline-amount-field {
      max-width: 280px;
      margin-bottom: -1.25rem;
    }

    .cushion-sync-check {
      font-size: 0.875rem;
      color: var(--mat-sys-on-surface);
    }
  `,
})
export class Cashflow {
  protected readonly store = inject(WorthItStore);
  private readonly dialog = inject(MatDialog);

  protected readonly baseCurrency = computed(
    () => this.store.settings().baseCurrency || 'PLN'
  );

  protected readonly surplusTone = computed(() =>
    this.store.monthlySurplusSummary().monthlySurplus >= 0 ? 'positive' : 'negative'
  );

  protected readonly pendingCount = computed(
    () => this.store.pendingIncomeRecords().length + this.store.pendingExpenseRecords().length
  );

  protected readonly hasPendingAdjustments = computed(
    () => this.pendingCount() > 0 || this.store.wealthSummary().pendingAdjustments !== 0
  );

  // Month navigation
  protected readonly selectedMonth = signal<string>(
    new Date().toISOString().substring(0, 7)
  );

  // Sorted lists
  protected readonly sortedIncomeSources = computed(() =>
    this.store.incomeSources().slice()
  );

  protected readonly sortedIncomeRecords = computed(() =>
    this.store
      .incomeRecords()
      .slice()
      .sort((a, b) => b.receivedDate.localeCompare(a.receivedDate))
  );

  protected readonly sortedCategories = computed(() =>
    this.store
      .expenseCategories()
      .slice()
      .sort((a, b) => a.order - b.order)
  );

  protected readonly sortedExpenseRecords = computed(() =>
    this.store
      .expenseRecords()
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date))
  );

  protected readonly categoriesBaselineTotal = computed(() =>
    this.store
      .expenseCategories()
      .filter((c) => c.isEnabled)
      .reduce((sum, c) => sum + c.expectedMonthlyAmount, 0)
  );

  protected readonly actualExpensesInSelectedMonth = computed(() => {
    const ym = this.selectedMonth();
    return this.store
      .expenseRecords()
      .filter((r) => r.isActual && r.date.startsWith(ym))
      .reduce((sum, r) => sum + r.amount, 0);
  });

  // Signal Form for the quick overall baseline
  protected readonly baselineModel = signal<{ amount: number; syncCushion: boolean }>({
    amount: this.getInitialBaselineAmount(),
    syncCushion: true,
  });

  protected readonly baselineForm = form(
    this.baselineModel,
    (path) => {
      required(path.amount, { message: 'Enter monthly expense amount' });
      min(path.amount, 0, { message: 'Amount cannot be negative' });
    },
    {
      submission: {
        action: async () => {
          await this.saveOverallBaseline();
          return undefined;
        },
      },
    }
  );

  private getInitialBaselineAmount(): number {
    const overallCat = this.store
      .expenseCategories()
      .find((c) => c.name.toLowerCase() === 'overall monthly expenses');
    if (overallCat) return overallCat.expectedMonthlyAmount;

    return this.store.settings().cushion.averageMonthlyExpenses || 0;
  }

  protected async saveOverallBaseline(): Promise<void> {
    const amount = Number(this.baselineModel().amount) || 0;
    const syncCushion = this.baselineModel().syncCushion;
    const currency = this.baseCurrency();

    const existing = this.store
      .expenseCategories()
      .find((c) => c.name.toLowerCase() === 'overall monthly expenses');

    if (existing) {
      await this.store.updateExpenseCategory(existing.id, {
        expectedMonthlyAmount: amount,
        isEnabled: true,
      });
    } else {
      await this.store.addExpenseCategory({
        name: 'Overall monthly expenses',
        expectedMonthlyAmount: amount,
        currency,
        isEnabled: true,
        order: 0,
      });
    }

    if (syncCushion) {
      await this.store.updateCushionSettings({
        averageMonthlyExpenses: amount,
      });
    }
  }

  // --- Navigation Helpers ---
  protected prevMonth(): void {
    const [year, month] = this.selectedMonth().split('-').map(Number);
    const d = new Date(year, month - 2, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    this.selectedMonth.set(ym);
  }

  protected nextMonth(): void {
    const [year, month] = this.selectedMonth().split('-').map(Number);
    const d = new Date(year, month, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    this.selectedMonth.set(ym);
  }

  protected formatMonth(yearMonth: string): string {
    const [year, month] = yearMonth.split('-').map(Number);
    const d = new Date(year, month - 1, 1);
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  // --- Mark All Reflected ---
  protected async onMarkAllReflected(): Promise<void> {
    await this.store.markRecordsReflected();
  }

  // --- Income Source Actions ---
  protected async addIncomeSource(): Promise<void> {
    const dialogRef = this.dialog.open(IncomeSourceDialog, {
      data: { defaultCurrency: this.baseCurrency() },
    });
    const result = await firstValueFrom(dialogRef.afterClosed());
    if (result) {
      await this.store.addIncomeSource(result);
    }
  }

  protected async editIncomeSource(source: IncomeSource): Promise<void> {
    const dialogRef = this.dialog.open(IncomeSourceDialog, {
      data: { source, defaultCurrency: this.baseCurrency() },
    });
    const result = await firstValueFrom(dialogRef.afterClosed());
    if (result) {
      await this.store.updateIncomeSource(source.id, result);
    }
  }

  protected async updateSalary(source: IncomeSource): Promise<void> {
    const dialogRef = this.dialog.open(SalaryUpdateDialog, {
      data: { source },
    });
    const result = await firstValueFrom(dialogRef.afterClosed());
    if (!result) return;

    // 1. If logging history record is selected, store old salary as historical entry (isActual: false)
    if (result.logHistoryRecord) {
      await this.store.addIncomeRecord({
        incomeSourceId: source.id,
        name: source.name,
        type: 'salary',
        amount: source.amount,
        currency: source.currency,
        receivedDate: result.effectiveDate,
        isActual: false,
        note: result.historyNote || 'Salary change baseline',
      });
    }

    // 2. Update income source with new baseline amount & effective date
    await this.store.updateIncomeSource(source.id, {
      amount: result.newAmount,
      effectiveDate: result.effectiveDate,
    });
  }

  protected async toggleIncomeSource(source: IncomeSource, isEnabled: boolean): Promise<void> {
    await this.store.updateIncomeSource(source.id, { isEnabled });
  }

  protected async deleteIncomeSource(source: IncomeSource): Promise<void> {
    const dialogRef = this.dialog.open(ConfirmDialog, {
      data: {
        title: 'Delete Income Source',
        message: `Are you sure you want to delete "${source.name}"? Past recorded income entries will remain intact.`,
        confirmText: 'Delete',
        destructive: true,
      },
    });
    const confirmed = await firstValueFrom(dialogRef.afterClosed());
    if (confirmed) {
      await this.store.deleteIncomeSource(source.id);
    }
  }

  // --- Income Record Actions ---
  protected async recordIncome(): Promise<void> {
    const dialogRef = this.dialog.open(IncomeRecordDialog, {
      data: {
        sources: this.store.incomeSources(),
        recentRecords: this.store.incomeRecords(),
        defaultCurrency: this.baseCurrency(),
      },
    });
    const result = await firstValueFrom(dialogRef.afterClosed());
    if (result) {
      const rec = await this.store.addIncomeRecord(result);
      if (result.isReflectedInBalances) {
        await this.store.updateIncomeRecord(rec.id, { isReflectedInBalances: true });
      }
    }
  }

  protected async editIncomeRecord(record: IncomeRecord): Promise<void> {
    const dialogRef = this.dialog.open(IncomeRecordDialog, {
      data: {
        record,
        sources: this.store.incomeSources(),
        recentRecords: this.store.incomeRecords(),
        defaultCurrency: this.baseCurrency(),
      },
    });
    const result = await firstValueFrom(dialogRef.afterClosed());
    if (result) {
      await this.store.updateIncomeRecord(record.id, result);
    }
  }

  protected async toggleIncomeRecordReflected(record: IncomeRecord): Promise<void> {
    await this.store.updateIncomeRecord(record.id, {
      isReflectedInBalances: !record.isReflectedInBalances,
    });
  }

  protected async deleteIncomeRecord(record: IncomeRecord): Promise<void> {
    const dialogRef = this.dialog.open(ConfirmDialog, {
      data: {
        title: 'Delete Income Record',
        message: `Delete income record "${record.name}" for ${record.amount} ${record.currency}?`,
        confirmText: 'Delete',
        destructive: true,
      },
    });
    const confirmed = await firstValueFrom(dialogRef.afterClosed());
    if (confirmed) {
      await this.store.deleteIncomeRecord(record.id);
    }
  }

  // --- Expense Category Actions ---
  protected async addExpenseCategory(): Promise<void> {
    const dialogRef = this.dialog.open(ExpenseCategoryDialog, {
      data: { defaultCurrency: this.baseCurrency() },
    });
    const result = await firstValueFrom(dialogRef.afterClosed());
    if (result) {
      await this.store.addExpenseCategory(result);
    }
  }

  protected async editExpenseCategory(category: ExpenseCategory): Promise<void> {
    const dialogRef = this.dialog.open(ExpenseCategoryDialog, {
      data: { category, defaultCurrency: this.baseCurrency() },
    });
    const result = await firstValueFrom(dialogRef.afterClosed());
    if (result) {
      await this.store.updateExpenseCategory(category.id, result);
    }
  }

  protected async toggleExpenseCategory(category: ExpenseCategory, isEnabled: boolean): Promise<void> {
    await this.store.updateExpenseCategory(category.id, { isEnabled });
  }

  protected async deleteExpenseCategory(category: ExpenseCategory): Promise<void> {
    const dialogRef = this.dialog.open(ConfirmDialog, {
      data: {
        title: 'Delete Expense Category',
        message: `Delete category "${category.name}"? Past recorded expenses under this category will be preserved.`,
        confirmText: 'Delete',
        destructive: true,
      },
    });
    const confirmed = await firstValueFrom(dialogRef.afterClosed());
    if (confirmed) {
      await this.store.deleteExpenseCategory(category.id);
    }
  }

  protected async moveCategoryUp(index: number): Promise<void> {
    const cats = [...this.sortedCategories()];
    if (index <= 0 || index >= cats.length) return;
    const temp = cats[index];
    cats[index] = cats[index - 1];
    cats[index - 1] = temp;
    await this.store.reorderExpenseCategories(cats);
  }

  protected async moveCategoryDown(index: number): Promise<void> {
    const cats = [...this.sortedCategories()];
    if (index < 0 || index >= cats.length - 1) return;
    const temp = cats[index];
    cats[index] = cats[index + 1];
    cats[index + 1] = temp;
    await this.store.reorderExpenseCategories(cats);
  }

  // --- Expense Record Actions ---
  protected async recordExpense(mode: 'individual' | 'monthly_total' = 'individual'): Promise<void> {
    const dialogRef = this.dialog.open(ExpenseRecordDialog, {
      data: {
        categories: this.store.expenseCategories(),
        defaultCurrency: this.baseCurrency(),
        initialMode: mode,
      },
    });
    const result = await firstValueFrom(dialogRef.afterClosed());
    if (result) {
      const rec = await this.store.addExpenseRecord(result);
      if (result.isReflectedInBalances) {
        await this.store.updateExpenseRecord(rec.id, { isReflectedInBalances: true });
      }
    }
  }

  protected async editExpenseRecord(record: ExpenseRecord): Promise<void> {
    const dialogRef = this.dialog.open(ExpenseRecordDialog, {
      data: {
        record,
        categories: this.store.expenseCategories(),
        defaultCurrency: this.baseCurrency(),
      },
    });
    const result = await firstValueFrom(dialogRef.afterClosed());
    if (result) {
      await this.store.updateExpenseRecord(record.id, result);
    }
  }

  protected async toggleExpenseRecordReflected(record: ExpenseRecord): Promise<void> {
    await this.store.updateExpenseRecord(record.id, {
      isReflectedInBalances: !record.isReflectedInBalances,
    });
  }

  protected async deleteExpenseRecord(record: ExpenseRecord): Promise<void> {
    const dialogRef = this.dialog.open(ConfirmDialog, {
      data: {
        title: 'Delete Expense Record',
        message: `Delete expense record "${record.categoryName}" for ${record.amount} ${record.currency}?`,
        confirmText: 'Delete',
        destructive: true,
      },
    });
    const confirmed = await firstValueFrom(dialogRef.afterClosed());
    if (confirmed) {
      await this.store.deleteExpenseRecord(record.id);
    }
  }
}
