import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Asset, AssetType } from '../../core/models/worth-it.model';
import { FinancialCalculatorService } from '../../core/services/financial-calculator.service';
import { WorthItStore } from '../../core/stores/worth-it.store';
import { ConfirmDialog } from '../../shared/components/confirm-dialog/confirm-dialog';
import { EmptyState } from '../../shared/components/empty-state/empty-state';
import { MetricTile } from '../../shared/components/metric-tile/metric-tile';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { AssetFormDialog, AssetDialogResult } from './asset-form-dialog';
import { AssetHistoryDialog } from './asset-history-dialog';
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
  employer_stock: { label: 'Employer stock', icon: 'domain' },
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
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatDialogModule,
    MatIconModule,
    MatMenuModule,
    MatSlideToggleModule,
    MatTooltipModule,
    MetricTile,
    EmptyState,
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
          (sum, a) => sum + this.calculator.assetValueInBase(a),
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
    return this.calculator.assetValueInBase(asset);
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

  protected openEditAssetDialog(asset: Asset): void {
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
    await this.store.updateAsset(asset.id, {
      isGoalEligible: !asset.isGoalEligible,
    });
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
