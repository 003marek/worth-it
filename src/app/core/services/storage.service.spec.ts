import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import Dexie from 'dexie';
import { StockGrant } from '../models/employer-stock.model';
import { FxRate, MarketQuote } from '../models/market-data.model';
import {
  Asset,
  AssetBalanceHistory,
  ExpenseCategory,
  ExpenseRecord,
  Goal,
  IncomeRecord,
  IncomeSource,
  StockSale,
} from '../models/worth-it.model';
import { DEFAULT_SETTINGS, StorageService } from './storage.service';

describe('StorageService', () => {
  let service: StorageService;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [StorageService],
    });
    service = TestBed.inject(StorageService);
    await service.open();
    await service.clearAllData();
  });

  afterEach(async () => {
    if (service.isOpen()) {
      await service.clearAllData();
    }
  });

  it('should be created and have all required v1 + v2 tables', () => {
    expect(service).toBeTruthy();
    expect(service.goals).toBeDefined();
    expect(service.assets).toBeDefined();
    expect(service.assetHistory).toBeDefined();
    expect(service.incomeSources).toBeDefined();
    expect(service.incomeRecords).toBeDefined();
    expect(service.expenseCategories).toBeDefined();
    expect(service.expenseRecords).toBeDefined();
    expect(service.stockSales).toBeDefined();
    expect(service.stockGrants).toBeDefined();
    expect(service.marketQuotes).toBeDefined();
    expect(service.fxRates).toBeDefined();
    expect(service.settings).toBeDefined();
  });

  describe('Dexie v1 → v2 Migration', () => {
    it('preserves v1 data when upgrading to version 2 and exposes new v2 stores', async () => {
      service.close();
      await Dexie.delete('WorthItDB');

      // Open WorthItDB at version 1 only and seed v1 data
      const v1Db = new Dexie('WorthItDB');
      v1Db.version(1).stores({
        goals: 'id, order, isCompleted, createdAt',
        assets: 'id, type, currency, isGoalEligible, updatedAt',
        assetHistory: 'id, assetId, date',
        incomeSources: 'id, type, frequency, isEnabled',
        incomeRecords: 'id, incomeSourceId, receivedDate, isActual',
        expenseCategories: 'id, order, isEnabled',
        expenseRecords: 'id, categoryId, date, isActual',
        stockSales: 'id, companyOrTicker, saleDate',
        settings: 'id',
      });
      await v1Db.open();

      const v1Goal: Goal = {
        id: 'v1-goal',
        name: 'Pre-upgrade Goal',
        targetAmount: 42000,
        order: 1,
        isCompleted: false,
        createdAt: '2025-12-01T00:00:00.000Z',
        updatedAt: '2025-12-01T00:00:00.000Z',
      };
      const v1Asset: Asset = {
        id: 'v1-asset',
        name: 'Pre-upgrade Bank',
        type: 'bank_account',
        currency: 'PLN',
        balance: 15000,
        isGoalEligible: true,
        updatedAt: '2025-12-01T00:00:00.000Z',
      };
      await v1Db.table('goals').put(v1Goal);
      await v1Db.table('assets').put(v1Asset);
      await v1Db.table('settings').put({ ...DEFAULT_SETTINGS, baseCurrency: 'EUR' });
      v1Db.close();

      // Open with StorageService (version 2)
      const upgraded = new StorageService();
      await upgraded.open();

      const migratedGoal = await upgraded.getGoal('v1-goal');
      const migratedAsset = await upgraded.getAsset('v1-asset');
      const migratedSettings = await upgraded.getSettings();

      expect(migratedGoal).toEqual(v1Goal);
      expect(migratedAsset).toEqual(v1Asset);
      expect(migratedSettings.baseCurrency).toBe('EUR');

      // New v2 tables work after upgrade
      await upgraded.saveMarketQuote({
        symbol: 'GOOGL',
        price: 190,
        currency: 'USD',
        fetchedAt: '2026-04-01T10:00:00.000Z',
      });
      const quotes = await upgraded.getAllMarketQuotes();
      expect(quotes).toHaveLength(1);
      expect(quotes[0].symbol).toBe('GOOGL');

      upgraded.close();
      await service.open();
    });
  });

  describe('Settings', () => {
    it('should return default settings if empty', async () => {
      const settings = await service.getSettings();
      expect(settings.id).toBe('default');
      expect(settings.baseCurrency).toBe('PLN');
      expect(settings.defaultDashboard).toBe('goal_first');
      expect(settings.theme).toBe('system');
      expect(settings.cushion).toEqual({
        isEnabled: true,
        averageMonthlyExpenses: 6000,
        coverageMonths: 6,
      });
    });

    it('should update partial settings including twelveDataApiKey', async () => {
      const updated = await service.updateSettings({
        baseCurrency: 'EUR',
        theme: 'dark',
        twelveDataApiKey: 'secret-td-key',
        cushion: {
          isEnabled: false,
          averageMonthlyExpenses: 7000,
          coverageMonths: 12,
        },
      });

      expect(updated.baseCurrency).toBe('EUR');
      expect(updated.theme).toBe('dark');
      expect(updated.twelveDataApiKey).toBe('secret-td-key');
      expect(updated.cushion.coverageMonths).toBe(12);

      const retrieved = await service.getSettings();
      expect(retrieved.baseCurrency).toBe('EUR');
      expect(retrieved.twelveDataApiKey).toBe('secret-td-key');
    });
  });

  describe('Goals CRUD', () => {
    const sampleGoal: Goal = {
      id: 'g-1',
      name: 'Emergency Buffer',
      targetAmount: 50000,
      order: 1,
      isCompleted: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    it('should save, retrieve, and delete a goal', async () => {
      await service.saveGoal(sampleGoal);
      const fetched = await service.getGoal('g-1');
      expect(fetched).toEqual(sampleGoal);

      const all = await service.getAllGoals();
      expect(all.length).toBe(1);

      await service.deleteGoal('g-1');
      const afterDelete = await service.getGoal('g-1');
      expect(afterDelete).toBeUndefined();
    });

    it('should return goals ordered by order field', async () => {
      await service.saveGoals([
        { ...sampleGoal, id: 'g-2', order: 2, name: 'Goal 2' },
        { ...sampleGoal, id: 'g-1', order: 1, name: 'Goal 1' },
      ]);

      const goals = await service.getAllGoals();
      expect(goals.length).toBe(2);
      expect(goals[0].id).toBe('g-1');
      expect(goals[1].id).toBe('g-2');
    });
  });

  describe('Assets, StockGrants, MarketQuotes, FxRates & Cascading Delete', () => {
    const sampleStockAsset: Asset = {
      id: 'a-stock',
      name: 'Alphabet RSU',
      type: 'employer_stock',
      currency: 'USD',
      balance: 0,
      employerStock: {
        tickerSymbol: 'GOOGL',
        vestedSharesBaseline: 20,
        vestedSharesBaselineDate: '2026-01-01',
      },
      isGoalEligible: true,
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    const sampleHistory: AssetBalanceHistory = {
      id: 'h-1',
      assetId: 'a-stock',
      balance: 0,
      date: '2026-01-15',
    };

    const sampleGrant1: StockGrant = {
      id: 'gr-1',
      assetId: 'a-stock',
      name: '2025 Grant',
      grantDate: '2025-03-01',
      totalShares: 40,
      schedule: { frequency: 'quarterly', durationMonths: 12, cliffMonths: 0 },
      tranches: [
        { id: 't-1', vestDate: '2025-06-01', shares: 10 },
        { id: 't-2', vestDate: '2025-09-01', shares: 10 },
        { id: 't-3', vestDate: '2025-12-01', shares: 10 },
        { id: 't-4', vestDate: '2026-03-01', shares: 10 },
      ],
      isScheduleCustomized: false,
      createdAt: '2025-03-01T00:00:00.000Z',
      updatedAt: '2025-03-01T00:00:00.000Z',
    };

    const sampleGrant2: StockGrant = {
      id: 'gr-2',
      assetId: 'a-stock',
      name: '2026 Grant',
      grantDate: '2026-03-01',
      totalShares: 20,
      schedule: { frequency: 'annual', durationMonths: 12, cliffMonths: 0 },
      tranches: [{ id: 't-5', vestDate: '2027-03-01', shares: 20 }],
      isScheduleCustomized: false,
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z',
    };

    it('should perform CRUD on stockGrants, marketQuotes, and fxRates', async () => {
      await service.saveAsset(sampleStockAsset);
      await service.saveStockGrant(sampleGrant2);
      await service.saveStockGrant(sampleGrant1);

      const allGrants = await service.getAllStockGrants();
      expect(allGrants).toHaveLength(2);
      expect(allGrants[0].id).toBe('gr-1');
      expect(allGrants[1].id).toBe('gr-2');

      const assetGrants = await service.getStockGrants('a-stock');
      expect(assetGrants).toHaveLength(2);

      await service.deleteStockGrant('gr-2');
      expect(await service.getStockGrants('a-stock')).toHaveLength(1);

      const quote: MarketQuote = {
        symbol: 'googl',
        price: 182.5,
        currency: 'USD',
        name: 'Alphabet Inc.',
        exchange: 'NASDAQ',
        fetchedAt: '2026-04-01T12:00:00.000Z',
      };
      await service.saveMarketQuote(quote);
      const quotes = await service.getAllMarketQuotes();
      expect(quotes).toHaveLength(1);
      expect(quotes[0].symbol).toBe('GOOGL');
      expect(quotes[0].price).toBe(182.5);

      const fx: FxRate = {
        pair: 'usd/pln',
        from: 'usd',
        to: 'pln',
        rate: 3.98,
        effectiveDate: '2026-04-01',
        fetchedAt: '2026-04-01T12:00:00.000Z',
      };
      await service.saveFxRate(fx);
      const rates = await service.getAllFxRates();
      expect(rates).toHaveLength(1);
      expect(rates[0].pair).toBe('USD/PLN');
      expect(rates[0].rate).toBe(3.98);
    });

    it('should cascade delete assetHistory and stockGrants and clear sourceAssetId on linked stockSales when asset is deleted', async () => {
      await service.saveAsset(sampleStockAsset);
      await service.saveAssetHistory(sampleHistory);
      await service.saveStockGrant(sampleGrant1);
      await service.saveStockGrant(sampleGrant2);

      const linkedSale: StockSale = {
        id: 'sale-linked',
        sourceAssetId: 'a-stock',
        companyOrTicker: 'GOOGL',
        saleDate: '2026-03-20',
        sharesSold: 5,
        pricePerShare: 180,
        currency: 'USD',
        grossValue: 900,
      };
      const otherSale: StockSale = {
        id: 'sale-other',
        sourceAssetId: 'other-asset',
        companyOrTicker: 'MSFT',
        saleDate: '2026-03-21',
        sharesSold: 2,
        pricePerShare: 420,
        currency: 'USD',
        grossValue: 840,
      };
      await service.saveStockSale(linkedSale);
      await service.saveStockSale(otherSale);

      await service.deleteAsset('a-stock');

      expect(await service.getAsset('a-stock')).toBeUndefined();
      expect(await service.getAssetHistory('a-stock')).toHaveLength(0);
      expect(await service.getStockGrants('a-stock')).toHaveLength(0);

      // Sales are history and must be kept, with sourceAssetId cleared on linked sales
      const allSales = await service.getAllStockSales();
      expect(allSales).toHaveLength(2);
      const updatedLinked = await service.getStockSale('sale-linked');
      expect(updatedLinked).toBeDefined();
      expect(updatedLinked?.sourceAssetId).toBeUndefined();
      const untouchedOther = await service.getStockSale('sale-other');
      expect(untouchedOther?.sourceAssetId).toBe('other-asset');
    });
  });

  describe('Demo Data & Clear Data', () => {
    it('should seed demo data including employer_stock asset, 2 grants, baseline, linked sale, quote and USD/PLN rate', async () => {
      await service.seedDemoData(true);

      const goals = await service.getAllGoals();
      const assets = await service.getAllAssets();
      const grants = await service.getAllStockGrants();
      const quotes = await service.getAllMarketQuotes();
      const fxRates = await service.getAllFxRates();
      const sales = await service.getAllStockSales();

      expect(goals.length).toBeGreaterThan(0);
      expect(assets.length).toBeGreaterThan(0);

      const employerStock = assets.find((a) => a.type === 'employer_stock');
      expect(employerStock).toBeDefined();
      expect(employerStock?.employerStock?.tickerSymbol).toBe('GOOGL');
      expect(employerStock?.employerStock?.vestedSharesBaseline).toBeDefined();
      expect(employerStock?.employerStock?.vestedSharesBaselineDate).toBeDefined();

      expect(grants).toHaveLength(2);
      expect(grants.every((g) => g.assetId === employerStock?.id)).toBe(true);

      expect(sales.some((s) => s.sourceAssetId === employerStock?.id)).toBe(true);
      expect(quotes.some((q) => q.symbol === 'GOOGL')).toBe(true);
      expect(fxRates.some((r) => r.pair === 'USD/PLN')).toBe(true);

      const hasData = await service.hasAnyData();
      expect(hasData).toBe(true);
    });

    it('should clear all data including v2 tables and reset default settings', async () => {
      await service.seedDemoData(true);
      await service.clearAllData();

      expect(await service.getAllGoals()).toHaveLength(0);
      expect(await service.getAllStockGrants()).toHaveLength(0);
      expect(await service.getAllMarketQuotes()).toHaveLength(0);
      expect(await service.getAllFxRates()).toHaveLength(0);

      const settings = await service.getSettings();
      expect(settings.id).toBe('default');
    });
  });

  describe('Export and Import (Backup v2 + v1 Compatibility)', () => {
    it('should export all data at version 2 including stockGrants, marketQuotes, fxRates', async () => {
      await service.seedDemoData(true);
      const json = await service.exportAllData();

      expect(typeof json).toBe('string');
      const parsed = JSON.parse(json);
      expect(parsed.version).toBe(2);
      expect(parsed.appName).toBe('Worth It');
      expect(parsed.data.goals.length).toBeGreaterThan(0);
      expect(parsed.data.assets.length).toBeGreaterThan(0);
      expect(parsed.data.stockGrants.length).toBe(2);
      expect(parsed.data.marketQuotes.length).toBe(1);
      expect(parsed.data.fxRates.length).toBe(1);
    });

    it('should import previously exported v2 data accurately', async () => {
      await service.seedDemoData(true);
      const exportedJson = await service.exportAllData();

      await service.clearAllData();
      expect((await service.getAllStockGrants()).length).toBe(0);

      await service.importAllData(exportedJson);
      expect((await service.getAllGoals()).length).toBeGreaterThan(0);
      expect((await service.getAllAssets()).length).toBeGreaterThan(0);
      expect((await service.getAllStockGrants()).length).toBe(2);
      expect((await service.getAllMarketQuotes()).length).toBe(1);
      expect((await service.getAllFxRates()).length).toBe(1);
    });

    it('should accept a v1 backup payload (missing stockGrants, marketQuotes, fxRates arrays)', async () => {
      const v1Backup = {
        version: 1,
        exportedAt: '2026-01-10T00:00:00.000Z',
        appName: 'Worth It',
        data: {
          goals: [
            {
              id: 'g-v1',
              name: 'V1 Goal',
              targetAmount: 10000,
              order: 1,
              isCompleted: false,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
          assets: [
            {
              id: 'a-v1',
              name: 'V1 Bank',
              type: 'bank_account',
              currency: 'PLN',
              balance: 5000,
              isGoalEligible: true,
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
          assetHistory: [],
          incomeSources: [],
          incomeRecords: [],
          expenseCategories: [],
          expenseRecords: [],
          stockSales: [],
          settings: [DEFAULT_SETTINGS],
        },
      };

      await service.importAllData(JSON.stringify(v1Backup));

      expect(await service.getAllGoals()).toHaveLength(1);
      expect(await service.getAllAssets()).toHaveLength(1);
      expect(await service.getAllStockGrants()).toEqual([]);
      expect(await service.getAllMarketQuotes()).toEqual([]);
      expect(await service.getAllFxRates()).toEqual([]);
    });

    it('should reject invalid JSON syntax', async () => {
      await expect(service.importAllData('invalid { json')).rejects.toThrow(
        /Invalid JSON syntax/
      );
    });

    it('should reject when AssetBalanceHistory references non-existent assetId', async () => {
      const invalidData = {
        version: 2,
        appName: 'Worth It',
        data: {
          goals: [],
          assets: [
            {
              id: 'asset-1',
              name: 'Bank',
              type: 'bank_account',
              currency: 'PLN',
              balance: 1000,
              isGoalEligible: true,
              updatedAt: '2026-01-01T00:00:00Z',
            },
          ],
          assetHistory: [
            {
              id: 'hist-1',
              assetId: 'non-existent-asset-999',
              balance: 500,
              date: '2026-01-01',
            },
          ],
          incomeSources: [],
          incomeRecords: [],
          expenseCategories: [],
          expenseRecords: [],
          stockSales: [],
          stockGrants: [],
          marketQuotes: [],
          fxRates: [],
          settings: [DEFAULT_SETTINGS],
        },
      };

      await expect(
        service.importAllData(JSON.stringify(invalidData))
      ).rejects.toThrow(/references non-existent assetId "non-existent-asset-999"/);
    });

    it('should reject when StockGrant references non-existent assetId', async () => {
      const invalidData = {
        version: 2,
        appName: 'Worth It',
        data: {
          goals: [],
          assets: [],
          assetHistory: [],
          incomeSources: [],
          incomeRecords: [],
          expenseCategories: [],
          expenseRecords: [],
          stockSales: [],
          stockGrants: [
            {
              id: 'gr-orphan',
              assetId: 'missing-asset',
              grantDate: '2026-01-01',
              totalShares: 10,
              schedule: { frequency: 'annual', durationMonths: 12, cliffMonths: 0 },
              tranches: [{ id: 't1', vestDate: '2027-01-01', shares: 10 }],
              isScheduleCustomized: false,
              createdAt: '2026-01-01T00:00:00Z',
              updatedAt: '2026-01-01T00:00:00Z',
            },
          ],
          marketQuotes: [],
          fxRates: [],
          settings: [DEFAULT_SETTINGS],
        },
      };

      await expect(
        service.importAllData(JSON.stringify(invalidData))
      ).rejects.toThrow(/references non-existent assetId "missing-asset"/);
    });

    it('should reject when IncomeRecord references non-existent incomeSourceId', async () => {
      const invalidData = {
        version: 1,
        appName: 'Worth It',
        data: {
          goals: [],
          assets: [],
          assetHistory: [],
          incomeSources: [
            {
              id: 'src-1',
              name: 'Job',
              type: 'salary',
              amount: 5000,
              currency: 'PLN',
              frequency: 'monthly',
              isEnabled: true,
            },
          ],
          incomeRecords: [
            {
              id: 'inc-1',
              incomeSourceId: 'unknown-src',
              name: 'Bonus',
              type: 'salary',
              amount: 1000,
              currency: 'PLN',
              receivedDate: '2026-01-01',
              isActual: true,
            },
          ],
          expenseCategories: [],
          expenseRecords: [],
          stockSales: [],
          settings: [DEFAULT_SETTINGS],
        },
      };

      await expect(
        service.importAllData(JSON.stringify(invalidData))
      ).rejects.toThrow(/references non-existent incomeSourceId "unknown-src"/);
    });

    it('should reject when ExpenseRecord references non-existent categoryId', async () => {
      const invalidData = {
        version: 1,
        appName: 'Worth It',
        data: {
          goals: [],
          assets: [],
          assetHistory: [],
          incomeSources: [],
          incomeRecords: [],
          expenseCategories: [
            {
              id: 'cat-1',
              name: 'Food',
              expectedMonthlyAmount: 1000,
              currency: 'PLN',
              isEnabled: true,
              order: 1,
            },
          ],
          expenseRecords: [
            {
              id: 'exp-1',
              categoryId: 'ghost-category',
              categoryName: 'Dining',
              amount: 50,
              currency: 'PLN',
              date: '2026-01-01',
              isActual: true,
            },
          ],
          stockSales: [],
          settings: [DEFAULT_SETTINGS],
        },
      };

      await expect(
        service.importAllData(JSON.stringify(invalidData))
      ).rejects.toThrow(/references non-existent categoryId "ghost-category"/);
    });
  });
});
