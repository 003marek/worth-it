import { Injectable } from '@angular/core';
import Dexie, { Table } from 'dexie';
import {
  ApplicationSettings,
  Asset,
  AssetBalanceHistory,
  ExpenseCategory,
  ExpenseRecord,
  Goal,
  IncomeRecord,
  IncomeSource,
  StockSale,
  WorthItBackupData,
} from '../models/worth-it.model';

export const DEFAULT_SETTINGS: ApplicationSettings = {
  id: 'default',
  baseCurrency: 'PLN',
  defaultDashboard: 'goal_first',
  theme: 'system',
  cushion: {
    isEnabled: true,
    averageMonthlyExpenses: 6000,
    coverageMonths: 6,
  },
};

@Injectable({
  providedIn: 'root',
})
export class StorageService extends Dexie {
  goals!: Table<Goal, string>;
  assets!: Table<Asset, string>;
  assetHistory!: Table<AssetBalanceHistory, string>;
  incomeSources!: Table<IncomeSource, string>;
  incomeRecords!: Table<IncomeRecord, string>;
  expenseCategories!: Table<ExpenseCategory, string>;
  expenseRecords!: Table<ExpenseRecord, string>;
  stockSales!: Table<StockSale, string>;
  settings!: Table<ApplicationSettings, string>;

