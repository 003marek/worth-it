import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { form, FormField, FormRoot, min, required } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { Goal, GoalCompletionChoice } from '../../core/models/worth-it.model';
import { MoneyPipe } from '../../shared/pipes/money.pipe';

export interface GoalCompleteDialogData {
  goal: Goal;
}

export interface GoalCompleteResult {
  choice: GoalCompletionChoice;
  spentAmount?: number;
  reservedAmount?: number;
}

export interface GoalCompleteFormModel {
  choice: GoalCompletionChoice;
  spentAmount: number;
  reservedAmount: number;
}

@Component({
  selector: 'app-goal-complete-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatDialogModule,
    MatCardModule,
    MatChipsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatRadioModule,
    FormRoot,
    FormField,
    MoneyPipe,
  ],
  template: `
    <h2 mat-dialog-title>
      {{ data.goal.isCompleted ? 'Change allocation' : 'Complete goal' }}
    </h2>
    <div class="goal-subtitle">
      <span class="goal-name">{{ data.goal.name }}</span>
      <mat-chip-set>
        <mat-chip class="target-chip">Target: {{ data.goal.targetAmount | money }}</mat-chip>
      </mat-chip-set>
    </div>

    <form [formRoot]="completeForm">
      <mat-dialog-content class="dialog-content">
        <p class="instruction">
          Choose what happens to the funds accumulated for this goal:
        </p>

        <mat-radio-group [formField]="completeForm.choice" class="choices-group">
          <!-- Option 1: Spend -->
          <mat-card
            appearance="outlined"
            class="choice-card"
            [class.selected]="completeForm.choice().value() === 'spend'"
          >
            <mat-card-content>
              <mat-radio-button value="spend">
                <span class="choice-title">Spend the money</span>
              </mat-radio-button>
              <p class="choice-description">
                An actual expense will be recorded reducing total wealth. Any unspent amount carries forward to the next goal.
              </p>
              @if (completeForm.choice().value() === 'spend') {
                <div class="amount-field-wrapper">
                  <mat-form-field appearance="outline" class="amount-field">
                    <mat-label>Actual amount spent</mat-label>
                    <input
                      matInput
                      type="number"
                      [formField]="completeForm.spentAmount"
                      placeholder="0"
                    />
                    <span matTextSuffix>PLN</span>
                    @for (error of completeForm.spentAmount().errors(); track $index) {
                      <mat-error>{{ error.message }}</mat-error>
                    }
                  </mat-form-field>
                </div>
              }
            </mat-card-content>
          </mat-card>

          <!-- Option 2: Reserve -->
          <mat-card
            appearance="outlined"
            class="choice-card"
            [class.selected]="completeForm.choice().value() === 'reserve'"
          >
            <mat-card-content>
              <mat-radio-button value="reserve">
                <span class="choice-title">Reserve the money</span>
              </mat-radio-button>
              <p class="choice-description">
                Stays in total wealth but is earmarked for this completed goal and excluded from subsequent goals.
              </p>
              @if (completeForm.choice().value() === 'reserve') {
                <div class="amount-field-wrapper">
                  <mat-form-field appearance="outline" class="amount-field">
                    <mat-label>Amount to reserve</mat-label>
                    <input
                      matInput
                      type="number"
                      [formField]="completeForm.reservedAmount"
                      placeholder="0"
                    />
                    <span matTextSuffix>PLN</span>
                    @for (error of completeForm.reservedAmount().errors(); track $index) {
                      <mat-error>{{ error.message }}</mat-error>
                    }
                  </mat-form-field>
                </div>
              }
            </mat-card-content>
          </mat-card>

          <!-- Option 3: Release -->
          <mat-card
            appearance="outlined"
            class="choice-card"
            [class.selected]="completeForm.choice().value() === 'release'"
          >
            <mat-card-content>
              <mat-radio-button value="release">
                <span class="choice-title">Release the money</span>
              </mat-radio-button>
              <p class="choice-description">
                All money remains available for the next goal. No funds are spent or earmarked.
              </p>
            </mat-card-content>
          </mat-card>
        </mat-radio-group>
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancel</button>
        <button
          mat-flat-button
          color="primary"
          type="submit"
          [disabled]="completeForm().submitting()"
        >
          {{ data.goal.isCompleted ? 'Save allocation' : 'Complete goal' }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .goal-subtitle {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0 1.5rem 0.5rem;
      color: var(--mat-sys-on-surface-variant);
      font-size: 0.875rem;
    }
    .goal-name {
      font-weight: 600;
      color: var(--mat-sys-on-surface);
    }
    .dialog-content {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      min-width: min(520px, 85vw);
      box-sizing: border-box;
    }
    .instruction {
      margin: 0;
      font-size: 0.875rem;
      color: var(--mat-sys-on-surface-variant);
    }
    .choices-group {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .choice-card {
      background: var(--mat-sys-surface-container-low);
      transition: border-color 0.15s, background-color 0.15s;

      &.selected {
        border-color: var(--mat-sys-primary);
        background: var(--mat-sys-surface-container);
      }
    }
    .choice-title {
      font-weight: 600;
      font-size: 0.9375rem;
      color: var(--mat-sys-on-surface);
    }
    .choice-description {
      margin: 0.375rem 0 0 2rem;
      font-size: 0.8125rem;
      color: var(--mat-sys-on-surface-variant);
      line-height: 1.4;
    }
    .amount-field-wrapper {
      margin-top: 0.75rem;
      margin-left: 2rem;
    }
    .amount-field {
      width: 100%;
    }
  `,
})
export class GoalCompleteDialog {
  protected readonly data = inject<GoalCompleteDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<GoalCompleteDialog, GoalCompleteResult>);

  /** Plain-object model signal. */
  private readonly model = signal<GoalCompleteFormModel>({
    choice: this.data.goal.completionChoice ?? 'spend',
    spentAmount: this.data.goal.spentAmount ?? this.data.goal.targetAmount,
    reservedAmount: this.data.goal.reservedAmount ?? this.data.goal.targetAmount,
  });

  /** Validation schema and submission action. */
  protected readonly completeForm = form(
    this.model,
    (path) => {
      required(path.choice, { message: 'Select an option' });
      min(path.spentAmount, 0, { message: 'Must be ≥ 0' });
      min(path.reservedAmount, 0, { message: 'Must be ≥ 0' });
    },
    {
      submission: {
        action: async () => {
          const val = this.model();
          const choice = val.choice;
          const result: GoalCompleteResult = {
            choice,
            spentAmount: choice === 'spend' ? Math.max(0, Number(val.spentAmount) || 0) : undefined,
            reservedAmount: choice === 'reserve' ? Math.max(0, Number(val.reservedAmount) || 0) : undefined,
          };
          this.dialogRef.close(result);
          return undefined;
        },
      },
    }
  );
}

export { GoalCompleteDialog as GoalCompleteDialogComponent };
