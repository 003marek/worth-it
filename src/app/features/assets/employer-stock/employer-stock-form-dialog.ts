import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { form, FormField, FormRoot, required, validate } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { EmployerStockDetails } from '../../../core/models/employer-stock.model';
import { MarketQuote } from '../../../core/models/market-data.model';
import { Asset } from '../../../core/models/worth-it.model';
import {
  MarketDataError,
  MarketDataErrorKind,
} from '../../../core/services/market-data/market-data.error';
import { WorthItStore } from '../../../core/stores/worth-it.store';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';

export interface EmployerStockDialogData {
  asset?: Asset;
  initialName?: string;
  initialCurrency?: string;
  initialIsGoalEligible?: boolean;
  /** Defaults to true: dialog persists via WorthItStore before closing. */
  saveToStore?: boolean;
}

export interface EmployerStockFormValue {
  tickerSymbol: string;
  name: string;
  currency: string;
  manualPrice: number | null;
  manualFxRate: number | null;
  isGoalEligible: boolean;
}

export interface EmployerStockDialogResult {
  asset?: Asset;
  name: string;
  tickerSymbol: string;
  currency: string;
  employerStock: EmployerStockDetails;
  isGoalEligible: boolean;
}

export interface LookupErrorFeedback {
  kind: MarketDataErrorKind;
  message: string;
  recovery: string;
}

export const EMPLOYER_STOCK_CURRENCIES = ['USD', 'EUR', 'GBP', 'PLN', 'CHF'] as const;

