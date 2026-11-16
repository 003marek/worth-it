import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { AssetValuation } from '../../core/asset-types/asset-type-handler';
import { EmployerStockSnapshot, StockGrant } from '../../core/models/employer-stock.model';
import { MarketDataSource } from '../../core/models/market-data.model';
import { Asset, AssetType, StockSale } from '../../core/models/worth-it.model';
import { FinancialCalculatorService } from '../../core/services/financial-calculator.service';
import { WorthItStore } from '../../core/stores/worth-it.store';
import { ConfirmDialog } from '../../shared/components/confirm-dialog/confirm-dialog';
import { EmptyState } from '../../shared/components/empty-state/empty-state';
import { MarketStatusBadge } from '../../shared/components/market-status-badge/market-status-badge';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import {
  StockSaleDialog,
  StockSaleDialogResult,
} from '../stock-sales/stock-sale-dialog';
import { AssetDialogResult, AssetFormDialog } from './asset-form-dialog';
import { AssetHistoryDialog } from './asset-history-dialog';
import { EmployerStockFormDialog } from './employer-stock/employer-stock-form-dialog';
import { VestedBaselineDialog } from './employer-stock/vested-baseline-dialog';
import { UpdateBalanceDialog } from './update-balance-dialog';

export interface AssetTypeBreakdownItem {
  type: AssetType;
  label: string;
  icon: string;
  totalInBase: number;
  percentage: number;
  count: number;
}

export const ASSET_TYPE_INFO: Record<AssetType, { label: string; icon: string }> = {
  bank_account: { label: 'Bank account', icon: 'account_balance' },
  cash: { label: 'Cash', icon: 'payments' },
  stocks_etf: { label: 'Stocks / ETF', icon: 'trending_up' },
  employer_stock: { label: 'Employer stock', icon: 'trending_up' },
  retirement: { label: 'Retirement', icon: 'savings' },
  other: { label: 'Other', icon: 'category' },
};

export type GoalFilterOption = 'all' | 'goal_eligible' | 'excluded';

@Component({
  selector: 'app-assets',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    DecimalPipe,
    RouterLink,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatChipsModule,
    MatDialogModule,
    MatDividerModule,
    MatIconModule,
    MatMenuModule,
    MatSlideToggleModule,
    MatTooltipModule,
    EmptyState,
    MarketStatusBadge,
    MoneyPipe,
  ],
  templateUrl: './assets.html',
  styleUrl: './assets.scss',
})
export class Assets {
  protected readonly store = inject(WorthItStore);
  protected readonly calculator = inject(FinancialCalculatorService);
  private readonly dialog = inject(MatDialog);

  protected readonly goalFilter = signal<GoalFilterOption>('all');
  protected readonly selectedTypeFilter = signal<AssetType | null>(null);

  protected readonly wealthSummary = this.store.wealthSummary;
  protected readonly baseCurrency = computed(
    () => this.store.settings().baseCurrency || 'PLN'
  );

  protected readonly totalWealthHint = computed(() => {
    const w = this.wealthSummary();
    if (w.pendingAdjustments === 0) {
      return undefined;
    }
    const pipe = new MoneyPipe();
    const rec = pipe.transform(w.recordedAssetsTotal);
    const sign = w.pendingAdjustments > 0 ? '+' : '';
    const adj = pipe.transform(w.pendingAdjustments);
    return `${rec} recorded ${sign}${adj} pending`;
  });

  protected readonly typeBreakdown = computed<AssetTypeBreakdownItem[]>(() => {
    const assets = this.store.assets();
    const valuations = this.store.assetValuations();
    const recordedTotal = this.wealthSummary().recordedAssetsTotal;
    const types: AssetType[] = [
      'bank_account',
      'cash',
      'stocks_etf',
      'employer_stock',
      'retirement',
      'other',
    ];

    return types
      .map((type) => {
        const typeAssets = assets.filter((a) => a.type === type);
        const totalInBase = typeAssets.reduce(
          (sum, a) =>
            sum +
            (valuations.get(a.id)?.valueInBase ?? this.calculator.assetValueInBase(a)),
          0
        );
        const percentage = recordedTotal > 0 ? (totalInBase / recordedTotal) * 100 : 0;
        return {
          type,
          label: ASSET_TYPE_INFO[type].label,
          icon: ASSET_TYPE_INFO[type].icon,
          totalInBase,
          percentage: Math.round(percentage * 10) / 10,
          count: typeAssets.length,
        };
      })
      .filter((item) => item.count > 0);
  });

  protected readonly filteredAssets = computed(() => {
    let list = this.store.assets();
    const gf = this.goalFilter();
    if (gf === 'goal_eligible') {
      list = list.filter((a) => a.isGoalEligible);
    } else if (gf === 'excluded') {
      list = list.filter((a) => !a.isGoalEligible);
    }

    const tf = this.selectedTypeFilter();
    if (tf) {
      list = list.filter((a) => a.type === tf);
    }

    return list;
  });

  protected getTypeInfo(type: AssetType) {
    return ASSET_TYPE_INFO[type] ?? ASSET_TYPE_INFO.other;
  }

  protected getAssetBaseValue(asset: Asset): number {
    return (
      this.store.assetValuations().get(asset.id)?.valueInBase ??
      this.calculator.assetValueInBase(asset)
    );
  }

  protected getValuation(assetId: string): AssetValuation | undefined {
    return this.store.assetValuations().get(assetId);
  }

  protected getSnapshot(assetId: string): EmployerStockSnapshot | undefined {
    return this.store.employerStockSnapshots().get(assetId);
  }

  protected getGrants(assetId: string): StockGrant[] {
    return this.store.grantsByAsset().get(assetId) ?? [];
  }

