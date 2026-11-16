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
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';
import { Goal, GoalFundingSummary } from '../../core/models/worth-it.model';
import { WorthItStore } from '../../core/stores/worth-it.store';
import { ConfirmDialog } from '../../shared/components/confirm-dialog/confirm-dialog';
import { EmptyState } from '../../shared/components/empty-state/empty-state';
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
    MatChipsModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatTooltipModule,
    EmptyState,
    MoneyPipe,
    MonthsPipe,
  ],
  templateUrl: './goals.html',
  styleUrl: './goals.scss',
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

  // Cushion metric hint and tone
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

  protected readonly cushionTone = computed<'positive' | 'negative'>(() =>
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
