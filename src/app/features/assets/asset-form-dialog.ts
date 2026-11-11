import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { form, FormField, FormRoot, min, required } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { Asset, AssetType } from '../../core/models/worth-it.model';
import { FieldErrors } from '../../shared/components/field-errors/field-errors';

export interface AssetFormValue {
  name: string;
  type: AssetType;
  balance: number;
  currency: string;
  exchangeRateToBase: number;
  isGoalEligible: boolean;
  historyNote: string;
}

export interface AssetDialogResult {
  name: string;
  type: AssetType;
  balance: number;
  currency: string;
  exchangeRateToBase: number;
  isGoalEligible: boolean;
  historyNote?: string;
}

export const ASSET_TYPE_OPTIONS: Array<{ value: AssetType; label: string }> = [
  { value: 'bank_account', label: 'Bank account' },
  { value: 'cash', label: 'Cash' },
  { value: 'stocks_etf', label: 'Stocks / ETF' },
  { value: 'employer_stock', label: 'Employer stock' },
  { value: 'retirement', label: 'Retirement (IKE/IKZE/PPK)' },
  { value: 'other', label: 'Other' },
];

export const CURRENCY_OPTIONS = ['PLN', 'EUR', 'USD', 'GBP', 'CHF'] as const;

@Component({
  selector: 'app-asset-form-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatDialogModule,
    MatFormFieldModule,
    MatInput,
    MatSelectModule,
    MatSlideToggleModule,
    MatButtonModule,
    FormRoot,
    FormField,
    FieldErrors,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.asset ? 'Edit asset' : 'New asset' }}</h2>
    <form [formRoot]="assetForm">
      <mat-dialog-content class="form-grid">
        <mat-form-field appearance="outline">
          <mat-label>Asset name</mat-label>
          <input matInput [formField]="assetForm.name" placeholder="e.g. Main checking account" />
        </mat-form-field>
        <app-field-errors [field]="assetForm.name" />

        <mat-form-field appearance="outline">
          <mat-label>Asset type</mat-label>
          <mat-select [formField]="assetForm.type">
            @for (option of typeOptions; track option.value) {
              <mat-option [value]="option.value">{{ option.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <app-field-errors [field]="assetForm.type" />

        <div class="row-two-col">
          <div class="col">
            <mat-form-field appearance="outline" class="w-full">
              <mat-label>Balance</mat-label>
              <input matInput type="number" step="any" [formField]="assetForm.balance" />
              <span matTextSuffix>{{ assetForm.currency().value() }}</span>
            </mat-form-field>
            <app-field-errors [field]="assetForm.balance" />
          </div>

          <div class="col">
            <mat-form-field appearance="outline" class="w-full">
              <mat-label>Currency</mat-label>
              <mat-select [formField]="assetForm.currency">
                @for (curr of currencyOptions; track curr) {
                  <mat-option [value]="curr">{{ curr }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <app-field-errors [field]="assetForm.currency" />
          </div>
        </div>

        @if (assetForm.currency().value() !== 'PLN') {
          <mat-form-field appearance="outline">
            <mat-label>Exchange rate to PLN</mat-label>
            <input matInput type="number" step="0.0001" [formField]="assetForm.exchangeRateToBase" />
            <mat-hint>1 {{ assetForm.currency().value() }} = X PLN (manual rate)</mat-hint>
          </mat-form-field>
          <app-field-errors [field]="assetForm.exchangeRateToBase" />
        }

        <div class="toggle-container">
          <mat-slide-toggle [formField]="assetForm.isGoalEligible">
            Count towards financial goals
          </mat-slide-toggle>
          <span class="toggle-hint">Simple include/exclude toggle — no percentages needed</span>
        </div>

        <mat-form-field appearance="outline">
          <mat-label>Note (optional)</mat-label>
          <input
            matInput
            [formField]="assetForm.historyNote"
            placeholder="e.g. Initial balance or update note"
          />
        </mat-form-field>
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancel</button>
        <button mat-flat-button type="submit" [disabled]="assetForm().submitting()">Save</button>
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

    .row-two-col {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 12px;
    }

    .col {
      display: flex;
      flex-direction: column;
    }

    .w-full {
      width: 100%;
    }

    .toggle-container {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 8px 4px 12px;
    }

    .toggle-hint {
      font-size: 0.75rem;
      color: var(--mat-sys-on-surface-variant);
      margin-left: 2px;
    }
  `,
})
export class AssetFormDialog {
  protected readonly data = inject<{ asset?: Asset }>(MAT_DIALOG_DATA, { optional: true }) ?? {};
  private readonly dialogRef = inject(MatDialogRef<AssetFormDialog, AssetDialogResult>);

  protected readonly typeOptions = ASSET_TYPE_OPTIONS;
  protected readonly currencyOptions = CURRENCY_OPTIONS;

  private readonly model = signal<AssetFormValue>({
    name: this.data.asset?.name ?? '',
    type: this.data.asset?.type ?? 'bank_account',
    balance: this.data.asset?.balance ?? 0,
    currency: this.data.asset?.currency ?? 'PLN',
    exchangeRateToBase: this.data.asset?.exchangeRateToBase ?? 1,
    isGoalEligible: this.data.asset?.isGoalEligible ?? true,
    historyNote: '',
  });

  protected readonly assetForm = form(
    this.model,
    (path) => {
      required(path.name, { message: 'Asset name is required' });
      required(path.type, { message: 'Asset type is required' });
      required(path.balance, { message: 'Balance is required' });
      min(path.balance, 0, { message: 'Balance cannot be negative' });
      required(path.currency, { message: 'Currency is required' });
      min(path.exchangeRateToBase, 0.0001, { message: 'Exchange rate must be at least 0.0001' });
    },
    {
      submission: {
        action: async () => {
          const val = this.model();
          this.dialogRef.close({
            name: val.name.trim(),
            type: val.type,
            balance: Number(val.balance),
            currency: val.currency,
            exchangeRateToBase:
              val.currency === 'PLN' ? 1 : Number(val.exchangeRateToBase) || 1,
            isGoalEligible: Boolean(val.isGoalEligible),
            historyNote: val.historyNote.trim() || undefined,
          });
          return undefined;
        },
      },
    }
  );
}
