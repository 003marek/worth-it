import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';
import { StockSale } from '../../core/models/worth-it.model';
import { WorthItStore } from '../../core/stores/worth-it.store';
import { ConfirmDialog } from '../../shared/components/confirm-dialog/confirm-dialog';
import { EmptyState } from '../../shared/components/empty-state/empty-state';
import { MetricTile } from '../../shared/components/metric-tile/metric-tile';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { StockSaleDialog } from './stock-sale-dialog';

@Component({
  selector: 'app-stock-sales',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatIconModule,
    MatTableModule,
    MatTooltipModule,
    MetricTile,
    EmptyState,
    MoneyPipe,
  ],
  template: `
    <div class="page stock-sales-page">
      <!-- Spec §10.2: Explicit standalone notice banner -->
      <div class="standalone-banner" role="note">
        <mat-icon class="banner-icon">info</mat-icon>
        <div class="banner-body">
          <strong class="banner-title">Standalone historical log</strong>
          <p class="banner-text">
            Stock sales recorded here do not automatically modify your asset balances or total wealth.
            Record taxes/fees as ordinary expenses and update asset balances manually when desired to prevent double counting.
          </p>
        </div>
      </div>

      <!-- Header with Action -->
      <header class="page-header">
        <div class="header-titles">
          <h1 class="page-title">Stock Sales</h1>
          <p class="page-subtitle">
            Historical record of your equity and stock transactions.
          </p>
        </div>
        <button
          mat-flat-button
          color="primary"
          class="add-sale-btn"
          (click)="openAddDialog()"
        >
          <mat-icon>add</mat-icon>
          Record stock sale
        </button>
      </header>

      <!-- Summary Tiles (MetricTile) -->
      <section class="tiles-grid" aria-label="Stock sales summary">
        <app-metric-tile
          label="Total sales count"
          [value]="totalSalesCount()"
          hint="Recorded sale transactions"
          currency="PLN"
          icon="receipt_long"
        />

        <app-metric-tile
          label="Total PLN equivalent"
          [value]="totalPlnEquivalent()"
          hint="Sum of proceeds in PLN"
          currency="PLN"
          icon="account_balance_wallet"
          tone="positive"
        />

        @for (item of currencyBreakdown(); track item.currency) {
          <app-metric-tile
            [label]="'Gross (' + item.currency + ')'"
            [value]="item.grossValue"
            [currency]="item.currency"
            [hint]="item.count + ' sale(s) in ' + item.currency"
            icon="payments"
          />
        }
      </section>

      <!-- Sales Table or Empty State -->
      <section class="sales-list-section">
        @if (sortedStockSales().length === 0) {
          <app-empty-state
            icon="show_chart"
            title="No stock sales recorded"
            message="Keep a clean historical log of all your stock and RSU sales without altering asset balances."
          >
            <button mat-flat-button color="primary" (click)="openAddDialog()">
              <mat-icon>add</mat-icon>
              Record your first sale
            </button>
          </app-empty-state>
        } @else {
          <!-- Desktop / Tablet Table View -->
          <div class="table-container mat-elevation-z1">
            <table mat-table [dataSource]="sortedStockSales()" class="sales-table">
              <!-- Date Column -->
              <ng-container matColumnDef="saleDate">
                <th mat-header-cell *matHeaderCellDef>Date</th>
                <td mat-cell *matCellDef="let sale" class="date-cell">
                  {{ sale.saleDate }}
                </td>
              </ng-container>

              <!-- Company / Ticker Column -->
              <ng-container matColumnDef="companyOrTicker">
                <th mat-header-cell *matHeaderCellDef>Company / Ticker</th>
                <td mat-cell *matCellDef="let sale" class="company-cell">
                  <strong>{{ sale.companyOrTicker }}</strong>
                </td>
              </ng-container>

              <!-- Shares Sold Column -->
              <ng-container matColumnDef="sharesSold">
                <th mat-header-cell *matHeaderCellDef class="numeric-header">Shares</th>
                <td mat-cell *matCellDef="let sale" class="numeric-cell">
                  {{ sale.sharesSold }}
                </td>
              </ng-container>

              <!-- Price Per Share Column -->
              <ng-container matColumnDef="pricePerShare">
                <th mat-header-cell *matHeaderCellDef class="numeric-header">Price / Share</th>
                <td mat-cell *matCellDef="let sale" class="numeric-cell">
                  {{ sale.pricePerShare | money:sale.currency:2 }}
                </td>
              </ng-container>

              <!-- Gross Value Column -->
              <ng-container matColumnDef="grossValue">
                <th mat-header-cell *matHeaderCellDef class="numeric-header">Gross Value</th>
                <td mat-cell *matCellDef="let sale" class="numeric-cell gross-cell">
                  {{ sale.grossValue | money:sale.currency }}
                </td>
              </ng-container>

              <!-- PLN Equivalent Column -->
              <ng-container matColumnDef="plnEquivalent">
                <th mat-header-cell *matHeaderCellDef class="numeric-header">PLN Equivalent</th>
                <td mat-cell *matCellDef="let sale" class="numeric-cell pln-cell">
                  {{ sale.plnEquivalent ? (sale.plnEquivalent | money:'PLN') : '—' }}
                </td>
              </ng-container>

              <!-- Notes Column -->
              <ng-container matColumnDef="notes">
                <th mat-header-cell *matHeaderCellDef>Notes</th>
                <td mat-cell *matCellDef="let sale" class="notes-cell">
                  {{ sale.notes || '—' }}
                </td>
              </ng-container>

              <!-- Actions Column -->
              <ng-container matColumnDef="actions">
                <th mat-header-cell *matHeaderCellDef class="actions-header">Actions</th>
                <td mat-cell *matCellDef="let sale" class="actions-cell">
                  <button
                    mat-icon-button
                    color="primary"
                    matTooltip="Edit sale"
                    (click)="openEditDialog(sale)"
                    aria-label="Edit sale"
                  >
                    <mat-icon>edit</mat-icon>
                  </button>
                  <button
                    mat-icon-button
                    color="warn"
                    matTooltip="Delete sale"
                    (click)="deleteSale(sale)"
                    aria-label="Delete sale"
                  >
                    <mat-icon>delete</mat-icon>
                  </button>
                </td>
              </ng-container>

              <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
              <tr mat-row *matRowDef="let row; columns: displayedColumns"></tr>
            </table>
          </div>

          <!-- Mobile Cards View -->
          <div class="mobile-cards">
            @for (sale of sortedStockSales(); track sale.id) {
              <mat-card class="mobile-sale-card">
                <mat-card-header>
                  <mat-card-title>{{ sale.companyOrTicker }}</mat-card-title>
                  <mat-card-subtitle>{{ sale.saleDate }}</mat-card-subtitle>
                </mat-card-header>
                <mat-card-content class="mobile-card-content">
                  <div class="mobile-row">
                    <span class="mobile-label">Shares:</span>
                    <span>{{ sale.sharesSold }} @ {{ sale.pricePerShare | money:sale.currency:2 }}</span>
                  </div>
                  <div class="mobile-row">
                    <span class="mobile-label">Gross Value:</span>
                    <strong>{{ sale.grossValue | money:sale.currency }}</strong>
                  </div>
                  @if (sale.plnEquivalent) {
                    <div class="mobile-row">
                      <span class="mobile-label">PLN Equivalent:</span>
                      <span class="pln-text">{{ sale.plnEquivalent | money:'PLN' }}</span>
                    </div>
                  }
                  @if (sale.notes) {
                    <div class="mobile-notes">{{ sale.notes }}</div>
                  }
                </mat-card-content>
                <mat-card-actions align="end">
                  <button mat-button color="primary" (click)="openEditDialog(sale)">
                    <mat-icon>edit</mat-icon> Edit
                  </button>
                  <button mat-button color="warn" (click)="deleteSale(sale)">
                    <mat-icon>delete</mat-icon> Delete
                  </button>
                </mat-card-actions>
              </mat-card>
            }
          </div>
        }
      </section>
    </div>
  `,
  styles: [
    `
      .stock-sales-page {
        display: flex;
        flex-direction: column;
        gap: 20px;
      }
      .standalone-banner {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        background-color: var(--mat-sys-surface-container);
        border: 1px solid var(--mat-sys-outline-variant);
        border-left: 4px solid var(--mat-sys-primary);
        padding: 14px 18px;
        border-radius: 8px;
      }
      .banner-icon {
        color: var(--mat-sys-primary);
        font-size: 1.5rem;
        width: 1.5rem;
        height: 1.5rem;
        margin-top: 2px;
        flex-shrink: 0;
      }
      .banner-body {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .banner-title {
        font-size: 0.9375rem;
        color: var(--mat-sys-on-surface);
      }
      .banner-text {
        margin: 0;
        font-size: 0.875rem;
        color: var(--mat-sys-on-surface-variant);
        line-height: 1.45;
      }
      .page-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 12px;
      }
      .page-title {
        margin: 0;
        font-size: 1.75rem;
        font-weight: 600;
        color: var(--mat-sys-on-surface);
      }
      .page-subtitle {
        margin: 4px 0 0;
        font-size: 0.9375rem;
        color: var(--mat-sys-on-surface-variant);
      }
      .tiles-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 16px;
      }
      .sales-list-section {
        margin-top: 8px;
      }
      .table-container {
        border-radius: 12px;
        overflow-x: auto;
        background-color: var(--mat-sys-surface-container-low);
      }
      .sales-table {
        width: 100%;
        border-collapse: collapse;
      }
      .numeric-header,
      .numeric-cell {
        text-align: right;
      }
      .actions-header,
      .actions-cell {
        text-align: center;
        white-space: nowrap;
      }
      .company-cell {
        color: var(--mat-sys-on-surface);
      }
      .gross-cell {
        font-weight: 500;
      }
      .pln-cell {
        font-weight: 500;
        color: var(--mat-sys-primary);
      }
      .notes-cell {
        max-width: 220px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        color: var(--mat-sys-on-surface-variant);
        font-size: 0.875rem;
      }
      .mobile-cards {
        display: none;
        flex-direction: column;
        gap: 12px;
      }
      .mobile-sale-card {
        border-radius: 12px;
      }
      .mobile-card-content {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding-top: 8px;
      }
      .mobile-row {
        display: flex;
        justify-content: space-between;
        font-size: 0.875rem;
      }
      .mobile-label {
        color: var(--mat-sys-on-surface-variant);
      }
      .pln-text {
        font-weight: 600;
        color: var(--mat-sys-primary);
      }
      .mobile-notes {
        font-size: 0.8125rem;
        font-style: italic;
        color: var(--mat-sys-on-surface-variant);
        background-color: var(--mat-sys-surface-container);
        padding: 6px 10px;
        border-radius: 4px;
        margin-top: 4px;
      }
      @media (max-width: 768px) {
        .table-container {
          display: none;
        }
        .mobile-cards {
          display: flex;
        }
      }
    `,
  ],
})
export class StockSales {
  protected readonly store = inject(WorthItStore);
  private readonly dialog = inject(MatDialog);

