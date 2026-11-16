import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { form, FormField, FormRoot, min, required } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { StockSale } from '../../core/models/worth-it.model';
import { WorthItStore } from '../../core/stores/worth-it.store';
import { MoneyPipe } from '../../shared/pipes/money.pipe';

export interface StockSaleDialogData {
  sale?: StockSale;
  preselectedAssetId?: string;
}

export interface StockSaleFormModel {
  sourceAssetId: string;
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
  sourceAssetId?: string;
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
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSelectModule,
    MatIconModule,
    FormRoot,
    FormField,
    MoneyPipe,
  ],
  template: `
    <h2 mat-dialog-title>
      {{ data.sale ? 'Edit Stock Sale' : 'Record Stock Sale' }}
    </h2>

    <form [formRoot]="saleForm">
      <mat-dialog-content class="dialog-content">
        <div class="form-grid">
          <!-- Source Employer Stock Dropdown (UX Screen 6) -->
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Source Employer Stock (Optional)</mat-label>
            <mat-select
              [value]="model().sourceAssetId"
              (selectionChange)="onSourceAssetChange($event.value)"
              placeholder="Select company equity (optional)"
            >
              <mat-option value="">None (independent sale)</mat-option>
              @for (asset of employerStockAssets(); track asset.id) {
                <mat-option [value]="asset.id">
                  {{ asset.name }} ({{ asset.employerStock?.tickerSymbol || asset.currency }})
                </mat-option>
              }
            </mat-select>
          </mat-form-field>

          <!-- Amber Accounting Clarification Banner -->
          @if (selectedSourceAsset(); as sourceAsset) {
            <mat-card appearance="outlined" class="source-asset-notice" role="note">
              <mat-card-content class="notice-content">
                <mat-icon class="notice-icon amber-icon">info</mat-icon>
                <div class="banner-text-block">
                  <p class="banner-primary">
                    Selling {{ model().sharesSold }} shares will deduct them from {{ sourceAsset.name }}'s held vested shares as of {{ model().saleDate }}.
                  </p>
                  <p class="banner-secondary">
                    Sale proceeds do not automatically add to cash accounts. Update your bank balance when cash settles.
                  </p>
                </div>
              </mat-card-content>
            </mat-card>
          }

          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Company or Ticker</mat-label>
            <input
              matInput
              [formField]="saleForm.companyOrTicker"
              placeholder="e.g. AAPL / Apple Inc."
            />
            @for (error of saleForm.companyOrTicker().errors(); track $index) {
              <mat-error>{{ error.message }}</mat-error>
            }
          </mat-form-field>

          <div class="two-col">
            <div>
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Sale Date</mat-label>
                <input matInput type="date" [formField]="saleForm.saleDate" />
                @for (error of saleForm.saleDate().errors(); track $index) {
                  <mat-error>{{ error.message }}</mat-error>
                }
              </mat-form-field>
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
                @for (error of saleForm.currency().errors(); track $index) {
                  <mat-error>{{ error.message }}</mat-error>
                }
              </mat-form-field>
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
                @for (error of saleForm.sharesSold().errors(); track $index) {
                  <mat-error>{{ error.message }}</mat-error>
                }
              </mat-form-field>
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
                @for (error of saleForm.pricePerShare().errors(); track $index) {
                  <mat-error>{{ error.message }}</mat-error>
                }
              </mat-form-field>
            </div>
          </div>

          <!-- Live Computed Gross Value Preview -->
          <mat-card appearance="outlined" class="preview-card">
            <mat-card-content class="preview-content">
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
            </mat-card-content>
          </mat-card>

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
                  @for (error of saleForm.exchangeRateToPln().errors(); track $index) {
                    <mat-error>{{ error.message }}</mat-error>
                  }
                </mat-form-field>
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
                  @for (error of saleForm.plnEquivalent().errors(); track $index) {
                    <mat-error>{{ error.message }}</mat-error>
                  }
                </mat-form-field>
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
            @for (error of saleForm.notes().errors(); track $index) {
              <mat-error>{{ error.message }}</mat-error>
            }
          </mat-form-field>

          <mat-card appearance="outlined" class="dialog-footer-notice">
            <mat-card-content class="notice-content">
              <mat-icon class="notice-icon">info</mat-icon>
              <span>
                No tax or brokerage fee fields are needed — enter taxes/fees as regular expenses if applicable.
              </span>
            </mat-card-content>
          </mat-card>
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
      .source-asset-notice {
        background-color: var(--mat-sys-surface-container);
        border-left: 4px solid var(--mat-sys-tertiary, #e69a00);
        margin: 2px 0 8px;
      }
      .amber-icon {
        color: var(--mat-sys-tertiary, #e69a00);
      }
      .banner-text-block {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .banner-primary {
        margin: 0;
        font-weight: 500;
        font-size: 0.8125rem;
        color: var(--mat-sys-on-surface);
      }
      .banner-secondary {
        margin: 0;
        font-size: 0.75rem;
        color: var(--mat-sys-on-surface-variant);
      }
      .preview-card {
        background-color: var(--mat-sys-surface-container);
        margin: 4px 0 10px;
      }
      .preview-content {
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
        background-color: var(--mat-sys-surface-container-low);
        border-left: 3px solid var(--mat-sys-primary);
      }
      .notice-content {
        display: flex;
        align-items: flex-start;
        gap: 8px;
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
  protected readonly store = inject(WorthItStore, { optional: true });

  readonly employerStockAssets = computed(() => {
    return this.store ? this.store.employerStockAssets() : [];
  });

  readonly model = signal<StockSaleFormModel>(this.computeInitialModel());

  readonly selectedSourceAsset = computed(() => {
    const id = this.model().sourceAssetId;
    if (!id) return null;
    return this.employerStockAssets().find((a) => a.id === id) ?? null;
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

  readonly saleForm = form(
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
            sourceAssetId: m.sourceAssetId || undefined,
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

  onSourceAssetChange(assetId: string): void {
    this.model.update((prev) => {
      if (!assetId) {
        return {
          ...prev,
          sourceAssetId: '',
        };
      }

      const asset = this.employerStockAssets().find((a) => a.id === assetId);
      if (!asset) {
        return {
          ...prev,
          sourceAssetId: assetId,
        };
      }

      const ticker = asset.employerStock?.tickerSymbol || asset.name;
      const curr = (asset.currency as StockSaleFormModel['currency']) || prev.currency;
      let price = prev.pricePerShare;
      if (price === 0 && this.store) {
        const unitPrice = this.store.assetValuations().get(asset.id)?.unitPrice;
        if (unitPrice !== undefined && unitPrice > 0) {
          price = unitPrice;
        }
      }

      return {
        ...prev,
        sourceAssetId: asset.id,
        companyOrTicker: ticker,
        currency: curr,
        pricePerShare: price,
      };
    });
  }

  private computeInitialModel(): StockSaleFormModel {
    const sale = this.data?.sale;
    const preselectedId = sale?.sourceAssetId ?? this.data?.preselectedAssetId ?? '';
    const preselectedAsset = preselectedId && this.store
      ? this.store.employerStockAssets().find((a) => a.id === preselectedId)
      : null;

    const companyOrTicker =
      sale?.companyOrTicker ??
      (preselectedAsset
        ? (preselectedAsset.employerStock?.tickerSymbol || preselectedAsset.name)
        : '');

    const currency =
      (sale?.currency as StockSaleFormModel['currency']) ||
      ((preselectedAsset?.currency as StockSaleFormModel['currency']) || 'USD');

    let initialPrice = sale?.pricePerShare ?? 0;
    if (!sale && preselectedAsset && this.store) {
      const unitPrice = this.store.assetValuations().get(preselectedAsset.id)?.unitPrice;
      if (unitPrice !== undefined && unitPrice > 0) {
        initialPrice = unitPrice;
      }
    }

    return {
      sourceAssetId: preselectedId,
      companyOrTicker,
      saleDate: sale?.saleDate
        ? sale.saleDate.substring(0, 10)
        : new Date().toISOString().substring(0, 10),
      sharesSold: sale?.sharesSold ?? 1,
      pricePerShare: initialPrice,
      currency,
      exchangeRateToPln: this.computeInitialExchangeRate(),
      plnEquivalent: sale?.plnEquivalent ?? null,
      notes: sale?.notes ?? '',
    };
  }

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
