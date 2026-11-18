import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  form,
  FormField,
  FormRoot,
  min,
  required,
  validate,
} from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { RetirementTransfer } from '../../../core/models/retirement.model';
import { Asset } from '../../../core/models/worth-it.model';
import { WorthItStore } from '../../../core/stores/worth-it.store';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';

export interface RetirementTransferDialogData {
  toAsset?: Asset;
  fromAsset?: Asset;
}

export interface RetirementTransferFormValue {
  fromAssetId: string;
  toAssetId: string;
  amount: number;
  date: string;
  note: string;
}

@Component({
  selector: 'app-retirement-transfer-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    MatDialogModule,
    MatCardModule,
    MatChipsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    FormRoot,
    FormField,
    MoneyPipe,
  ],
  template: `
    <h2 mat-dialog-title>Transfer Savings to IKE / IKZE</h2>

    <form [formRoot]="transferForm">
      <mat-dialog-content class="transfer-content">
        <mat-card appearance="outlined" class="guidance-card">
          <mat-card-content class="guidance-body">
            <mat-icon class="guidance-icon" aria-hidden="true">swap_horiz</mat-icon>
            <p class="guidance-copy">
              Automatically deducts the amount from your chosen cash or bank account and adds it to
              your IKE/IKZE balance, logging balance history on both accounts and updating your
              annual contribution limit progress.
            </p>
          </mat-card-content>
        </mat-card>

        <mat-form-field appearance="outline">
          <mat-label>From cash / bank account</mat-label>
          <mat-select [formField]="transferForm.fromAssetId">
            @for (src of sourceAssets(); track src.id) {
              <mat-option [value]="src.id">
                {{ src.name }} ({{ src.balance | money:src.currency }})
              </mat-option>
            }
          </mat-select>
          @for (error of transferForm.fromAssetId().errors(); track $index) {
            <mat-error>{{ error.message }}</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>To IKE / IKZE account</mat-label>
          <mat-select [formField]="transferForm.toAssetId">
            @for (dest of retirementAssets(); track dest.id) {
              <mat-option [value]="dest.id">
                {{ dest.name }} ({{ dest.balance | money:dest.currency }})
              </mat-option>
            }
          </mat-select>
          @for (error of transferForm.toAssetId().errors(); track $index) {
            <mat-error>{{ error.message }}</mat-error>
          }
        </mat-form-field>

        <div class="fields-row">
          <mat-form-field appearance="outline">
            <mat-label>Transfer amount</mat-label>
            <input
              matInput
              type="number"
              step="0.01"
              class="mono-nums"
              [formField]="transferForm.amount"
            />
            <span matTextSuffix>{{ selectedToAsset()?.currency || 'PLN' }}</span>
            @for (error of transferForm.amount().errors(); track $index) {
              <mat-error>{{ error.message }}</mat-error>
            }
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Transfer date</mat-label>
            <input
              matInput
              type="date"
              class="mono-nums"
              [formField]="transferForm.date"
            />
            @for (error of transferForm.date().errors(); track $index) {
              <mat-error>{{ error.message }}</mat-error>
            }
          </mat-form-field>
        </div>

        @if (maxTransferableForLimit() > 0) {
          <div class="quick-fill-row">
            <button
              mat-stroked-button
              type="button"
              class="quick-fill-btn"
              (click)="fillRemainingLimit()"
            >
              <mat-icon>bolt</mat-icon>
              <span>
                Fill remaining {{ targetSnapshot()?.year }} limit ({{
                  maxTransferableForLimit() | money:(selectedToAsset()?.currency || 'PLN')
                }})
              </span>
            </button>
          </div>
        }

        <mat-form-field appearance="outline">
          <mat-label>Note (optional)</mat-label>
          <input
            matInput
            [formField]="transferForm.note"
            placeholder="e.g. 2026 IKE contribution"
          />
        </mat-form-field>

        <!-- Live Balance & Annual Limit Preview -->
        @if (selectedFromAsset() && selectedToAsset()) {
          <mat-card
            appearance="outlined"
            class="preview-card"
            role="status"
            aria-live="polite"
          >
            <mat-card-content class="preview-body">
              <div class="preview-line">
                <span>{{ selectedFromAsset()!.name }}:</span>
                <span class="mono-nums">
                  {{ selectedFromAsset()!.balance | money:selectedFromAsset()!.currency }}
                  &rarr;
                  <strong>{{
                    previewFromBalanceAfter() | money:selectedFromAsset()!.currency
                  }}</strong>
                </span>
              </div>
              <div class="preview-line">
                <span>{{ selectedToAsset()!.name }}:</span>
                <span class="mono-nums">
                  {{ selectedToAsset()!.balance | money:selectedToAsset()!.currency }}
                  &rarr;
                  <strong class="positive-value">{{
                    previewToBalanceAfter() | money:selectedToAsset()!.currency
                  }}</strong>
                </span>
              </div>

              @if ((targetSnapshot()?.annualLimit ?? 0) > 0) {
                <div class="limit-preview-section">
                  <div class="limit-preview-header">
                    <span>{{ targetSnapshot()!.year }} Annual Limit Progress:</span>
                    <strong class="mono-nums">
                      {{ previewContributedYtd() | money:selectedToAsset()!.currency }} /
                      {{ targetSnapshot()!.annualLimit | money:selectedToAsset()!.currency }}
                      ({{ previewLimitPercent() | number:'1.0-1' }}%)
                    </strong>
                  </div>
                  <mat-progress-bar
                    mode="determinate"
                    [value]="previewLimitPercent()"
                    [color]="exceedsAnnualLimit() ? 'warn' : 'primary'"
                  ></mat-progress-bar>
                  @if (exceedsAnnualLimit()) {
                    <div class="limit-warning">
                      <mat-icon>warning</mat-icon>
                      <span>
                        Exceeds the {{ targetSnapshot()!.year }} annual contribution limit by
                        <strong>{{
                          (previewContributedYtd() - targetSnapshot()!.annualLimit)
                            | money:selectedToAsset()!.currency
                        }}</strong>.
                      </span>
                    </div>
                  }
                </div>
              }
            </mat-card-content>
          </mat-card>
        }
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-stroked-button type="button" mat-dialog-close>Cancel</button>
        <button
          mat-flat-button
          color="primary"
          type="submit"
          [disabled]="!transferForm().valid() || transferForm().submitting()"
        >
          Record Transfer
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .transfer-content {
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-width: min(480px, 88vw);
      padding-top: 8px;
    }

    .guidance-card {
      background: var(--mat-sys-surface-container);
    }

    .guidance-body {
      display: flex;
      align-items: flex-start;
      gap: 10px;
    }

    .guidance-icon {
      color: var(--mat-sys-primary);
      flex-shrink: 0;
      margin-top: 2px;
    }

    .guidance-copy {
      margin: 0;
      font-size: 0.8125rem;
      line-height: 1.45;
      color: var(--mat-sys-on-surface-variant);
    }

    .fields-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;

      @media (max-width: 520px) {
        grid-template-columns: 1fr;
      }
    }

    .quick-fill-row {
      display: flex;
      margin-top: -4px;
    }

    .quick-fill-btn {
      font-size: 0.8125rem;
    }

    .preview-card {
      background: var(--mat-sys-surface-container-low);
      border-color: var(--mat-sys-outline-variant);
    }

    .preview-body {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .preview-line {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 8px;
      font-size: 0.875rem;
      color: var(--mat-sys-on-surface);
    }

    .positive-value {
      color: var(--worth-it-positive, #1b6b3a);
    }

    .limit-preview-section {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding-top: 6px;
      border-top: 1px dashed var(--mat-sys-outline-variant);
    }

    .limit-preview-header {
      display: flex;
      justify-content: space-between;
      font-size: 0.8125rem;
      color: var(--mat-sys-on-surface-variant);
    }

    .limit-warning {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.75rem;
      color: var(--mat-sys-error);

      mat-icon {
        font-size: 1rem;
        width: 1rem;
        height: 1rem;
      }
    }

    .mono-nums {
      font-family: 'Roboto Mono', monospace;
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class RetirementTransferDialog {
  protected readonly data =
    inject<RetirementTransferDialogData>(MAT_DIALOG_DATA, { optional: true }) ??
    {};
  protected readonly store = inject(WorthItStore);
  private readonly dialogRef = inject(
    MatDialogRef<RetirementTransferDialog, RetirementTransfer>
  );

  protected readonly sourceAssets = this.store.savingsSourceAssets;
  protected readonly retirementAssets = this.store.retirementAssets;

  protected readonly model = signal<RetirementTransferFormValue>({
    fromAssetId:
      this.data.fromAsset?.id ?? this.store.savingsSourceAssets()[0]?.id ?? '',
    toAssetId:
      this.data.toAsset?.id ?? this.store.retirementAssets()[0]?.id ?? '',
    amount: 1000,
    date: this.store.today(),
    note: '',
  });

  protected readonly selectedFromAsset = computed<Asset | undefined>(() =>
    this.sourceAssets().find((a) => a.id === this.model().fromAssetId)
  );

  protected readonly selectedToAsset = computed<Asset | undefined>(() =>
    this.retirementAssets().find((a) => a.id === this.model().toAssetId)
  );

  protected readonly targetSnapshot = computed(() => {
    const toId = this.model().toAssetId;
    return toId ? this.store.retirementSnapshots().get(toId) : undefined;
  });

  protected readonly maxTransferableForLimit = computed(() => {
    const rem = this.targetSnapshot()?.remainingLimit ?? 0;
    const fromBal = this.selectedFromAsset()?.balance ?? 0;
    if (rem <= 0 || fromBal <= 0) return 0;
    return Math.min(rem, fromBal);
  });

  protected readonly previewFromBalanceAfter = computed(() => {
    const from = this.selectedFromAsset();
    if (!from) return 0;
    const amt = Math.max(0, Number(this.model().amount) || 0);
    return Math.max(0, Math.round((from.balance - amt) * 100) / 100);
  });

  protected readonly previewToBalanceAfter = computed(() => {
    const to = this.selectedToAsset();
    if (!to) return 0;
    const amt = Math.max(0, Number(this.model().amount) || 0);
    return Math.round((to.balance + amt) * 100) / 100;
  });

  protected readonly previewContributedYtd = computed(() => {
    const snap = this.targetSnapshot();
    const amt = Math.max(0, Number(this.model().amount) || 0);
    return Math.round(((snap?.contributedYtd ?? 0) + amt) * 100) / 100;
  });

  protected readonly previewLimitPercent = computed(() => {
    const limit = this.targetSnapshot()?.annualLimit ?? 0;
    if (limit <= 0) return 0;
    return Math.min(
      100,
      Math.round(((this.previewContributedYtd() / limit) * 100) * 10) / 10
    );
  });

  protected readonly exceedsAnnualLimit = computed(() => {
    const limit = this.targetSnapshot()?.annualLimit ?? 0;
    return limit > 0 && this.previewContributedYtd() > limit;
  });

  protected readonly transferForm = form(
    this.model,
    (path) => {
      required(path.fromAssetId, {
        message: 'Source cash/bank account is required',
      });
      required(path.toAssetId, {
        message: 'Destination IKE/IKZE account is required',
      });
      required(path.amount, { message: 'Transfer amount is required' });
      min(path.amount, 0.01, {
        message: 'Transfer amount must be greater than 0',
      });
      required(path.date, { message: 'Transfer date is required' });

      validate(path.amount, (ctx) => {
        const amt = Number(ctx.value()) || 0;
        const fromId = ctx.valueOf(path.fromAssetId);
        const from = this.sourceAssets().find((a) => a.id === fromId);
        if (from && amt > from.balance) {
          return {
            kind: 'insufficient_balance',
            message: `Amount exceeds ${from.name} balance (${from.balance.toFixed(2)} ${from.currency})`,
          };
        }
        return null;
      });
    },
    {
      submission: {
        action: async () => {
          const val = this.model();
          const created = await this.store.transferToRetirement({
            fromAssetId: val.fromAssetId,
            toAssetId: val.toAssetId,
            amount: Number(val.amount),
            date: val.date.trim() || this.store.today(),
            note: val.note.trim() || undefined,
          });
          this.dialogRef.close(created);
          return undefined;
        },
      },
    }
  );

  protected fillRemainingLimit(): void {
    const fillAmount = this.maxTransferableForLimit();
    if (fillAmount > 0) {
      this.model.update((m) => ({ ...m, amount: fillAmount }));
    }
  }
}