  constructor() {
    super('WorthItDB');

    this.version(1).stores({
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

    this.on('populate', () => {
      this.settings.add({ ...DEFAULT_SETTINGS });
    });
  }

  // --- Settings ---
  async getSettings(): Promise<ApplicationSettings> {
    const existing = await this.settings.get('default');
    if (existing) {
      return existing;
    }
    const defaults: ApplicationSettings = { ...DEFAULT_SETTINGS };
    await this.settings.put(defaults);
    return defaults;
  }

  async saveSettings(settings: ApplicationSettings): Promise<void> {
    await this.settings.put({ ...settings, id: 'default' });
  }

  async updateSettings(
    partial: Partial<ApplicationSettings>
  ): Promise<ApplicationSettings> {
    const current = await this.getSettings();
    const updated: ApplicationSettings = {
      ...current,
      ...partial,
      cushion: {
        ...current.cushion,
        ...(partial.cushion || {}),
      },
      id: 'default',
    };
    await this.settings.put(updated);
    return updated;
  }

  // --- Goals ---
  async getAllGoals(): Promise<Goal[]> {
    return this.goals.orderBy('order').toArray();
  }

  async getGoal(id: string): Promise<Goal | undefined> {
    return this.goals.get(id);
  }

  async saveGoal(goal: Goal): Promise<void> {
    await this.goals.put(goal);
  }

  async saveGoals(goals: Goal[]): Promise<void> {
    await this.goals.bulkPut(goals);
  }

  async deleteGoal(id: string): Promise<void> {
    await this.goals.delete(id);
  }

  // --- Assets ---
  async getAllAssets(): Promise<Asset[]> {
    return this.assets.toArray();
  }

  async getAsset(id: string): Promise<Asset | undefined> {
    return this.assets.get(id);
  }

  async saveAsset(asset: Asset): Promise<void> {
    await this.assets.put(asset);
  }

  async deleteAsset(id: string): Promise<void> {
    await this.transaction('rw', [this.assets, this.assetHistory], async () => {
      await this.assets.delete(id);
      await this.assetHistory.where('assetId').equals(id).delete();
    });
  }

  // --- Asset Balance History ---
  async getAllAssetHistory(): Promise<AssetBalanceHistory[]> {
    return this.assetHistory.orderBy('date').toArray();
  }

  async getAssetHistory(assetId: string): Promise<AssetBalanceHistory[]> {
    return this.assetHistory.where('assetId').equals(assetId).sortBy('date');
  }

  async saveAssetHistory(record: AssetBalanceHistory): Promise<void> {
    await this.assetHistory.put(record);
  }

  async saveAssetHistories(records: AssetBalanceHistory[]): Promise<void> {
    await this.assetHistory.bulkPut(records);
  }

  async deleteAssetHistory(id: string): Promise<void> {
    await this.assetHistory.delete(id);
  }

  // --- Income Sources ---
  async getAllIncomeSources(): Promise<IncomeSource[]> {
    return this.incomeSources.toArray();
  }

  async getIncomeSource(id: string): Promise<IncomeSource | undefined> {
    return this.incomeSources.get(id);
  }

  async saveIncomeSource(source: IncomeSource): Promise<void> {
    await this.incomeSources.put(source);
  }

  async deleteIncomeSource(id: string): Promise<void> {
    await this.transaction('rw', [this.incomeSources, this.incomeRecords], async () => {
      await this.incomeSources.delete(id);
      await this.incomeRecords
        .where('incomeSourceId')
        .equals(id)
        .modify({ incomeSourceId: undefined });
    });
  }

  // --- Income Records ---
  async getAllIncomeRecords(): Promise<IncomeRecord[]> {
    return this.incomeRecords.orderBy('receivedDate').toArray();
  }

  async getIncomeRecords(sourceId?: string): Promise<IncomeRecord[]> {
    if (sourceId) {
      return this.incomeRecords.where('incomeSourceId').equals(sourceId).toArray();
    }
    return this.getAllIncomeRecords();
  }

  async saveIncomeRecord(record: IncomeRecord): Promise<void> {
    await this.incomeRecords.put(record);
  }

  async deleteIncomeRecord(id: string): Promise<void> {
    await this.incomeRecords.delete(id);
  }

  // --- Expense Categories ---
  async getAllExpenseCategories(): Promise<ExpenseCategory[]> {
    return this.expenseCategories.orderBy('order').toArray();
  }

  async getExpenseCategory(id: string): Promise<ExpenseCategory | undefined> {
    return this.expenseCategories.get(id);
  }

  async saveExpenseCategory(category: ExpenseCategory): Promise<void> {
    await this.expenseCategories.put(category);
  }

  async saveExpenseCategories(categories: ExpenseCategory[]): Promise<void> {
    await this.expenseCategories.bulkPut(categories);
  }

  async deleteExpenseCategory(id: string): Promise<void> {
    await this.transaction('rw', [this.expenseCategories, this.expenseRecords], async () => {
      await this.expenseCategories.delete(id);
      await this.expenseRecords
        .where('categoryId')
        .equals(id)
        .modify({ categoryId: undefined });
    });
  }

  // --- Expense Records ---
  async getAllExpenseRecords(): Promise<ExpenseRecord[]> {
    return this.expenseRecords.orderBy('date').toArray();
  }

  async getExpenseRecords(categoryId?: string): Promise<ExpenseRecord[]> {
    if (categoryId) {
      return this.expenseRecords.where('categoryId').equals(categoryId).toArray();
    }
    return this.getAllExpenseRecords();
  }

  async saveExpenseRecord(record: ExpenseRecord): Promise<void> {
    await this.expenseRecords.put(record);
  }

  async deleteExpenseRecord(id: string): Promise<void> {
    await this.expenseRecords.delete(id);
  }

  // --- Stock Sales ---
  async getAllStockSales(): Promise<StockSale[]> {
    return this.stockSales.orderBy('saleDate').toArray();
  }

  async getStockSale(id: string): Promise<StockSale | undefined> {
    return this.stockSales.get(id);
  }

  async saveStockSale(sale: StockSale): Promise<void> {
    await this.stockSales.put(sale);
  }

  async deleteStockSale(id: string): Promise<void> {
    await this.stockSales.delete(id);
  }

  // --- Clear / Reset ---
  async clearAllData(): Promise<void> {
    await this.transaction(
      'rw',
      [
        this.goals,
        this.assets,
        this.assetHistory,
        this.incomeSources,
        this.incomeRecords,
        this.expenseCategories,
        this.expenseRecords,
        this.stockSales,
        this.settings,
      ],
      async () => {
        await Promise.all([
          this.goals.clear(),
          this.assets.clear(),
          this.assetHistory.clear(),
          this.incomeSources.clear(),
          this.incomeRecords.clear(),
          this.expenseCategories.clear(),
          this.expenseRecords.clear(),
          this.stockSales.clear(),
          this.settings.clear(),
        ]);
        await this.settings.add({ ...DEFAULT_SETTINGS });
      }
    );
  }

  async hasAnyData(): Promise<boolean> {
    const counts = await Promise.all([
      this.goals.count(),
      this.assets.count(),
      this.incomeSources.count(),
      this.expenseCategories.count(),
    ]);
    return counts.some((count) => count > 0);
  }

  // --- Seed Demo Data ---
  async seedDemoData(clearExisting = false): Promise<void> {
    if (clearExisting) {
      await this.clearAllData();
    } else {
      const exists = await this.hasAnyData();
      if (exists) {
        return;
      }
    }

    const demoGoals: Goal[] = [
      {
        id: 'goal-1',
        name: 'Apartment Down Payment',
        targetAmount: 200000,
        order: 1,
        isCompleted: false,
        createdAt: '2026-01-15T10:00:00.000Z',
        updatedAt: '2026-01-15T10:00:00.000Z',
      },
      {
        id: 'goal-2',
        name: 'Family Car',
        targetAmount: 80000,
        order: 2,
        isCompleted: false,
        createdAt: '2026-02-01T10:00:00.000Z',
        updatedAt: '2026-02-01T10:00:00.000Z',
      },
      {
        id: 'goal-3',
        name: 'Financial Independence',
        targetAmount: 1000000,
        order: 3,
        isCompleted: false,
        createdAt: '2026-02-01T10:00:00.000Z',
        updatedAt: '2026-02-01T10:00:00.000Z',
      },
    ];

    const demoAssets: Asset[] = [
      {
        id: 'asset-1',
        name: 'Main Checking Account',
        type: 'bank_account',
        currency: 'PLN',
        balance: 18500,
        isGoalEligible: true,
        updatedAt: '2026-03-31T12:00:00.000Z',
      },
      {
        id: 'asset-2',
        name: 'High-Yield Savings Account',
        type: 'bank_account',
        currency: 'PLN',
        balance: 45000,
        isGoalEligible: true,
        updatedAt: '2026-03-31T12:00:00.000Z',
      },
      {
        id: 'asset-3',
        name: 'Vanguard All-World ETF',
        type: 'stocks_etf',
        currency: 'PLN',
        balance: 65000,
        isGoalEligible: true,
        updatedAt: '2026-03-31T12:00:00.000Z',
      },
      {
        id: 'asset-4',
        name: 'Physical Cash Reserve',
        type: 'cash',
        currency: 'PLN',
        balance: 3500,
        isGoalEligible: true,
        updatedAt: '2026-03-31T12:00:00.000Z',
      },
      {
        id: 'asset-5',
        name: 'Employer Stock (RSUs)',
        type: 'employer_stock',
        currency: 'USD',
        balance: 12000,
        isGoalEligible: true,
        updatedAt: '2026-03-31T12:00:00.000Z',
      },
      {
        id: 'asset-6',
        name: 'IKE Retirement Account',
        type: 'retirement',
        currency: 'PLN',
        balance: 32000,
        isGoalEligible: false,
        updatedAt: '2026-03-31T12:00:00.000Z',
      },
    ];

    const demoAssetHistory: AssetBalanceHistory[] = [
      {
        id: 'hist-1',
        assetId: 'asset-1',
        balance: 15200,
        date: '2026-01-31',
        note: 'End of January balance',
      },
      {
        id: 'hist-2',
        assetId: 'asset-1',
        balance: 17100,
        date: '2026-02-28',
        note: 'End of February balance',
      },
      {
        id: 'hist-3',
        assetId: 'asset-1',
        balance: 18500,
        date: '2026-03-31',
        note: 'End of March balance',
      },
      {
        id: 'hist-4',
        assetId: 'asset-2',
        balance: 40000,
        date: '2026-01-31',
        note: 'Emergency savings initial',
      },
      {
        id: 'hist-5',
        assetId: 'asset-2',
        balance: 42500,
        date: '2026-02-28',
        note: 'Monthly deposit + interest',
      },
      {
        id: 'hist-6',
        assetId: 'asset-2',
        balance: 45000,
        date: '2026-03-31',
        note: 'Monthly deposit + interest',
      },
      {
        id: 'hist-7',
        assetId: 'asset-3',
        balance: 58000,
        date: '2026-01-31',
        note: 'ETF portfolio valuation',
      },
      {
        id: 'hist-8',
        assetId: 'asset-3',
        balance: 61500,
        date: '2026-02-28',
        note: 'Monthly purchase',
      },
      {
        id: 'hist-9',
        assetId: 'asset-3',
        balance: 65000,
        date: '2026-03-31',
        note: 'Monthly purchase + valuation update',
      },
    ];

    const demoIncomeSources: IncomeSource[] = [
      {
        id: 'source-1',
        name: 'Senior Software Engineer Salary',
        type: 'salary',
        amount: 15000,
        currency: 'PLN',
        frequency: 'monthly',
        isEnabled: true,
        effectiveDate: '2026-01-01',
      },
      {
        id: 'source-2',
        name: 'Tech Consulting',
        type: 'other',
        amount: 3500,
        currency: 'PLN',
        frequency: 'monthly',
        isEnabled: true,
        effectiveDate: '2026-01-01',
      },
    ];

    const demoIncomeRecords: IncomeRecord[] = [
      {
        id: 'inc-1',
        incomeSourceId: 'source-1',
        name: 'Senior Software Engineer Salary',
        type: 'salary',
        amount: 15000,
        currency: 'PLN',
        receivedDate: '2026-01-28',
        isActual: true,
        note: 'January salary',
      },
      {
        id: 'inc-2',
        incomeSourceId: 'source-1',
        name: 'Senior Software Engineer Salary',
        type: 'salary',
        amount: 15000,
        currency: 'PLN',
        receivedDate: '2026-02-27',
        isActual: true,
        note: 'February salary',
      },
      {
        id: 'inc-3',
        incomeSourceId: 'source-1',
        name: 'Senior Software Engineer Salary',
        type: 'salary',
        amount: 15000,
        currency: 'PLN',
        receivedDate: '2026-03-27',
        isActual: true,
        note: 'March salary',
      },
      {
        id: 'inc-4',
        incomeSourceId: 'source-2',
        name: 'Tech Consulting',
        type: 'other',
        amount: 3500,
        currency: 'PLN',
        receivedDate: '2026-02-15',
        isActual: true,
        note: 'Q1 retainer payment',
      },
      {
        id: 'inc-5',
        incomeSourceId: 'source-2',
        name: 'Tech Consulting',
        type: 'other',
        amount: 4200,
        currency: 'PLN',
        receivedDate: '2026-03-15',
        isActual: true,
        note: 'March retainer + extra advisory hours',
      },
    ];

    const demoExpenseCategories: ExpenseCategory[] = [
      {
        id: 'cat-1',
        name: 'Housing & Utilities',
        expectedMonthlyAmount: 3500,
        currency: 'PLN',
        isEnabled: true,
        order: 1,
      },
      {
        id: 'cat-2',
        name: 'Groceries & Household',
        expectedMonthlyAmount: 1600,
        currency: 'PLN',
        isEnabled: true,
        order: 2,
      },
      {
        id: 'cat-3',
        name: 'Transport & Fuel',
        expectedMonthlyAmount: 600,
        currency: 'PLN',
        isEnabled: true,
        order: 3,
      },
      {
        id: 'cat-4',
        name: 'Health & Wellbeing',
        expectedMonthlyAmount: 400,
        currency: 'PLN',
        isEnabled: true,
        order: 4,
      },
      {
        id: 'cat-5',
        name: 'Subscriptions & Tech',
        expectedMonthlyAmount: 250,
        currency: 'PLN',
        isEnabled: true,
        order: 5,
      },
      {
        id: 'cat-6',
        name: 'Dining & Entertainment',
        expectedMonthlyAmount: 800,
        currency: 'PLN',
        isEnabled: true,
        order: 6,
      },
    ];

    const demoExpenseRecords: ExpenseRecord[] = [
      {
        id: 'exp-1',
        categoryId: 'cat-1',
        categoryName: 'Housing & Utilities',
        amount: 3450,
        currency: 'PLN',
        date: '2026-03-05',
        isActual: true,
        note: 'Rent + electricity & heating',
      },
      {
        id: 'exp-2',
        categoryId: 'cat-2',
        categoryName: 'Groceries & Household',
        amount: 1540,
        currency: 'PLN',
        date: '2026-03-25',
        isActual: true,
        note: 'Supermarket and local groceries',
      },
      {
        id: 'exp-3',
        categoryId: 'cat-3',
        categoryName: 'Transport & Fuel',
        amount: 580,
        currency: 'PLN',
        date: '2026-03-20',
        isActual: true,
        note: 'Gas and parking fees',
      },
      {
        id: 'exp-4',
        categoryId: 'cat-5',
        categoryName: 'Subscriptions & Tech',
        amount: 230,
        currency: 'PLN',
        date: '2026-03-10',
        isActual: true,
        note: 'Streaming & internet',
      },
    ];

    const demoStockSales: StockSale[] = [
      {
        id: 'sale-1',
        companyOrTicker: 'ACME',
        saleDate: '2026-03-20',
        sharesSold: 30,
        pricePerShare: 125,
        currency: 'USD',
        grossValue: 3750,
        plnEquivalent: 15000,
        notes: 'Q1 RSU vesting tranche sale',
      },
    ];

    await this.transaction(
      'rw',
      [
        this.goals,
        this.assets,
        this.assetHistory,
        this.incomeSources,
        this.incomeRecords,
        this.expenseCategories,
        this.expenseRecords,
        this.stockSales,
        this.settings,
      ],
      async () => {
        await this.goals.bulkPut(demoGoals);
        await this.assets.bulkPut(demoAssets);
        await this.assetHistory.bulkPut(demoAssetHistory);
        await this.incomeSources.bulkPut(demoIncomeSources);
        await this.incomeRecords.bulkPut(demoIncomeRecords);
        await this.expenseCategories.bulkPut(demoExpenseCategories);
        await this.expenseRecords.bulkPut(demoExpenseRecords);
        await this.stockSales.bulkPut(demoStockSales);
        await this.settings.put({ ...DEFAULT_SETTINGS });
      }
    );
  }

  // --- Export / Import ---
  async exportAllData(): Promise<string> {
    const [
      goals,
      assets,
      assetHistory,
      incomeSources,
      incomeRecords,
      expenseCategories,
      expenseRecords,
      stockSales,
      settings,
    ] = await Promise.all([
      this.goals.toArray(),
      this.assets.toArray(),
      this.assetHistory.toArray(),
      this.incomeSources.toArray(),
      this.incomeRecords.toArray(),
      this.expenseCategories.toArray(),
      this.expenseRecords.toArray(),
      this.stockSales.toArray(),
      this.settings.toArray(),
    ]);

    const backupData: WorthItBackupData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      appName: 'Worth It',
      data: {
        goals,
        assets,
        assetHistory,
        incomeSources,
        incomeRecords,
        expenseCategories,
        expenseRecords,
        stockSales,
        settings: settings.length > 0 ? settings : [{ ...DEFAULT_SETTINGS }],
      },
    };

    return JSON.stringify(backupData, null, 2);
  }

  async importAllData(jsonData: string): Promise<void> {
    if (!jsonData || typeof jsonData !== 'string' || !jsonData.trim()) {
      throw new Error('Import failed: Empty or invalid JSON string.');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonData);
    } catch (e: unknown) {
      const err = e instanceof Error ? e.message : String(e);
      throw new Error(`Import failed: Invalid JSON syntax: ${err}`);
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Import failed: Parsed JSON root must be an object.');
    }

    // Support both wrapped { version, data: { ... } } and direct { goals, assets, ... } formats
    const recordObj = parsed as Record<string, unknown>;
    const payload =
      recordObj['data'] && typeof recordObj['data'] === 'object'
        ? (recordObj['data'] as Record<string, unknown>)
        : recordObj;

    const goals = (payload['goals'] ?? []) as Goal[];
    const assets = (payload['assets'] ?? []) as Asset[];
    const assetHistory = (payload['assetHistory'] ?? []) as AssetBalanceHistory[];
    const incomeSources = (payload['incomeSources'] ?? []) as IncomeSource[];
    const incomeRecords = (payload['incomeRecords'] ?? []) as IncomeRecord[];
    const expenseCategories = (payload['expenseCategories'] ?? []) as ExpenseCategory[];
    const expenseRecords = (payload['expenseRecords'] ?? []) as ExpenseRecord[];
    const stockSales = (payload['stockSales'] ?? []) as StockSale[];

    let settingsList: ApplicationSettings[] = [];
    if (Array.isArray(payload['settings'])) {
      settingsList = payload['settings'] as ApplicationSettings[];
    } else if (payload['settings'] && typeof payload['settings'] === 'object') {
      settingsList = [payload['settings'] as ApplicationSettings];
    } else {
      settingsList = [{ ...DEFAULT_SETTINGS }];
    }

    // --- Validation ---
    this.validateImportedData({
      goals,
      assets,
      assetHistory,
      incomeSources,
      incomeRecords,
      expenseCategories,
      expenseRecords,
      stockSales,
      settings: settingsList,
    });

    // Execute atomic transaction to replace data
    await this.transaction(
      'rw',
      [
        this.goals,
        this.assets,
        this.assetHistory,
        this.incomeSources,
        this.incomeRecords,
        this.expenseCategories,
        this.expenseRecords,
        this.stockSales,
        this.settings,
      ],
      async () => {
        await Promise.all([
          this.goals.clear(),
          this.assets.clear(),
          this.assetHistory.clear(),
          this.incomeSources.clear(),
          this.incomeRecords.clear(),
          this.expenseCategories.clear(),
          this.expenseRecords.clear(),
          this.stockSales.clear(),
          this.settings.clear(),
        ]);

        if (goals.length > 0) await this.goals.bulkAdd(goals);
        if (assets.length > 0) await this.assets.bulkAdd(assets);
        if (assetHistory.length > 0) await this.assetHistory.bulkAdd(assetHistory);
        if (incomeSources.length > 0) await this.incomeSources.bulkAdd(incomeSources);
        if (incomeRecords.length > 0) await this.incomeRecords.bulkAdd(incomeRecords);
        if (expenseCategories.length > 0) {
          await this.expenseCategories.bulkAdd(expenseCategories);
        }
        if (expenseRecords.length > 0) await this.expenseRecords.bulkAdd(expenseRecords);
        if (stockSales.length > 0) await this.stockSales.bulkAdd(stockSales);

        if (settingsList.length > 0) {
          await this.settings.bulkAdd(settingsList);
        } else {
          await this.settings.add({ ...DEFAULT_SETTINGS });
        }
      }
    );
  }

