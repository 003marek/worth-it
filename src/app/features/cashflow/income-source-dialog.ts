import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { form, FormField, FormRoot, min, required } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { IncomeFrequency, IncomeSource, IncomeType } from '../../core/models/worth-it.model';
import { FieldErrors } from '../../shared/components/field-errors/field-errors';

export interface IncomeSourceDialogData {
  source?: IncomeSource;
  defaultCurrency?: string;
}

export interface IncomeSourceFormValue {
  name: string;
  type: IncomeType;
  amount: number;
  currency: string;
  frequency: IncomeFrequency;
  effectiveDate: string;
  isEnabled: boolean;
}

@Component({
  selector: 'app-income-source-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatButtonModule,
    FormRoot,
    FormField,
    FieldErrors,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.source ? 'Edit Income Source' : 'New Income Source' }}</h2>
    <form [formRoot]="sourceForm">
      <mat-dialog-content class="form-grid">
        <mat-form-field appearance="outline">
          <mat-label>Source name</mat-label>
          <input matInput [formField]="sourceForm.name" placeholder="e.g. Primary Job / Tech Corp" />
        </mat-form-field>
        <app-field-errors [field]="sourceForm.name" />

        <mat-form-field appearance="outline">
          <mat-label>Income Type</mat-label>
          <mat-select [formField]="sourceForm.type">
            <mat-option value="salary">Salary / Regular</mat-option>
            <mat-option value="other">Other / Freelance / Bonus</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Expected Amount</mat-label>
          <input matInput type="number" step="0.01" [formField]="sourceForm.amount" />
          <span matTextSuffix>{{ model().currency }}</span>
        </mat-form-field>
        <app-field-errors [field]="sourceForm.amount" />

        <div class="two-col">
          <mat-form-field appearance="outline">
            <mat-label>Frequency</mat-label>
            <mat-select [formField]="sourceForm.frequency">
              <mat-option value="monthly">Monthly</mat-option>
              <mat-option value="annual">Annual</mat-option>
              <mat-option value="one_time">One-time</mat-option>
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Effective date</mat-label>
            <input matInput type="date" [formField]="sourceForm.effectiveDate" />
          </mat-form-field>
        </div>

        <div class="toggle-row">
          <mat-slide-toggle [formField]="sourceForm.isEnabled">Active in projections</mat-slide-toggle>
          <span class="toggle-hint">Disabling stops future surplus projections without erasing history.</span>
        </div>
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancel</button>
        <button mat-flat-button type="submit" [disabled]="sourceForm().submitting()">Save</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .form-grid {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: min(440px, 85vw);
      padding-top: 8px;
    }
    .two-col {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .toggle-row {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 8px 0;
    }
    .toggle-hint {
      font-size: 0.75rem;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class IncomeSourceDialog {
  protected readonly data = inject<IncomeSourceDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<IncomeSourceDialog, IncomeSourceFormValue>);

  protected readonly model = signal<IncomeSourceFormValue>({
    name: this.data.source?.name ?? '',
    type: this.data.source?.type ?? 'salary',
    amount: this.data.source?.amount ?? 0,
    currency: this.data.source?.currency ?? (this.data.defaultCurrency || 'PLN'),
    frequency: this.data.source?.frequency ?? 'monthly',
    effectiveDate: this.data.source?.effectiveDate ?? new Date().toISOString().substring(0, 10),
    isEnabled: this.data.source?.isEnabled ?? true,
  });

  protected readonly sourceForm = form(
    this.model,
    (path) => {
      required(path.name, { message: 'Source name is required' });
      required(path.amount, { message: 'Amount is required' });
      min(path.amount, 0.01, { message: 'Amount must be greater than 0' });
    },
    {
      submission: {
        action: async () => {
          this.dialogRef.close({
            ...this.model(),
            name: this.model().name.trim(),
          });
          return undefined;
        },
      },
    }
  );
}
