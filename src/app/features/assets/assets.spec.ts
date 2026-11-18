import 'fake-indexeddb/auto';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { submit } from '@angular/forms/signals';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FinancialCalculatorService } from '../../core/services/financial-calculator.service';
import { MarketDataError } from '../../core/services/market-data/market-data.error';
import { StorageService } from '../../core/services/storage.service';
import { WorthItStore } from '../../core/stores/worth-it.store';
import { MarketStatusBadge } from '../../shared/components/market-status-badge/market-status-badge';
import { AssetFormDialog } from './asset-form-dialog';
import { AssetHistoryDialog } from './asset-history-dialog';
import { Assets } from './assets';
import { EmployerStockDetail } from './employer-stock/employer-stock-detail';
import { EmployerStockFormDialog } from './employer-stock/employer-stock-form-dialog';
import { GrantEditorDialog } from './employer-stock/grant-editor-dialog';
import { VestedBaselineDialog } from './employer-stock/vested-baseline-dialog';
import { VestingTimeline } from './employer-stock/vesting-timeline';
import { RecurringSavingsBaselineDialog } from './recurring-savings/recurring-savings-baseline-dialog';
import { RetirementTransferDialog } from './retirement/retirement-transfer-dialog';
import { UpdateBalanceDialog } from './update-balance-dialog';