@Component({
  selector: 'app-employer-stock-form-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatDialogModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    FormRoot,
    FormField,
    MoneyPipe,
  ],
  template: `
    <h2 mat-dialog-title>
      {{ data.asset ? 'Edit employer stock' : 'Add employer stock' }}
    </h2>

    <form [formRoot]="stockForm">
      <mat-dialog-content class="form-grid">
        <!-- 1. Ticker Symbol with Lookup -->
        <div class="ticker-lookup-row">
          <mat-form-field appearance="outline" class="ticker-field">
            <mat-label>Ticker symbol</mat-label>
            <input
              matInput
              [formField]="stockForm.tickerSymbol"
              placeholder="e.g. GOOGL, MSFT"
              class="uppercase-input"
              (blur)="onTickerBlur()"
            />
            <button
              mat-icon-button
              matSuffix
              type="button"
              class="lookup-btn"
              (click)="onLookupTicker()"
              [disabled]="lookingUp() || !stockForm.tickerSymbol().value().trim()"
              matTooltip="Search ticker on Twelve Data"
              aria-label="Search ticker on Twelve Data"
            >
              <mat-icon [class.spinning]="lookingUp()">
                {{ lookingUp() ? 'sync' : 'search' }}
              </mat-icon>
            </button>
            @for (error of stockForm.tickerSymbol().errors(); track $index) {
              <mat-error>{{ error.message }}</mat-error>
            }
          </mat-form-field>
        </div>

        <!-- Shimmer Loading State -->
        @if (lookingUp()) {
          <div class="quote-preview-banner shimmer-banner" role="status" aria-live="polite">
            <span class="price-shimmer" aria-hidden="true"></span>
            <span class="shimmer-copy">Looking up live quote on Twelve Data…</span>
          </div>
        }

        <!-- Live Quote Preview -->
        @if (!lookingUp() && quotePreview(); as quote) {
          <div class="quote-preview-banner success-banner" role="status" aria-live="polite">
            <mat-icon class="banner-icon positive-icon" aria-hidden="true">check_circle</mat-icon>
            <div class="banner-details">
              <div class="quote-main">
                <strong>{{ quote.symbol }}</strong>
                @if (quote.name) {
                  <span>· {{ quote.name }}</span>
                }
                @if (quote.exchange) {
                  <span class="exchange-tag">({{ quote.exchange }})</span>
                }
              </div>
              <div class="quote-price mono-nums">
                Latest price: <strong>{{ quote.price | money:quote.currency:2 }}</strong>
              </div>
            </div>
          </div>
        }

        <!-- Lookup Error Feedback per UX §3.3 -->
        @if (!lookingUp() && lookupError(); as err) {
          <div class="quote-preview-banner error-banner" role="alert" aria-live="polite">
            <mat-icon class="banner-icon warn-icon" aria-hidden="true">warning</mat-icon>
            <div class="banner-details">
              <div class="err-msg">{{ err.message }}</div>
              <div class="err-recovery">{{ err.recovery }}</div>
              <div class="err-actions">
                @if (err.kind === 'no_api_key' || err.kind === 'auth') {
                  <button
                    mat-button
                    type="button"
                    class="inline-action-btn"
                    (click)="goToSettings()"
                  >
                    <span>Configure key in Settings →</span>
                  </button>
                }
                @if (err.kind === 'unknown' || err.kind === 'rate_limit') {
                  <button
                    mat-button
                    type="button"
                    class="inline-action-btn"
                    (click)="onLookupTicker()"
                  >
                    <mat-icon>refresh</mat-icon>
                    <span>Retry lookup</span>
                  </button>
                }
              </div>
            </div>
          </div>
        }

        <!-- 2. Asset Name & 3. Trading Currency -->
        <div class="two-col-row">
          <mat-form-field appearance="outline" class="name-field">
            <mat-label>Asset name</mat-label>
            <input
              matInput
              [formField]="stockForm.name"
              placeholder="e.g. Alphabet Inc."
            />
            @for (error of stockForm.name().errors(); track $index) {
              <mat-error>{{ error.message }}</mat-error>
            }
          </mat-form-field>

          <mat-form-field appearance="outline" class="currency-field">
            <mat-label>Trading currency</mat-label>
            <mat-select [formField]="stockForm.currency">
              @for (curr of currencyOptions; track curr) {
                <mat-option [value]="curr">{{ curr }}</mat-option>
              }
            </mat-select>
            @for (error of stockForm.currency().errors(); track $index) {
              <mat-error>{{ error.message }}</mat-error>
            }
          </mat-form-field>
        </div>

        <!-- 4. Manual Fallbacks (Collapsible Section) -->
        <div class="manual-fallbacks-section">
          <button
            mat-button
            type="button"
            class="collapse-toggle-btn"
            (click)="toggleManualFallbacks()"
            [attr.aria-expanded]="showManualFallbacks()"
          >
            <mat-icon>{{ showManualFallbacks() ? 'expand_less' : 'expand_more' }}</mat-icon>
            <span>Manual price &amp; exchange rate fallbacks</span>
          </button>

          @if (showManualFallbacks()) {
            <div class="manual-fields-box">
              <p class="manual-helper">
                Used when offline or when no cached Twelve Data / NBP value is available.
              </p>
              <div class="two-col-row">
                <mat-form-field appearance="outline">
                  <mat-label>Manual price</mat-label>
                  <input
                    matInput
                    type="number"
                    step="0.01"
                    class="mono-nums"
                    [formField]="stockForm.manualPrice"
                    placeholder="e.g. 185.00"
                  />
                  <span matTextSuffix>{{ stockForm.currency().value() }}</span>
                  <mat-hint>Self-entered stock price fallback</mat-hint>
                  @for (error of stockForm.manualPrice().errors(); track $index) {
                    <mat-error>{{ error.message }}</mat-error>
                  }
                </mat-form-field>

                @if (stockForm.currency().value() !== baseCurrency()) {
                  <mat-form-field appearance="outline">
                    <mat-label>Manual exchange rate</mat-label>
                    <input
                      matInput
                      type="number"
                      step="0.0001"
                      class="mono-nums"
                      [formField]="stockForm.manualFxRate"
                      placeholder="e.g. 4.02"
                    />
                    <span matTextSuffix>{{ baseCurrency() }}</span>
                    <mat-hint>
                      1 {{ stockForm.currency().value() }} = X {{ baseCurrency() }}
                    </mat-hint>
                    @for (error of stockForm.manualFxRate().errors(); track $index) {
                      <mat-error>{{ error.message }}</mat-error>
                    }
                  </mat-form-field>
                }
              </div>
            </div>
          }
        </div>

        <!-- 5. Goal Eligibility Toggle -->
        <div class="toggle-container">
          <mat-slide-toggle [formField]="stockForm.isGoalEligible" color="primary">
            Count towards financial goals
          </mat-slide-toggle>
          <span class="toggle-hint">
            When enabled, currently held vested shares fund your cushion and active goals.
          </span>
        </div>
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-stroked-button type="button" mat-dialog-close>Cancel</button>
        <button
          mat-flat-button
          color="primary"
          type="submit"
          [disabled]="!stockForm().valid() || stockForm().submitting()"
        >
          Save asset
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .form-grid {
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-width: min(480px, 88vw);
      padding-top: 8px;
    }

    .ticker-lookup-row {
      display: flex;
      align-items: flex-start;
      width: 100%;
    }

    .ticker-field {
      width: 100%;
    }

    .uppercase-input {
      text-transform: uppercase;
      font-family: 'Roboto Mono', monospace;
      font-weight: 600;
      letter-spacing: 0.04em;
    }

    .lookup-btn {
      min-width: 48px;
      min-height: 48px;
    }

    @keyframes spin {
      from {
        transform: rotate(0deg);
      }
      to {
        transform: rotate(360deg);
      }
    }

    .spinning {
      animation: spin 1s linear infinite;
    }

    @keyframes shimmer {
      0% {
        background-position: -200% 0;
      }
      100% {
        background-position: 200% 0;
      }
    }

    .price-shimmer {
      display: inline-block;
      height: 1.5rem;
      width: 5.5rem;
      border-radius: 4px;
      background: linear-gradient(
        90deg,
        var(--mat-sys-surface-container) 25%,
        var(--mat-sys-surface-container-high) 50%,
        var(--mat-sys-surface-container) 75%
      );
      background-size: 200% 100%;
      animation: shimmer 1.5s infinite;
      flex-shrink: 0;
    }

    .quote-preview-banner {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 12px;
      border-radius: 10px;
      font-size: 0.8125rem;
      line-height: 1.4;
      border: 1px solid var(--mat-sys-outline-variant);
    }

    .shimmer-banner {
      align-items: center;
      background: var(--mat-sys-surface-container);
      color: var(--mat-sys-on-surface-variant);
    }

    .success-banner {
      background: var(--mat-sys-surface-container);
      color: var(--mat-sys-on-surface);
    }

    .error-banner {
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
      border-color: var(--mat-sys-error);
    }

    .banner-icon {
      font-size: 1.25rem;
      width: 1.25rem;
      height: 1.25rem;
      flex-shrink: 0;
      margin-top: 1px;
    }

    .positive-icon {
      color: var(--worth-it-positive, #1b6b3a);
    }

    .warn-icon {
      color: var(--mat-sys-error);
    }

    .banner-details {
      display: flex;
      flex-direction: column;
      gap: 4px;
      flex: 1;
    }

    .exchange-tag {
      color: var(--mat-sys-on-surface-variant);
      margin-left: 4px;
    }

    .err-msg {
      font-weight: 600;
    }

    .err-recovery {
      opacity: 0.9;
    }

    .err-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 4px;
    }

    .inline-action-btn {
      min-height: 36px;
      padding: 0 8px;
      font-size: 0.8125rem;
    }

    .two-col-row {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 12px;

      @media (max-width: 520px) {
        grid-template-columns: 1fr;
      }
    }

    .manual-fallbacks-section {
      display: flex;
      flex-direction: column;
      gap: 8px;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 10px;
      padding: 8px 12px;
      background: var(--mat-sys-surface-container-low);
    }

    .collapse-toggle-btn {
      justify-content: flex-start;
      min-height: 44px;
      font-size: 0.875rem;
      color: var(--mat-sys-on-surface);
    }

    .manual-fields-box {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding-top: 4px;
    }

    .manual-helper {
      margin: 0 0 4px;
      font-size: 0.75rem;
      color: var(--mat-sys-on-surface-variant);
    }

    .mono-nums {
      font-variant-numeric: tabular-nums;
      font-family: 'Roboto Mono', monospace;
    }

    .toggle-container {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 8px 4px;
    }

    .toggle-hint {
      font-size: 0.75rem;
      color: var(--mat-sys-on-surface-variant);
      margin-left: 2px;
    }
  `,
})
export class EmployerStockFormDialog {
  protected readonly data =
    inject<EmployerStockDialogData>(MAT_DIALOG_DATA, { optional: true }) ?? {};
  protected readonly store = inject(WorthItStore);
  private readonly router = inject(Router);
  private readonly dialogRef = inject(
    MatDialogRef<EmployerStockFormDialog, EmployerStockDialogResult>
  );

