import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { compareIsoDates } from '../../../core/asset-types/date-utils';
import { vestedSharesAt } from '../../../core/asset-types/employer-stock/vesting';
import { StockGrant } from '../../../core/models/employer-stock.model';
import { MarketDataSource } from '../../../core/models/market-data.model';
import { StockSale } from '../../../core/models/worth-it.model';
import { WorthItStore } from '../../../core/stores/worth-it.store';
import { ConfirmDialog } from '../../../shared/components/confirm-dialog/confirm-dialog';
import { EmptyState } from '../../../shared/components/empty-state/empty-state';
import { MarketStatusBadge } from '../../../shared/components/market-status-badge/market-status-badge';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import {
  StockSaleDialog,
  StockSaleDialogResult,
} from '../../stock-sales/stock-sale-dialog';
import { EmployerStockFormDialog } from './employer-stock-form-dialog';
import { GrantEditorDialog } from './grant-editor-dialog';
import { VestedBaselineDialog } from './vested-baseline-dialog';
import { VestingTimeline } from './vesting-timeline';

@Component({
  selector: 'app-employer-stock-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    DecimalPipe,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatDialogModule,
    MatDividerModule,
    MatExpansionModule,
    MatIconModule,
    MatMenuModule,
    MatSlideToggleModule,
    MatTooltipModule,
    EmptyState,
    MarketStatusBadge,
    MoneyPipe,
    VestingTimeline,
  ],
  template: `
    <div class="detail-page">
      @if (asset(); as currentAsset) {
        <!-- 1. Top Header -->
        <header class="detail-header">
          <div class="header-left">
            <a
              mat-icon-button
              routerLink="/assets"
              aria-label="Back to assets"
              class="back-btn"
            >
              <mat-icon>arrow_back</mat-icon>
            </a>
            <div class="title-group">
              <div class="title-line">
                <h1 class="asset-title">{{ currentAsset.name }}</h1>
                <span class="ticker-pill mono-nums">{{ tickerSymbol() }}</span>
              </div>
              <span class="asset-subtitle">
                Employer Stock · Trading in {{ currentAsset.currency }}
              </span>
            </div>
          </div>

          <div class="header-actions">
            <button
              mat-flat-button
              color="primary"
              class="primary-action-btn"
              (click)="openAddGrantDialog()"
            >
              <mat-icon>add</mat-icon>
              <span>Add Grant</span>
            </button>

            <button
              mat-icon-button
              [matMenuTriggerFor]="moreMenu"
              aria-label="More actions for employer stock"
              class="more-menu-btn"
            >
              <mat-icon>more_vert</mat-icon>
            </button>
            <mat-menu #moreMenu="matMenu">
              <button mat-menu-item (click)="openEditAssetDialog()">
                <mat-icon>edit</mat-icon>
                <span>Edit Asset</span>
              </button>
              <button mat-menu-item (click)="openBaselineDialog()">
                <mat-icon>verified</mat-icon>
                <span>Set Vested Baseline</span>
              </button>
              <button
                mat-menu-item
                (click)="onRefreshMarketData()"
                [disabled]="store.marketDataRefreshing()"
              >
                <mat-icon>sync</mat-icon>
                <span>Refresh Market Data</span>
              </button>
              <mat-divider></mat-divider>
              <button
                mat-menu-item
                (click)="onDeleteAsset()"
                class="danger-menu-item"
              >
                <mat-icon color="warn">delete</mat-icon>
                <span>Delete Asset</span>
              </button>
            </mat-menu>
          </div>
        </header>

        <!-- 2. Wealth Summary Hero Banner -->
        <section class="hero-summary-section" aria-label="Equity summary">
          <div class="hero-metrics-grid">
            <!-- Col 1: Vested & Held (Actual Wealth) -->
            <mat-card appearance="outlined" class="metric-card hero-card actual-card">
              <mat-card-content class="metric-content">
                <div class="metric-header">
                  <span class="metric-label">Vested &amp; held</span>
                  <mat-icon class="metric-icon positive-icon" aria-hidden="true">
                    verified_user
                  </mat-icon>
                </div>

                <div class="share-big-number mono-nums">
                  {{ snapshot()?.heldShares ?? 0 | number:'1.0-4' }} sh
                </div>

                @if (store.marketDataRefreshing()) {
                  <span class="price-shimmer" aria-hidden="true"></span>
                } @else {
                  <div class="base-equivalent mono-nums positive">
                    ≈ {{ valuation()?.valueInBase ?? 0 | money:'PLN' }}
                  </div>
                }

                <p class="microcopy">
                  Shares you currently hold in your brokerage account today.
                </p>

                <div class="goal-eligibility-strip">
                  <mat-slide-toggle
                    [checked]="currentAsset.isGoalEligible"
                    (change)="onToggleGoalEligible()"
                    color="primary"
                  >
                    <span class="eligibility-label">
                      {{
                        currentAsset.isGoalEligible
                          ? 'Counts toward goals'
                          : 'Excluded from goals'
                      }}
                    </span>
                  </mat-slide-toggle>
                </div>
              </mat-card-content>
            </mat-card>

            <!-- Col 2: Unvested Pipeline (Projected Only) -->
            <mat-card appearance="outlined" class="metric-card hero-card projected-card">
              <mat-card-content class="metric-content">
                <div class="metric-header">
                  <span class="metric-label">Unvested pipeline</span>
                  <mat-icon class="metric-icon projected-icon" aria-hidden="true">
                    schedule
                  </mat-icon>
                </div>

                <div class="share-big-number mono-nums projected">
                  {{ snapshot()?.unvestedShares ?? 0 | number:'1.0-4' }} sh
                </div>

                @if (store.marketDataRefreshing()) {
                  <span class="price-shimmer" aria-hidden="true"></span>
                } @else {
                  <div class="base-equivalent mono-nums projected">
                    est. {{ unvestedValueInBase() | money:'PLN' }}
                    <span class="projected-pill">Projected only</span>
                  </div>
                }

                <p class="microcopy">
                  Future scheduled shares waiting to vest. Projected only.
                </p>

                @if (snapshot()?.nextVest; as next) {
                  <div class="next-vest-pill mono-nums">
                    <mat-icon aria-hidden="true">event_upcoming</mat-icon>
                    <span>
                      Next: <strong>{{ next.shares | number:'1.0-4' }} sh</strong> on
                      {{ next.date | date:'mediumDate' }}
                    </span>
                  </div>
                }
              </mat-card-content>
            </mat-card>

            <!-- Col 3: Total Granted & Deducted via Sales -->
            <mat-card appearance="outlined" class="metric-card hero-card total-card">
              <mat-card-content class="metric-content">
                <div class="metric-header">
                  <span class="metric-label">Total granted</span>
                  <mat-icon class="metric-icon" aria-hidden="true">
                    workspace_premium
                  </mat-icon>
                </div>

                <div class="share-big-number mono-nums">
                  {{ snapshot()?.totalGrantedShares ?? 0 | number:'1.0-4' }} sh
                </div>

                <div class="grants-count-line">
                  Across <strong>{{ grants().length }}</strong>
                  {{ grants().length === 1 ? 'grant' : 'grants' }}
                </div>

                <p class="microcopy">
                  Total net shares awarded across all active grants before taxes.
                </p>

                @if ((snapshot()?.soldSharesCounted ?? 0) > 0) {
                  <div class="deducted-sales-pill mono-nums">
                    <span>Deducted via sales:</span>
                    <strong>-{{ snapshot()?.soldSharesCounted | number:'1.0-4' }} sh</strong>
                  </div>
                }
              </mat-card-content>
            </mat-card>
          </div>

          <!-- Market Status Strip -->
          <div class="market-status-strip" aria-live="polite">
            <div class="status-badges-wrap">
              <app-market-status-badge
                [status]="valuation()?.priceStatus ?? 'missing'"
                [source]="priceSource()"
                [asOf]="valuation()?.priceAsOf"
                [symbolOrPair]="tickerSymbol()"
              />

              @if (currentAsset.currency !== baseCurrency()) {
                <app-market-status-badge
                  [status]="valuation()?.fxStatus ?? 'missing'"
                  [source]="fxSource()"
                  [asOf]="valuation()?.fxAsOf"
                  [symbolOrPair]="currentAsset.currency + ' → ' + baseCurrency()"
                />
              }

              <span class="rate-summary mono-nums">
                @if (store.marketDataRefreshing()) {
                  <span class="price-shimmer" aria-hidden="true"></span>
                } @else {
                  Price:
                  <strong>
                    {{
                      (valuation()?.unitPrice ?? 0) | money:currentAsset.currency:2
                    }}
                  </strong>
                  @if (currentAsset.currency !== baseCurrency()) {
                    · FX: 1 {{ currentAsset.currency }} =
                    <strong>{{ valuation()?.fxRateToBase ?? 1 | number:'1.2-4' }}</strong>
                    {{ baseCurrency() }}
                  }
                }
              </span>
            </div>

            <button
              mat-icon-button
              type="button"
              class="refresh-icon-btn"
              (click)="onRefreshMarketData()"
              [disabled]="store.marketDataRefreshing()"
              matTooltip="Refresh market price & FX rates"
              aria-label="Refresh market price and FX rates"
            >
              <mat-icon [class.spinning]="store.marketDataRefreshing()">sync</mat-icon>
            </button>
          </div>
        </section>

        <!-- 3. Vested Baseline Banner (if active) -->
        @if (hasActiveBaseline()) {
          <mat-card
            appearance="outlined"
            class="baseline-active-banner"
            role="status"
          >
            <mat-card-content class="baseline-banner-layout">
              <div class="baseline-banner-copy">
                <mat-icon class="baseline-icon" aria-hidden="true">verified</mat-icon>
                <div>
                  <strong>Vested baseline active:</strong>
                  Fixed at
                  <strong class="mono-nums">
                    {{
                      currentAsset.employerStock?.vestedSharesBaseline | number:'1.0-4'
                    }} sh
                  </strong>
                  on
                  <strong class="mono-nums">
                    {{
                      currentAsset.employerStock?.vestedSharesBaselineDate
                        | date:'mediumDate'
                    }}
                  </strong>.
                  Tranches and sales on or before this date are excluded from held share math.
                </div>
              </div>
              <div class="baseline-banner-actions">
                <button
                  mat-stroked-button
                  type="button"
                  (click)="openBaselineDialog()"
                >
                  Adjust baseline
                </button>
                <button
                  mat-button
                  color="warn"
                  type="button"
                  (click)="onClearBaseline()"
                >
                  Clear baseline
                </button>
              </div>
            </mat-card-content>
          </mat-card>
        }

        <!-- Main Responsive Body (Tablet/Desktop 2-col, Mobile stacked) -->
        <div class="detail-main-grid">
          <!-- Left / Top: Visual Vesting Timeline -->
          <div class="timeline-col">
            <app-vesting-timeline
              [grants]="grants()"
              [today]="store.today()"
              [stockPrice]="valuation()?.unitPrice ?? 0"
              [fxRate]="valuation()?.fxRateToBase ?? 1"
            />
          </div>

          <!-- Right / Bottom: Collapsible Grant Cards & Linked Sales -->
          <div class="grants-and-sales-col">
            <!-- 5. Collapsible Grant Cards -->
            <section class="grants-section" aria-label="Stock grants">
              <div class="section-header-bar">
                <div>
                  <h2 class="section-title">Stock Grants ({{ grants().length }})</h2>
                  <p class="section-subtitle">
                    Expand a grant to inspect or customize its vesting tranches
                  </p>
                </div>
                <button
                  mat-stroked-button
                  color="primary"
                  type="button"
                  class="section-action-btn"
                  (click)="openAddGrantDialog()"
                >
                  <mat-icon>add</mat-icon>
                  <span>Add Grant</span>
                </button>
              </div>

              @if (grants().length === 0) {
                <app-empty-state
                  icon="inventory_2"
                  title="No stock grants recorded yet"
                  description="Add your initial grant or RSU award to start tracking vesting schedules and projected inflows."
                >
                  <button
                    mat-flat-button
                    color="primary"
                    (click)="openAddGrantDialog()"
                  >
                    <mat-icon>add</mat-icon>
                    <span>Add your first grant</span>
                  </button>
                </app-empty-state>
              } @else {
                <mat-accordion multi class="grants-accordion">
                  @for (grant of grants(); track grant.id; let idx = $index) {
                    <mat-expansion-panel
                      class="grant-panel"
                      [expanded]="idx === 0"
                    >
                      <mat-expansion-panel-header>
                        <mat-panel-title class="grant-panel-title">
                          <span class="grant-name">
                            {{ grant.name || 'Grant #' + (idx + 1) }}
                          </span>
                          @if (grant.isScheduleCustomized) {
                            <span class="custom-chip">Customized</span>
                          }
                        </mat-panel-title>
                        <mat-panel-description class="grant-panel-desc mono-nums">
                          <span>{{ grant.grantDate | date:'mediumDate' }}</span>
                          <span class="progress-badge">
                            {{ getGrantVestedShares(grant) | number:'1.0-4' }} /
                            {{ grant.totalShares | number:'1.0-4' }} sh vested
                          </span>
                        </mat-panel-description>
                      </mat-expansion-panel-header>

                      <div class="grant-panel-body">
                        <div class="schedule-meta-row">
                          <span>
                            Frequency:
                            <strong>{{ grant.schedule.frequency }}</strong>
                          </span>
                          <span>
                            Duration:
                            <strong>{{ grant.schedule.durationMonths }} mos</strong>
                          </span>
                          @if (grant.schedule.firstVestDate) {
                            <span>
                              First vest:
                              <strong class="mono-nums">
                                {{ grant.schedule.firstVestDate }}
                              </strong>
                            </span>
                          } @else {
                            <span>
                              Cliff:
                              <strong>{{ grant.schedule.cliffMonths }} mos</strong>
                            </span>
                          }
                        </div>

                        <div class="tranches-table-scroll">
                          <div
                            class="tranches-mini-table"
                            role="table"
                            [attr.aria-label]="
                              'Tranches for ' + (grant.name || 'Grant #' + (idx + 1))
                            "
                          >
                            <div class="mini-thead" role="row">
                              <span role="columnheader">Vest Date</span>
                              <span role="columnheader">Shares</span>
                              <span role="columnheader">Status</span>
                              <span role="columnheader">Est. PLN</span>
                            </div>
                            @for (t of grant.tranches; track t.id) {
                              @let isVested = isTrancheVested(t.vestDate);
                              <div
                                class="mini-trow mono-nums"
                                [class.projected-row]="!isVested"
                                role="row"
                              >
                                <span role="cell">{{ t.vestDate | date:'yyyy-MM-dd' }}</span>
                                <span role="cell">
                                  <strong>{{ t.shares | number:'1.0-4' }} sh</strong>
                                </span>
                                <span role="cell">
                                  @if (isVested) {
                                    <span class="vested-pill">Vested</span>
                                  } @else {
                                    <span class="projected-pill">Projected</span>
                                  }
                                </span>
                                <span role="cell">
                                  {{ getTranchePlnValue(t.shares) | money:'PLN' }}
                                </span>
                              </div>
                            }
                          </div>
                        </div>

                        <div class="grant-panel-actions">
                          <button
                            mat-stroked-button
                            type="button"
                            (click)="openEditGrantDialog(grant)"
                          >
                            <mat-icon>edit</mat-icon>
                            <span>Edit Grant</span>
                          </button>
                          <button
                            mat-button
                            color="warn"
                            type="button"
                            (click)="onDeleteGrant(grant)"
                          >
                            <mat-icon>delete</mat-icon>
                            <span>Delete Grant</span>
                          </button>
                        </div>
                      </div>
                    </mat-expansion-panel>
                  }
                </mat-accordion>
              }
            </section>

            <!-- 6. Linked Stock Sales History Section -->
            <section class="sales-section" aria-label="Linked stock sales history">
              <div class="section-header-bar">
                <div>
                  <h2 class="section-title">
                    Linked Stock Sales ({{ linkedSales().length }})
                  </h2>
                  <p class="section-subtitle">
                    Deducted from held vested shares to prevent double counting
                  </p>
                </div>
                <button
                  mat-stroked-button
                  type="button"
                  class="section-action-btn"
                  (click)="openRecordSaleDialog()"
                >
                  <mat-icon>sell</mat-icon>
                  <span>Sell shares</span>
                </button>
              </div>

              @if (linkedSales().length === 0) {
                <mat-card appearance="outlined" class="empty-sales-card">
                  <mat-card-content class="empty-sales-body">
                    <mat-icon aria-hidden="true">receipt_long</mat-icon>
                    <p>
                      No shares sold yet from this company. When you sell shares, record it
                      under Stock Sales to deduct them from your held balance.
                    </p>
                  </mat-card-content>
                </mat-card>
              } @else {
                <div class="sales-list">
                  @for (sale of linkedSales(); track sale.id) {
                    <mat-card appearance="outlined" class="sale-item-card">
                      <mat-card-content class="sale-item-row">
                        <div class="sale-left">
                          <div class="sale-date mono-nums">
                            {{ sale.saleDate | date:'mediumDate' }}
                          </div>
                          <div class="sale-shares mono-nums">
                            <strong>-{{ sale.sharesSold | number:'1.0-4' }} sh</strong>
                            <span>
                              @ {{ sale.pricePerShare | money:sale.currency:2 }}
                            </span>
                          </div>
                          <span class="deducted-note">
                            Deducted from held vested shares
                          </span>
                        </div>
                        <div class="sale-right mono-nums">
                          <div class="sale-gross">
                            {{ sale.grossValue | money:sale.currency:2 }}
                          </div>
                          @if (sale.plnEquivalent) {
                            <div class="sale-pln">
                              ≈ {{ sale.plnEquivalent | money:'PLN' }}
                            </div>
                          }
                        </div>
                      </mat-card-content>
                    </mat-card>
                  }
                </div>
              }
            </section>
          </div>
        </div>
      } @else {
        <!-- Asset Not Found Fallback -->
        <app-empty-state
          icon="search_off"
          title="Employer stock asset not found"
          description="This asset may have been deleted or does not exist."
        >
          <a mat-flat-button color="primary" routerLink="/assets">
            <mat-icon>arrow_back</mat-icon>
            <span>Return to Assets</span>
          </a>
        </app-empty-state>
      }
    </div>
  `,
  styles: `
    .detail-page {
      display: flex;
      flex-direction: column;
      gap: 24px;
      padding: 1rem;
      max-width: 1200px;
      width: 100%;
      box-sizing: border-box;
      margin: 0 auto;

      @media (min-width: 768px) {
        padding: 1.5rem;
      }
    }

    /* 1. Top Header */
    .detail-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
      padding: 12px 16px;
      border-radius: 12px;
      background: var(--mat-sys-surface-container);
      border: 1px solid var(--mat-sys-outline-variant);
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      flex: 1 1 220px;
    }

    .back-btn,
    .more-menu-btn,
    .refresh-icon-btn {
      min-width: 48px;
      min-height: 48px;
      flex-shrink: 0;
    }

    .title-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 0;
      flex: 1 1 auto;
    }

    .title-line {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      min-width: 0;
    }

    .asset-title {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 700;
      line-height: 1.3;
      color: var(--mat-sys-on-surface);
      overflow-wrap: anywhere;

      @media (min-width: 768px) {
        font-size: 1.375rem;
      }
    }

    .ticker-pill {
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 0.8125rem;
      font-weight: 700;
      background: var(--mat-sys-surface-container-highest);
      color: var(--mat-sys-primary);
      flex-shrink: 0;
    }

    .asset-subtitle {
      font-size: 0.8125rem;
      line-height: 1.45;
      color: var(--mat-sys-on-surface-variant);
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-left: auto;
      flex-wrap: wrap;
    }

    .primary-action-btn,
    .section-action-btn {
      min-height: 44px;
      white-space: nowrap;
    }

    /* 2. Hero Summary */
    .hero-summary-section {
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-width: 0;
    }

    .hero-metrics-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 16px;

      @media (min-width: 768px) and (max-width: 1023px) {
        grid-template-columns: repeat(2, minmax(0, 1fr));

        .total-card {
          grid-column: 1 / -1;
        }
      }

      @media (min-width: 1024px) {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
    }

    .hero-card {
      background: var(--mat-sys-surface-container);
      min-width: 0;
    }

    .share-big-number {
      font-size: clamp(1.375rem, 4vw, 1.625rem);
      font-weight: 700;
      line-height: 1.2;
      color: var(--mat-sys-on-surface);
      overflow-wrap: anywhere;
    }

    .base-equivalent {
      font-size: 1rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .microcopy {
      margin: 4px 0 0;
      font-size: 0.75rem;
      line-height: 1.4;
      color: var(--mat-sys-on-surface-variant);
    }

    .goal-eligibility-strip {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid var(--mat-sys-outline-variant);

      .eligibility-label {
        font-size: 0.75rem;
        font-weight: 500;
      }
    }

    .next-vest-pill {
      display: inline-flex;
      align-items: flex-start;
      gap: 6px;
      margin-top: 8px;
      padding: 6px 10px;
      border-radius: 12px;
      max-width: 100%;
      box-sizing: border-box;
      font-size: 0.75rem;
      line-height: 1.35;
      background: var(--mat-sys-surface-container-high);
      color: var(--mat-sys-tertiary);

      mat-icon {
        font-size: 0.9375rem;
        width: 0.9375rem;
        height: 0.9375rem;
        flex-shrink: 0;
        margin-top: 1px;
      }
    }

    .grants-count-line {
      font-size: 0.875rem;
      color: var(--mat-sys-on-surface-variant);
    }

    .deducted-sales-pill {
      display: flex;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 8px;
      padding: 6px 10px;
      border-radius: 8px;
      font-size: 0.75rem;
      background: var(--mat-sys-surface-container-low);
      color: var(--mat-sys-on-surface-variant);
    }

    .market-status-strip {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
      padding: 10px 14px;
      border-radius: 10px;
      background: var(--mat-sys-surface-container-low);
      border: 1px solid var(--mat-sys-outline-variant);
      min-width: 0;
    }

    .status-badges-wrap {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
      min-width: 0;
      flex: 1 1 200px;
    }

    .rate-summary {
      font-size: 0.8125rem;
      color: var(--mat-sys-on-surface-variant);
      overflow-wrap: anywhere;
    }

    /* 3. Baseline Active Banner */
    .baseline-active-banner {
      background: var(--mat-sys-tertiary-container);
      color: var(--mat-sys-on-tertiary-container);
      border-color: var(--mat-sys-tertiary);
    }

    .baseline-banner-layout {
      display: flex;
      flex-direction: column;
      gap: 12px;

      @media (min-width: 720px) {
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
      }
    }

    .baseline-banner-copy {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      font-size: 0.875rem;
      line-height: 1.45;
      min-width: 0;
    }

    .baseline-icon {
      flex-shrink: 0;
      margin-top: 2px;
    }

    .baseline-banner-actions {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
      flex-shrink: 0;
    }

    /* Responsive Detail Body */
    .detail-main-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 24px;

      @media (min-width: 1024px) {
        grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
        align-items: start;
      }
    }

    .timeline-col,
    .grants-and-sales-col {
      min-width: 0;
    }

    .grants-and-sales-col {
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    .grants-section,
    .sales-section {
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-width: 0;
    }

    .section-header-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 8px;
    }

    .section-title {
      margin: 0;
      font-size: 1.125rem;
      font-weight: 600;
      color: var(--mat-sys-on-surface);
    }

    .section-subtitle {
      margin: 2px 0 0;
      font-size: 0.8125rem;
      color: var(--mat-sys-on-surface-variant);
    }

    .grant-panel {
      border-radius: 10px !important;
      margin-bottom: 8px;
      background: var(--mat-sys-surface-container);

      ::ng-deep .mat-expansion-panel-header {
        height: auto !important;
        min-height: 52px;
        padding-top: 10px;
        padding-bottom: 10px;
      }

      ::ng-deep .mat-content {
        flex-wrap: wrap;
        gap: 6px 12px;
        min-width: 0;
      }
    }

    .grant-panel-title {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
      font-weight: 600;
      flex: 1 1 140px;
      min-width: 0;
      margin-right: 0;
    }

    .custom-chip {
      font-size: 0.6875rem;
      padding: 2px 6px;
      border-radius: 999px;
      background: var(--mat-sys-surface-container-highest);
      color: var(--mat-sys-on-surface-variant);
    }

    .grant-panel-desc {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 4px 12px;
      font-size: 0.8125rem;
      flex: 1 1 auto;
      min-width: 0;
      margin-right: 0;
    }

    .progress-badge {
      font-weight: 600;
      color: var(--mat-sys-primary);
    }

    .grant-panel-body {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding-top: 8px;
    }

    .schedule-meta-row {
      display: flex;
      flex-wrap: wrap;
      gap: 10px 16px;
      font-size: 0.8125rem;
      color: var(--mat-sys-on-surface-variant);
    }

    .tranches-table-scroll {
      width: 100%;
      overflow-x: auto;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 8px;
    }

    .tranches-mini-table {
      display: flex;
      flex-direction: column;
      min-width: 380px;
    }

    .mini-thead,
    .mini-trow {
      display: grid;
      grid-template-columns: minmax(92px, 1fr) minmax(76px, 1fr) auto minmax(88px, 1fr);
      gap: 8px;
      padding: 8px 12px;
      font-size: 0.8125rem;
      align-items: center;
    }

    .mini-thead {
      background: var(--mat-sys-surface-container-high);
      font-weight: 600;
      color: var(--mat-sys-on-surface-variant);
    }

    .mini-trow {
      border-top: 1px solid var(--mat-sys-outline-variant);
      background: var(--mat-sys-surface);
    }

    .projected-row {
      font-style: italic;
      color: var(--mat-sys-tertiary);
    }

    .vested-pill {
      color: var(--worth-it-positive, #1b6b3a);
      font-weight: 600;
    }

    .projected-pill {
      color: var(--mat-sys-tertiary);
      font-style: italic;
      font-size: 0.75rem;
    }

    .grant-panel-actions {
      display: flex;
      justify-content: flex-end;
      flex-wrap: wrap;
      gap: 8px;
      padding-top: 4px;
    }

    /* Sales History */
    .empty-sales-card {
      background: var(--mat-sys-surface-container-low);
    }

    .empty-sales-body {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      color: var(--mat-sys-on-surface-variant);
      font-size: 0.875rem;

      mat-icon {
        flex-shrink: 0;
      }

      p {
        margin: 0;
      }
    }

    .sales-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .sale-item-card {
      background: var(--mat-sys-surface-container);
    }

    .sale-item-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 8px 12px;
    }

    .sale-left {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .sale-date {
      font-size: 0.75rem;
      color: var(--mat-sys-on-surface-variant);
    }

    .sale-shares {
      font-size: 0.9375rem;
      color: var(--mat-sys-on-surface);
    }

    .deducted-note {
      font-size: 0.75rem;
      color: var(--mat-sys-on-surface-variant);
    }

    .sale-right {
      text-align: right;
      margin-left: auto;
    }

    .sale-gross {
      font-weight: 600;
      color: var(--mat-sys-on-surface);
    }

    .sale-pln {
      font-size: 0.75rem;
      color: var(--mat-sys-on-surface-variant);
    }

    .positive-icon {
      color: var(--worth-it-positive, #1b6b3a) !important;
    }

    .projected-icon {
      color: var(--mat-sys-tertiary) !important;
    }

    .danger-menu-item {
      color: var(--mat-sys-error);
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
    }

    .mono-nums {
      font-family: 'Roboto Mono', monospace;
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class EmployerStockDetail {
  protected readonly store = inject(WorthItStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);

  protected readonly assetId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('assetId') ?? '')),
    { initialValue: this.route.snapshot.paramMap.get('assetId') ?? '' }
  );

  protected readonly asset = computed(() =>
    this.store
      .assets()
      .find((a) => a.id === this.assetId() && a.type === 'employer_stock')
  );

  protected readonly tickerSymbol = computed(
    () => this.asset()?.employerStock?.tickerSymbol || 'STOCK'
  );

  protected readonly baseCurrency = computed(
    () => this.store.settings().baseCurrency || 'PLN'
  );

  protected readonly valuation = computed(() =>
    this.store.assetValuations().get(this.assetId())
  );

  protected readonly snapshot = computed(() =>
    this.store.employerStockSnapshots().get(this.assetId())
  );

  protected readonly grants = computed<StockGrant[]>(
    () => this.store.grantsByAsset().get(this.assetId()) ?? []
  );

  protected readonly linkedSales = computed<StockSale[]>(() =>
    this.store
      .stockSales()
      .filter((s) => s.sourceAssetId === this.assetId())
      .slice()
      .sort((a, b) => b.saleDate.localeCompare(a.saleDate))
  );

  protected readonly unvestedValueInBase = computed(() => {
    const unvested = this.snapshot()?.unvestedShares ?? 0;
    const price = this.valuation()?.unitPrice ?? 0;
    const fx = this.valuation()?.fxRateToBase ?? 1;
    return Math.round(unvested * price * fx * 100) / 100;
  });

  protected readonly hasActiveBaseline = computed(() => {
    const details = this.asset()?.employerStock;
    return (
      details?.vestedSharesBaseline !== undefined &&
      Boolean(details?.vestedSharesBaselineDate)
    );
  });

  protected readonly priceSource = computed<MarketDataSource>(() => {
    const st = this.valuation()?.priceStatus;
    return st === 'manual' || st === 'missing' ? 'manual' : 'twelve_data';
  });

  protected readonly fxSource = computed<MarketDataSource>(() => {
    const st = this.valuation()?.fxStatus;
    return st === 'manual' || st === 'missing' ? 'manual' : 'nbp';
  });

  protected getGrantVestedShares(grant: StockGrant): number {
    return vestedSharesAt([grant], this.store.today());
  }

  protected isTrancheVested(vestDate: string): boolean {
    return compareIsoDates(vestDate, this.store.today()) <= 0;
  }

  protected getTranchePlnValue(shares: number): number {
    const price = this.valuation()?.unitPrice ?? 0;
    const fx = this.valuation()?.fxRateToBase ?? 1;
    return Math.round((Number(shares) || 0) * price * fx * 100) / 100;
  }

  protected async onToggleGoalEligible(): Promise<void> {
    const current = this.asset();
    if (!current) return;
    await this.store.toggleGoalEligible(current.id, !current.isGoalEligible);
  }

  protected async onRefreshMarketData(): Promise<void> {
    try {
      await this.store.refreshMarketData({ force: true });
    } catch {
      // Errors are surfaced via lastMarketRefresh and status badges
    }
  }

  protected openEditAssetDialog(): void {
    const current = this.asset();
    if (!current) return;
    this.dialog.open(EmployerStockFormDialog, {
      data: { asset: current },
      width: '520px',
      maxWidth: '95vw',
    });
  }

  protected openBaselineDialog(): void {
    const current = this.asset();
    if (!current) return;
    this.dialog.open(VestedBaselineDialog, {
      data: { asset: current },
      width: '500px',
      maxWidth: '95vw',
    });
  }

  protected async onClearBaseline(): Promise<void> {
    const current = this.asset();
    if (!current) return;
    await this.store.clearVestedSharesBaseline(current.id);
  }

  protected openAddGrantDialog(): void {
    const current = this.asset();
    if (!current) return;
    this.dialog.open(GrantEditorDialog, {
      data: { assetId: current.id },
      width: '740px',
      maxWidth: '95vw',
    });
  }

  protected openEditGrantDialog(grant: StockGrant): void {
    const current = this.asset();
    if (!current) return;
    this.dialog.open(GrantEditorDialog, {
      data: { assetId: current.id, grant },
      width: '740px',
      maxWidth: '95vw',
    });
  }

  protected onDeleteGrant(grant: StockGrant): void {
    const ref = this.dialog.open(ConfirmDialog, {
      data: {
        title: 'Delete stock grant',
        message: `Are you sure you want to delete "${grant.name || 'this stock grant'}" (${grant.totalShares} sh)?`,
        confirmText: 'Delete',
        destructive: true,
      },
    });

    ref.afterClosed().subscribe(async (confirmed) => {
      if (confirmed) {
        await this.store.deleteStockGrant(grant.id);
      }
    });
  }

  protected openRecordSaleDialog(): void {
    const current = this.asset();
    if (!current) return;

    const unitPrice = this.valuation()?.unitPrice ?? 0;
    const prefilledSale: Partial<StockSale> = {
      sourceAssetId: current.id,
      companyOrTicker: current.employerStock?.tickerSymbol || current.name,
      currency: current.currency,
      pricePerShare: unitPrice > 0 ? unitPrice : 0,
      sharesSold: 1,
      saleDate: this.store.today(),
    };

    const ref = this.dialog.open(StockSaleDialog, {
      data: {
        preselectedAssetId: current.id,
        sale: prefilledSale as StockSale,
      },
      width: '560px',
      maxWidth: '95vw',
    });

    ref.afterClosed().subscribe(async (res: StockSaleDialogResult | undefined) => {
      if (!res) return;
      const sourceAssetId =
        (res as StockSaleDialogResult & { sourceAssetId?: string }).sourceAssetId ??
        current.id;
      await this.store.addStockSale({
        ...res,
        sourceAssetId,
      });
    });
  }

  protected onDeleteAsset(): void {
    const current = this.asset();
    if (!current) return;

    const ref = this.dialog.open(ConfirmDialog, {
      data: {
        title: 'Delete employer stock asset',
        message: `Are you sure you want to delete "${current.name}"? All associated stock grants will also be deleted.`,
        confirmText: 'Delete',
        destructive: true,
      },
    });

    ref.afterClosed().subscribe(async (confirmed) => {
      if (confirmed) {
        await this.store.deleteAsset(current.id);
        void this.router.navigate(['/assets']);
      }
    });
  }
}

export { EmployerStockDetail as EmployerStockDetailComponent };
