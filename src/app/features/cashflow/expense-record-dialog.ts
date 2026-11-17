import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { form, FormField, FormRoot, min, required } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleChange, MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectChange, MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { ExpenseCategory, ExpenseRecord } from '../../core/models/worth-it.model';

export interface ExpenseRecordDialogData {
  record?: ExpenseRecord;
  categories: ExpenseCategory[];
  defaultCurrency?: string;
  initialMode?: 'individual' | 'monthly_total';
  initialPreset?: 'annual_stock_tax';
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
    MatCardModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatButtonToggleModule,
    MatButtonModule,
    FormRoot,
    FormField,
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

        <!-- Quick Preset Row (PIT-38 Annual Stock Tax preset) -->
        <div class="presets-row">
          <button
            type="button"
            mat-stroked-button
            class="preset-btn"
            (click)="applyAnnualStockTaxPreset()"
          >
            <mat-icon>receipt_long</mat-icon>
            Annual stock tax (PIT-38)
          </button>
        </div>

        <!-- Explanatory note when Annual Stock Tax preset is active -->
        @if (isAnnualStockTax()) {
          <mat-card appearance="outlined" class="tax-preset-notice" role="note">
            <mat-card-content class="notice-content">
              <mat-icon class="notice-icon">info</mat-icon>
              <span>
                One-off annual stock tax reduces current wealth without increasing your recurring monthly expense baseline.
              </span>
            </mat-card-content>
          </mat-card>
        }

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
          @for (error of expenseForm.categoryName().errors(); track $index) {
            <mat-error>{{ error.message }}</mat-error>
          }
        </mat-form-field>

        <div class="two-col">
          <mat-form-field appearance="outline">
            <mat-label>Amount</mat-label>
            <input matInput type="number" step="0.01" [formField]="expenseForm.amount" />
            <span matTextSuffix>{{ model().currency }}</span>
            @for (error of expenseForm.amount().errors(); track $index) {
              <mat-error>{{ error.message }}</mat-error>
            }
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Date</mat-label>
            <input matInput type="date" [formField]="expenseForm.date" />
            @for (error of expenseForm.date().errors(); track $index) {
              <mat-error>{{ error.message }}</mat-error>
            }
          </mat-form-field>
        </div>

        <div class="toggle-group">
          <mat-card appearance="outlined" class="toggle-row">
            <mat-card-content>
              <mat-slide-toggle [formField]="expenseForm.isActual">
                Actual spent expense
              </mat-slide-toggle>
              <p class="toggle-hint">
                When enabled, actual spending reduces your current total wealth (until asset balances are updated).
              </p>
            </mat-card-content>
          </mat-card>

          @if (model().isActual) {
            <mat-card appearance="outlined" class="toggle-row highlighted">
              <mat-card-content>
                <mat-slide-toggle [formField]="expenseForm.isReflectedInBalances">
                  Already reflected in asset balances
                </mat-slide-toggle>
                <p class="toggle-hint">
                  Turn ON if your bank/card account balance already accounts for this charge.
                  Leave OFF if you haven't refreshed account balances yet — this expense will immediately reduce wealth and active goal progress to prevent double counting (spec §7.2 / §17).
                </p>
              </mat-card-content>
            </mat-card>
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
      width: 100%;
      max-width: 100%;
      box-sizing: border-box;
      padding-top: 8px;

      mat-form-field {
        width: 100%;
        min-width: 0;
      }
    }
    .mode-selector {
      display: flex;
      justify-content: center;
      width: 100%;
      margin-bottom: 8px;

      mat-button-toggle-group {
        width: 100%;
        max-width: 100%;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      ::ng-deep .mat-button-toggle-button {
        height: auto;
        min-height: 44px;
      }

      ::ng-deep .mat-button-toggle-label-content {
        padding: 8px 10px !important;
        line-height: 1.25 !important;
        white-space: normal !important;
        text-align: center;
      }
    }
    .presets-row {
      display: flex;
      align-items: center;
      margin-bottom: 4px;
    }
    .preset-btn {
      font-size: 0.8125rem;
    }
    .tax-preset-notice {
      background-color: var(--mat-sys-surface-container);
      border-left: 3px solid var(--mat-sys-tertiary, #e69a00);
      margin: 2px 0 8px;
    }
    .notice-content {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.8125rem;
      color: var(--mat-sys-on-surface-variant);
      line-height: 1.4;
      padding: 8px 12px;
    }
    .notice-icon {
      font-size: 1.125rem;
      width: 1.125rem;
      height: 1.125rem;
      color: var(--mat-sys-tertiary, #e69a00);
      flex-shrink: 0;
    }
    .two-col {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 4px 12px;

      @media (min-width: 480px) {
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      }
    }
    .toggle-group {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 8px 0 12px;
    }
    .toggle-row {
      background-color: var(--mat-sys-surface-container-low);

      &.highlighted {
        background-color: var(--mat-sys-surface-container);
        border-left: 3px solid var(--mat-sys-error);
      }
    }
    .toggle-hint {
      margin: 4px 0 0;
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

  readonly isAnnualStockTax = computed(() => {
    return this.model().categoryName.trim().toLowerCase() === 'taxes / annual stock tax';
  });

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

  applyAnnualStockTaxPreset(): void {
    this.model.update((prev) => ({
      ...prev,
      mode: 'individual',
      categoryId: '',
      categoryName: 'Taxes / Annual Stock Tax',
      isActual: true,
      isReflectedInBalances: false,
      note: prev.note || 'Annual PIT-38 capital gains tax',
    }));
  }

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

    if (this.data.initialPreset === 'annual_stock_tax') {
      return {
        mode: 'individual',
        categoryId: '',
        categoryName: 'Taxes / Annual Stock Tax',
        amount: 0,
        currency,
        date: today,
        isActual: true,
        isReflectedInBalances: false,
        note: 'Annual PIT-38 capital gains tax',
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
