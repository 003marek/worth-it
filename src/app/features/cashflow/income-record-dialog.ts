import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { form, FormField, FormRoot, min, required } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectChange, MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { IncomeRecord, IncomeSource, IncomeType } from '../../core/models/worth-it.model';
import { FieldErrors } from '../../shared/components/field-errors/field-errors';

export interface IncomeRecordDialogData {
  record?: IncomeRecord;
  sources: IncomeSource[];
  recentRecords?: IncomeRecord[];
  defaultCurrency?: string;
}

export interface IncomeRecordFormValue {
  incomeSourceId: string;
  name: string;
  type: IncomeType;
  amount: number;
  currency: string;
  receivedDate: string;
  isActual: boolean;
  isReflectedInBalances: boolean;
  note: string;
}

@Component({
  selector: 'app-income-record-dialog',
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
    <h2 mat-dialog-title>{{ data.record ? 'Edit Income Entry' : 'Record Received Income' }}</h2>
    <form [formRoot]="recordForm">
      <mat-dialog-content class="form-grid">
        @if (data.sources.length > 0) {
          <mat-form-field appearance="outline">
            <mat-label>Link to Income Source (Optional prefill)</mat-label>
            <mat-select
              [formField]="recordForm.incomeSourceId"
              (selectionChange)="onSourceSelectionChange($event)"
            >
              <mat-option value="">-- Ad-hoc / Unlinked Income --</mat-option>
              @for (source of data.sources; track source.id) {
                <mat-option [value]="source.id">
                  {{ source.name }} ({{ source.frequency }})
                </mat-option>
              }
            </mat-select>
          </mat-form-field>
        }

        <mat-form-field appearance="outline">
          <mat-label>Income description / name</mat-label>
          <input matInput [formField]="recordForm.name" placeholder="e.g. October Salary" />
        </mat-form-field>
        <app-field-errors [field]="recordForm.name" />

        <div class="two-col">
          <mat-form-field appearance="outline">
            <mat-label>Type</mat-label>
            <mat-select [formField]="recordForm.type">
              <mat-option value="salary">Salary</mat-option>
              <mat-option value="other">Other / Freelance / Bonus</mat-option>
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Received Date</mat-label>
            <input matInput type="date" [formField]="recordForm.receivedDate" />
          </mat-form-field>
        </div>

        <mat-form-field appearance="outline">
          <mat-label>Amount</mat-label>
          <input matInput type="number" step="0.01" [formField]="recordForm.amount" />
          <span matTextSuffix>{{ model().currency }}</span>
        </mat-form-field>
        <app-field-errors [field]="recordForm.amount" />

        <div class="toggle-group">
          <div class="toggle-row">
            <mat-slide-toggle [formField]="recordForm.isActual">
              Actual received income
            </mat-slide-toggle>
            <span class="toggle-hint">
              When checked, this real income adjusts your total wealth. If unchecked, it serves as an expected or planning note.
            </span>
          </div>

          @if (model().isActual) {
            <div class="toggle-row highlighted">
              <mat-slide-toggle [formField]="recordForm.isReflectedInBalances">
                Already included in my asset balances
              </mat-slide-toggle>
              <span class="toggle-hint">
                Turn ON if your bank account balance already includes this payment.
                Leave OFF if you haven't updated balances yet — this income will add to your total wealth immediately (spec §6.3 / §17).
              </span>
            </div>
          }
        </div>

        <mat-form-field appearance="outline">
          <mat-label>Note (Optional)</mat-label>
          <input matInput [formField]="recordForm.note" placeholder="e.g. Base salary + Q3 bonus" />
        </mat-form-field>
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancel</button>
        <button mat-flat-button type="submit" [disabled]="recordForm().submitting()">Save record</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .form-grid {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: min(460px, 85vw);
      padding-top: 8px;
    }
    .two-col {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .toggle-group {
      display: flex;
      flex-direction: column;
      gap: 12px;
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
        border-left: 3px solid var(--mat-sys-primary);
      }
    }
    .toggle-hint {
      font-size: 0.75rem;
      color: var(--mat-sys-on-surface-variant);
      line-height: 1.35;
    }
  `,
})
export class IncomeRecordDialog {
  protected readonly data = inject<IncomeRecordDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<IncomeRecordDialog, IncomeRecordFormValue>);

  protected readonly model = signal<IncomeRecordFormValue>(this.createInitialModel());

  protected readonly recordForm = form(
    this.model,
    (path) => {
      required(path.name, { message: 'Description/name is required' });
      required(path.amount, { message: 'Amount is required' });
      min(path.amount, 0.01, { message: 'Amount must be greater than 0' });
      required(path.receivedDate, { message: 'Date is required' });
    },
    {
      submission: {
        action: async () => {
          this.dialogRef.close({
            ...this.model(),
            name: this.model().name.trim(),
            note: this.model().note?.trim() || undefined,
          });
          return undefined;
        },
      },
    }
  );

  private createInitialModel(): IncomeRecordFormValue {
    if (this.data.record) {
      return {
        incomeSourceId: this.data.record.incomeSourceId ?? '',
        name: this.data.record.name,
        type: this.data.record.type,
        amount: this.data.record.amount,
        currency: this.data.record.currency,
        receivedDate: this.data.record.receivedDate.substring(0, 10),
        isActual: this.data.record.isActual,
        isReflectedInBalances: this.data.record.isReflectedInBalances ?? false,
        note: this.data.record.note ?? '',
      };
    }

    // Default prefill from primary salary source or first source
    const defaultSource =
      this.data.sources.find((s) => s.type === 'salary' && s.isEnabled) ||
      this.data.sources.find((s) => s.isEnabled) ||
      this.data.sources[0];

    const today = new Date().toISOString().substring(0, 10);
    const currency = defaultSource?.currency || this.data.defaultCurrency || 'PLN';

    if (defaultSource) {
      // Find most recent record for this source to prefill amount
      const recentForSource = this.data.recentRecords?.find(
        (r) => r.incomeSourceId === defaultSource.id
      );
      const prefillAmount = recentForSource?.amount ?? defaultSource.amount;

      return {
        incomeSourceId: defaultSource.id,
        name: defaultSource.name,
        type: defaultSource.type,
        amount: prefillAmount,
        currency,
        receivedDate: today,
        isActual: true,
        isReflectedInBalances: false,
        note: '',
      };
    }

    return {
      incomeSourceId: '',
      name: '',
      type: 'salary',
      amount: 0,
      currency,
      receivedDate: today,
      isActual: true,
      isReflectedInBalances: false,
      note: '',
    };
  }

  protected onSourceSelectionChange(event: MatSelectChange): void {
    const sourceId = event.value;
    if (!sourceId) return;

    const source = this.data.sources.find((s) => s.id === sourceId);
    if (!source) return;

    const recentForSource = this.data.recentRecords?.find(
      (r) => r.incomeSourceId === source.id
    );
    const prefillAmount = recentForSource?.amount ?? source.amount;

    this.model.update((prev) => ({
      ...prev,
      incomeSourceId: source.id,
      name: source.name,
      type: source.type,
      amount: prefillAmount,
      currency: source.currency,
    }));
  }
}
