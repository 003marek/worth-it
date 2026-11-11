import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { StorageService, DEFAULT_SETTINGS } from './storage.service';
import {
  Goal,
  Asset,
  AssetBalanceHistory,
  IncomeSource,
  IncomeRecord,
  ExpenseCategory,
  ExpenseRecord,
  StockSale,
} from '../models/worth-it.model';

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
    await service.clearAllData();
  });

  it('should be created and have all required tables', () => {
    expect(service).toBeTruthy();
    expect(service.goals).toBeDefined();
    expect(service.assets).toBeDefined();
    expect(service.assetHistory).toBeDefined();
    expect(service.incomeSources).toBeDefined();
    expect(service.incomeRecords).toBeDefined();
    expect(service.expenseCategories).toBeDefined();
    expect(service.expenseRecords).toBeDefined();
    expect(service.stockSales).toBeDefined();
    expect(service.settings).toBeDefined();
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

    it('should update partial settings', async () => {
      const updated = await service.updateSettings({
        baseCurrency: 'EUR',
        theme: 'dark',
        cushion: {
          isEnabled: false,
          averageMonthlyExpenses: 7000,
          coverageMonths: 12,
        },
      });

      expect(updated.baseCurrency).toBe('EUR');
      expect(updated.theme).toBe('dark');
      expect(updated.cushion.coverageMonths).toBe(12);

      const retrieved = await service.getSettings();
      expect(retrieved.baseCurrency).toBe('EUR');
      expect(retrieved.theme).toBe('dark');
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

  describe('Assets and Cascading History', () => {
    const sampleAsset: Asset = {
      id: 'a-1',
      name: 'Checking Account',
      type: 'bank_account',
      currency: 'PLN',
      balance: 10000,
      isGoalEligible: true,
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    const sampleHistory: AssetBalanceHistory = {
      id: 'h-1',
      assetId: 'a-1',
      balance: 9500,
      date: '2026-01-15',
    };

    it('should save asset and retrieve history', async () => {
      await service.saveAsset(sampleAsset);
      await service.saveAssetHistory(sampleHistory);

      const history = await service.getAssetHistory('a-1');
      expect(history.length).toBe(1);
      expect(history[0].balance).toBe(9500);
    });

    it('should cascade delete asset history when asset is deleted', async () => {
      await service.saveAsset(sampleAsset);
      await service.saveAssetHistory(sampleHistory);

      await service.deleteAsset('a-1');

      const asset = await service.getAsset('a-1');
      expect(asset).toBeUndefined();

      const history = await service.getAssetHistory('a-1');
      expect(history.length).toBe(0);
    });
  });

  describe('Demo Data & Clear Data', () => {
    it('should seed demo data properly', async () => {
      await service.seedDemoData(true);

      const goals = await service.getAllGoals();
      const assets = await service.getAllAssets();
      const incomeSources = await service.getAllIncomeSources();
      const expenseCategories = await service.getAllExpenseCategories();

      expect(goals.length).toBeGreaterThan(0);
      expect(assets.length).toBeGreaterThan(0);
      expect(incomeSources.length).toBeGreaterThan(0);
      expect(expenseCategories.length).toBeGreaterThan(0);

      const hasData = await service.hasAnyData();
      expect(hasData).toBe(true);
    });

    it('should clear all data and reset default settings', async () => {
      await service.seedDemoData(true);
      await service.clearAllData();

      const goals = await service.getAllGoals();
      expect(goals.length).toBe(0);

      const settings = await service.getSettings();
      expect(settings.id).toBe('default');
    });
  });

  describe('Export and Import with Validation', () => {
    it('should export all data to a valid JSON string', async () => {
      await service.seedDemoData(true);
      const json = await service.exportAllData();

      expect(typeof json).toBe('string');
      const parsed = JSON.parse(json);
      expect(parsed.version).toBe(1);
      expect(parsed.appName).toBe('Worth It');
      expect(parsed.data.goals.length).toBeGreaterThan(0);
      expect(parsed.data.assets.length).toBeGreaterThan(0);
    });

    it('should import previously exported data accurately', async () => {
      await service.seedDemoData(true);
      const exportedJson = await service.exportAllData();

      await service.clearAllData();
      expect((await service.getAllGoals()).length).toBe(0);

      await service.importAllData(exportedJson);
      expect((await service.getAllGoals()).length).toBeGreaterThan(0);
      expect((await service.getAllAssets()).length).toBeGreaterThan(0);
    });

    it('should reject invalid JSON syntax', async () => {
      await expect(service.importAllData('invalid { json')).rejects.toThrow(
        /Invalid JSON syntax/
      );
    });

    it('should reject when AssetBalanceHistory references non-existent assetId', async () => {
      const invalidData = {
        version: 1,
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
          settings: [DEFAULT_SETTINGS],
        },
      };

      await expect(
        service.importAllData(JSON.stringify(invalidData))
      ).rejects.toThrow(/references non-existent assetId "non-existent-asset-999"/);
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