  protected readonly currencyOptions = EMPLOYER_STOCK_CURRENCIES;
  protected readonly baseCurrency = computed(
    () => this.store.settings().baseCurrency || 'PLN'
  );

  protected readonly lookingUp = signal(false);
  protected readonly quotePreview = signal<MarketQuote | null>(null);
  protected readonly lookupError = signal<LookupErrorFeedback | null>(null);
  protected readonly showManualFallbacks = signal<boolean>(
    Boolean(
      this.data.asset?.employerStock?.manualPrice !== undefined ||
        this.data.asset?.employerStock?.manualFxRate !== undefined
    )
  );

  private lastLookedUpSymbol =
    this.data.asset?.employerStock?.tickerSymbol?.trim().toUpperCase() ?? '';

  private readonly model = signal<EmployerStockFormValue>({
    tickerSymbol: this.data.asset?.employerStock?.tickerSymbol ?? '',
    name: this.data.asset?.name ?? this.data.initialName ?? '',
    currency: this.data.asset?.currency ?? this.data.initialCurrency ?? 'USD',
    manualPrice: this.data.asset?.employerStock?.manualPrice ?? null,
    manualFxRate: this.data.asset?.employerStock?.manualFxRate ?? null,
    isGoalEligible:
      this.data.asset?.isGoalEligible ?? this.data.initialIsGoalEligible ?? true,
  });

