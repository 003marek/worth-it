import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { MarketQuote } from '../models/market-data.model';
import { FinancialCalculatorService } from '../services/financial-calculator.service';
import { GoogleDriveService } from '../services/google-drive.service';
import { MarketDataService } from '../services/market-data/market-data.service';
import { StorageService } from '../services/storage.service';
import { WorthItStore } from './worth-it.store';

describe('WorthItStore', () => {
  let store: InstanceType<typeof WorthItStore>;
  let storage: StorageService;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [StorageService, FinancialCalculatorService, WorthItStore],
    });

    storage = TestBed.inject(StorageService);
    await storage.open();
    await storage.clearAllData();

    store = TestBed.inject(WorthItStore);
    await store.loadAll();
  });

  afterEach(async () => {
    await storage.clearAllData();
  });

  describe('Initialization', () => {
    it('initializes with default settings and empty collections', () => {
      expect(store.settings().baseCurrency).toBe('PLN');
      expect(store.settings().cushion.isEnabled).toBe(true);
      expect(store.entities()).toEqual([]);
      expect(store.assets()).toEqual([]);
      expect(store.activeGoal()).toBeNull();
      expect(store.wealthSummary().totalWealth).toBe(0);
    });
  });

  describe('Goals CRUD and Lifecycle', () => {
    it('adds goals, assigns sequential order and updates entities and activeGoal', async () => {
      const g1 = await store.addGoal({ name: 'Emergency Fund', targetAmount: 20000 });
      const g2 = await store.addGoal({ name: 'Car', targetAmount: 60000 });

      expect(store.entities()).toHaveLength(2);
      expect(store.goals()[0].id).toBe(g1.id);
      expect(store.goals()[0].order).toBe(0);
      expect(store.goals()[1].id).toBe(g2.id);
      expect(store.goals()[1].order).toBe(1);

      expect(store.activeGoal()?.id).toBe(g1.id);
      expect(store.upcomingGoals()).toHaveLength(1);
      expect(store.upcomingGoals()[0].id).toBe(g2.id);
    });

    it('updates a goal target and name', async () => {
      const g = await store.addGoal({ name: 'Vacation', targetAmount: 5000 });
      const updated = await store.updateGoal(g.id, {
        name: 'Japan Vacation',
        targetAmount: 12000,
      });

      expect(updated?.name).toBe('Japan Vacation');
      expect(updated?.targetAmount).toBe(12000);
      expect(store.activeGoal()?.targetAmount).toBe(12000);
    });

    it('deletes a goal', async () => {
      const g = await store.addGoal({ name: 'Laptop', targetAmount: 8000 });
      expect(store.entities()).toHaveLength(1);

      await store.deleteGoal(g.id);
      expect(store.entities()).toHaveLength(0);
      expect(store.activeGoal()).toBeNull();
    });

    it('reorders goals and updates priorities', async () => {
      const g1 = await store.addGoal({ name: 'First', targetAmount: 10000 });
      const g2 = await store.addGoal({ name: 'Second', targetAmount: 20000 });

      expect(store.activeGoal()?.id).toBe(g1.id);

      // Reorder g2 to first position
      await store.reorderGoals([g2, g1]);

      expect(store.goals()[0].id).toBe(g2.id);
      expect(store.goals()[0].order).toBe(0);
      expect(store.goals()[1].id).toBe(g1.id);
      expect(store.goals()[1].order).toBe(1);
      expect(store.activeGoal()?.id).toBe(g2.id);
    });

    it('completes a goal with reserve choice and affects wealth reservation', async () => {
      const g1 = await store.addGoal({ name: 'Goal 1', targetAmount: 15000 });
      const g2 = await store.addGoal({ name: 'Goal 2', targetAmount: 30000 });

      // Add eligible asset so we have wealth
      await store.addAsset({
        name: 'Savings',
        type: 'bank_account',
        balance: 60000,
        isGoalEligible: true,
      });

      // Disable cushion to simplify checking goal pool
      await store.updateCushionSettings({ isEnabled: false });

      expect(store.wealthSummary().availableForGoals).toBe(60000);

      // Complete Goal 1 with reserve choice
      await store.completeGoal(g1.id, 'reserve', undefined, 15000);

      expect(store.completedGoals()).toHaveLength(1);
      expect(store.completedGoals()[0].id).toBe(g1.id);
      expect(store.activeGoal()?.id).toBe(g2.id);

      // Reserved amounts should now be 15,000 and available reduced by 15,000
      expect(store.wealthSummary().reservedAmounts).toBe(15000);
      expect(store.wealthSummary().availableForGoals).toBe(45000);

      // Uncomplete g1
      await store.uncompleteGoal(g1.id);
      expect(store.completedGoals()).toHaveLength(0);
      expect(store.activeGoal()?.id).toBe(g1.id);
      expect(store.wealthSummary().reservedAmounts).toBe(0);
      expect(store.wealthSummary().availableForGoals).toBe(60000);
    });
  });

  describe('Assets and Balance History', () => {
    it('creates asset and logs initial balance history entry', async () => {
      const asset = await store.addAsset(
        {
          name: 'PKO Bank',
          type: 'bank_account',
          balance: 25000,
          isGoalEligible: true,
        },
        'Initial import'
      );

      expect(store.assets()).toHaveLength(1);
      expect(store.assets()[0].balance).toBe(25000);
      expect(store.assetHistory()).toHaveLength(1);
      expect(store.assetHistory()[0].assetId).toBe(asset.id);
      expect(store.assetHistory()[0].balance).toBe(25000);
      expect(store.assetHistory()[0].note).toBe('Initial import');
    });

    it('records new history record when asset balance is updated', async () => {
      const asset = await store.addAsset({
        name: 'Wallet',
        type: 'cash',
        balance: 500,
        isGoalEligible: true,
      });

      expect(store.assetHistory()).toHaveLength(1);

      await store.updateAssetBalance(asset.id, 800, 'Payday cash withdrawal');

      expect(store.assets()[0].balance).toBe(800);
      expect(store.assetHistory()).toHaveLength(2);
      expect(store.assetHistory()[1].balance).toBe(800);
      expect(store.assetHistory()[1].note).toBe('Payday cash withdrawal');
    });

    it('deletes asset and cleans up its history records', async () => {
      const asset = await store.addAsset({
        name: 'Brokerage',
        type: 'stocks_etf',
        balance: 10000,
        isGoalEligible: true,
      });

      await store.deleteAsset(asset.id);

      expect(store.assets()).toHaveLength(0);
      expect(store.assetHistory()).toHaveLength(0);
    });
  });

  describe('Income and Expense Management', () => {
    it('manages income sources and records', async () => {
      const source = await store.addIncomeSource({
        name: 'Tech Job',
        amount: 14000,
        frequency: 'monthly',
      });

      expect(store.incomeSources()).toHaveLength(1);
      expect(store.monthlySurplusSummary().monthlyIncome).toBe(14000);

      const record = await store.addIncomeRecord({
        incomeSourceId: source.id,
        name: 'November Salary',
        amount: 14200,
      });
      expect(store.incomeRecords()).toHaveLength(1);

      await store.deleteIncomeRecord(record.id);
      expect(store.incomeRecords()).toHaveLength(0);

      await store.deleteIncomeSource(source.id);
      expect(store.incomeSources()).toHaveLength(0);
    });

    it('manages expense categories and records', async () => {
      const rent = await store.addExpenseCategory({
        name: 'Apartment Rent',
        expectedMonthlyAmount: 4000,
      });
      const food = await store.addExpenseCategory({
        name: 'Groceries',
        expectedMonthlyAmount: 2000,
      });

      expect(store.expenseCategories()).toHaveLength(2);
      expect(store.monthlySurplusSummary().monthlyExpenses).toBe(6000);

      await store.reorderExpenseCategories([food, rent]);
      expect(store.expenseCategories()[0].id).toBe(food.id);

      const expRecord = await store.addExpenseRecord({
        categoryId: food.id,
        categoryName: 'Groceries',
        amount: 150,
      });
      expect(store.expenseRecords()).toHaveLength(1);

      await store.deleteExpenseRecord(expRecord.id);
      expect(store.expenseRecords()).toHaveLength(0);

      await store.deleteExpenseCategory(rent.id);
      expect(store.expenseCategories()).toHaveLength(1);
    });
  });

  describe('Stock Sales (Standalone)', () => {
    it('records stock sales without altering total wealth or goal progress', async () => {
      await store.addAsset({
        name: 'Bank',
        type: 'bank_account',
        balance: 10000,
        isGoalEligible: true,
      });

      const initialWealth = store.wealthSummary().totalWealth;
      expect(initialWealth).toBe(10000);

      const sale = await store.addStockSale({
        companyOrTicker: 'NVDA',
        sharesSold: 10,
        pricePerShare: 140,
        grossValue: 1400,
        plnEquivalent: 5600,
      });

      expect(store.stockSales()).toHaveLength(1);
      expect(store.stockSales()[0].companyOrTicker).toBe('NVDA');

      // Wealth must be unaffected!
      expect(store.wealthSummary().totalWealth).toBe(10000);

      await store.deleteStockSale(sale.id);
      expect(store.stockSales()).toHaveLength(0);
      expect(store.wealthSummary().totalWealth).toBe(10000);
    });
  });

  describe('Settings and Financial Cushion Reactivity', () => {
    it('updates application settings and recalculates cushion target dynamically', async () => {
      // Default cushion: 6000 expenses * 6 months = 36000
      expect(store.wealthSummary().cushionTarget).toBe(36000);

      await store.updateCushionSettings({
        averageMonthlyExpenses: 8000,
        coverageMonths: 3,
      });

      expect(store.wealthSummary().cushionTarget).toBe(24000);

      await store.updateCushionSettings({ isEnabled: false });
      expect(store.wealthSummary().cushionTarget).toBe(0);
      expect(store.wealthSummary().cushionPercent).toBe(100);
    });
  });

  describe('End-to-End Computed Projections and Goal Funding', () => {
    it('accurately computes wealth, cushion status, goal timeline and projections', async () => {
      // Setup Assets:
      // 50,000 PLN eligible
      // 20,000 PLN excluded
      await store.addAsset({
        name: 'Checking',
        type: 'bank_account',
        balance: 50000,
        isGoalEligible: true,
      });
      await store.addAsset({
        name: 'PPK Retirement',
        type: 'retirement',
        balance: 20000,
        isGoalEligible: false,
      });

      // Cushion Settings: 5000 * 6 = 30,000 PLN target
      await store.updateCushionSettings({
        isEnabled: true,
        averageMonthlyExpenses: 5000,
        coverageMonths: 6,
      });

      // Wealth available for goals should be:
      // totalWealth: 70,000
      // eligible: 50,000
      // cushionTarget: 30,000 (funded: 30,000, deficit: 0)
      // availableForGoals: 50,000 - 30,000 = 20,000 PLN
      expect(store.wealthSummary().totalWealth).toBe(70000);
      expect(store.wealthSummary().goalEligibleWealth).toBe(50000);
      expect(store.wealthSummary().excludedWealth).toBe(20000);
      expect(store.wealthSummary().cushionTarget).toBe(30000);
      expect(store.wealthSummary().cushionFunded).toBe(30000);
      expect(store.wealthSummary().cushionDeficit).toBe(0);
      expect(store.wealthSummary().isCushionFullyFunded).toBe(true);
      expect(store.wealthSummary().availableForGoals).toBe(20000);

      // Income & Expenses for monthly surplus:
      // Income: 12,000 PLN / month
      await store.addIncomeSource({
        name: 'Primary Salary',
        amount: 12000,
        frequency: 'monthly',
      });
      // Expense: 7,000 PLN / month
      await store.addExpenseCategory({
        name: 'Total Monthly Budget',
        expectedMonthlyAmount: 7000,
      });

      // Monthly Surplus = 12000 - 7000 = 5000 PLN
      expect(store.monthlySurplusSummary().monthlyIncome).toBe(12000);
      expect(store.monthlySurplusSummary().monthlyExpenses).toBe(7000);
      expect(store.monthlySurplusSummary().monthlySurplus).toBe(5000);

      // Add Goals:
      // Goal 1: 30,000 PLN (Active)
      // Goal 2: 25,000 PLN (Upcoming)
      const g1 = await store.addGoal({ name: 'Car Downpayment', targetAmount: 30000 });
      const g2 = await store.addGoal({ name: 'New Furniture', targetAmount: 25000 });

      // Goal 1 gets 20,000 from available wealth.
      // Goal 1 remaining = 10,000 PLN.
      // Goal 1 timeline: 10,000 / 5,000 surplus = 2.0 months!
      // Goal 2 gets 0 from available wealth.
      // Goal 2 remaining = 25,000 PLN.
      // Goal 2 timeline: (10,000 + 25,000) / 5,000 = 7.0 months!
      const funding = store.goalsWithFunding();
      expect(funding).toHaveLength(2);

      expect(funding[0].goal.id).toBe(g1.id);
      expect(funding[0].currentProgress).toBe(20000);
      expect(funding[0].remainingAmount).toBe(10000);
      expect(funding[0].progressPercent).toBe(66.67);
      expect(funding[0].estimatedCompletionMonths).toBe(2);

      expect(funding[1].goal.id).toBe(g2.id);
      expect(funding[1].currentProgress).toBe(0);
      expect(funding[1].remainingAmount).toBe(25000);
      expect(funding[1].progressPercent).toBe(0);
      expect(funding[1].estimatedCompletionMonths).toBe(7);

      // Projection summary verification
      const proj = store.projectionSummary();
      expect(proj.monthlyIncome).toBe(12000);
      expect(proj.monthlyExpenses).toBe(7000);
      expect(proj.monthlySurplus).toBe(5000);
      expect(proj.cushionMonthsToFund).toBe(0);
      expect(proj.goalsTimeline).toHaveLength(2);
    });
  });

  describe('Employer Stock: Grant CRUD, Baseline Set/Clear & Wealth/Projection Integration', () => {
    beforeEach(() => {
      store.refreshToday('2026-11-16');
    });

    it('supports StockGrant CRUD and cascades grant deletion + unlinks sales when asset is deleted', async () => {
      const stockAsset = await store.addAsset({
        name: 'Alphabet RSU',
        type: 'employer_stock',
        currency: 'USD',
        balance: 0,
        isGoalEligible: true,
        employerStock: {
          tickerSymbol: 'GOOGL',
          manualPrice: 200,
          manualFxRate: 4.0,
        },
      });

      expect(store.employerStockAssets()).toHaveLength(1);
      expect(store.grantsByAsset().get(stockAsset.id)).toEqual([]);

      const grant = await store.addStockGrant({
        assetId: stockAsset.id,
        name: '2025 Initial Grant',
        grantDate: '2025-11-15',
        totalShares: 40,
        schedule: {
          frequency: 'annual',
          durationMonths: 48,
          cliffMonths: 12,
        },
        tranches: [
          { id: 't1', vestDate: '2026-11-15', shares: 10 },
          { id: 't2', vestDate: '2027-11-15', shares: 10 },
          { id: 't3', vestDate: '2028-11-15', shares: 10 },
          { id: 't4', vestDate: '2029-11-15', shares: 10 },
        ],
        isScheduleCustomized: false,
      });

      expect(store.stockGrants()).toHaveLength(1);
      expect(store.grantsByAsset().get(stockAsset.id)).toHaveLength(1);

      const updatedGrant = await store.updateStockGrant(grant.id, {
        name: '2025 Updated Grant',
        isScheduleCustomized: true,
      });
      expect(updatedGrant?.name).toBe('2025 Updated Grant');
      expect(store.stockGrants()[0].isScheduleCustomized).toBe(true);

      // Link a stock sale to this employer_stock asset
      const linkedSale = await store.addStockSale({
        sourceAssetId: stockAsset.id,
        companyOrTicker: 'GOOGL',
        saleDate: '2026-11-16',
        sharesSold: 3,
        pricePerShare: 200,
        currency: 'USD',
      });
      expect(linkedSale.sourceAssetId).toBe(stockAsset.id);

      // Snapshot reflects 10 vested - 3 sold = 7 held, 30 unvested
      const snap = store.employerStockSnapshots().get(stockAsset.id)!;
      expect(snap.heldShares).toBe(7);
      expect(snap.unvestedShares).toBe(30);
      expect(snap.soldSharesCounted).toBe(3);

      // Delete grant directly
      const secondGrant = await store.addStockGrant({
        assetId: stockAsset.id,
        grantDate: '2026-01-15',
        totalShares: 10,
        schedule: { frequency: 'annual', durationMonths: 12, cliffMonths: 0 },
        tranches: [{ id: 't5', vestDate: '2027-01-15', shares: 10 }],
        isScheduleCustomized: false,
      });
      expect(store.stockGrants()).toHaveLength(2);
      await store.deleteStockGrant(secondGrant.id);
      expect(store.stockGrants()).toHaveLength(1);

      // Deleting the asset cascades to remaining grants and clears sourceAssetId on linked sales
      await store.deleteAsset(stockAsset.id);
      expect(store.stockGrants()).toHaveLength(0);
      expect(store.stockSales()).toHaveLength(1);
      expect(store.stockSales()[0].sourceAssetId).toBeUndefined();
    });

    it('sets and clears vestedSharesBaseline and updates heldShares and wealth accordingly', async () => {
      const stockAsset = await store.addAsset({
        name: 'Microsoft RSU',
        type: 'employer_stock',
        currency: 'USD',
        balance: 0,
        isGoalEligible: true,
        employerStock: {
          tickerSymbol: 'MSFT',
          manualPrice: 400,
          manualFxRate: 4.0, // 1 share = 1,600 PLN
        },
      });

      await store.addStockGrant({
        assetId: stockAsset.id,
        grantDate: '2025-01-15',
        totalShares: 30,
        schedule: { frequency: 'annual', durationMonths: 36, cliffMonths: 0 },
        tranches: [
          { id: 'm1', vestDate: '2025-06-15', shares: 10 },
          { id: 'm2', vestDate: '2026-06-15', shares: 10 },
          { id: 'm3', vestDate: '2027-06-15', shares: 10 },
        ],
        isScheduleCustomized: false,
      });

      // Without baseline at 2026-11-16: 20 vested & held shares -> 20 * 400 * 4 = 32,000 PLN
      expect(store.employerStockSnapshots().get(stockAsset.id)?.heldShares).toBe(20);
      expect(store.wealthSummary().totalWealth).toBe(32000);

      // Set baseline: 12 shares as of 2026-01-01
      // Tranche m1 (2025-06-15) is before baseline (ignored); m2 (2026-06-15, +10 sh) is after baseline
      // Held shares at 2026-11-16 = 12 + 10 = 22 shares -> 22 * 1,600 = 35,200 PLN
      await store.setVestedSharesBaseline(stockAsset.id, 12, '2026-01-01');
      expect(store.employerStockSnapshots().get(stockAsset.id)?.heldShares).toBe(22);
      expect(store.wealthSummary().totalWealth).toBe(35200);

      // Clear baseline -> reverts to full grant schedule (20 held shares -> 32,000 PLN)
      await store.clearVestedSharesBaseline(stockAsset.id);
      expect(store.employerStockSnapshots().get(stockAsset.id)?.heldShares).toBe(20);
      expect(store.wealthSummary().totalWealth).toBe(32000);
    });

    it('never includes unvested shares in wealthSummary, while feeding them as projectedInflows to projections', async () => {
      await store.updateCushionSettings({
        isEnabled: false,
        averageMonthlyExpenses: 0,
      });

      const stockAsset = await store.addAsset({
        name: 'Alphabet RSU',
        type: 'employer_stock',
        currency: 'USD',
        balance: 0,
        isGoalEligible: true,
        employerStock: {
          tickerSymbol: 'GOOGL',
          manualPrice: 250,
          manualFxRate: 4.0, // 1 share = 1,000 PLN
        },
      });

      // 5 vested shares (5,000 PLN) and 25 unvested future shares (25,000 PLN on 2027-03-15)
      await store.addStockGrant({
        assetId: stockAsset.id,
        grantDate: '2026-03-15',
        totalShares: 30,
        schedule: { frequency: 'annual', durationMonths: 24, cliffMonths: 0 },
        tranches: [
          { id: 'v1', vestDate: '2026-09-15', shares: 5 },
          { id: 'v2', vestDate: '2027-03-15', shares: 25 },
        ],
        isScheduleCustomized: false,
      });

      // Actual wealth ONLY counts the 5 vested shares (5,000 PLN) — unvested 25,000 PLN is excluded!
      expect(store.wealthSummary().recordedAssetsTotal).toBe(5000);
      expect(store.wealthSummary().totalWealth).toBe(5000);
      expect(store.wealthSummary().goalEligibleWealth).toBe(5000);
      expect(store.wealthSummary().availableForGoals).toBe(5000);

      // Projected inflows has the 25 unvested shares (25,000 PLN on 2027-03-15)
      expect(store.projectedInflows()).toEqual([
        {
          date: '2027-03-15',
          amountInBase: 25000,
          assetId: stockAsset.id,
          sourceId: 'v2',
          label: 'GOOGL vest · 25 sh',
        },
      ]);

      // Add a 20,000 PLN goal with 0 monthly surplus:
      // 5,000 PLN is currently funded, remaining 15,000 PLN is completed on 2027-03-15 by the stock vest!
      await store.addGoal({ name: 'Dream Trip', targetAmount: 20000 });
      const goalFunding = store.goalsWithFunding()[0];
      expect(goalFunding.currentProgress).toBe(5000);
      expect(goalFunding.remainingAmount).toBe(15000);
      expect(goalFunding.isFullyFunded).toBe(false);
      expect(goalFunding.estimatedCompletionDate).toBe('2027-03-15');

      const proj = store.projectionSummary();
      expect(proj.projectedInflowsTotal).toBe(25000);
      expect(proj.assumptions).toContain(
        "Includes 1 future stock vest valued at today's price and NBP rate"
      );
    });

    it('delegates lookupTicker and refreshMarketData to MarketDataService and updates store state', async () => {
      const mds = {
        lookupSymbol: vi.fn(async (symbol: string): Promise<MarketQuote> => {
          const quote: MarketQuote = {
            symbol: symbol.toUpperCase(),
            price: 210,
            currency: 'USD',
            name: 'Alphabet Inc.',
            fetchedAt: new Date().toISOString(),
          };
          await storage.saveMarketQuote(quote);
          return quote;
        }),
        refreshQuotes: vi.fn(async () => ({
          updated: ['GOOGL'],
          skipped: [],
          errors: [],
        })),
        refreshFxRates: vi.fn(async () => {
          await storage.saveFxRate({
            pair: 'USD/PLN',
            from: 'USD',
            to: 'PLN',
            rate: 4.1,
            effectiveDate: '2026-11-16',
            fetchedAt: new Date().toISOString(),
          });
          return {
            updated: ['USD/PLN'],
            skipped: [],
            errors: [],
          };
        }),
      };

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          StorageService,
          FinancialCalculatorService,
          WorthItStore,
          { provide: MarketDataService, useValue: mds },
        ],
      });

      const localStore = TestBed.inject(WorthItStore);
      await localStore.loadAll();

      await localStore.addAsset({
        name: 'Alphabet RSU',
        type: 'employer_stock',
        currency: 'USD',
        employerStock: { tickerSymbol: 'GOOGL' },
      });

      const quote = await localStore.lookupTicker('googl');
      expect(quote.price).toBe(210);
      expect(localStore.marketQuotes()).toHaveLength(1);

      const refreshResult = await localStore.refreshMarketData({ force: true });
      expect(refreshResult.updated).toEqual(['GOOGL', 'USD/PLN']);
      expect(localStore.fxRates()).toHaveLength(1);
      expect(localStore.lastMarketRefresh()).toEqual(refreshResult);
      expect(localStore.marketDataRefreshing()).toBe(false);
    });
  });

  describe('Google Drive Sync (exportToDrive & importFromDrive)', () => {
    it('exports all data to Google Drive using configured clientId and folder', async () => {
      const driveService = TestBed.inject(GoogleDriveService);
      const initSpy = vi.spyOn(driveService, 'init').mockResolvedValue(undefined);
      const syncSpy = vi.spyOn(driveService, 'syncData').mockResolvedValue(undefined);

      await store.addGoal({ name: 'Drive Goal', targetAmount: 25000 });
      await store.updateSettings({
        googleClientId: 'drive-client-id.apps.googleusercontent.com',
        googleDriveBackupFolder: 'My WorthIt Backups',
      });

      await store.exportToDrive();

      expect(initSpy).toHaveBeenCalledWith('drive-client-id.apps.googleusercontent.com');
      expect(syncSpy).toHaveBeenCalledWith(
        expect.stringContaining('"Drive Goal"'),
        'My WorthIt Backups'
      );
    });

    it('imports data from Google Drive, preserves Google Client ID, and reloads store', async () => {
      const driveService = TestBed.inject(GoogleDriveService);
      await store.addGoal({ name: 'Remote Goal', targetAmount: 40000 });
      const backupJson = await storage.exportAllData();

      await storage.clearAllData();
      await store.loadAll();
      expect(store.goals()).toHaveLength(0);

      await store.updateSettings({
        googleClientId: 'active-client-id',
        googleDriveBackupFolder: 'Custom Folder',
      });

      vi.spyOn(driveService, 'init').mockResolvedValue(undefined);
      vi.spyOn(driveService, 'importData').mockResolvedValue(backupJson);

      await store.importFromDrive();

      expect(store.goals()).toHaveLength(1);
      expect(store.goals()[0].name).toBe('Remote Goal');
      // Preserves Google Drive credentials even if imported backup had none
      expect(store.settings().googleClientId).toBe('active-client-id');
      expect(store.settings().googleDriveBackupFolder).toBe('Custom Folder');
    });
  });

  describe('Recurring Savings (PPK / PPO)', () => {
    it('auto-accrues monthly contributions from baselineDate into wealthSummary and feeds effectiveMonthlySurplus', async () => {
      store.refreshToday('2026-04-15');
      await store.updateCushionSettings({
        isEnabled: false,
        averageMonthlyExpenses: 0,
      });

      const ppk = await store.addAsset({
        name: 'PPK — Nationale-Nederlanden',
        type: 'recurring_savings',
        currency: 'PLN',
        isGoalEligible: true,
        recurringSavings: {
          baselineAmount: 10000,
          baselineDate: '2026-01-15',
          monthlyContribution: 1000,
          isContributing: true,
        },
      });

      // 3 months elapsed (Feb 15, Mar 15, Apr 15) -> 10,000 + 3 * 1,000 = 13,000 PLN
      const snap = store.recurringSavingsSnapshots().get(ppk.id);
      expect(snap?.monthsElapsed).toBe(3);
      expect(snap?.accruedContributions).toBe(3000);
      expect(snap?.currentAccruedBalance).toBe(13000);
      expect(snap?.nextContributionDate).toBe('2026-05-15');

      expect(store.wealthSummary().recordedAssetsTotal).toBe(13000);
      expect(store.wealthSummary().availableForGoals).toBe(13000);
      expect(store.recurringMonthlyContributionsInBase()).toBe(1000);
      expect(store.effectiveMonthlySurplus()).toBe(1000);

      // Even with 0 salary/expense cashflow surplus, a 19,000 PLN goal (6,000 PLN remaining)
      // completes in 6 months via the 1,000 PLN/mo PPK contribution
      await store.addGoal({ name: 'Apartment Down Payment', targetAmount: 19000 });
      const goalSummary = store.goalsWithFunding()[0];
      expect(goalSummary.currentProgress).toBe(13000);
      expect(goalSummary.remainingAmount).toBe(6000);
      expect(goalSummary.estimatedCompletionMonths).toBe(6);

      const proj = store.projectionSummary();
      expect(proj.recurringContributionsMonthlyInBase).toBe(1000);
      expect(proj.effectiveMonthlySurplus).toBe(1000);
      expect(proj.assumptions).toContain(
        'Includes +1000 PLN/mo from recurring savings (PPK/PPO)'
      );
    });

    it('snapshots current accrued balance at today when pausing contributions or changing monthly rate (spec §7.3.4)', async () => {
      store.refreshToday('2026-05-15');

      const ppo = await store.addAsset({
        name: 'Employer PPO',
        type: 'recurring_savings',
        currency: 'PLN',
        isGoalEligible: true,
        recurringSavings: {
          baselineAmount: 20000,
          baselineDate: '2026-01-15',
          monthlyContribution: 500,
          isContributing: true,
        },
      });

      // 4 months elapsed -> 22,000 PLN accrued today
      expect(
        store.recurringSavingsSnapshots().get(ppo.id)?.currentAccruedBalance
      ).toBe(22000);

      // Pause contributions: must lock in 22,000 PLN at 2026-05-15 so past 4 months are preserved
      await store.toggleRecurringSavingsContributing(ppo.id, false);

      const pausedSnap = store.recurringSavingsSnapshots().get(ppo.id);
      expect(pausedSnap?.isContributing).toBe(false);
      expect(pausedSnap?.baselineAmount).toBe(22000);
      expect(pausedSnap?.baselineDate).toBe('2026-05-15');
      expect(pausedSnap?.currentAccruedBalance).toBe(22000);
      expect(store.recurringMonthlyContributionsInBase()).toBe(0);

      // Re-anchor baseline manually to real portal value (e.g. 23,450 PLN after fund gains)
      await store.reanchorRecurringSavingsBaseline(
        ppo.id,
        23450,
        '2026-05-15',
        'Q2 fund valuation sync'
      );

      const reanchored = store.recurringSavingsSnapshots().get(ppo.id);
      expect(reanchored?.baselineAmount).toBe(23450);
      expect(reanchored?.currentAccruedBalance).toBe(23450);
      expect(store.wealthSummary().totalWealth).toBe(23450);
      expect(
        store
          .assetHistory()
          .some(
            (h) =>
              h.assetId === ppo.id &&
              h.balance === 23450 &&
              h.note === 'Q2 fund valuation sync'
          )
      ).toBe(true);
    });
  });

  describe('Savings-to-Retirement Transfers (IKE / IKZE)', () => {
    it('deducts from source cash/bank account, adds to IKE/IKZE balance, logs history on both, and updates YTD limit progress', async () => {
      store.refreshToday('2026-04-15');
      await store.updateCushionSettings({
        isEnabled: false,
        averageMonthlyExpenses: 0,
      });

      const checking = await store.addAsset({
        name: 'Main Checking',
        type: 'bank_account',
        currency: 'PLN',
        balance: 30000,
        isGoalEligible: true,
      });

      const ike = await store.addAsset({
        name: 'XTB IKE',
        type: 'retirement',
        currency: 'PLN',
        balance: 20000,
        isGoalEligible: false,
        retirement: {
          accountKind: 'ike',
          annualLimit: 28260,
          ytdContributionsBaseline: 10000,
          ytdBaselineYear: 2026,
        },
      });

      expect(store.wealthSummary().totalWealth).toBe(50000);
      expect(store.wealthSummary().goalEligibleWealth).toBe(30000);
      expect(store.wealthSummary().excludedWealth).toBe(20000);

      const transfer = await store.transferToRetirement({
        fromAssetId: checking.id,
        toAssetId: ike.id,
        amount: 8260,
        date: '2026-04-15',
        note: 'April IKE top-up',
      });

      expect(transfer.amount).toBe(8260);
      expect(store.retirementTransfers()).toHaveLength(1);

      const updatedChecking = store.assets().find((a) => a.id === checking.id);
      const updatedIke = store.assets().find((a) => a.id === ike.id);
      expect(updatedChecking?.balance).toBe(21740);
      expect(updatedIke?.balance).toBe(28260);

      // Total wealth is invariant (50,000 PLN), while Goal-Eligible shifted to Excluded
      expect(store.wealthSummary().totalWealth).toBe(50000);
      expect(store.wealthSummary().goalEligibleWealth).toBe(21740);
      expect(store.wealthSummary().excludedWealth).toBe(28260);

      // YTD limit progress updated: 10,000 baseline + 8,260 transfer = 18,260 / 28,260 (10,000 remaining)
      const ikeSnap = store.retirementSnapshots().get(ike.id);
      expect(ikeSnap?.contributedYtd).toBe(18260);
      expect(ikeSnap?.remainingLimit).toBe(10000);

      // Both accounts have balance history entries for the transfer
      const history = store.assetHistory();
      expect(
        history.some(
          (h) =>
            h.assetId === checking.id &&
            h.balance === 21740 &&
            h.note?.includes('Transfer to XTB IKE')
        )
      ).toBe(true);
      expect(
        history.some(
          (h) =>
            h.assetId === ike.id &&
            h.balance === 28260 &&
            h.note?.includes('Transfer from Main Checking')
        )
      ).toBe(true);
    });
  });
});
