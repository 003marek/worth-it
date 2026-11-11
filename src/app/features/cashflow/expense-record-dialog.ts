import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { form, FormField, FormRoot, min, required } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleChange, MatButtonToggleModule } from '@angular/material/button-toggle';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectChange, MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { ExpenseCategory, ExpenseRecord } from '../../core/models/worth-it.model';
import { FieldErrors } from '../../shared/components/field-errors/field-errors';

export interface ExpenseRecordDialogData {
  record?: ExpenseRecord;
  categories: ExpenseCategory[];
  defaultCurrency?: string;
  initialMode?: 'individual' | 'monthly_total';
}

export interface ExpenseRecordFormValue {
  mode: 'individual' | 'monthly_total';
  categoryId: string;
  categoryName: string;
  amount: number;
  currency: string;
  date: string;
  isActual: boolean;
  isReflectedInBalances: boolean;
  note: string;
}

@Component({
  selector: 'app-expense-record-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatButtonToggleModule,
    MatButtonModule,
    FormRoot,
    FormField,
    FieldErrors,
  ],
  template: `
    <h2 mat-dialog-title>
      {{ data.record ? 'Edit Expense Record' : 'Record Expense / Monthly Total' }}
    </h2>
    <form [formRoot]="expenseForm">
      <mat-dialog-content class="form-grid">
        <div class="mode-selector">
          <mat-button-toggle-group
            [value]="model().mode"
            (change)="onModeChange($event)"
            aria-label="Expense Mode"
          >
            <mat-button-toggle value="individual">Individual Expense</mat-button-toggle>
            <mat-button-toggle value="monthly_total">Monthly Total Entry</mat-button-toggle>
          </mat-button-toggle-group>
        </div>

        @if (model().mode === 'individual' && data.categories.length > 0) {
          <mat-form-field appearance="outline">
            <mat-label>Category (Optional prefill)</mat-label>
            <mat-select
              [formField]="expenseForm.categoryId"
              (selectionChange)="onCategorySelectionChange($event)"
            >
              <mat-option value="">-- Custom / Uncategorized --</mat-option>
              @for (cat of data.categories; track cat.id) {
                <mat-option [value]="cat.id">{{ cat.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        }

        <mat-form-field appearance="outline">
          <mat-label>{{ model().mode === 'monthly_total' ? 'Entry description' : 'Expense / Category name' }}</mat-label>
          <input
            matInput
            [formField]="expenseForm.categoryName"
            [placeholder]="model().mode === 'monthly_total' ? 'e.g. Total monthly living expenses' : 'e.g. Groceries / Supermarket'"
          />
        </mat-form-field>
        <app-field-errors [field]="expenseForm.categoryName" />

        <div class="two-col">
          <mat-form-field appearance="outline">
            <mat-label>Amount</mat-label>
            <input matInput type="number" step="0.01" [formField]="expenseForm.amount" />
            <span matTextSuffix>{{ model().currency }}</span>
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Date</mat-label>
            <input matInput type="date" [formField]="expenseForm.date" />
          </mat-form-field>
        </div>
        <app-field-errors [field]="expenseForm.amount" />

        <div class="toggle-group">
          <div class="toggle-row">
            <mat-slide-toggle [formField]="expenseForm.isActual">
              Actual spent expense
            </mat-slide-toggle>
            <span class="toggle-hint">
              When enabled, actual spending reduces your current total wealth (until asset balances are updated).
            </span>
          </div>

          @if (model().isActual) {
            <div class="toggle-row highlighted">
              <mat-slide-toggle [formField]="expenseForm.isReflectedInBalances">
                Already reflected in asset balances
              </mat-slide-toggle>
              <span class="toggle-hint">
                Turn ON if your bank/card account balance already accounts for this charge.
                Leave OFF if you haven't refreshed account balances yet — this expense will immediately reduce wealth and active goal progress to prevent double counting (spec §7.2 / §17).
              </span>
            </div>
          }
        </div>

        <mat-form-field appearance="outline">
          <mat-label>Note (Optional)</mat-label>
          <input matInput [formField]="expenseForm.note" placeholder="e.g. Annual car insurance / monthly lump sum" />
        </mat-form-field>
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancel</button>
        <button mat-flat-button type="submit" [disabled]="expenseForm().submitting()">Save expense</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .form-grid {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: min(480px, 85vw);
      padding-top: 8px;
    }
    .mode-selector {
      display: flex;
      justify-content: center;
      margin-bottom: 8px;
    }
    .two-col {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .toggle-group {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 8px 0 12px;
    }
    .toggle-row {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 8px;
      border-radius: 8px;
      background-color: var(--mat-sys-surface-container-low);

      &.highlighted {
        background-color: var(--mat-sys-surface-container);
        border-left: 3px solid var(--mat-sys-error);
      }
    }
    .toggle-hint {
      font-size: 0.75rem;
      color: var(--mat-sys-on-surface-variant);
      line-height: 1.35;
    }
  `,
})
export class ExpenseRecordDialog {
  protected readonly data = inject<ExpenseRecordDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<ExpenseRecordDialog, ExpenseRecordFormValue>);

  protected readonly model = signal<ExpenseRecordFormValue>(this.createInitialModel());

  protected readonly expenseForm = form(
    this.model,
    (path) => {
      required(path.categoryName, { message: 'Category / description is required' });
      required(path.amount, { message: 'Amount is required' });
      min(path.amount, 0.01, { message: 'Amount must be greater than 0' });
      required(path.date, { message: 'Date is required' });
    },
    {
      submission: {
        action: async () => {
          this.dialogRef.close({
            ...this.model(),
            categoryName: this.model().categoryName.trim(),
            note: this.model().note?.trim() || undefined,
          });
          return undefined;
        },
      },
    }
  );

  private createInitialModel(): ExpenseRecordFormValue {
    const today = new Date().toISOString().substring(0, 10);
    const currency = this.data.record?.currency || this.data.defaultCurrency || 'PLN';

    if (this.data.record) {
      return {
        mode: this.data.initialMode || 'individual',
        categoryId: this.data.record.categoryId ?? '',
        categoryName: this.data.record.categoryName,
        amount: this.data.record.amount,
        currency,
        date: this.data.record.date.substring(0, 10),
        isActual: this.data.record.isActual,
        isReflectedInBalances: this.data.record.isReflectedInBalances ?? false,
        note: this.data.record.note ?? '',
      };
    }

    if (this.data.initialMode === 'monthly_total') {
      return {
        mode: 'monthly_total',
        categoryId: '',
        categoryName: 'Overall monthly expenses',
        amount: 0,
        currency,
        date: today,
        isActual: true,
        isReflectedInBalances: false,
        note: 'Monthly total actual spend',
      };
    }

    return {
      mode: 'individual',
      categoryId: '',
      categoryName: '',
      amount: 0,
      currency,
      date: today,
      isActual: true,
      isReflectedInBalances: false,
      note: '',
    };
  }

  protected onModeChange(event: MatButtonToggleChange): void {
    const newMode = event.value as 'individual' | 'monthly_total';
    if (newMode === 'monthly_total') {
      this.model.update((prev) => ({
        ...prev,
        mode: newMode,
        categoryId: '',
        categoryName: prev.categoryName || 'Overall monthly expenses',
        note: prev.note || 'Monthly total actual spend',
      }));
    } else {
      this.model.update((prev) => ({
        ...prev,
        mode: newMode,
      }));
    }
  }

  protected onCategorySelectionChange(event: MatSelectChange): void {
    const catId = event.value;
    if (!catId) return;

    const cat = this.data.categories.find((c) => c.id === catId);
    if (!cat) return;

    this.model.update((prev) => ({
      ...prev,
      categoryId: cat.id,
      categoryName: cat.name,
      amount: prev.amount > 0 ? prev.amount : cat.expectedMonthlyAmount,
      currency: cat.currency,
    }));
  }
}
