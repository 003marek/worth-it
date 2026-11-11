import 'fake-indexeddb/auto';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { submit } from '@angular/forms/signals';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { of } from 'rxjs';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { FinancialCalculatorService } from '../../core/services/financial-calculator.service';
import { StorageService } from '../../core/services/storage.service';
import { WorthItStore } from '../../core/stores/worth-it.store';
import { Assets } from './assets';
import { AssetFormDialog } from './asset-form-dialog';
import { AssetHistoryDialog } from './asset-history-dialog';
import { UpdateBalanceDialog } from './update-balance-dialog';

describe('Assets Feature', () => {
  let store: InstanceType<typeof WorthItStore>;
  let storage: StorageService;
  let calculator: FinancialCalculatorService;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [Assets, AssetFormDialog, UpdateBalanceDialog, AssetHistoryDialog],
      providers: [
        StorageService,
        FinancialCalculatorService,
        WorthItStore,
      ],
    });

    storage = TestBed.inject(StorageService);
    await storage.open();
    await storage.clearAllData();

    calculator = TestBed.inject(FinancialCalculatorService);
    store = TestBed.inject(WorthItStore);
    await store.loadAll();
  });

  afterEach(async () => {
    await storage.clearAllData();
  });

  describe('1. Asset Creation', () => {
    it('creates an asset with initial balance history', async () => {
      const asset = await store.addAsset(
        {
          name: 'PKO Main Account',
          type: 'bank_account',
          balance: 25000,
          currency: 'PLN',
          isGoalEligible: true,
        },
        'Initial setup note'
      );

      expect(asset.id).toBeTruthy();
      expect(asset.name).toBe('PKO Main Account');
      expect(asset.balance).toBe(25000);
      expect(asset.currency).toBe('PLN');
      expect(asset.isGoalEligible).toBe(true);

      expect(store.assets()).toHaveLength(1);
      expect(store.assets()[0].id).toBe(asset.id);

      // Verify initial history entry was created
      const history = store.assetHistory().filter((h) => h.assetId === asset.id);
      expect(history).toHaveLength(1);
      expect(history[0].balance).toBe(25000);
      expect(history[0].note).toBe('Initial setup note');
    });

    it('creates foreign currency asset and converts to base currency for total wealth', async () => {
      const usdAsset = await store.addAsset({
        name: 'Interactive Brokers USD',
        type: 'stocks_etf',
        balance: 1000,
        currency: 'USD',
        isGoalEligible: true,
      });

      // Update exchange rate: 1 USD = 4.2 PLN
      await store.updateAsset(usdAsset.id, { exchangeRateToBase: 4.2 });

      expect(store.assets()[0].balance).toBe(1000);
      expect(store.assets()[0].exchangeRateToBase).toBe(4.2);

      const baseValue = calculator.assetValueInBase(store.assets()[0]);
      expect(baseValue).toBe(4200);
      expect(store.wealthSummary().totalWealth).toBe(4200);
    });
  });

  describe('2. Goal Eligibility Toggle', () => {
    it('toggles goal eligibility and recalculates eligible and excluded wealth dynamically', async () => {
      const bank = await store.addAsset({
        name: 'Checking Account',
        type: 'bank_account',
        balance: 30000,
        isGoalEligible: true,
      });

      const retirement = await store.addAsset({
        name: 'PPK Retirement',
        type: 'retirement',
        balance: 20000,
        isGoalEligible: false,
      });

      expect(store.wealthSummary().totalWealth).toBe(50000);
      expect(store.wealthSummary().goalEligibleWealth).toBe(30000);
      expect(store.wealthSummary().excludedWealth).toBe(20000);

      // Toggle retirement to be goal-eligible
      await store.updateAsset(retirement.id, { isGoalEligible: true });

      expect(store.wealthSummary().goalEligibleWealth).toBe(50000);
      expect(store.wealthSummary().excludedWealth).toBe(0);

      // Toggle bank account off from goals
      await store.updateAsset(bank.id, { isGoalEligible: false });

      expect(store.wealthSummary().goalEligibleWealth).toBe(20000);
      expect(store.wealthSummary().excludedWealth).toBe(30000);
    });
  });

  describe('3. Balance Update with History', () => {
    it('updates asset balance and records balance history with note', async () => {
      const asset = await store.addAsset({
        name: 'Savings',
        type: 'bank_account',
        balance: 10000,
        isGoalEligible: true,
      });

      expect(store.assetHistory()).toHaveLength(1);

      // Update balance to 14000
      await store.updateAssetBalance(asset.id, 14000, 'Monthly savings deposit');

      const updated = store.assets().find((a) => a.id === asset.id);
      expect(updated?.balance).toBe(14000);

      const history = store.assetHistory().filter((h) => h.assetId === asset.id);
      expect(history).toHaveLength(2);
      expect(history[1].balance).toBe(14000);
      expect(history[1].note).toBe('Monthly savings deposit');
    });

    it('adds manual snapshot to history and deletes history entry', async () => {
      const asset = await store.addAsset({
        name: 'Cash',
        type: 'cash',
        balance: 500,
      });

      const manualSnapshot = await store.addAssetHistory({
        assetId: asset.id,
        balance: 400,
        date: '2026-01-01T12:00:00Z',
        note: 'Year start count',
      });

      expect(store.assetHistory().filter((h) => h.assetId === asset.id)).toHaveLength(2);

      await store.deleteAssetHistory(manualSnapshot.id);

      expect(store.assetHistory().filter((h) => h.assetId === asset.id)).toHaveLength(1);
    });
  });

  describe('4. Marking Pending Records Reflected (Spec §7.2 / §17)', () => {
    it('accurately tracks pending adjustments and marks them reflected', async () => {
      await store.addAsset({
        name: 'Main Bank',
        type: 'bank_account',
        balance: 20000,
        isGoalEligible: true,
      });

      // Initially recorded assets = 20,000, pending = 0, total = 20,000
      expect(store.wealthSummary().recordedAssetsTotal).toBe(20000);
      expect(store.wealthSummary().pendingAdjustments).toBe(0);
      expect(store.wealthSummary().totalWealth).toBe(20000);

      // User received actual income of 8,000 PLN not yet reflected in bank balance
      await store.addIncomeRecord({
        name: 'Freelance Invoice',
        amount: 8000,
        currency: 'PLN',
        isActual: true,
        receivedDate: '2026-11-10',
      });

      // User paid actual expense of 3,000 PLN not yet reflected in bank balance
      await store.addExpenseRecord({
        categoryName: 'Electronics',
        amount: 3000,
        currency: 'PLN',
        isActual: true,
        date: '2026-11-10',
      });

      // Pending adjustments = +8,000 - 3,000 = +5,000 PLN
      expect(store.pendingIncomeRecords()).toHaveLength(1);
      expect(store.pendingExpenseRecords()).toHaveLength(1);
      expect(store.wealthSummary().pendingAdjustments).toBe(5000);
      expect(store.wealthSummary().totalWealth).toBe(25000);

      // Now user updates bank balance to 25,000 and marks pending records reflected
      await store.updateAssetBalance(
        store.assets()[0].id,
        25000,
        'Synced bank balance with mobile app'
      );
      await store.markRecordsReflected();

      // Pending adjustments should now be 0, total wealth still 25,000 without double counting!
      expect(store.pendingIncomeRecords()).toHaveLength(0);
      expect(store.pendingExpenseRecords()).toHaveLength(0);
      expect(store.wealthSummary().pendingAdjustments).toBe(0);
      expect(store.wealthSummary().recordedAssetsTotal).toBe(25000);
      expect(store.wealthSummary().totalWealth).toBe(25000);
    });

    it('updates balance dialog calls markRecordsReflected when submitted with true', async () => {
      const asset = await store.addAsset({
        name: 'Checking',
        type: 'bank_account',
        balance: 10000,
      });

      await store.addIncomeRecord({
        name: 'Bonus',
        amount: 5000,
        isActual: true,
        receivedDate: '2026-11-11',
      });

      expect(store.pendingIncomeRecords()).toHaveLength(1);

      // Set up dialog fixture with mock MatDialogRef and data
      const mockDialogRef = { close: vi.fn() };
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [UpdateBalanceDialog],
        providers: [
          StorageService,
          FinancialCalculatorService,
          WorthItStore,
          { provide: MatDialogRef, useValue: mockDialogRef },
          { provide: MAT_DIALOG_DATA, useValue: { asset } },
        ],
      });

      const dialogStore = TestBed.inject(WorthItStore);
      await dialogStore.loadAll();

      const fixture = TestBed.createComponent(UpdateBalanceDialog);
      fixture.detectChanges();
      const dialogInstance = fixture.componentInstance;

      expect(dialogInstance['pendingCount']()).toBe(1);
      expect(dialogInstance['hasPending']()).toBe(true);

      // Submit form
      await submit(dialogInstance['updateForm']);

      expect(mockDialogRef.close).toHaveBeenCalledWith(
        expect.objectContaining({
          newBalance: 10000,
          markedReflected: true,
        })
      );
    });
  });

  describe('5. Assets Component UI Integration', () => {
    let fixture: ComponentFixture<Assets>;
    let component: Assets;

    beforeEach(async () => {
      fixture = TestBed.createComponent(Assets);
      component = fixture.componentInstance;
      fixture.detectChanges();
    });

    it('renders empty state when no assets exist', () => {
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('app-empty-state')).toBeTruthy();
      expect(compiled.textContent).toContain('No assets recorded yet');
    });

    it('renders metric tiles and asset cards when assets are present', async () => {
      await store.addAsset({
        name: 'PKO Main Account',
        type: 'bank_account',
        balance: 15000,
        isGoalEligible: true,
      });
      await store.addAsset({
        name: 'Brokerage ETF',
        type: 'stocks_etf',
        balance: 25000,
        isGoalEligible: true,
      });

      fixture.detectChanges();
      await fixture.whenStable();

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('app-empty-state')).toBeFalsy();

      const cards = compiled.querySelectorAll('.asset-card');
      expect(cards.length).toBe(2);

      const metricTiles = compiled.querySelectorAll('app-metric-tile');
      expect(metricTiles.length).toBe(4);
    });

    it('shows pending adjustments banner when unreflected actual records exist', async () => {
      await store.addAsset({
        name: 'Checking',
        type: 'bank_account',
        balance: 10000,
      });

      await store.addIncomeRecord({
        name: 'Dividend',
        amount: 250,
        isActual: true,
        receivedDate: '2026-11-10',
      });

      fixture.detectChanges();
      await fixture.whenStable();

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('.pending-adjustments-banner')).toBeTruthy();
      expect(compiled.textContent).toContain('Unreflected actual income/expenses');

      // Click "Mark all reflected" button
      await component['onMarkAllReflected']();
      fixture.detectChanges();
      await fixture.whenStable();

      expect(compiled.querySelector('.pending-adjustments-banner')).toBeFalsy();
    });

    it('filters assets by goal eligibility and by asset type', async () => {
      await store.addAsset({
        name: 'Checking',
        type: 'bank_account',
        balance: 5000,
        isGoalEligible: true,
      });
      await store.addAsset({
        name: 'Emergency Gold/Cash',
        type: 'cash',
        balance: 2000,
        isGoalEligible: false,
      });

      fixture.detectChanges();
      expect(component['filteredAssets']()).toHaveLength(2);

      component['setGoalFilter']('goal_eligible');
      fixture.detectChanges();
      expect(component['filteredAssets']()).toHaveLength(1);
      expect(component['filteredAssets']()[0].name).toBe('Checking');

      component['setGoalFilter']('excluded');
      fixture.detectChanges();
      expect(component['filteredAssets']()).toHaveLength(1);
      expect(component['filteredAssets']()[0].name).toBe('Emergency Gold/Cash');

      component['setGoalFilter']('all');
      component['toggleTypeFilter']('bank_account');
      fixture.detectChanges();
      expect(component['filteredAssets']()).toHaveLength(1);
      expect(component['filteredAssets']()[0].name).toBe('Checking');

      component['clearTypeFilter']();
      fixture.detectChanges();
      expect(component['filteredAssets']()).toHaveLength(2);
    });

    it('toggles goal eligibility inline from the component', async () => {
      const asset = await store.addAsset({
        name: 'Crypto Vault',
        type: 'other',
        balance: 10000,
        isGoalEligible: false,
      });

      expect(store.assets()[0].isGoalEligible).toBe(false);

      await component['onToggleGoalEligible'](asset);

      expect(store.assets()[0].isGoalEligible).toBe(true);
    });
  });
});
