import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { form, FormField, FormRoot, min, required } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { StockSale } from '../../core/models/worth-it.model';
import { FieldErrors } from '../../shared/components/field-errors/field-errors';
import { MoneyPipe } from '../../shared/pipes/money.pipe';

export interface StockSaleDialogData {
  sale?: StockSale;
}

export interface StockSaleFormModel {
  companyOrTicker: string;
  saleDate: string;
  sharesSold: number;
  pricePerShare: number;
  currency: 'USD' | 'EUR' | 'PLN' | 'GBP' | 'CHF';
  exchangeRateToPln: number | null;
  plnEquivalent: number | null;
  notes: string;
}

export interface StockSaleDialogResult {
  companyOrTicker: string;
  saleDate: string;
  sharesSold: number;
  pricePerShare: number;
  currency: string;
  grossValue: number;
  plnEquivalent?: number;
  notes?: string;
}

@Component({
  selector: 'app-stock-sale-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSelectModule,
    MatIconModule,
    FormRoot,
    FormField,
    FieldErrors,
    MoneyPipe,
  ],
  template: `
    <h2 mat-dialog-title>
      {{ data.sale ? 'Edit Stock Sale' : 'Record Stock Sale' }}
    </h2>

    <form [formRoot]="saleForm">
      <mat-dialog-content class="dialog-content">
        <div class="form-grid">
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Company or Ticker</mat-label>
            <input
              matInput
              [formField]="saleForm.companyOrTicker"
              placeholder="e.g. AAPL / Apple Inc."
            />
          </mat-form-field>
          <app-field-errors [field]="saleForm.companyOrTicker" />

          <div class="two-col">
            <div>
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Sale Date</mat-label>
                <input matInput type="date" [formField]="saleForm.saleDate" />
              </mat-form-field>
              <app-field-errors [field]="saleForm.saleDate" />
            </div>

            <div>
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Currency</mat-label>
                <mat-select [formField]="saleForm.currency">
                  <mat-option value="USD">USD ($)</mat-option>
                  <mat-option value="EUR">EUR (€)</mat-option>
                  <mat-option value="PLN">PLN (zł)</mat-option>
                  <mat-option value="GBP">GBP (£)</mat-option>
                  <mat-option value="CHF">CHF</mat-option>
                </mat-select>
              </mat-form-field>
              <app-field-errors [field]="saleForm.currency" />
            </div>
          </div>

          <div class="two-col">
            <div>
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Shares Sold</mat-label>
                <input
                  matInput
                  type="number"
                  step="any"
                  [formField]="saleForm.sharesSold"
                  placeholder="0.00"
                />
              </mat-form-field>
              <app-field-errors [field]="saleForm.sharesSold" />
            </div>

            <div>
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Price per Share</mat-label>
                <input
                  matInput
                  type="number"
                  step="0.01"
                  [formField]="saleForm.pricePerShare"
                  placeholder="0.00"
                />
                <span matTextSuffix>{{ model().currency }}</span>
              </mat-form-field>
              <app-field-errors [field]="saleForm.pricePerShare" />
            </div>
          </div>

          <!-- Live Computed Gross Value Preview -->
          <div class="preview-card">
            <div class="preview-row">
              <span class="preview-label">Calculated Gross Value:</span>
              <strong class="preview-value">
                {{ calculatedGrossValue() | money:model().currency:2 }}
              </strong>
            </div>

            @if (model().currency !== 'PLN') {
              <div class="preview-row pln-preview">
                <span class="preview-label">PLN Equivalent:</span>
                <span class="preview-subvalue">
                  {{ livePlnDisplay() !== null ? (livePlnDisplay() | money:'PLN':2) : 'Not specified' }}
                </span>
              </div>
            }
          </div>

          @if (model().currency !== 'PLN') {
            <div class="two-col">
              <div>
                <mat-form-field appearance="outline" class="full-width">
                  <mat-label>Exchange Rate to PLN</mat-label>
                  <input
                    matInput
                    type="number"
                    step="0.0001"
                    [formField]="saleForm.exchangeRateToPln"
                    placeholder="e.g. 4.05"
                  />
                  <mat-hint>1 {{ model().currency }} = X PLN</mat-hint>
                </mat-form-field>
                <app-field-errors [field]="saleForm.exchangeRateToPln" />
              </div>

              <div>
                <mat-form-field appearance="outline" class="full-width">
                  <mat-label>Direct PLN Equivalent</mat-label>
                  <input
                    matInput
                    type="number"
                    step="0.01"
                    [formField]="saleForm.plnEquivalent"
                    placeholder="e.g. 15000"
                  />
                  <span matTextSuffix>PLN</span>
                  <mat-hint>Override or direct bank payout</mat-hint>
                </mat-form-field>
                <app-field-errors [field]="saleForm.plnEquivalent" />
              </div>
            </div>
          }

          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Notes (optional)</mat-label>
            <textarea
              matInput
              rows="2"
              [formField]="saleForm.notes"
              placeholder="e.g. Q1 RSU tranche, brokerage fees paid separately"
            ></textarea>
          </mat-form-field>
          <app-field-errors [field]="saleForm.notes" />

          <div class="dialog-footer-notice">
            <mat-icon class="notice-icon">info</mat-icon>
            <span>
              No tax or brokerage fee fields are needed — enter taxes/fees as regular expenses if applicable.
            </span>
          </div>
        </div>
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancel</button>
        <button
          mat-flat-button
          type="submit"
          [disabled]="saleForm().submitting()"
        >
          {{ data.sale ? 'Update' : 'Save' }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: [
    `
      .dialog-content {
        min-width: min(520px, 85vw);
        padding-top: 0.5rem;
      }
      .form-grid {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .full-width {
        width: 100%;
      }
      .two-col {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }
      @media (max-width: 600px) {
        .two-col {
          grid-template-columns: 1fr;
        }
      }
      .preview-card {
        background-color: var(--mat-sys-surface-container);
        border-radius: 8px;
        padding: 12px 16px;
        margin: 4px 0 10px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .preview-row {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
      }
      .preview-label {
        font-size: 0.875rem;
        color: var(--mat-sys-on-surface-variant);
      }
      .preview-value {
        font-size: 1.125rem;
        color: var(--mat-sys-on-surface);
      }
      .preview-subvalue {
        font-weight: 500;
        color: var(--mat-sys-primary);
      }
      .dialog-footer-notice {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        background-color: var(--mat-sys-surface-container-low);
        border-left: 3px solid var(--mat-sys-primary);
        padding: 8px 12px;
        border-radius: 4px;
        font-size: 0.8125rem;
        color: var(--mat-sys-on-surface-variant);
        line-height: 1.4;
      }
      .notice-icon {
        font-size: 1.125rem;
        width: 1.125rem;
        height: 1.125rem;
        color: var(--mat-sys-primary);
        margin-top: 2px;
        flex-shrink: 0;
      }
    `,
  ],
})
export class StockSaleDialog {
  protected readonly data = inject<StockSaleDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(
    MatDialogRef<StockSaleDialog, StockSaleDialogResult>
  );

  readonly model = signal<StockSaleFormModel>({
    companyOrTicker: this.data?.sale?.companyOrTicker ?? '',
    saleDate: this.data?.sale?.saleDate
      ? this.data.sale.saleDate.substring(0, 10)
      : new Date().toISOString().substring(0, 10),
    sharesSold: this.data?.sale?.sharesSold ?? 1,
    pricePerShare: this.data?.sale?.pricePerShare ?? 0,
    currency: (this.data?.sale?.currency as StockSaleFormModel['currency']) || 'USD',
    exchangeRateToPln: this.computeInitialExchangeRate(),
    plnEquivalent: this.data?.sale?.plnEquivalent ?? null,
    notes: this.data?.sale?.notes ?? '',
  });

  readonly calculatedGrossValue = computed(() => {
    const shares = Number(this.model().sharesSold) || 0;
    const price = Number(this.model().pricePerShare) || 0;
    return Math.round(shares * price * 100) / 100;
  });

  readonly calculatedPlnFromRate = computed(() => {
    const rate = this.model().exchangeRateToPln;
    if (rate === null || rate === undefined || rate <= 0) return null;
    return Math.round(this.calculatedGrossValue() * rate * 100) / 100;
  });

  readonly livePlnDisplay = computed<number | null>(() => {
    const m = this.model();
    if (m.currency === 'PLN') {
      return this.calculatedGrossValue();
    }
    if (m.plnEquivalent !== null && m.plnEquivalent !== undefined && m.plnEquivalent > 0) {
      return m.plnEquivalent;
    }
    return this.calculatedPlnFromRate();
  });

  protected readonly saleForm = form(
    this.model,
    (path) => {
      required(path.companyOrTicker, { message: 'Company or ticker is required' });
      required(path.saleDate, { message: 'Sale date is required' });
      required(path.sharesSold, { message: 'Shares sold is required' });
      min(path.sharesSold, 0.0001, { message: 'Shares sold must be at least 0.0001' });
      required(path.pricePerShare, { message: 'Price per share is required' });
      min(path.pricePerShare, 0.01, { message: 'Price must be at least 0.01' });
      required(path.currency, { message: 'Currency is required' });
    },
    {
      submission: {
        action: async () => {
          const m = this.model();
          const grossValue = this.calculatedGrossValue();
          let plnEquivalent: number | undefined;

          if (m.currency === 'PLN') {
            plnEquivalent = grossValue;
          } else if (
            m.plnEquivalent !== null &&
            m.plnEquivalent !== undefined &&
            Number(m.plnEquivalent) > 0
          ) {
            plnEquivalent = Number(m.plnEquivalent);
          } else if (
            m.exchangeRateToPln !== null &&
            m.exchangeRateToPln !== undefined &&
            Number(m.exchangeRateToPln) > 0
          ) {
            plnEquivalent = Math.round(grossValue * Number(m.exchangeRateToPln) * 100) / 100;
          }

          this.dialogRef.close({
            companyOrTicker: m.companyOrTicker.trim(),
            saleDate: m.saleDate,
            sharesSold: Number(m.sharesSold),
            pricePerShare: Number(m.pricePerShare),
            currency: m.currency,
            grossValue,
            plnEquivalent,
            notes: m.notes?.trim() || undefined,
          });
          return undefined;
        },
      },
    }
  );

  private computeInitialExchangeRate(): number | null {
    const sale = this.data?.sale;
    if (!sale) return null;
    if (sale.currency === 'PLN') return 1;
    if (sale.plnEquivalent && sale.grossValue > 0) {
      return Math.round((sale.plnEquivalent / sale.grossValue) * 10000) / 10000;
    }
    return null;
  }
}