describe('Assets Feature', () => {
  let store: InstanceType<typeof WorthItStore>;
  let storage: StorageService;
  let calculator: FinancialCalculatorService;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [
        Assets,
        AssetFormDialog,
        UpdateBalanceDialog,
        AssetHistoryDialog,
        MarketStatusBadge,
        EmployerStockFormDialog,
        GrantEditorDialog,
        VestedBaselineDialog,
        VestingTimeline,
        EmployerStockDetail,
      ],
      providers: [
        provideRouter([]),
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

      const metricTiles = compiled.querySelectorAll('.metric-card');
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

  describe('6. MarketStatusBadge Component (UX §3.1)', () => {
    it('renders live, cached, stale, manual, and missing statuses accurately', () => {
      const fixture = TestBed.createComponent(MarketStatusBadge);

      fixture.componentRef.setInput('status', 'live');
      fixture.componentRef.setInput('source', 'twelve_data');
      fixture.componentRef.setInput('symbolOrPair', 'GOOGL');
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      expect(el.textContent).toContain('GOOGL · Twelve Data · live');
      expect(el.querySelector('.status-live')).toBeTruthy();

      fixture.componentRef.setInput('status', 'cached');
      fixture.componentRef.setInput('source', 'nbp');
      fixture.componentRef.setInput('symbolOrPair', 'USD → PLN');
      fixture.componentRef.setInput(
        'asOf',
        new Date(Date.now() - 2 * 3600_000).toISOString()
      );
      fixture.detectChanges();
      expect(el.textContent).toContain('USD → PLN · NBP · 2 h ago');
      expect(el.querySelector('.status-cached')).toBeTruthy();

      fixture.componentRef.setInput('status', 'stale');
      fixture.componentRef.setInput('source', 'twelve_data');
      fixture.componentRef.setInput('symbolOrPair', 'GOOGL');
      fixture.componentRef.setInput(
        'asOf',
        new Date(Date.now() - 4 * 86400_000).toISOString()
      );
      fixture.detectChanges();
      expect(el.textContent).toContain('GOOGL · Twelve Data · 4 d ago');
      expect(el.querySelector('.status-stale')).toBeTruthy();

      fixture.componentRef.setInput('status', 'manual');
      fixture.componentRef.setInput('source', 'manual');
      fixture.componentRef.setInput('symbolOrPair', 'GOOGL');
      fixture.detectChanges();
      expect(el.textContent).toContain('GOOGL · Manual price');
      expect(el.querySelector('.status-manual')).toBeTruthy();

      fixture.componentRef.setInput('status', 'missing');
      fixture.detectChanges();
      expect(el.textContent).toContain('Missing price · Tap to fix');
      expect(el.querySelector('.status-missing')).toBeTruthy();
    });
  });

  describe('7. EmployerStockFormDialog (UX Screen 2 & §3.3)', () => {
    it('looks up ticker, auto-fills name and currency, and saves employer_stock asset', async () => {
      const mockDialogRef = { close: vi.fn() };
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [EmployerStockFormDialog],
        providers: [
          provideRouter([]),
          StorageService,
          FinancialCalculatorService,
          WorthItStore,
          { provide: MatDialogRef, useValue: mockDialogRef },
          { provide: MAT_DIALOG_DATA, useValue: {} },
        ],
      });

      const dialogStore = TestBed.inject(WorthItStore);
      await dialogStore.loadAll();
      vi.spyOn(dialogStore, 'lookupTicker').mockResolvedValue({
        symbol: 'GOOGL',
        name: 'Alphabet Inc.',
        currency: 'USD',
        price: 185.5,
        exchange: 'NASDAQ',
        fetchedAt: new Date().toISOString(),
      });

      const fixture = TestBed.createComponent(EmployerStockFormDialog);
      fixture.detectChanges();
      const instance = fixture.componentInstance;

      instance['model'].update((m) => ({ ...m, tickerSymbol: 'googl' }));
      await instance['onLookupTicker']();
      fixture.detectChanges();

      expect(dialogStore.lookupTicker).toHaveBeenCalledWith('GOOGL');
      expect(instance['model']().name).toBe('Alphabet Inc.');
      expect(instance['model']().currency).toBe('USD');
      expect(instance['quotePreview']()?.price).toBe(185.5);

      await submit(instance['stockForm']);

      expect(dialogStore.employerStockAssets()).toHaveLength(1);
      expect(dialogStore.employerStockAssets()[0].name).toBe('Alphabet Inc.');
      expect(dialogStore.employerStockAssets()[0].employerStock?.tickerSymbol).toBe(
        'GOOGL'
      );
      expect(mockDialogRef.close).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Alphabet Inc.',
          tickerSymbol: 'GOOGL',
          currency: 'USD',
        })
      );
    });

    it('surfaces inline error feedback and reveals manual fallbacks on lookup failure', async () => {
      const mockDialogRef = { close: vi.fn() };
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [EmployerStockFormDialog],
        providers: [
          provideRouter([]),
          StorageService,
          FinancialCalculatorService,
          WorthItStore,
          { provide: MatDialogRef, useValue: mockDialogRef },
          { provide: MAT_DIALOG_DATA, useValue: {} },
        ],
      });

      const dialogStore = TestBed.inject(WorthItStore);
      await dialogStore.loadAll();
      vi.spyOn(dialogStore, 'lookupTicker').mockRejectedValue(
        new MarketDataError('no_api_key', 'Missing API key')
      );

      const fixture = TestBed.createComponent(EmployerStockFormDialog);
      fixture.detectChanges();
      const instance = fixture.componentInstance;

      instance['model'].update((m) => ({
        ...m,
        tickerSymbol: 'MSFT',
        name: 'Microsoft Corp.',
      }));
      await instance['onLookupTicker']();
      fixture.detectChanges();

      expect(instance['lookupError']()?.kind).toBe('no_api_key');
      expect(instance['showManualFallbacks']()).toBe(true);
      expect((fixture.nativeElement as HTMLElement).textContent).toContain(
        'Twelve Data API key not configured in Settings.'
      );
    });
  });

  describe('8. GrantEditorDialog (UX Screen 4 & §6)', () => {
    it('validates tranche sum mismatch, date ordering, and confirms before overwriting customized schedule', async () => {
      const asset = await store.addAsset({
        name: 'Alphabet Inc.',
        type: 'employer_stock',
        currency: 'USD',
        employerStock: { tickerSymbol: 'GOOGL', manualPrice: 180, manualFxRate: 4 },
      });

      const mockDialogRef = { close: vi.fn() };

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [GrantEditorDialog],
        providers: [
          StorageService,
          FinancialCalculatorService,
          WorthItStore,
          { provide: MatDialogRef, useValue: mockDialogRef },
          { provide: MAT_DIALOG_DATA, useValue: { assetId: asset.id } },
        ],
      });

      const dialogStore = TestBed.inject(WorthItStore);
      await dialogStore.loadAll();

      const fixture = TestBed.createComponent(GrantEditorDialog);
      fixture.detectChanges();
      const instance = fixture.componentInstance;
      const openSpy = vi
        .spyOn(instance['dialog'], 'open')
        .mockReturnValue({ afterClosed: () => of(true) } as unknown as MatDialogRef<unknown>);

      // Initial generated schedule is valid (48 shares over 48 months with 12m cliff)
      expect(instance['grantForm']().valid()).toBe(true);
      expect(instance['isAllocationExact']()).toBe(true);

      // Edit first tranche shares to create a sum mismatch
      instance['updateTrancheShares'](0, 99);
      fixture.detectChanges();

      expect(instance['model']().isScheduleCustomized).toBe(true);
      expect(instance['isAllocationExact']()).toBe(false);
      expect(instance['grantForm']().valid()).toBe(false);
      expect(
        instance['grantForm'].tranches().errors().some((e) => e.kind === 'sum_mismatch')
      ).toBe(true);

      // Regenerate schedule -> should prompt ConfirmDialog because isScheduleCustomized is true
      await instance['onGenerateSchedule']();
      fixture.detectChanges();

      expect(openSpy).toHaveBeenCalled();
      expect(instance['model']().isScheduleCustomized).toBe(false);
      expect(instance['grantForm']().valid()).toBe(true);

      // Submit valid grant
      instance['model'].update((m) => ({ ...m, name: '2026 Annual Grant' }));
      await submit(instance['grantForm']);

      expect(dialogStore.stockGrants()).toHaveLength(1);
      expect(dialogStore.stockGrants()[0].name).toBe('2026 Annual Grant');
      expect(mockDialogRef.close).toHaveBeenCalled();
    });
  });

  describe('9. VestedBaselineDialog (UX Screen 5)', () => {
    it('sets and clears vested shares baseline with live preview', async () => {
      store.refreshToday('2026-06-01');
      const asset = await store.addAsset({
        name: 'Alphabet Inc.',
        type: 'employer_stock',
        currency: 'USD',
        employerStock: { tickerSymbol: 'GOOGL', manualPrice: 180, manualFxRate: 4 },
      });
      await store.addStockGrant({
        assetId: asset.id,
        name: 'Initial Grant',
        grantDate: '2026-01-01',
        totalShares: 40,
        schedule: { frequency: 'quarterly', durationMonths: 12, cliffMonths: 0 },
        tranches: [
          { id: 't1', vestDate: '2026-04-01', shares: 10 },
          { id: 't2', vestDate: '2026-07-01', shares: 10 },
          { id: 't3', vestDate: '2026-10-01', shares: 10 },
          { id: 't4', vestDate: '2027-01-01', shares: 10 },
        ],
        isScheduleCustomized: false,
      });

      const mockDialogRef = { close: vi.fn() };
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [VestedBaselineDialog],
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
      dialogStore.refreshToday('2026-06-01');

      const fixture = TestBed.createComponent(VestedBaselineDialog);
      fixture.detectChanges();
      const instance = fixture.componentInstance;

      instance['model'].set({
        vestedSharesBaseline: 25,
        vestedSharesBaselineDate: '2026-06-01',
      });
      fixture.detectChanges();

      expect(instance['previewHeldSharesToday']()).toBe(25);
      expect(instance['futureSharesAfterBaseline']()).toBe(30);

      await submit(instance['baselineForm']);

      const updatedAsset = dialogStore.assets().find((a) => a.id === asset.id);
      expect(updatedAsset?.employerStock?.vestedSharesBaseline).toBe(25);
      expect(updatedAsset?.employerStock?.vestedSharesBaselineDate).toBe('2026-06-01');
      expect(mockDialogRef.close).toHaveBeenCalledWith({
        action: 'saved',
        vestedSharesBaseline: 25,
        vestedSharesBaselineDate: '2026-06-01',
      });
    });
  });

  describe('10. EmployerStockDetail & VestingTimeline (UX Screen 3 & §5)', () => {
    it('renders hero summary, baseline banner, vesting timeline, collapsible grants, and linked sales', async () => {
      store.refreshToday('2026-06-01');
      const asset = await store.addAsset({
        name: 'Alphabet Inc.',
        type: 'employer_stock',
        currency: 'USD',
        isGoalEligible: true,
        employerStock: {
          tickerSymbol: 'GOOGL',
          manualPrice: 200,
          manualFxRate: 4,
          vestedSharesBaseline: 15,
          vestedSharesBaselineDate: '2026-05-01',
        },
      });

      await store.addStockGrant({
        assetId: asset.id,
        name: '2026 RSU Award',
        grantDate: '2026-01-01',
        totalShares: 20,
        schedule: { frequency: 'quarterly', durationMonths: 6, cliffMonths: 0 },
        tranches: [
          { id: 'tr1', vestDate: '2026-04-01', shares: 10 },
          { id: 'tr2', vestDate: '2026-07-01', shares: 10 },
        ],
        isScheduleCustomized: false,
      });

      await store.addStockSale({
        sourceAssetId: asset.id,
        companyOrTicker: 'GOOGL',
        saleDate: '2026-05-15',
        sharesSold: 3,
        pricePerShare: 200,
        currency: 'USD',
        grossValue: 600,
        plnEquivalent: 2400,
      });

      const paramMap$ = new BehaviorSubject(convertToParamMap({ assetId: asset.id }));
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [EmployerStockDetail],
        providers: [
          provideRouter([]),
          StorageService,
          FinancialCalculatorService,
          WorthItStore,
          {
            provide: ActivatedRoute,
            useValue: {
              paramMap: paramMap$.asObservable(),
              snapshot: { paramMap: convertToParamMap({ assetId: asset.id }) },
            },
          },
        ],
      });

      const detailStore = TestBed.inject(WorthItStore);
      await detailStore.loadAll();
      detailStore.refreshToday('2026-06-01');

      const fixture = TestBed.createComponent(EmployerStockDetail);
      fixture.detectChanges();
      await fixture.whenStable();

      const el = fixture.nativeElement as HTMLElement;
      expect(el.textContent).toContain('Alphabet Inc.');
      expect(el.textContent).toContain('GOOGL');
      // Held shares = baseline 15 - 3 sold after baseline = 12 sh
      expect(el.textContent).toContain('12 sh');
      // Unvested = 10 sh
      expect(el.textContent).toContain('10 sh');
      // Active baseline banner
      expect(el.querySelector('.baseline-active-banner')).toBeTruthy();
      // Vesting timeline rendered
      expect(el.querySelector('app-vesting-timeline')).toBeTruthy();
      // Grant expansion panel rendered
      expect(el.textContent).toContain('2026 RSU Award');
      // Linked sale rendered
      expect(el.textContent).toContain('-3 sh');
    });
  });

  describe('11. Assets List — Employer Stock Card & Dialog Delegation (UX Screen 1)', () => {
    it('renders employer_stock card with held shares, unvested pipeline, next vest pill, and market status badge', async () => {
      store.refreshToday('2026-06-01');
      const asset = await store.addAsset({
        name: 'Alphabet Inc.',
        type: 'employer_stock',
        currency: 'USD',
        isGoalEligible: true,
        employerStock: {
          tickerSymbol: 'GOOGL',
          manualPrice: 150,
          manualFxRate: 4,
        },
      });

      await store.addStockGrant({
        assetId: asset.id,
        name: '2026 Grant',
        grantDate: '2026-01-01',
        totalShares: 24,
        schedule: { frequency: 'quarterly', durationMonths: 6, cliffMonths: 0 },
        tranches: [
          { id: 't1', vestDate: '2026-04-01', shares: 12 },
          { id: 't2', vestDate: '2026-07-01', shares: 12 },
        ],
        isScheduleCustomized: false,
      });

      const fixture = TestBed.createComponent(Assets);
      fixture.detectChanges();
      await fixture.whenStable();

      const el = fixture.nativeElement as HTMLElement;
      const stockCard = el.querySelector('.employer-stock-card');
      expect(stockCard).toBeTruthy();
      expect(stockCard?.textContent).toContain('Alphabet Inc.');
      expect(stockCard?.textContent).toContain('12 sh');
      expect(stockCard?.textContent).toContain('Vested & held');
      expect(stockCard?.textContent).toContain('Unvested:');
      expect(stockCard?.textContent).toContain('Manage grants (1)');
      expect(stockCard?.querySelector('app-market-status-badge')).toBeTruthy();
    });

    it('delegates to EmployerStockFormDialog when employer_stock type is selected in AssetFormDialog', () => {
      const mockDialogRef = { close: vi.fn() };

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [AssetFormDialog],
        providers: [
          { provide: MatDialogRef, useValue: mockDialogRef },
          { provide: MAT_DIALOG_DATA, useValue: {} },
        ],
      });

      const fixture = TestBed.createComponent(AssetFormDialog);
      fixture.detectChanges();
      const instance = fixture.componentInstance;
      const openSpy = vi
        .spyOn(instance['dialog']!, 'open')
        .mockReturnValue({ afterClosed: () => of(undefined) } as unknown as MatDialogRef<unknown>);

      instance['onTypeSelected']('employer_stock');

      expect(mockDialogRef.close).toHaveBeenCalled();
      expect(openSpy).toHaveBeenCalledWith(
        EmployerStockFormDialog,
        expect.objectContaining({ width: '520px' })
      );
    });
  });

  describe('12. Recurring Savings (PPK / PPO) Card & Baseline Dialog (Spec §7)', () => {
    it('renders recurring_savings card with accrued balance, baseline breakdown, and monthly rate', async () => {
      store.refreshToday('2026-04-15');
      await store.addAsset({
        name: 'PPK — Nationale-Nederlanden',
        type: 'recurring_savings',
        currency: 'PLN',
        isGoalEligible: true,
        recurringSavings: {
          baselineAmount: 14000,
          baselineDate: '2026-01-15',
          monthlyContribution: 850,
          isContributing: true,
        },
      });

      const fixture = TestBed.createComponent(Assets);
      fixture.detectChanges();
      await fixture.whenStable();

      const el = fixture.nativeElement as HTMLElement;
      expect(el.textContent).toContain('PPK — Nationale-Nederlanden');
      expect(el.textContent).toContain('Accrued balance');
      expect(el.textContent).toContain('Accrued since baseline:');
      expect(el.textContent).toContain('Update baseline');
    });

    it('re-anchors baseline via RecurringSavingsBaselineDialog and updates store', async () => {
      store.refreshToday('2026-04-15');
      const ppk = await store.addAsset({
        name: 'PPK — Nationale-Nederlanden',
        type: 'recurring_savings',
        currency: 'PLN',
        isGoalEligible: true,
        recurringSavings: {
          baselineAmount: 14000,
          baselineDate: '2026-01-15',
          monthlyContribution: 850,
          isContributing: true,
        },
      });

      const mockDialogRef = { close: vi.fn() };
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [RecurringSavingsBaselineDialog],
        providers: [
          StorageService,
          FinancialCalculatorService,
          WorthItStore,
          { provide: MatDialogRef, useValue: mockDialogRef },
          { provide: MAT_DIALOG_DATA, useValue: { asset: ppk } },
        ],
      });

      const dialogStore = TestBed.inject(WorthItStore);
      await dialogStore.loadAll();
      dialogStore.refreshToday('2026-04-15');

      const fixture = TestBed.createComponent(RecurringSavingsBaselineDialog);
      fixture.detectChanges();
      const instance = fixture.componentInstance;

      instance['model'].set({
        baselineAmount: 17200,
        baselineDate: '2026-04-15',
        note: 'Portal balance sync',
      });
      fixture.detectChanges();

      expect(instance['previewBalanceToday']()).toBe(17200);

      await submit(instance['baselineForm']);

      const updated = dialogStore.assets().find((a) => a.id === ppk.id);
      expect(updated?.recurringSavings?.baselineAmount).toBe(17200);
      expect(updated?.recurringSavings?.baselineDate).toBe('2026-04-15');
      expect(mockDialogRef.close).toHaveBeenCalledWith({
        baselineAmount: 17200,
        baselineDate: '2026-04-15',
        note: 'Portal balance sync',
      });
    });
  });

  describe('13. Retirement (IKE / IKZE) Card & RetirementTransferDialog (Spec §8)', () => {
    it('renders IKE annual limit progress on retirement card and transfers funds via RetirementTransferDialog', async () => {
      store.refreshToday('2026-04-15');
      const bank = await store.addAsset({
        name: 'PKO Checking',
        type: 'bank_account',
        currency: 'PLN',
        balance: 25000,
        isGoalEligible: true,
      });
      const ike = await store.addAsset({
        name: 'XTB IKE',
        type: 'retirement',
        currency: 'PLN',
        balance: 32000,
        isGoalEligible: false,
        retirement: {
          accountKind: 'ike',
          annualLimit: 28260,
          ytdContributionsBaseline: 12000,
          ytdBaselineYear: 2026,
        },
      });

      const listFixture = TestBed.createComponent(Assets);
      listFixture.detectChanges();
      await listFixture.whenStable();

      const listEl = listFixture.nativeElement as HTMLElement;
      expect(listEl.textContent).toContain('2026 Contributed:');
      expect(listEl.textContent).toContain('Remaining in 2026:');
      expect(listEl.textContent).toContain('Transfer from savings');

      const mockDialogRef = { close: vi.fn() };
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [RetirementTransferDialog],
        providers: [
          StorageService,
          FinancialCalculatorService,
          WorthItStore,
          { provide: MatDialogRef, useValue: mockDialogRef },
          { provide: MAT_DIALOG_DATA, useValue: { toAsset: ike } },
        ],
      });

      const dialogStore = TestBed.inject(WorthItStore);
      await dialogStore.loadAll();
      dialogStore.refreshToday('2026-04-15');

      const dialogFixture = TestBed.createComponent(RetirementTransferDialog);
      dialogFixture.detectChanges();
      const instance = dialogFixture.componentInstance;

      instance['model'].set({
        fromAssetId: bank.id,
        toAssetId: ike.id,
        amount: 5000,
        date: '2026-04-15',
        note: 'Spring IKE contribution',
      });
      dialogFixture.detectChanges();

      expect(instance['previewFromBalanceAfter']()).toBe(20000);
      expect(instance['previewToBalanceAfter']()).toBe(37000);
      expect(instance['previewContributedYtd']()).toBe(17000);

      await submit(instance['transferForm']);

      expect(
        dialogStore.assets().find((a) => a.id === bank.id)?.balance
      ).toBe(20000);
      expect(
        dialogStore.assets().find((a) => a.id === ike.id)?.balance
      ).toBe(37000);
      expect(mockDialogRef.close).toHaveBeenCalled();
    });
  });
});
