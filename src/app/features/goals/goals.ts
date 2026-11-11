import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';
import { Goal, GoalFundingSummary } from '../../core/models/worth-it.model';
import { WorthItStore } from '../../core/stores/worth-it.store';
import { ConfirmDialog } from '../../shared/components/confirm-dialog/confirm-dialog';
import { EmptyState } from '../../shared/components/empty-state/empty-state';
import {
  MetricTile,
  MetricTileTone,
} from '../../shared/components/metric-tile/metric-tile';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { MonthsPipe } from '../../shared/pipes/months.pipe';
import {
  GoalCompleteDialog,
  GoalCompleteResult,
} from './goal-complete-dialog';
import { GoalFormDialog, GoalFormValue } from './goal-form-dialog';

@Component({
  selector: 'app-goals',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatTooltipModule,
    MetricTile,
    EmptyState,
    MoneyPipe,
    MonthsPipe,
  ],
  template: `
    <div class="goals-page">
      <!-- Top Header Strip -->
      <header class="page-header">
        <div class="header-titles">
          <h1 class="page-title">Goals</h1>
          <p class="page-subtitle">
            Plan, order, and track your financial milestones sequentially.
          </p>
        </div>
        <div class="header-actions">
          <button
            mat-flat-button
            color="primary"
            class="add-goal-btn"
            (click)="openAddGoalDialog()"
          >
            <mat-icon>add</mat-icon>
            Add goal
          </button>
        </div>
      </header>

      <!-- Summary Tiles Strip -->
      <section class="summary-strip" aria-label="Goals Summary Metrics">
        <div class="summary-tile">
          <app-metric-tile
            label="Available for goals"
            [value]="wealthSummary().availableForGoals"
            hint="Eligible wealth minus cushion & reserves"
            icon="savings"
            tone="positive"
          />
        </div>

        <div class="summary-tile">
          <app-metric-tile
            label="Financial cushion"
            [value]="cushionStatus().funded"
            [hint]="cushionHint()"
            icon="shield"
            [tone]="cushionTone()"
          />
        </div>

        <div class="summary-tile">
          <app-metric-tile
            label="Reserved for goals"
            [value]="wealthSummary().reservedAmounts"
            hint="Earmarked for completed goals"
            icon="bookmark"
            tone="default"
          />
        </div>
      </section>

      <!-- Financial Cushion Priority Warning Banner -->
      @if (cushionStatus().deficit > 0) {
        <div class="warning-banner" role="alert">
          <mat-icon class="banner-icon">priority_high</mat-icon>
          <div class="banner-content">
            <strong>Financial Cushion Deficit: {{ cushionStatus().deficit | money }}</strong>
            <p>
              By accounting priority, the cushion takes priority before funding goals. New savings will fund the cushion first.
            </p>
          </div>
        </div>
      }

      <!-- Empty State when no goals exist at all -->
      @if (!hasGoals()) {
        <div class="empty-state-wrapper">
          <app-empty-state
            icon="flag"
            title="No goals yet"
            message="Define your financial targets to start tracking your progress towards them."
          >
            <button mat-flat-button color="primary" (click)="openAddGoalDialog()">
              <mat-icon>add</mat-icon>
              Add your first goal
            </button>
          </app-empty-state>
        </div>
      } @else {
        <!-- Section 1: Funding Sequence (Uncompleted, Non-Skipped Goals) -->
        <section class="goals-section sequence-section" aria-label="Funding Sequence">
          <div class="section-header">
            <div class="section-title-group">
              <h2 class="section-title">Funding Sequence</h2>
              <p class="section-subtitle">
                Goals are funded sequentially in order of priority. Reordering goals never changes actual wealth or reserved amounts.
              </p>
            </div>
          </div>

          @if (uncompletedGoals().length === 0) {
            <div class="all-completed-card">
              <mat-icon class="all-completed-icon">check_circle_outline</mat-icon>
              <div class="all-completed-text">
                <h3>No active goals in sequence</h3>
                <p>All your goals are currently completed or skipped.</p>
              </div>
            </div>
          } @else {
            <div
              cdkDropList
              (cdkDropListDropped)="onDrop($event)"
              class="goals-drop-list"
              aria-label="Reorderable goals list"
            >
              @for (
                item of uncompletedGoals();
                track item.goal.id;
                let i = $index, first = $first, last = $last
              ) {
                <div cdkDrag class="goal-item-wrapper">
                  <mat-card class="goal-card" [class.active-card]="first">
                    <mat-card-content class="goal-card-content">
                      <!-- Top Row: Badge, Drag Handle, Name, and Actions -->
                      <div class="card-header-row">
                        <div class="header-left">
                          <mat-icon
                            cdkDragHandle
                            class="drag-handle"
                            matTooltip="Drag to reorder"
                            aria-label="Drag to reorder"
                          >
                            drag_indicator
                          </mat-icon>

                          @if (first) {
                            <span class="badge active-badge">
                              <mat-icon class="badge-icon">star</mat-icon>
                              Active Goal
                            </span>
                          } @else {
                            <span class="badge upcoming-badge">
                              Upcoming #{{ i + 1 }}
                            </span>
                          }

                          <h3 class="goal-name">{{ item.goal.name }}</h3>
                        </div>

                        <div class="header-actions">
                          <!-- Reorder Buttons -->
                          <button
                            mat-icon-button
                            type="button"
                            [disabled]="first"
                            (click)="moveGoalUp(i)"
                            matTooltip="Move goal up"
                            aria-label="Move goal up"
                          >
                            <mat-icon>arrow_upward</mat-icon>
                          </button>
                          <button
                            mat-icon-button
                            type="button"
                            [disabled]="last"
                            (click)="moveGoalDown(i)"
                            matTooltip="Move goal down"
                            aria-label="Move goal down"
                          >
                            <mat-icon>arrow_downward</mat-icon>
                          </button>

                          <!-- Goal Actions -->
                          <button
                            mat-stroked-button
                            color="primary"
                            class="complete-btn"
                            type="button"
                            (click)="openCompleteDialog(item.goal)"
                          >
                            <mat-icon>check_circle</mat-icon>
                            Complete
                          </button>

                          <button
                            mat-button
                            type="button"
                            (click)="skipGoal(item.goal.id)"
                            matTooltip="Skip goal for now"
                          >
                            <mat-icon>redo</mat-icon>
                            Skip
                          </button>

                          <button
                            mat-icon-button
                            type="button"
                            (click)="openEditDialog(item.goal)"
                            matTooltip="Edit goal"
                            aria-label="Edit goal"
                          >
                            <mat-icon>edit</mat-icon>
                          </button>

                          <button
                            mat-icon-button
                            type="button"
                            color="warn"
                            (click)="openDeleteDialog(item.goal)"
                            matTooltip="Delete goal"
                            aria-label="Delete goal"
                          >
                            <mat-icon>delete</mat-icon>
                          </button>
                        </div>
                      </div>

                      <!-- Financial Metrics Grid -->
                      <div class="metrics-grid">
                        <div class="metric-item">
                          <span class="metric-label">Target</span>
                          <span class="metric-value">{{ item.goal.targetAmount | money }}</span>
                        </div>
                        <div class="metric-item">
                          <span class="metric-label">Current progress</span>
                          <span class="metric-value">{{ item.currentProgress | money }}</span>
                        </div>
                        <div class="metric-item">
                          <span class="metric-label">Remaining</span>
                          <span class="metric-value">{{ item.remainingAmount | money }}</span>
                        </div>
                        <div class="metric-item">
                          <span class="metric-label">Funded</span>
                          <span class="metric-value">{{ item.progressPercent }}%</span>
                        </div>
                      </div>

                      <!-- Progress Bar -->
                      <div class="progress-bar-container">
                        <mat-progress-bar
                          mode="determinate"
                          [value]="item.progressPercent"
                          [color]="item.isFullyFunded ? 'accent' : 'primary'"
                        />
                      </div>

                      <!-- Projection Footer -->
                      <div class="card-footer-row">
                        @if (item.isFullyFunded) {
                          <div class="status-indicator funded">
                            <mat-icon class="status-icon">check_circle</mat-icon>
                            <span>Fully funded! Ready to complete.</span>
                          </div>
                        } @else if (monthlySurplusSummary().monthlySurplus <= 0) {
                          <div class="status-indicator warning">
                            <mat-icon class="status-icon">info</mat-icon>
                            <span>Needs positive monthly surplus</span>
                          </div>
                        } @else {
                          <div class="projected-info projected">
                            <mat-icon class="projected-icon">schedule</mat-icon>
                            <span class="projected-label">Projected:</span>
                            <span class="projected-duration">
                              {{ item.estimatedCompletionMonths | months }}
                            </span>
                            @if (item.estimatedCompletionDate) {
                              <span class="projected-date">
                                ({{ item.estimatedCompletionDate | date: 'MMM yyyy' }})
                              </span>
                            }
                          </div>
                        }
                      </div>
                    </mat-card-content>
                  </mat-card>
                </div>
              }
            </div>
          }
        </section>

        <!-- Section 2: Skipped Goals (when > 0) -->
        @if (store.skippedGoals().length > 0) {
          <section class="goals-section skipped-section" aria-label="Skipped Goals">
            <div class="section-header">
              <div class="section-title-group">
                <h2 class="section-title">
                  Skipped Goals ({{ store.skippedGoals().length }})
                </h2>
                <p class="section-subtitle">
                  Skipped goals stay in your list but are excluded from the funding sequence.
                </p>
              </div>
            </div>

            <div class="goals-list">
              @for (goal of store.skippedGoals(); track goal.id) {
                <mat-card class="goal-card skipped-card">
                  <mat-card-content class="goal-card-content">
                    <div class="card-header-row">
                      <div class="header-left">
                        <span class="badge skipped-badge">Skipped</span>
                        <h3 class="goal-name">{{ goal.name }}</h3>
                        <span class="amount-tag">
                          Target: {{ goal.targetAmount | money }}
                        </span>
                      </div>

                      <div class="header-actions">
                        <button
                          mat-stroked-button
                          color="primary"
                          type="button"
                          (click)="unskipGoal(goal.id)"
                        >
                          <mat-icon>play_arrow</mat-icon>
                          Resume
                        </button>
                        <button
                          mat-icon-button
                          type="button"
                          (click)="openEditDialog(goal)"
                          matTooltip="Edit goal"
                          aria-label="Edit goal"
                        >
                          <mat-icon>edit</mat-icon>
                        </button>
                        <button
                          mat-icon-button
                          type="button"
                          color="warn"
                          (click)="openDeleteDialog(goal)"
                          matTooltip="Delete goal"
                          aria-label="Delete goal"
                        >
                          <mat-icon>delete</mat-icon>
                        </button>
                      </div>
                    </div>
                  </mat-card-content>
                </mat-card>
              }
            </div>
          </section>
        }

        <!-- Section 3: Completed Goals (when > 0) -->
        @if (store.completedGoals().length > 0) {
          <section class="goals-section completed-section" aria-label="Completed Goals">
            <div class="section-header">
              <div class="section-title-group">
                <h2 class="section-title">
                  Completed Goals ({{ store.completedGoals().length }})
                </h2>
                <p class="section-subtitle">
                  Goals you have reached. You can adjust fund allocation or reopen them.
                </p>
              </div>
            </div>

            <div class="goals-list">
              @for (goal of store.completedGoals(); track goal.id) {
                <mat-card class="goal-card completed-card">
                  <mat-card-content class="goal-card-content">
                    <div class="card-header-row">
                      <div class="header-left">
                        @if (goal.completionChoice === 'spend') {
                          <span class="badge spend-badge">
                            Spent: {{ (goal.spentAmount ?? goal.targetAmount) | money }}
                          </span>
                        } @else if (goal.completionChoice === 'reserve') {
                          <span class="badge reserve-badge">
                            Reserved: {{ (goal.reservedAmount ?? goal.targetAmount) | money }}
                          </span>
                        } @else {
                          <span class="badge release-badge">Released</span>
                        }

                        <h3 class="goal-name">{{ goal.name }}</h3>
                        <span class="amount-tag">
                          Target: {{ goal.targetAmount | money }}
                        </span>
                      </div>

                      <div class="header-actions">
                        <button
                          mat-stroked-button
                          type="button"
                          (click)="openChangeAllocationDialog(goal)"
                        >
                          <mat-icon>tune</mat-icon>
                          Change allocation
                        </button>
                        <button
                          mat-button
                          type="button"
                          (click)="reopenGoal(goal.id)"
                        >
                          <mat-icon>undo</mat-icon>
                          Reopen goal
                        </button>
                        <button
                          mat-icon-button
                          type="button"
                          color="warn"
                          (click)="openDeleteDialog(goal)"
                          matTooltip="Delete goal"
                          aria-label="Delete goal"
                        >
                          <mat-icon>delete</mat-icon>
                        </button>
                      </div>
                    </div>
                  </mat-card-content>
                </mat-card>
              }
            </div>
          </section>
        }
      }
    </div>
  `,
  styles: `
    .goals-page {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
      padding: 1.5rem;
      max-width: 1100px;
      margin: 0 auto;
      box-sizing: border-box;
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 1rem;
      flex-wrap: wrap;
    }

    .page-title {
      font-size: 2rem;
      font-weight: 700;
      margin: 0;
      color: var(--mat-sys-on-surface);
      letter-spacing: -0.02em;
    }

    .page-subtitle {
      margin: 0.25rem 0 0;
      color: var(--mat-sys-on-surface-variant);
      font-size: 0.9375rem;
    }

    .add-goal-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      font-weight: 600;
    }

    .summary-strip {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 1rem;
    }

    .summary-tile {
      min-height: 100px;
    }

    .warning-banner {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      background-color: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
      border-radius: 12px;
      padding: 0.875rem 1.25rem;

      .banner-icon {
        color: var(--mat-sys-error);
        font-size: 1.5rem;
        width: 1.5rem;
        height: 1.5rem;
        flex-shrink: 0;
        margin-top: 0.125rem;
      }

      .banner-content {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        font-size: 0.875rem;

        p {
          margin: 0;
          opacity: 0.9;
        }
      }
    }

    .goals-section {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }

    .section-title {
      font-size: 1.25rem;
      font-weight: 600;
      margin: 0;
      color: var(--mat-sys-on-surface);
    }

    .section-subtitle {
      margin: 0.25rem 0 0;
      font-size: 0.875rem;
      color: var(--mat-sys-on-surface-variant);
    }

    .goals-drop-list,
    .goals-list {
      display: flex;
      flex-direction: column;
      gap: 0.875rem;
    }

    .goal-item-wrapper {
      position: relative;
    }

    .goal-card {
      border-radius: 12px;
      background-color: var(--mat-sys-surface-container);
      border: 1px solid var(--mat-sys-outline-variant);
      transition: border-color 0.2s ease, box-shadow 0.2s ease;

      &.active-card {
        border: 2px solid var(--mat-sys-primary);
        background-color: var(--mat-sys-surface-container-high);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
      }

      &.skipped-card,
      &.completed-card {
        background-color: var(--mat-sys-surface-container-low);
      }
    }

    .goal-card-content {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      padding: 1.25rem;
    }

    .card-header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      flex-wrap: wrap;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-wrap: wrap;
    }

    .drag-handle {
      cursor: grab;
      color: var(--mat-sys-on-surface-variant);
      opacity: 0.6;
      user-select: none;

      &:hover {
        opacity: 1;
        color: var(--mat-sys-primary);
      }

      &:active {
        cursor: grabbing;
      }
    }

    .goal-name {
      font-size: 1.125rem;
      font-weight: 600;
      margin: 0;
      color: var(--mat-sys-on-surface);
    }

    .amount-tag {
      font-size: 0.875rem;
      color: var(--mat-sys-on-surface-variant);
      margin-left: 0.5rem;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      flex-wrap: wrap;

      .complete-btn {
        font-weight: 600;
      }
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      font-size: 0.75rem;
      font-weight: 600;
      padding: 0.25rem 0.625rem;
      border-radius: 9999px;
      letter-spacing: 0.02em;

      .badge-icon {
        font-size: 1rem;
        width: 1rem;
        height: 1rem;
      }
    }

    .active-badge {
      background-color: var(--mat-sys-primary);
      color: var(--mat-sys-on-primary);
    }

    .upcoming-badge {
      background-color: var(--mat-sys-surface-container-highest);
      color: var(--mat-sys-on-surface-variant);
    }

    .skipped-badge {
      background-color: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
    }

    .spend-badge {
      background-color: var(--mat-sys-tertiary-container);
      color: var(--mat-sys-on-tertiary-container);
    }

    .reserve-badge {
      background-color: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
    }

    .release-badge {
      background-color: var(--mat-sys-surface-variant, #e1e2ec);
      color: var(--mat-sys-on-surface-variant);
    }

    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: 0.75rem;
      background-color: var(--mat-sys-surface-container-low);
      padding: 0.75rem 1rem;
      border-radius: 8px;
    }

    .metric-item {
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
    }

    .metric-label {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      color: var(--mat-sys-on-surface-variant);
    }

    .metric-value {
      font-size: 1rem;
      font-weight: 600;
      color: var(--mat-sys-on-surface);
    }

    .progress-bar-container {
      width: 100%;

      mat-progress-bar {
        height: 8px;
        border-radius: 4px;
      }
    }

    .card-footer-row {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      font-size: 0.875rem;
    }

    .status-indicator {
      display: flex;
      align-items: center;
      gap: 0.375rem;

      .status-icon {
        font-size: 1.125rem;
        width: 1.125rem;
        height: 1.125rem;
      }

      &.funded {
        color: var(--worth-it-positive, #1b6b3a);
        font-weight: 600;
      }

      &.warning {
        color: var(--mat-sys-error);
        font-style: italic;
      }
    }

    .projected {
      font-style: italic;
      color: var(--mat-sys-tertiary);
      display: flex;
      align-items: center;
      gap: 0.375rem;
      font-size: 0.875rem;

      .projected-icon {
        font-size: 1.125rem;
        width: 1.125rem;
        height: 1.125rem;
      }

      .projected-label {
        font-weight: 600;
        text-transform: uppercase;
        font-size: 0.75rem;
        letter-spacing: 0.04em;
      }

      .projected-duration {
        font-weight: 500;
      }

      .projected-date {
        opacity: 0.85;
      }
    }

    .all-completed-card {
      display: flex;
      align-items: center;
      gap: 1rem;
      background-color: var(--mat-sys-surface-container-low);
      border: 1px dashed var(--mat-sys-outline-variant);
      border-radius: 12px;
      padding: 1.5rem;

      .all-completed-icon {
        font-size: 2.25rem;
        width: 2.25rem;
        height: 2.25rem;
        color: var(--worth-it-positive, #1b6b3a);
      }

      .all-completed-text {
        h3 {
          margin: 0;
          font-size: 1rem;
          font-weight: 600;
          color: var(--mat-sys-on-surface);
        }

        p {
          margin: 0.25rem 0 0;
          font-size: 0.875rem;
          color: var(--mat-sys-on-surface-variant);
        }
      }
    }

    .empty-state-wrapper {
      padding: 2rem 0;
    }
  `,
})
export class Goals {
  protected readonly store = inject(WorthItStore);
  private readonly dialog = inject(MatDialog);

