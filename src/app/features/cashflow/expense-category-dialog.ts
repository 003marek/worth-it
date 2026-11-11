import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { form, FormField, FormRoot, min, required } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { ExpenseCategory } from '../../core/models/worth-it.model';
import { FieldErrors } from '../../shared/components/field-errors/field-errors';

export interface ExpenseCategoryDialogData {
  category?: ExpenseCategory;
  defaultCurrency?: string;
}

export interface ExpenseCategoryFormValue {
  name: string;
  expectedMonthlyAmount: number;
  currency: string;
  isEnabled: boolean;
}

@Component({
  selector: 'app-expense-category-dialog',
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
  ],
  template: `
    <h2 mat-dialog-title>{{ data.category ? 'Edit Expense Category' : 'New Expense Category' }}</h2>
    <form [formRoot]="categoryForm">
      <mat-dialog-content class="form-grid">
        <mat-form-field appearance="outline">
          <mat-label>Category name</mat-label>
          <input matInput [formField]="categoryForm.name" placeholder="e.g. Rent, Food, Transport, Utilities" />
        </mat-form-field>
        <app-field-errors [field]="categoryForm.name" />

        <mat-form-field appearance="outline">
          <mat-label>Expected monthly baseline</mat-label>
          <input matInput type="number" step="0.01" [formField]="categoryForm.expectedMonthlyAmount" />
          <span matTextSuffix>{{ model().currency }}</span>
        </mat-form-field>
        <app-field-errors [field]="categoryForm.expectedMonthlyAmount" />

        <div class="toggle-row">
          <mat-slide-toggle [formField]="categoryForm.isEnabled">Active in baseline</mat-slide-toggle>
          <span class="toggle-hint">
            Inactive categories stay in your list but are excluded from monthly expense projections.
          </span>
        </div>
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancel</button>
        <button mat-flat-button type="submit" [disabled]="categoryForm().submitting()">Save category</button>
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
export class ExpenseCategoryDialog {
  protected readonly data = inject<ExpenseCategoryDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<ExpenseCategoryDialog, ExpenseCategoryFormValue>);

  protected readonly model = signal<ExpenseCategoryFormValue>({
    name: this.data.category?.name ?? '',
    expectedMonthlyAmount: this.data.category?.expectedMonthlyAmount ?? 0,
    currency: this.data.category?.currency ?? (this.data.defaultCurrency || 'PLN'),
    isEnabled: this.data.category?.isEnabled ?? true,
  });

  protected readonly categoryForm = form(
    this.model,
    (path) => {
      required(path.name, { message: 'Category name is required' });
      required(path.expectedMonthlyAmount, { message: 'Monthly amount is required' });
      min(path.expectedMonthlyAmount, 0, { message: 'Amount cannot be negative' });
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