  protected readonly displayedColumns: string[] = [
    'saleDate',
    'companyOrTicker',
    'sharesSold',
    'pricePerShare',
    'grossValue',
    'plnEquivalent',
    'notes',
    'actions',
  ];

  /** Sales sorted by saleDate descending (spec §10.2). */
  readonly sortedStockSales = computed<StockSale[]>(() => {
    return [...this.store.stockSales()].sort((a, b) =>
      b.saleDate.localeCompare(a.saleDate)
    );
  });

  /** Total count of sales. */
  readonly totalSalesCount = computed<number>(() => {
    return this.store.stockSales().length;
  });

  /** Sum of plnEquivalent ?? (currency === 'PLN' ? grossValue : 0). */
  readonly totalPlnEquivalent = computed<number>(() => {
    return this.store.stockSales().reduce((sum, sale) => {
      const val =
        sale.plnEquivalent ?? (sale.currency === 'PLN' ? sale.grossValue : 0);
      return sum + val;
    }, 0);
  });

  /** Gross value breakdown by currency. */
  readonly currencyBreakdown = computed<
    Array<{ currency: string; grossValue: number; count: number }>
  >(() => {
    const map = new Map<string, { grossValue: number; count: number }>();
    for (const sale of this.store.stockSales()) {
      const curr = sale.currency || 'USD';
      const entry = map.get(curr) ?? { grossValue: 0, count: 0 };
      entry.grossValue += sale.grossValue;
      entry.count += 1;
      map.set(curr, entry);
    }
    return Array.from(map.entries()).map(([currency, data]) => ({
      currency,
      grossValue: Math.round(data.grossValue * 100) / 100,
      count: data.count,
    }));
  });

  async openAddDialog(): Promise<void> {
    const dialogRef = this.dialog.open(StockSaleDialog, {
      data: {},
      autoFocus: 'first-tabbable',
    });
    const result = await firstValueFrom(dialogRef.afterClosed());
    if (result) {
      await this.store.addStockSale(result);
    }
  }

  async openEditDialog(sale: StockSale): Promise<void> {
    const dialogRef = this.dialog.open(StockSaleDialog, {
      data: { sale },
      autoFocus: 'first-tabbable',
    });
    const result = await firstValueFrom(dialogRef.afterClosed());
    if (result) {
      await this.store.updateStockSale(sale.id, result);
    }
  }

  async deleteSale(sale: StockSale): Promise<void> {
    const dialogRef = this.dialog.open(ConfirmDialog, {
      data: {
        title: 'Delete Stock Sale',
        message: `Are you sure you want to delete the sale record for ${sale.companyOrTicker}? This action cannot be undone.`,
        confirmText: 'Delete',
        cancelText: 'Cancel',
        destructive: true,
      },
    });
    const confirmed = await firstValueFrom(dialogRef.afterClosed());
    if (confirmed) {
      await this.store.deleteStockSale(sale.id);
    }
  }
}
