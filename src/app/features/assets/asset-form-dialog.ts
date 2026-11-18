import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { form, FormField, FormRoot, min, required } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { RecurringSavingsDetails } from '../../core/models/recurring-savings.model';
import {
  RETIREMENT_ACCOUNT_KIND_OPTIONS,
  RETIREMENT_LIMIT_PRESETS_2026,
  RetirementAccountKind,
  RetirementDetails,
} from '../../core/models/retirement.model';
import { Asset, AssetType } from '../../core/models/worth-it.model';
import { EmployerStockFormDialog } from './employer-stock/employer-stock-form-dialog';

function todayIsoString(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export interface AssetFormValue {
  name: string;
  type: AssetType;
  balance: number;
  currency: string;
  exchangeRateToBase: number;
  baselineDate: string;
  monthlyContribution: number;
  isContributing: boolean;
  retirementKind: RetirementAccountKind;
  annualLimit: number;
  ytdContributionsBaseline: number;
  isGoalEligible: boolean;
  historyNote: string;
}

export interface AssetDialogResult {
  name: string;
  type: AssetType;
  balance: number;
  currency: string;
  exchangeRateToBase: number;
  recurringSavings?: RecurringSavingsDetails;
  retirement?: RetirementDetails;
  isGoalEligible: boolean;
  historyNote?: string;
}

export const ASSET_TYPE_OPTIONS: Array<{ value: AssetType; label: string }> = [
  { value: 'bank_account', label: 'Bank account' },
  { value: 'cash', label: 'Cash' },
  { value: 'stocks_etf', label: 'Stocks / ETF' },
  { value: 'employer_stock', label: 'Employer stock' },
  { value: 'recurring_savings', label: 'Recurring savings (PPK / PPO)' },
  { value: 'retirement', label: 'Retirement (IKE / IKZE)' },
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
  ],
  template: `
    <h2 mat-dialog-title>{{ data.asset ? 'Edit asset' : 'New asset' }}</h2>
    <form [formRoot]="assetForm">
      <mat-dialog-content class="form-grid">
        <mat-form-field appearance="outline">
          <mat-label>Asset name</mat-label>
          <input
            matInput
            [formField]="assetForm.name"
            [placeholder]="
              assetForm.type().value() === 'recurring_savings'
                ? 'e.g. PPK — Nationale-Nederlanden or Employer PPO'
                : 'e.g. Main checking account'
            "
          />
          @for (error of assetForm.name().errors(); track $index) {
            <mat-error>{{ error.message }}</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Asset type</mat-label>
          <mat-select
            [formField]="assetForm.type"
            (selectionChange)="onTypeSelected($event.value)"
          >
            @for (option of typeOptions; track option.value) {
              <mat-option [value]="option.value">{{ option.label }}</mat-option>
            }
          </mat-select>
          @for (error of assetForm.type().errors(); track $index) {
            <mat-error>{{ error.message }}</mat-error>
          }
        </mat-form-field>

        <div class="row-two-col">
          <div class="col">
            <mat-form-field appearance="outline" class="w-full">
              <mat-label>
                {{
                  assetForm.type().value() === 'recurring_savings'
                    ? 'Baseline balance'
                    : 'Balance'
                }}
              </mat-label>
              <input matInput type="number" step="any" [formField]="assetForm.balance" />
              <span matTextSuffix>{{ assetForm.currency().value() }}</span>
              @for (error of assetForm.balance().errors(); track $index) {
                <mat-error>{{ error.message }}</mat-error>
              }
            </mat-form-field>
          </div>

          <div class="col">
            <mat-form-field appearance="outline" class="w-full">
              <mat-label>Currency</mat-label>
              <mat-select [formField]="assetForm.currency">
                @for (curr of currencyOptions; track curr) {
                  <mat-option [value]="curr">{{ curr }}</mat-option>
                }
              </mat-select>
              @for (error of assetForm.currency().errors(); track $index) {
                <mat-error>{{ error.message }}</mat-error>
              }
            </mat-form-field>
          </div>
        </div>

        @if (assetForm.type().value() === 'recurring_savings') {
          <div class="row-two-col">
            <div class="col">
              <mat-form-field appearance="outline" class="w-full">
                <mat-label>Monthly contribution</mat-label>
                <input
                  matInput
                  type="number"
                  step="any"
                  [formField]="assetForm.monthlyContribution"
                  placeholder="e.g. 850"
                />
                <span matTextSuffix>{{ assetForm.currency().value() }}/mo</span>
                <mat-hint>Combined employee + employer monthly increase</mat-hint>
                @for (error of assetForm.monthlyContribution().errors(); track $index) {
                  <mat-error>{{ error.message }}</mat-error>
                }
              </mat-form-field>
            </div>

            <div class="col">
              <mat-form-field appearance="outline" class="w-full">
                <mat-label>Baseline date</mat-label>
                <input
                  matInput
                  type="date"
                  [formField]="assetForm.baselineDate"
                />
                <mat-hint>Date of verified baseline</mat-hint>
                @for (error of assetForm.baselineDate().errors(); track $index) {
                  <mat-error>{{ error.message }}</mat-error>
                }
              </mat-form-field>
            </div>
          </div>

          <div class="toggle-container">
            <mat-slide-toggle [formField]="assetForm.isContributing">
              Active monthly contributions
            </mat-slide-toggle>
            <span class="toggle-hint">
              Auto-accrues each month after the baseline date and adds to future projections
            </span>
          </div>
        }

        @if (assetForm.type().value() === 'retirement') {
          <mat-form-field appearance="outline">
            <mat-label>Retirement account type (2026 limit preset)</mat-label>
            <mat-select
              [formField]="assetForm.retirementKind"
              (selectionChange)="onRetirementKindSelected($event.value)"
            >
              @for (opt of retirementKindOptions; track opt.value) {
                <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <div class="row-two-col">
            <div class="col">
              <mat-form-field appearance="outline" class="w-full">
                <mat-label>Annual contribution limit</mat-label>
                <input
                  matInput
                  type="number"
                  step="any"
                  [formField]="assetForm.annualLimit"
                />
                <span matTextSuffix>{{ assetForm.currency().value() }}/yr</span>
                <mat-hint>2026: IKE 28,260 · IKZE 11,304 / 16,956</mat-hint>
                @for (error of assetForm.annualLimit().errors(); track $index) {
                  <mat-error>{{ error.message }}</mat-error>
                }
              </mat-form-field>
            </div>

            <div class="col">
              <mat-form-field appearance="outline" class="w-full">
                <mat-label>Already contributed YTD</mat-label>
                <input
                  matInput
                  type="number"
                  step="any"
                  [formField]="assetForm.ytdContributionsBaseline"
                />
                <span matTextSuffix>{{ assetForm.currency().value() }}</span>
                <mat-hint>Prior {{ currentYear }} contributions</mat-hint>
                @for (error of assetForm.ytdContributionsBaseline().errors(); track $index) {
                  <mat-error>{{ error.message }}</mat-error>
                }
              </mat-form-field>
            </div>
          </div>
        }

        @if (assetForm.currency().value() !== 'PLN') {
          <mat-form-field appearance="outline">
            <mat-label>Exchange rate to PLN</mat-label>
            <input matInput type="number" step="0.0001" [formField]="assetForm.exchangeRateToBase" />
            <mat-hint>1 {{ assetForm.currency().value() }} = X PLN (manual rate)</mat-hint>
            @for (error of assetForm.exchangeRateToBase().errors(); track $index) {
              <mat-error>{{ error.message }}</mat-error>
            }
          </mat-form-field>
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
      width: 100%;
      max-width: 100%;
      box-sizing: border-box;
      padding-top: 8px;
    }

    .row-two-col {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 6px 12px;

      @media (min-width: 480px) {
        grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
      }
    }

    .col {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .w-full,
    mat-form-field {
      width: 100%;
      min-width: 0;
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
  protected readonly data =
    inject<{ asset?: Asset; initialType?: AssetType }>(MAT_DIALOG_DATA, {
      optional: true,
    }) ?? {};
  private readonly dialogRef = inject(MatDialogRef<AssetFormDialog, AssetDialogResult>);
  private readonly dialog = inject(MatDialog, { optional: true });

  protected readonly typeOptions = ASSET_TYPE_OPTIONS;
  protected readonly currencyOptions = CURRENCY_OPTIONS;
  protected readonly retirementKindOptions = RETIREMENT_ACCOUNT_KIND_OPTIONS;
  protected readonly currentYear = new Date().getFullYear();

  private readonly model = signal<AssetFormValue>({
    name: this.data.asset?.name ?? '',
    type: this.data.asset?.type ?? this.data.initialType ?? 'bank_account',
    balance:
      this.data.asset?.type === 'recurring_savings'
        ? (this.data.asset.recurringSavings?.baselineAmount ??
            this.data.asset.balance ??
            0)
        : (this.data.asset?.balance ?? 0),
    currency: this.data.asset?.currency ?? 'PLN',
    exchangeRateToBase: this.data.asset?.exchangeRateToBase ?? 1,
    baselineDate:
      this.data.asset?.recurringSavings?.baselineDate ?? todayIsoString(),
    monthlyContribution:
      this.data.asset?.recurringSavings?.monthlyContribution ?? 0,
    isContributing: this.data.asset?.recurringSavings?.isContributing ?? true,
    retirementKind: this.data.asset?.retirement?.accountKind ?? 'ike',
    annualLimit:
      this.data.asset?.retirement?.annualLimit ??
      RETIREMENT_LIMIT_PRESETS_2026.ike,
    ytdContributionsBaseline:
      this.data.asset?.retirement?.ytdContributionsBaseline ?? 0,
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
      min(path.exchangeRateToBase, 0.0001, {
        message: 'Exchange rate must be at least 0.0001',
      });
      min(path.monthlyContribution, 0, {
        message: 'Monthly contribution cannot be negative',
      });
      min(path.annualLimit, 0, {
        message: 'Annual limit cannot be negative',
      });
      min(path.ytdContributionsBaseline, 0, {
        message: 'YTD baseline cannot be negative',
      });
      required(path.baselineDate, { message: 'Baseline date is required' });
    },
    {
      submission: {
        action: async () => {
          const val = this.model();
          if (val.type === 'employer_stock') {
            this.delegateToEmployerStockDialog();
            return undefined;
          }

          const isRecurring = val.type === 'recurring_savings';
          const recurringSavings: RecurringSavingsDetails | undefined = isRecurring
            ? {
                baselineAmount: Math.max(0, Number(val.balance) || 0),
                baselineDate: val.baselineDate.trim() || todayIsoString(),
                monthlyContribution: Math.max(
                  0,
                  Number(val.monthlyContribution) || 0
                ),
                isContributing: Boolean(val.isContributing),
              }
            : undefined;

          const isRetirement = val.type === 'retirement';
          const retirement: RetirementDetails | undefined = isRetirement
            ? {
                accountKind: val.retirementKind,
                annualLimit: Math.max(0, Number(val.annualLimit) || 0),
                ytdContributionsBaseline: Math.max(
                  0,
                  Number(val.ytdContributionsBaseline) || 0
                ),
                ytdBaselineYear:
                  this.data.asset?.retirement?.ytdBaselineYear ??
                  this.currentYear,
              }
            : undefined;

          this.dialogRef.close({
            name: val.name.trim(),
            type: val.type,
            balance: Number(val.balance),
            currency: val.currency,
            exchangeRateToBase:
              val.currency === 'PLN' ? 1 : Number(val.exchangeRateToBase) || 1,
            recurringSavings,
            retirement,
            isGoalEligible: Boolean(val.isGoalEligible),
            historyNote: val.historyNote.trim() || undefined,
          });
          return undefined;
        },
      },
    }
  );

  protected onTypeSelected(type: AssetType): void {
    if (type === 'employer_stock') {
      this.delegateToEmployerStockDialog();
      return;
    }
    if (type === 'retirement' && !this.data.asset) {
      this.model.update((m) => ({
        ...m,
        isGoalEligible: false,
      }));
    }
  }

  protected onRetirementKindSelected(kind: RetirementAccountKind): void {
    if (kind !== 'custom') {
      this.model.update((m) => ({
        ...m,
        retirementKind: kind,
        annualLimit: RETIREMENT_LIMIT_PRESETS_2026[kind],
      }));
    }
  }

  protected delegateToEmployerStockDialog(): void {
    const val = this.model();
    this.dialogRef.close();
    this.dialog?.open(EmployerStockFormDialog, {
      data: {
        asset: this.data.asset,
        initialName: val.name.trim(),
        initialCurrency: val.currency === 'PLN' ? 'USD' : val.currency,
        initialIsGoalEligible: val.isGoalEligible,
      },
      width: '520px',
    });
  }
}