  private validateImportedData(data: {
    goals: Goal[];
    assets: Asset[];
    assetHistory: AssetBalanceHistory[];
    incomeSources: IncomeSource[];
    incomeRecords: IncomeRecord[];
    expenseCategories: ExpenseCategory[];
    expenseRecords: ExpenseRecord[];
    stockSales: StockSale[];
    settings: ApplicationSettings[];
  }): void {
    if (!Array.isArray(data.goals)) {
      throw new Error('Validation failed: "goals" must be an array.');
    }
    if (!Array.isArray(data.assets)) {
      throw new Error('Validation failed: "assets" must be an array.');
    }
    if (!Array.isArray(data.assetHistory)) {
      throw new Error('Validation failed: "assetHistory" must be an array.');
    }
    if (!Array.isArray(data.incomeSources)) {
      throw new Error('Validation failed: "incomeSources" must be an array.');
    }
    if (!Array.isArray(data.incomeRecords)) {
      throw new Error('Validation failed: "incomeRecords" must be an array.');
    }
    if (!Array.isArray(data.expenseCategories)) {
      throw new Error('Validation failed: "expenseCategories" must be an array.');
    }
    if (!Array.isArray(data.expenseRecords)) {
      throw new Error('Validation failed: "expenseRecords" must be an array.');
    }
    if (!Array.isArray(data.stockSales)) {
      throw new Error('Validation failed: "stockSales" must be an array.');
    }

    // 1. Validate Goals
    const goalIds = new Set<string>();
    for (const g of data.goals) {
      if (!g.id || typeof g.id !== 'string') {
        throw new Error('Validation failed: Goal must have a non-empty string "id".');
      }
      if (goalIds.has(g.id)) {
        throw new Error(`Validation failed: Duplicate Goal id "${g.id}".`);
      }
      goalIds.add(g.id);
      if (typeof g.name !== 'string' || !g.name.trim()) {
        throw new Error(`Validation failed: Goal "${g.id}" must have a valid "name".`);
      }
      if (typeof g.targetAmount !== 'number' || isNaN(g.targetAmount) || g.targetAmount < 0) {
        throw new Error(`Validation failed: Goal "${g.id}" targetAmount must be a non-negative number.`);
      }
      if (typeof g.order !== 'number' || isNaN(g.order)) {
        throw new Error(`Validation failed: Goal "${g.id}" order must be a number.`);
      }
      if (typeof g.isCompleted !== 'boolean') {
        throw new Error(`Validation failed: Goal "${g.id}" isCompleted must be a boolean.`);
      }
      if (
        g.completionChoice !== undefined &&
        !['spend', 'reserve', 'release'].includes(g.completionChoice)
      ) {
        throw new Error(
          `Validation failed: Goal "${g.id}" completionChoice must be 'spend', 'reserve', or 'release'.`
        );
      }
    }

    // 2. Validate Assets
    const assetIds = new Set<string>();
    const validAssetTypes = [
      'bank_account',
      'cash',
      'stocks_etf',
      'employer_stock',
      'retirement',
      'other',
    ];
    for (const a of data.assets) {
      if (!a.id || typeof a.id !== 'string') {
        throw new Error('Validation failed: Asset must have a non-empty string "id".');
      }
      if (assetIds.has(a.id)) {
        throw new Error(`Validation failed: Duplicate Asset id "${a.id}".`);
      }
      assetIds.add(a.id);
      if (typeof a.name !== 'string' || !a.name.trim()) {
        throw new Error(`Validation failed: Asset "${a.id}" must have a valid "name".`);
      }
      if (!validAssetTypes.includes(a.type)) {
        throw new Error(`Validation failed: Asset "${a.id}" has invalid type "${a.type}".`);
      }
      if (typeof a.currency !== 'string' || !a.currency.trim()) {
        throw new Error(`Validation failed: Asset "${a.id}" must have a valid currency.`);
      }
      if (typeof a.balance !== 'number' || isNaN(a.balance)) {
        throw new Error(`Validation failed: Asset "${a.id}" balance must be a number.`);
      }
      if (typeof a.isGoalEligible !== 'boolean') {
        throw new Error(`Validation failed: Asset "${a.id}" isGoalEligible must be a boolean.`);
      }
    }

    // 3. Validate AssetBalanceHistory & Relationships
    const historyIds = new Set<string>();
    for (const h of data.assetHistory) {
      if (!h.id || typeof h.id !== 'string') {
        throw new Error('Validation failed: AssetBalanceHistory must have a string "id".');
      }
      if (historyIds.has(h.id)) {
        throw new Error(`Validation failed: Duplicate AssetBalanceHistory id "${h.id}".`);
      }
      historyIds.add(h.id);
      if (!h.assetId || typeof h.assetId !== 'string') {
        throw new Error(
          `Validation failed: AssetBalanceHistory "${h.id}" must have a string "assetId".`
        );
      }
      // Relationship check
      if (!assetIds.has(h.assetId)) {
        throw new Error(
          `Validation failed: AssetBalanceHistory "${h.id}" references non-existent assetId "${h.assetId}".`
        );
      }
      if (typeof h.balance !== 'number' || isNaN(h.balance)) {
        throw new Error(
          `Validation failed: AssetBalanceHistory "${h.id}" balance must be a number.`
        );
      }
      if (typeof h.date !== 'string' || !h.date.trim()) {
        throw new Error(`Validation failed: AssetBalanceHistory "${h.id}" must have a date.`);
      }
    }

    // 4. Validate IncomeSources
    const incomeSourceIds = new Set<string>();
    const validIncomeTypes = ['salary', 'other'];
    const validFrequencies = ['monthly', 'one_time', 'annual'];
    for (const s of data.incomeSources) {
      if (!s.id || typeof s.id !== 'string') {
        throw new Error('Validation failed: IncomeSource must have a non-empty string "id".');
      }
      if (incomeSourceIds.has(s.id)) {
        throw new Error(`Validation failed: Duplicate IncomeSource id "${s.id}".`);
      }
      incomeSourceIds.add(s.id);
      if (typeof s.name !== 'string' || !s.name.trim()) {
        throw new Error(`Validation failed: IncomeSource "${s.id}" must have a valid name.`);
      }
      if (!validIncomeTypes.includes(s.type)) {
        throw new Error(`Validation failed: IncomeSource "${s.id}" has invalid type "${s.type}".`);
      }
      if (!validFrequencies.includes(s.frequency)) {
        throw new Error(
          `Validation failed: IncomeSource "${s.id}" has invalid frequency "${s.frequency}".`
        );
      }
      if (typeof s.amount !== 'number' || isNaN(s.amount)) {
        throw new Error(`Validation failed: IncomeSource "${s.id}" amount must be a number.`);
      }
    }

    // 5. Validate IncomeRecords & Relationships
    const incomeRecordIds = new Set<string>();
    for (const r of data.incomeRecords) {
      if (!r.id || typeof r.id !== 'string') {
        throw new Error('Validation failed: IncomeRecord must have a non-empty string "id".');
      }
      if (incomeRecordIds.has(r.id)) {
        throw new Error(`Validation failed: Duplicate IncomeRecord id "${r.id}".`);
      }
      incomeRecordIds.add(r.id);
      if (r.incomeSourceId && !incomeSourceIds.has(r.incomeSourceId)) {
        throw new Error(
          `Validation failed: IncomeRecord "${r.id}" references non-existent incomeSourceId "${r.incomeSourceId}".`
        );
      }
      if (typeof r.amount !== 'number' || isNaN(r.amount)) {
        throw new Error(`Validation failed: IncomeRecord "${r.id}" amount must be a number.`);
      }
      if (typeof r.receivedDate !== 'string' || !r.receivedDate.trim()) {
        throw new Error(`Validation failed: IncomeRecord "${r.id}" must have a receivedDate.`);
      }
      if (typeof r.isActual !== 'boolean') {
        throw new Error(`Validation failed: IncomeRecord "${r.id}" isActual must be a boolean.`);
      }
    }

    // 6. Validate ExpenseCategories
    const expenseCategoryIds = new Set<string>();
    for (const c of data.expenseCategories) {
      if (!c.id || typeof c.id !== 'string') {
        throw new Error('Validation failed: ExpenseCategory must have a non-empty string "id".');
      }
      if (expenseCategoryIds.has(c.id)) {
        throw new Error(`Validation failed: Duplicate ExpenseCategory id "${c.id}".`);
      }
      expenseCategoryIds.add(c.id);
      if (typeof c.name !== 'string' || !c.name.trim()) {
        throw new Error(`Validation failed: ExpenseCategory "${c.id}" must have a name.`);
      }
      if (typeof c.expectedMonthlyAmount !== 'number' || isNaN(c.expectedMonthlyAmount)) {
        throw new Error(
          `Validation failed: ExpenseCategory "${c.id}" expectedMonthlyAmount must be a number.`
        );
      }
      if (typeof c.order !== 'number' || isNaN(c.order)) {
        throw new Error(`Validation failed: ExpenseCategory "${c.id}" order must be a number.`);
      }
    }

    // 7. Validate ExpenseRecords & Relationships
    const expenseRecordIds = new Set<string>();
    for (const r of data.expenseRecords) {
      if (!r.id || typeof r.id !== 'string') {
        throw new Error('Validation failed: ExpenseRecord must have a non-empty string "id".');
      }
      if (expenseRecordIds.has(r.id)) {
        throw new Error(`Validation failed: Duplicate ExpenseRecord id "${r.id}".`);
      }
      expenseRecordIds.add(r.id);
      if (r.categoryId && !expenseCategoryIds.has(r.categoryId)) {
        throw new Error(
          `Validation failed: ExpenseRecord "${r.id}" references non-existent categoryId "${r.categoryId}".`
        );
      }
      if (typeof r.amount !== 'number' || isNaN(r.amount)) {
        throw new Error(`Validation failed: ExpenseRecord "${r.id}" amount must be a number.`);
      }
      if (typeof r.date !== 'string' || !r.date.trim()) {
        throw new Error(`Validation failed: ExpenseRecord "${r.id}" must have a date.`);
      }
      if (typeof r.isActual !== 'boolean') {
        throw new Error(`Validation failed: ExpenseRecord "${r.id}" isActual must be a boolean.`);
      }
    }

    // 8. Validate StockSales
    const stockSaleIds = new Set<string>();
    for (const s of data.stockSales) {
      if (!s.id || typeof s.id !== 'string') {
        throw new Error('Validation failed: StockSale must have a non-empty string "id".');
      }
      if (stockSaleIds.has(s.id)) {
        throw new Error(`Validation failed: Duplicate StockSale id "${s.id}".`);
      }
      stockSaleIds.add(s.id);
      if (typeof s.companyOrTicker !== 'string' || !s.companyOrTicker.trim()) {
        throw new Error(`Validation failed: StockSale "${s.id}" must have a companyOrTicker.`);
      }
      if (typeof s.saleDate !== 'string' || !s.saleDate.trim()) {
        throw new Error(`Validation failed: StockSale "${s.id}" must have a saleDate.`);
      }
      if (typeof s.sharesSold !== 'number' || isNaN(s.sharesSold)) {
        throw new Error(`Validation failed: StockSale "${s.id}" sharesSold must be a number.`);
      }
      if (typeof s.pricePerShare !== 'number' || isNaN(s.pricePerShare)) {
        throw new Error(`Validation failed: StockSale "${s.id}" pricePerShare must be a number.`);
      }
      if (typeof s.grossValue !== 'number' || isNaN(s.grossValue)) {
        throw new Error(`Validation failed: StockSale "${s.id}" grossValue must be a number.`);
      }
    }

    // 9. Validate Settings
    if (data.settings && data.settings.length > 0) {
      for (const st of data.settings) {
        if (!st.id) {
          throw new Error('Validation failed: ApplicationSettings must have an "id".');
        }
        if (st.cushion) {
          if (typeof st.cushion.isEnabled !== 'boolean') {
            throw new Error('Validation failed: cushion.isEnabled must be a boolean.');
          }
          if (
            typeof st.cushion.averageMonthlyExpenses !== 'number' ||
            isNaN(st.cushion.averageMonthlyExpenses)
          ) {
            throw new Error(
              'Validation failed: cushion.averageMonthlyExpenses must be a number.'
            );
          }
          if (
            typeof st.cushion.coverageMonths !== 'number' ||
            isNaN(st.cushion.coverageMonths)
          ) {
            throw new Error('Validation failed: cushion.coverageMonths must be a number.');
          }
        }
      }
    }
  }
}
