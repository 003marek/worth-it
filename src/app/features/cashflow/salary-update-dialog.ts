import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { form, FormField, FormRoot, min, required } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { IncomeSource } from '../../core/models/worth-it.model';
import { FieldErrors } from '../../shared/components/field-errors/field-errors';
import { MoneyPipe } from '../../shared/pipes/money.pipe';

export interface SalaryUpdateDialogData {
  source: IncomeSource;
}

export interface SalaryUpdateFormValue {
  newAmount: number;
  effectiveDate: string;
  logHistoryRecord: boolean;
  historyNote: string;
}

@Component({
  selector: 'app-salary-update-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
    MatButtonModule,
    FormRoot,
    FormField,
    FieldErrors,
    MoneyPipe,
  ],
  template: `
    <h2 mat-dialog-title>Update Salary / Baseline</h2>
    <form [formRoot]="salaryForm">
      <mat-dialog-content class="form-grid">
        <div class="current-info">
          <span class="info-label">Updating source:</span>
          <strong>{{ data.source.name }}</strong>
          <span class="info-sub">
            Current baseline: {{ data.source.amount | money:data.source.currency }}
            @if (data.source.effectiveDate) {
              (effective since {{ data.source.effectiveDate }})
            }
          </span>
        </div>

        <mat-form-field appearance="outline">
          <mat-label>New monthly salary / amount</mat-label>
          <input matInput type="number" step="0.01" [formField]="salaryForm.newAmount" />
          <span matTextSuffix>{{ data.source.currency }}</span>
        </mat-form-field>
        <app-field-errors [field]="salaryForm.newAmount" />

        <mat-form-field appearance="outline">
          <mat-label>Effective date</mat-label>
          <input matInput type="date" [formField]="salaryForm.effectiveDate" />
        </mat-form-field>
        <app-field-errors [field]="salaryForm.effectiveDate" />

        <div class="history-toggle-box">
          <mat-slide-toggle [formField]="salaryForm.logHistoryRecord">
            Log previous amount in history (spec §6.3)
          </mat-slide-toggle>
          <span class="toggle-hint">
            Preserves past salary baseline records so previous periods remain accurate in historical review.
          </span>
        </div>

        @if (model().logHistoryRecord) {
          <mat-form-field appearance="outline">
            <mat-label>History note</mat-label>
            <input matInput [formField]="salaryForm.historyNote" placeholder="e.g. Salary raise / role promotion" />
          </mat-form-field>
        }
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancel</button>
        <button mat-flat-button type="submit" [disabled]="salaryForm().submitting()">Save update</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .form-grid {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: min(440px, 85vw);
      padding-top: 8px;
    }
    .current-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 10px 14px;
      border-radius: 8px;
      background-color: var(--mat-sys-surface-container);
      margin-bottom: 8px;
      font-size: 0.875rem;
    }
    .info-label {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--mat-sys-on-surface-variant);
    }
    .info-sub {
      color: var(--mat-sys-on-surface-variant);
      font-size: 0.8125rem;
    }
    .history-toggle-box {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 6px 0;
    }
    .toggle-hint {
      font-size: 0.75rem;
      color: var(--mat-sys-on-surface-variant);
      line-height: 1.4;
    }
  `,
})
export class SalaryUpdateDialog {
  protected readonly data = inject<SalaryUpdateDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<SalaryUpdateDialog, SalaryUpdateFormValue>);

  protected readonly model = signal<SalaryUpdateFormValue>({
    newAmount: this.data.source.amount,
    effectiveDate: new Date().toISOString().substring(0, 10),
    logHistoryRecord: true,
    historyNote: 'Salary change baseline',
  });

  protected readonly salaryForm = form(
    this.model,
    (path) => {
      required(path.newAmount, { message: 'New salary amount is required' });
      min(path.newAmount, 0.01, { message: 'Amount must be greater than 0' });
      required(path.effectiveDate, { message: 'Effective date is required' });
    },
    {
      submission: {
        action: async () => {
          this.dialogRef.close(this.model());
          return undefined;
        },
      },
    }
  );
}