  protected readonly stockForm = form(
    this.model,
    (path) => {
      required(path.tickerSymbol, { message: 'Ticker symbol is required' });
      required(path.name, { message: 'Asset name is required' });
      required(path.currency, { message: 'Trading currency is required' });

      validate(path.manualPrice, (ctx) => {
        const val = ctx.value();
        if (val !== null && val !== undefined && Number(val) < 0) {
          return { kind: 'min', message: 'Manual price cannot be negative' };
        }
        return null;
      });

      validate(path.manualFxRate, (ctx) => {
        const val = ctx.value();
        if (val !== null && val !== undefined && Number(val) < 0) {
          return { kind: 'min', message: 'Manual FX rate cannot be negative' };
        }
        return null;
      });
    },
    {
      submission: {
        action: async () => {
          const val = this.model();
          const tickerSymbol = val.tickerSymbol.trim().toUpperCase();
          const name = val.name.trim();
          const currency = val.currency.trim().toUpperCase();
          const isGoalEligible = Boolean(val.isGoalEligible);

          const manualPrice =
            val.manualPrice !== null &&
            val.manualPrice !== undefined &&
            Number(val.manualPrice) > 0
              ? Number(val.manualPrice)
              : undefined;

          const manualFxRate =
            currency !== this.baseCurrency() &&
            val.manualFxRate !== null &&
            val.manualFxRate !== undefined &&
            Number(val.manualFxRate) > 0
              ? Number(val.manualFxRate)
              : undefined;

          const employerStock: EmployerStockDetails = {
            ...this.data.asset?.employerStock,
            tickerSymbol,
            manualPrice,
            manualFxRate,
          };

          let savedAsset: Asset | undefined;
          if (this.data.saveToStore !== false) {
            if (this.data.asset?.id) {
              savedAsset = await this.store.updateAsset(this.data.asset.id, {
                name,
                currency,
                isGoalEligible,
                employerStock,
              });
            } else {
              savedAsset = await this.store.addAsset(
                {
                  name,
                  type: 'employer_stock',
                  balance: 0,
                  currency,
                  isGoalEligible,
                  employerStock,
                },
                'Created employer stock asset'
              );
            }
          }

          this.dialogRef.close({
            asset: savedAsset,
            name,
            tickerSymbol,
            currency,
            employerStock,
            isGoalEligible,
          });
          return undefined;
        },
      },
    }
  );