  // Store signals
  protected readonly wealthSummary = this.store.wealthSummary;
  protected readonly cushionStatus = this.store.financialCushionStatus;
  protected readonly monthlySurplusSummary = this.store.monthlySurplusSummary;

  // Filtered views
  protected readonly uncompletedGoals = computed<GoalFundingSummary[]>(() =>
    this.store
      .goalsWithFunding()
      .filter((item) => !item.goal.isCompleted && !item.goal.isSkipped)
  );

  protected readonly hasGoals = computed<boolean>(
    () => this.store.goals().length > 0
  );

  // Cushion metric tile hint and tone
  protected readonly cushionHint = computed<string>(() => {
    const c = this.cushionStatus();
    if (!c.isEnabled) {
      return 'Cushion disabled in settings';
    }
    const formattedDeficit = new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency: 'PLN',
      maximumFractionDigits: 0,
    }).format(c.deficit);
    const formattedTarget = new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency: 'PLN',
      maximumFractionDigits: 0,
    }).format(c.target);

    if (c.deficit > 0) {
      return `Deficit: ${formattedDeficit} (${c.percent}%) — cushion takes priority`;
    }
    return `Target: ${formattedTarget} (Fully funded)`;
  });

  protected readonly cushionTone = computed<MetricTileTone>(() =>
    this.cushionStatus().deficit > 0 ? 'negative' : 'positive'
  );

  // Add Goal
  async openAddGoalDialog(): Promise<void> {
    const dialogRef = this.dialog.open(GoalFormDialog, {
      data: {},
      width: '450px',
    });

    const result = await firstValueFrom(dialogRef.afterClosed());
    if (result) {
      await this.store.addGoal(result);
    }
  }

  // Edit Goal
  async openEditDialog(goal: Goal): Promise<void> {
    const dialogRef = this.dialog.open(GoalFormDialog, {
      data: { goal },
      width: '450px',
    });

    const result = await firstValueFrom(dialogRef.afterClosed());
    if (result) {
      await this.store.updateGoal(goal.id, result);
    }
  }

  // Complete Goal
  async openCompleteDialog(goal: Goal): Promise<void> {
    const dialogRef = this.dialog.open(GoalCompleteDialog, {
      data: { goal },
      width: '520px',
    });

    const result = await firstValueFrom(dialogRef.afterClosed());
    if (result) {
      await this.store.completeGoal(
        goal.id,
        result.choice,
        result.spentAmount,
        result.reservedAmount
      );
    }
  }

  // Change Allocation on already completed goal
  async openChangeAllocationDialog(goal: Goal): Promise<void> {
    const dialogRef = this.dialog.open(GoalCompleteDialog, {
      data: { goal },
      width: '520px',
    });

    const result = await firstValueFrom(dialogRef.afterClosed());
    if (!result) return;
    // When changing from 'spend', clean up the old auto-expense first
    if (goal.completionChoice === 'spend') {
      await this.store.uncompleteGoal(goal.id);
    }
    await this.store.completeGoal(
      goal.id,
      result.choice,
      result.spentAmount,
      result.reservedAmount
    );
  }

  // Reopen goal
  async reopenGoal(id: string): Promise<void> {
    await this.store.uncompleteGoal(id);
  }

  // Skip goal
  async skipGoal(id: string): Promise<void> {
    await this.store.skipGoal(id, true);
  }

  // Resume / Unskip goal
  async unskipGoal(id: string): Promise<void> {
    await this.store.skipGoal(id, false);
  }

  // Delete goal
  async openDeleteDialog(goal: Goal): Promise<void> {
    const dialogRef = this.dialog.open(ConfirmDialog, {
      data: {
        title: 'Delete goal',
        message: `Are you sure you want to delete "${goal.name}"? This action cannot be undone.`,
        confirmText: 'Delete',
        destructive: true,
      },
    });

    const confirmed = await firstValueFrom(dialogRef.afterClosed());
    if (confirmed) {
      await this.store.deleteGoal(goal.id);
    }
  }

  // Reordering
  async moveGoalUp(index: number): Promise<void> {
    if (index > 0) {
      await this.reorderUncompletedGoals(index, index - 1);
    }
  }

  async moveGoalDown(index: number): Promise<void> {
    const uncompleted = this.uncompletedGoals();
    if (index < uncompleted.length - 1) {
      await this.reorderUncompletedGoals(index, index + 1);
    }
  }

  async onDrop(event: CdkDragDrop<GoalFundingSummary[]>): Promise<void> {
    if (event.previousIndex !== event.currentIndex) {
      await this.reorderUncompletedGoals(event.previousIndex, event.currentIndex);
    }
  }

  async reorderUncompletedGoals(fromIndex: number, toIndex: number): Promise<void> {
    const uncompleted = this.uncompletedGoals().map((item) => item.goal);
    if (
      fromIndex < 0 ||
      fromIndex >= uncompleted.length ||
      toIndex < 0 ||
      toIndex >= uncompleted.length
    ) {
      return;
    }
    moveItemInArray(uncompleted, fromIndex, toIndex);
    const otherGoals = this.store
      .goals()
      .filter((g) => g.isCompleted || g.isSkipped);
    await this.store.reorderGoals([...uncompleted, ...otherGoals]);
  }
}

export { Goals as GoalsComponent };
