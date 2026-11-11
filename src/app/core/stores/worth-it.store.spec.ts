import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { FinancialCalculatorService } from '../services/financial-calculator.service';
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
});