  protected getUnvestedValueInBase(assetId: string): number {
    const unvested = this.getSnapshot(assetId)?.unvestedShares ?? 0;
    const val = this.getValuation(assetId);
    const price = val?.unitPrice ?? 0;
    const fx = val?.fxRateToBase ?? 1;
    return Math.round(unvested * price * fx * 100) / 100;
  }

  protected getPriceSource(assetId: string): MarketDataSource {
    const st = this.getValuation(assetId)?.priceStatus;
    return st === 'manual' || st === 'missing' ? 'manual' : 'twelve_data';
  }

  protected getFxSource(assetId: string): MarketDataSource {
    const st = this.getValuation(assetId)?.fxStatus;
    return st === 'manual' || st === 'missing' ? 'manual' : 'nbp';
  }

  protected setGoalFilter(filter: GoalFilterOption): void {
    this.goalFilter.set(filter);
  }

  protected toggleTypeFilter(type: AssetType): void {
    if (this.selectedTypeFilter() === type) {
      this.selectedTypeFilter.set(null);
    } else {
      this.selectedTypeFilter.set(type);
    }
  }

  protected clearTypeFilter(): void {
    this.selectedTypeFilter.set(null);
  }

  protected openAddAssetDialog(): void {
    const ref = this.dialog.open<AssetFormDialog, { asset?: Asset }, AssetDialogResult>(
      AssetFormDialog,
      {
        data: {},
        width: '480px',
      }
    );

    ref.afterClosed().subscribe(async (res) => {
      if (!res) return;
      if (res.type === 'employer_stock') {
        this.openAddEmployerStockDialog({
          initialName: res.name,
          initialCurrency: res.currency === 'PLN' ? 'USD' : res.currency,
          initialIsGoalEligible: res.isGoalEligible,
        });
        return;
      }

      const created = await this.store.addAsset(
        {
          name: res.name,
          type: res.type,
          balance: res.balance,
          currency: res.currency,
          exchangeRateToBase: res.exchangeRateToBase,
          isGoalEligible: res.isGoalEligible,
        },
        res.historyNote
      );

      if (res.currency !== 'PLN' && res.exchangeRateToBase !== undefined) {
        await this.store.updateAsset(created.id, {
          exchangeRateToBase: res.exchangeRateToBase,
        });
      }
    });
  }

  protected openAddEmployerStockDialog(opts?: {
    initialName?: string;
    initialCurrency?: string;
    initialIsGoalEligible?: boolean;
  }): void {
    this.dialog.open(EmployerStockFormDialog, {
      data: {
        initialName: opts?.initialName,
        initialCurrency: opts?.initialCurrency,
        initialIsGoalEligible: opts?.initialIsGoalEligible,
      },
      width: '520px',
    });
  }

  protected openEditAssetDialog(asset: Asset): void {
    if (asset.type === 'employer_stock') {
      this.dialog.open(EmployerStockFormDialog, {
        data: { asset },
        width: '520px',
      });
      return;
    }

    const ref = this.dialog.open<AssetFormDialog, { asset?: Asset }, AssetDialogResult>(
      AssetFormDialog,
      {
        data: { asset },
        width: '480px',
      }
    );

    ref.afterClosed().subscribe(async (res) => {
      if (!res) return;
      await this.store.updateAsset(
        asset.id,
        {
          name: res.name,
          type: res.type,
          balance: res.balance,
          currency: res.currency,
          exchangeRateToBase: res.exchangeRateToBase,
          isGoalEligible: res.isGoalEligible,
        },
        res.historyNote
      );
    });
  }

  protected openBaselineDialog(asset: Asset): void {
    this.dialog.open(VestedBaselineDialog, {
      data: { asset },
      width: '500px',
    });
  }

  protected openSellSharesDialog(asset: Asset): void {
    const unitPrice = this.getValuation(asset.id)?.unitPrice ?? 0;
    const prefilledSale: Partial<StockSale> = {
      sourceAssetId: asset.id,
      companyOrTicker: asset.employerStock?.tickerSymbol || asset.name,
      currency: asset.currency,
      pricePerShare: unitPrice > 0 ? unitPrice : 0,
      sharesSold: 1,
      saleDate: this.store.today(),
    };

    const ref = this.dialog.open(StockSaleDialog, {
      data: {
        preselectedAssetId: asset.id,
        sale: prefilledSale as StockSale,
      },
      width: '560px',
    });

    ref.afterClosed().subscribe(async (res: StockSaleDialogResult | undefined) => {
      if (!res) return;
      const sourceAssetId =
        (res as StockSaleDialogResult & { sourceAssetId?: string }).sourceAssetId ??
        asset.id;
      await this.store.addStockSale({
        ...res,
        sourceAssetId,
      });
    });
  }

  protected openUpdateBalanceDialog(asset: Asset): void {
    this.dialog.open(UpdateBalanceDialog, {
      data: { asset },
      width: '460px',
    });
  }

  protected openHistoryDialog(asset: Asset): void {
    this.dialog.open(AssetHistoryDialog, {
      data: { asset },
      width: '640px',
    });
  }

  protected async onToggleGoalEligible(asset: Asset): Promise<void> {
    await this.store.toggleGoalEligible(asset.id, !asset.isGoalEligible);
  }

  protected onDeleteAsset(asset: Asset): void {
    const ref = this.dialog.open(ConfirmDialog, {
      data: {
        title: 'Delete asset',
        message: `Are you sure you want to delete "${asset.name}"? Its balance history will also be deleted.`,
        confirmText: 'Delete',
        destructive: true,
      },
    });

    ref.afterClosed().subscribe(async (confirmed) => {
      if (confirmed) {
        await this.store.deleteAsset(asset.id);
      }
    });
  }

  protected async onMarkAllReflected(): Promise<void> {
    await this.store.markRecordsReflected();
  }
}
