import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { form, FormField, FormRoot, min, required } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { Asset } from '../../core/models/worth-it.model';
import { WorthItStore } from '../../core/stores/worth-it.store';
import { FieldErrors } from '../../shared/components/field-errors/field-errors';
import { MoneyPipe } from '../../shared/pipes/money.pipe';

export interface UpdateBalanceFormValue {
  newBalance: number;
  note: string;
  markPendingReflected: boolean;
}

export interface UpdateBalanceDialogResult {
  newBalance: number;
  note?: string;
  markedReflected: boolean;
}

@Component({
  selector: 'app-update-balance-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatDialogModule,
    MatFormFieldModule,
    MatInput,
    MatCheckboxModule,
    MatButtonModule,
    MatIconModule,
    FormRoot,
    FormField,
    FieldErrors,
    MoneyPipe,
  ],
  template: `
    <h2 mat-dialog-title>Update balance: {{ data.asset.name }}</h2>
    <form [formRoot]="updateForm">
      <mat-dialog-content class="form-grid">
        <div class="current-balance-info">
          <span class="label">Current recorded balance:</span>
          <span class="value">{{ data.asset.balance | money:data.asset.currency }}</span>
        </div>

        <mat-form-field appearance="outline">
          <mat-label>New balance</mat-label>
          <input matInput type="number" step="any" [formField]="updateForm.newBalance" />
          <span matTextSuffix>{{ data.asset.currency }}</span>
        </mat-form-field>
        <app-field-errors [field]="updateForm.newBalance" />

        <mat-form-field appearance="outline">
          <mat-label>Note (optional)</mat-label>
          <input
            matInput
            [formField]="updateForm.note"
            placeholder="e.g. Monthly statement check"
          />
        </mat-form-field>

        @if (hasPending()) {
          <div class="pending-accounting-notice">
            <mat-checkbox [formField]="updateForm.markPendingReflected" color="primary">
              <span class="checkbox-label">
                Also mark {{ pendingCount() }} pending actual income/expense record{{ pendingCount() === 1 ? '' : 's' }}
                ({{ pendingNet() | money }}) as reflected in this new balance so they aren't counted twice.
              </span>
            </mat-checkbox>
          </div>
        }
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancel</button>
        <button mat-flat-button type="submit" [disabled]="updateForm().submitting()">
          Save balance
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .form-grid {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: min(440px, 85vw);
      padding-top: 8px;
    }

    .current-balance-info {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 14px;
      border-radius: 8px;
      background: var(--mat-sys-surface-container);
      margin-bottom: 6px;

      .label {
        font-size: 0.875rem;
        color: var(--mat-sys-on-surface-variant);
      }

      .value {
        font-size: 1rem;
        font-weight: 600;
        color: var(--mat-sys-on-surface);
      }
    }

    .pending-accounting-notice {
      padding: 10px 12px;
      border-radius: 8px;
      background: var(--mat-sys-surface-container);
      border: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));

      .checkbox-label {
        font-size: 0.8125rem;
        line-height: 1.4;
        color: var(--mat-sys-on-surface);
        white-space: normal;
        display: inline-block;
      }
    }
  `,
})
export class UpdateBalanceDialog {
  protected readonly data = inject<{ asset: Asset }>(MAT_DIALOG_DATA);
  protected readonly store = inject(WorthItStore);
  private readonly dialogRef = inject(
    MatDialogRef<UpdateBalanceDialog, UpdateBalanceDialogResult>
  );

  protected readonly pendingCount = computed(() => {
    return (
      this.store.pendingIncomeRecords().length +
      this.store.pendingExpenseRecords().length
    );
  });

  protected readonly hasPending = computed(() => this.pendingCount() > 0);

  protected readonly pendingNet = computed(() => {
    return this.store.wealthSummary().pendingAdjustments;
  });

  private readonly model = signal<UpdateBalanceFormValue>({
    newBalance: this.data.asset.balance,
    note: '',
    markPendingReflected: true,
  });

  protected readonly updateForm = form(
    this.model,
    (path) => {
      required(path.newBalance, { message: 'New balance is required' });
      min(path.newBalance, 0, { message: 'Balance cannot be negative' });
    },
    {
      submission: {
        action: async () => {
          const val = this.model();
          const cleanNote = val.note.trim() || undefined;
          const newBal = Number(val.newBalance);

          await this.store.updateAssetBalance(this.data.asset.id, newBal, cleanNote);

          const marked = val.markPendingReflected && this.hasPending();
          if (marked) {
            await this.store.markRecordsReflected();
          }

          this.dialogRef.close({
            newBalance: newBal,
            note: cleanNote,
            markedReflected: marked,
          });
          return undefined;
        },
      },
    }
  );
}