  protected toggleManualFallbacks(): void {
    this.showManualFallbacks.update((v) => !v);
  }

  protected onTickerBlur(): void {
    const sym = this.model().tickerSymbol.trim().toUpperCase();
    if (sym && sym !== this.lastLookedUpSymbol) {
      void this.onLookupTicker();
    }
  }

  protected async onLookupTicker(): Promise<void> {
    const sym = this.model().tickerSymbol.trim().toUpperCase();
    if (!sym || this.lookingUp()) return;

    this.lastLookedUpSymbol = sym;
    this.lookingUp.set(true);
    this.lookupError.set(null);

    try {
      const quote = await this.store.lookupTicker(sym);
      this.quotePreview.set(quote);

      const current = this.model();
      const updatedName = current.name.trim()
        ? current.name
        : quote.name?.trim() || quote.symbol;
      const quoteCurr = quote.currency?.trim().toUpperCase();
      const updatedCurrency =
        quoteCurr && (this.currencyOptions as readonly string[]).includes(quoteCurr)
          ? quoteCurr
          : current.currency;

      this.model.set({
        ...current,
        tickerSymbol: quote.symbol.toUpperCase(),
        name: updatedName,
        currency: updatedCurrency,
      });
    } catch (err: unknown) {
      this.quotePreview.set(null);
      this.lookupError.set(this.mapLookupError(err));
      this.showManualFallbacks.set(true);
    } finally {
      this.lookingUp.set(false);
    }
  }

  protected goToSettings(): void {
    this.dialogRef.close();
    void this.router.navigate(['/settings']);
  }

  private mapLookupError(err: unknown): LookupErrorFeedback {
    const kind: MarketDataErrorKind =
      err instanceof MarketDataError ? err.kind : 'unknown';

    switch (kind) {
      case 'invalid_symbol':
        return {
          kind,
          message:
            'Ticker not found on Twelve Data. Verify symbol (e.g. MSFT, GOOGL).',
          recovery: 'Keep typed symbol or enter a manual price below.',
        };
      case 'no_api_key':
        return {
          kind,
          message: 'Twelve Data API key not configured in Settings.',
          recovery: 'Configure your key in Settings or enter a manual price below.',
        };
      case 'auth':
        return {
          kind,
          message: 'Twelve Data rejected the API key.',
          recovery: 'Verify your API key in Settings or enter a manual price below.',
        };
      case 'rate_limit':
        return {
          kind,
          message: 'Twelve Data rate limit reached (8 req/min on free tier).',
          recovery: 'Wait 60s to retry or enter a manual price below.',
        };
      case 'network':
        return {
          kind,
          message: 'You are offline. Cannot fetch live ticker quote.',
          recovery: 'Form continues seamlessly using manual price and fallback FX.',
        };
      case 'unknown':
      default:
        return {
          kind: 'unknown',
          message: 'Unable to reach quote service. Please try again.',
          recovery: 'Retry lookup or enter a manual price below.',
        };
    }
  }
}

export { EmployerStockFormDialog as EmployerStockFormDialogComponent };
