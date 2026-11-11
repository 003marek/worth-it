import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { of } from 'rxjs';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { Cashflow } from './cashflow';
import { WorthItStore } from '../../core/stores/worth-it.store';
import { StorageService } from '../../core/services/storage.service';
import { FinancialCalculatorService } from '../../core/services/financial-calculator.service';
import { IncomeSourceDialog } from './income-source-dialog';
import { IncomeRecordDialog } from './income-record-dialog';
import { SalaryUpdateDialog } from './salary-update-dialog';
import { ExpenseCategoryDialog } from './expense-category-dialog';
import { ExpenseRecordDialog } from './expense-record-dialog';
import { ConfirmDialog } from '../../shared/components/confirm-dialog/confirm-dialog';

describe('Cashflow Component & Cash Flow Feature', () => {
  let store: InstanceType<typeof WorthItStore>;
  let storage: StorageService;
  let dialog: MatDialog;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [Cashflow],
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

    store = TestBed.inject(WorthItStore);
    dialog = TestBed.inject(MatDialog);
    await store.loadAll();
  });

  afterEach(async () => {
    await storage.clearAllData();
  });

  it('creates the Cashflow component', () => {
    const fixture = TestBed.createComponent(Cashflow);
    const component = fixture.componentInstance;
    expect(component).toBeTruthy();
  });

  it('renders top summary strip tiles with default zero values', async () => {
    const fixture = TestBed.createComponent(Cashflow);
    fixture.detectChanges();
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Expected Monthly Income');
    expect(compiled.textContent).toContain('Expected Monthly Expenses');
    expect(compiled.textContent).toContain('Projected Monthly Surplus');
    expect(compiled.textContent).toContain('Pending Actual Adjustments');
  });

  describe('Income Sources (Projections Baseline — spec §6.1-6.3)', () => {
    it('adds an income source and updates projected monthly surplus', async () => {
      const fixture = TestBed.createComponent(Cashflow);
      fixture.detectChanges();

      await store.addIncomeSource({
        name: 'Senior Engineer Salary',
        type: 'salary',
        amount: 15000,
        currency: 'PLN',
        frequency: 'monthly',
        isEnabled: true,
      });

      fixture.detectChanges();
      await fixture.whenStable();

      expect(store.incomeSources()).toHaveLength(1);
      expect(store.monthlySurplusSummary().monthlyIncome).toBe(15000);
      expect(store.monthlySurplusSummary().monthlySurplus).toBe(
        15000 - store.monthlySurplusSummary().monthlyExpenses
      );

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.textContent).toContain('Senior Engineer Salary');
      expect(compiled.textContent).toContain('Salary');
    });

    it('toggles income source isEnabled to pause from projections without erasing history', async () => {
      const source = await store.addIncomeSource({
        name: 'Consulting',
        type: 'other',
        amount: 5000,
        currency: 'PLN',
        frequency: 'monthly',
        isEnabled: true,
      });

      expect(store.monthlySurplusSummary().monthlyIncome).toBe(5000);

      const fixture = TestBed.createComponent(Cashflow);
      const component = fixture.componentInstance;
      await (component as any).toggleIncomeSource(source, false);

      expect(store.incomeSources()[0].isEnabled).toBe(false);
      // Disabling pauses from future surplus projections:
      expect(store.monthlySurplusSummary().monthlyIncome).toBe(0);
    });

    it('updates variable salary and logs historical baseline (spec §6.3)', async () => {
      const source = await store.addIncomeSource({
        name: 'Tech Corp Salary',
        type: 'salary',
        amount: 12000,
        currency: 'PLN',
        frequency: 'monthly',
        effectiveDate: '2026-01-01',
        isEnabled: true,
      });

      const fixture = TestBed.createComponent(Cashflow);
      const component = fixture.componentInstance;

      // Mock dialog.open on the component's injected dialog
      vi.spyOn((component as any).dialog, 'open').mockReturnValue({
        afterClosed: () =>
          of({
            newAmount: 14000,
            effectiveDate: '2026-11-01',
            logHistoryRecord: true,
            historyNote: 'Annual merit increase',
          }),
      } as any);

      await (component as any).updateSalary(source);

      // Verified: source updated with new amount
      const updatedSource = store.incomeSources().find((s) => s.id === source.id);
      expect(updatedSource?.amount).toBe(14000);
      expect(updatedSource?.effectiveDate).toBe('2026-11-01');

      // Verified: historical record logged with isActual: false (preserves history without affecting wealth)
      const records = store.incomeRecords();
      expect(records).toHaveLength(1);
      expect(records[0].amount).toBe(12000);
      expect(records[0].isActual).toBe(false);
      expect(records[0].note).toBe('Annual merit increase');
      expect(store.wealthSummary().pendingAdjustments).toBe(0);
    });

    it('deletes an income source after confirmation', async () => {
      const source = await store.addIncomeSource({
        name: 'Old Contract',
        type: 'other',
        amount: 2000,
        currency: 'PLN',
        frequency: 'monthly',
        isEnabled: true,
      });
      expect(store.incomeSources()).toHaveLength(1);

      const fixture = TestBed.createComponent(Cashflow);
      const component = fixture.componentInstance;

      vi.spyOn((component as any).dialog, 'open').mockReturnValue({
        afterClosed: () => of(true),
      } as any);

      await (component as any).deleteIncomeSource(source);

      expect(store.incomeSources()).toHaveLength(0);
    });
  });

  describe('Actual Income Records & Accounting Rules (spec §6.3, §7.2, §17)', () => {
    it('adjusts total wealth when actual income is unreflected in balances', async () => {
      // Setup initial asset balance
      await store.addAsset({
        name: 'Checking Account',
        type: 'bank_account',
        balance: 10000,
        currency: 'PLN',
      });

      expect(store.wealthSummary().recordedAssetsTotal).toBe(10000);
      expect(store.wealthSummary().pendingAdjustments).toBe(0);
      expect(store.wealthSummary().totalWealth).toBe(10000);

      // Record actual received income NOT yet in asset balances
      const record = await store.addIncomeRecord({
        name: 'October Salary Transfer',
        type: 'salary',
        amount: 8000,
        currency: 'PLN',
        receivedDate: '2026-10-31',
        isActual: true,
      });

      // Income record is unreflected by default
      expect(store.wealthSummary().pendingAdjustments).toBe(8000);
      expect(store.wealthSummary().totalWealth).toBe(18000);

      // Toggling reflected in balances stops adjusting wealth (no double counting)
      await store.updateIncomeRecord(record.id, { isReflectedInBalances: true });
      expect(store.wealthSummary().pendingAdjustments).toBe(0);
      expect(store.wealthSummary().totalWealth).toBe(10000);
    });

    it('does not adjust wealth for expected/historical income records', async () => {
      await store.addIncomeRecord({
        name: 'Expected bonus note',
        type: 'other',
        amount: 5000,
        currency: 'PLN',
        receivedDate: '2026-12-15',
        isActual: false,
      });

      expect(store.wealthSummary().pendingAdjustments).toBe(0);
      expect(store.pendingIncomeRecords()).toHaveLength(0);
    });

    it('marks all pending records reflected via markRecordsReflected', async () => {
      await store.addIncomeRecord({
        name: 'Payment 1',
        type: 'other',
        amount: 3000,
        isActual: true,
      });
      await store.addIncomeRecord({
        name: 'Payment 2',
        type: 'other',
        amount: 2000,
        isActual: true,
      });

      expect(store.wealthSummary().pendingAdjustments).toBe(5000);
      expect(store.pendingIncomeRecords()).toHaveLength(2);

      const fixture = TestBed.createComponent(Cashflow);
      const component = fixture.componentInstance;
      await (component as any).onMarkAllReflected();

      expect(store.wealthSummary().pendingAdjustments).toBe(0);
      expect(store.pendingIncomeRecords()).toHaveLength(0);
    });
  });

  describe('Expenses Tab (Hybrid Model — spec §7.1, §7.2)', () => {
    it('sets simple overall monthly expense baseline and syncs cushion settings', async () => {
      const fixture = TestBed.createComponent(Cashflow);
      const component = fixture.componentInstance;

      (component as any).baselineModel.set({
        amount: 6500,
        syncCushion: true,
      });

      await (component as any).saveOverallBaseline();

      const cats = store.expenseCategories();
      expect(cats).toHaveLength(1);
      expect(cats[0].name).toBe('Overall monthly expenses');
      expect(cats[0].expectedMonthlyAmount).toBe(6500);

      // Verified: synced cushion average monthly expenses
      expect(store.settings().cushion.averageMonthlyExpenses).toBe(6500);
      expect(store.monthlySurplusSummary().monthlyExpenses).toBe(6500);
    });

    it('manages expense categories and allows reordering', async () => {
      const c1 = await store.addExpenseCategory({
        name: 'Rent & Utilities',
        expectedMonthlyAmount: 3500,
        currency: 'PLN',
        order: 0,
      });
      const c2 = await store.addExpenseCategory({
        name: 'Groceries',
        expectedMonthlyAmount: 2000,
        currency: 'PLN',
        order: 1,
      });

      expect(store.monthlySurplusSummary().monthlyExpenses).toBe(5500);

      const fixture = TestBed.createComponent(Cashflow);
      const component = fixture.componentInstance;

      // Reorder: move Groceries (index 1) UP
      await (component as any).moveCategoryUp(1);

      expect(store.expenseCategories()[0].name).toBe('Groceries');
      expect(store.expenseCategories()[1].name).toBe('Rent & Utilities');
    });

    it('reduces wealth when unreflected actual expenses are recorded', async () => {
      await store.addAsset({
        name: 'Checking',
        type: 'bank_account',
        balance: 15000,
        currency: 'PLN',
      });

      // Record actual expense
      const expense = await store.addExpenseRecord({
        categoryName: 'Flight Tickets',
        amount: 2500,
        currency: 'PLN',
        date: '2026-11-05',
        isActual: true,
      });

      // Reduces wealth immediately via pendingAdjustments
      expect(store.wealthSummary().pendingAdjustments).toBe(-2500);
      expect(store.wealthSummary().totalWealth).toBe(12500);

      // Once marked reflected (user refreshed bank balance), pending adjustment clears
      await store.updateExpenseRecord(expense.id, { isReflectedInBalances: true });
      expect(store.wealthSummary().pendingAdjustments).toBe(0);
      expect(store.wealthSummary().totalWealth).toBe(15000);
    });

    it('computes actual expenses in selected month for comparison summary', async () => {
      await store.addExpenseCategory({
        name: 'Living',
        expectedMonthlyAmount: 6000,
      });

      await store.addExpenseRecord({
        categoryName: 'Supermarket',
        amount: 1500,
        date: '2026-11-02',
        isActual: true,
      });
      await store.addExpenseRecord({
        categoryName: 'Restaurants',
        amount: 500,
        date: '2026-11-08',
        isActual: true,
      });
      // Expense in different month
      await store.addExpenseRecord({
        categoryName: 'Past Month',
        amount: 3000,
        date: '2026-10-15',
        isActual: true,
      });

      const fixture = TestBed.createComponent(Cashflow);
      const component = fixture.componentInstance;
      (component as any).selectedMonth.set('2026-11');

      expect((component as any).actualExpensesInSelectedMonth()).toBe(2000);
    });

    it('navigates previous and next months in comparison view', () => {
      const fixture = TestBed.createComponent(Cashflow);
      const component = fixture.componentInstance;
      (component as any).selectedMonth.set('2026-11');

      (component as any).prevMonth();
      expect((component as any).selectedMonth()).toBe('2026-10');

      (component as any).nextMonth();
      expect((component as any).selectedMonth()).toBe('2026-11');
    });
  });

  describe('Signal Forms Dialogs', () => {
    it('IncomeSourceDialog initializes model and validates input', () => {
      const mockRef = { close: vi.fn() };
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [IncomeSourceDialog],
        providers: [
          { provide: MAT_DIALOG_DATA, useValue: { defaultCurrency: 'PLN' } },
          { provide: MatDialogRef, useValue: mockRef },
        ],
      });

      const fixture = TestBed.createComponent(IncomeSourceDialog);
      const comp = fixture.componentInstance;
      fixture.detectChanges();

      expect((comp as any).model().currency).toBe('PLN');
      expect((comp as any).sourceForm().valid()).toBe(false);

      // Set valid values
      (comp as any).model.set({
        name: 'New Job',
        type: 'salary',
        amount: 8000,
        currency: 'PLN',
        frequency: 'monthly',
        effectiveDate: '2026-11-01',
        isEnabled: true,
      });

      expect((comp as any).sourceForm().valid()).toBe(true);
    });

    it('SalaryUpdateDialog initializes with source values', () => {
      const mockRef = { close: vi.fn() };
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [SalaryUpdateDialog],
        providers: [
          {
            provide: MAT_DIALOG_DATA,
            useValue: {
              source: {
                id: 's1',
                name: 'My Job',
                amount: 10000,
                currency: 'PLN',
                frequency: 'monthly',
                isEnabled: true,
              },
            },
          },
          { provide: MatDialogRef, useValue: mockRef },
        ],
      });

      const fixture = TestBed.createComponent(SalaryUpdateDialog);
      const comp = fixture.componentInstance;
      fixture.detectChanges();

      expect((comp as any).model().newAmount).toBe(10000);
      expect((comp as any).model().logHistoryRecord).toBe(true);
      expect((comp as any).salaryForm().valid()).toBe(true);
    });

    it('IncomeRecordDialog prefills from primary salary source and recent amount (spec §6.3)', () => {
      const mockRef = { close: vi.fn() };
      const sources = [
        {
          id: 'src1',
          name: 'Primary Employer',
          type: 'salary' as const,
          amount: 12000,
          currency: 'PLN',
          frequency: 'monthly' as const,
          isEnabled: true,
        },
      ];
      const recentRecords = [
        {
          id: 'r1',
          incomeSourceId: 'src1',
          name: 'Primary Employer',
          type: 'salary' as const,
          amount: 12500, // most recent record had bonus
          currency: 'PLN',
          receivedDate: '2026-10-10',
          isActual: true,
        },
      ];

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [IncomeRecordDialog],
        providers: [
          {
            provide: MAT_DIALOG_DATA,
            useValue: { sources, recentRecords, defaultCurrency: 'PLN' },
          },
          { provide: MatDialogRef, useValue: mockRef },
        ],
      });

      const fixture = TestBed.createComponent(IncomeRecordDialog);
      const comp = fixture.componentInstance;
      fixture.detectChanges();

      // Practical prefill: prefilled with recent record amount (12500)
      expect((comp as any).model().incomeSourceId).toBe('src1');
      expect((comp as any).model().name).toBe('Primary Employer');
      expect((comp as any).model().amount).toBe(12500);
      expect((comp as any).model().isActual).toBe(true);
      expect((comp as any).model().isReflectedInBalances).toBe(false);
      expect((comp as any).recordForm().valid()).toBe(true);
    });

    it('ExpenseCategoryDialog initializes and validates name & amount', () => {
      const mockRef = { close: vi.fn() };
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [ExpenseCategoryDialog],
        providers: [
          { provide: MAT_DIALOG_DATA, useValue: { defaultCurrency: 'PLN' } },
          { provide: MatDialogRef, useValue: mockRef },
        ],
      });

      const fixture = TestBed.createComponent(ExpenseCategoryDialog);
      const comp = fixture.componentInstance;
      fixture.detectChanges();

      expect((comp as any).categoryForm().valid()).toBe(false);

      (comp as any).model.set({
        name: 'Dining Out',
        expectedMonthlyAmount: 800,
        currency: 'PLN',
        isEnabled: true,
      });

      expect((comp as any).categoryForm().valid()).toBe(true);
    });

    it('ExpenseRecordDialog supports both individual expense and monthly total override mode', () => {
      const mockRef = { close: vi.fn() };
      const categories = [
        {
          id: 'cat1',
          name: 'Groceries',
          expectedMonthlyAmount: 1800,
          currency: 'PLN',
          isEnabled: true,
          order: 0,
        },
      ];

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [ExpenseRecordDialog],
        providers: [
          {
            provide: MAT_DIALOG_DATA,
            useValue: { categories, defaultCurrency: 'PLN', initialMode: 'monthly_total' },
          },
          { provide: MatDialogRef, useValue: mockRef },
        ],
      });

      const fixture = TestBed.createComponent(ExpenseRecordDialog);
      const comp = fixture.componentInstance;
      fixture.detectChanges();

      expect((comp as any).model().mode).toBe('monthly_total');
      expect((comp as any).model().categoryName).toBe('Overall monthly expenses');

      // Switch to individual and select category
      (comp as any).onCategorySelectionChange({ value: 'cat1' } as any);
      expect((comp as any).model().categoryName).toBe('Groceries');
      expect((comp as any).model().amount).toBe(1800);
      expect((comp as any).model().isActual).toBe(true);
      expect((comp as any).model().isReflectedInBalances).toBe(false);
      expect((comp as any).expenseForm().valid()).toBe(true);
    });
  });
});
