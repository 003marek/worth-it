import { describe, expect, it } from 'vitest';
import {
  Asset,
  ExpenseRecord,
  FinancialCushionSettings,
  Goal,
  IncomeRecord,
} from '../models/worth-it.model';
import { FinancialCalculatorService } from './financial-calculator.service';

/**
 * Accounting rules added during orchestrator review (spec §3.2, §3.3, §5.3, §7.2, §16).
 */
describe('FinancialCalculatorService – accounting rules', () => {
  const service = new FinancialCalculatorService();
  const cushion: FinancialCushionSettings = {
    isEnabled: true,
    averageMonthlyExpenses: 6000,
    coverageMonths: 6,
  };
  const asset = (over: Partial<Asset>): Asset => ({
    id: 'a',
    name: 'Bank',
    type: 'bank_account',
    currency: 'PLN',
    balance: 0,
    isGoalEligible: true,
    updatedAt: '2026-11-01',
    ...over,
  });
  const goal = (over: Partial<Goal>): Goal => ({
    id: 'g',
    name: 'Goal',
    targetAmount: 100000,
    order: 0,
    isCompleted: false,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...over,
  });
  const expense = (over: Partial<ExpenseRecord>): ExpenseRecord => ({
    id: 'e',
    categoryName: 'Other',
    amount: 5000,
    currency: 'PLN',
    date: '2026-11-10',
    isActual: true,
    ...over,
  });

  it('reproduces the spec §5.3 example: a 5,000 PLN expense reduces available goal wealth', () => {
    const assets = [asset({ balance: 100000 })];
    const goals = [goal({ targetAmount: 100000 })];

    const before = service.calculateWealthSummary(assets, goals, cushion);
    expect(before.totalWealth).toBe(100000);
    expect(before.cushionFunded).toBe(36000);
    expect(before.availableForGoals).toBe(64000);

    const after = service.calculateWealthSummary(assets, goals, cushion, [], [expense({})]);
    expect(after.totalWealth).toBe(95000);
    expect(after.availableForGoals).toBe(59000);
    expect(after.cushionFunded).toBe(36000);

    const funding = service.calculateGoalsFundingSummary(goals, after.availableForGoals);
    expect(funding[0].currentProgress).toBe(59000);
  });

  it('does not double count an expense once it is reflected in asset balances', () => {
    const goals: Goal[] = [];
    // User updated the bank balance from 100k to 95k AND marked the expense as reflected.
    const summary = service.calculateWealthSummary(
      [asset({ balance: 95000 })],
      goals,
      cushion,
      [],
      [expense({ isReflectedInBalances: true })]
    );
    expect(summary.pendingAdjustments).toBe(0);
    expect(summary.totalWealth).toBe(95000);
  });

  it('never counts expected (non-actual) income or expenses as actual wealth', () => {
    const income: IncomeRecord[] = [
      {
        id: 'i',
        name: 'Salary',
        type: 'salary',
        amount: 10000,
        currency: 'PLN',
        receivedDate: '2026-12-10',
        isActual: false,
      },
    ];
    const summary = service.calculateWealthSummary(
      [asset({ balance: 1000 })],
      [],
      cushion,
      income,
      [expense({ isActual: false })]
    );
    expect(summary.pendingAdjustments).toBe(0);
    expect(summary.totalWealth).toBe(1000);
  });

  it('adds unreflected actual income to wealth', () => {
    const income: IncomeRecord[] = [
      {
        id: 'i',
        name: 'Salary',
        type: 'salary',
        amount: 12000,
        currency: 'PLN',
        receivedDate: '2026-11-10',
        isActual: true,
      },
    ];
    const summary = service.calculateWealthSummary([asset({ balance: 1000 })], [], cushion, income);
    expect(summary.pendingAdjustments).toBe(12000);
    expect(summary.totalWealth).toBe(13000);
  });

  it('converts foreign-currency assets with the manual exchange rate', () => {
    const summary = service.calculateWealthSummary(
      [asset({ balance: 1000, currency: 'USD', exchangeRateToBase: 4 })],
      [],
      { ...cushion, isEnabled: false }
    );
    expect(summary.totalWealth).toBe(4000);
    expect(summary.availableForGoals).toBe(4000);
  });

  it('excludes ineligible assets from goal progress (spec §16.5)', () => {
    const summary = service.calculateWealthSummary(
      [asset({ balance: 50000 }), asset({ id: 'r', balance: 200000, isGoalEligible: false })],
      [],
      { ...cushion, isEnabled: false }
    );
    expect(summary.totalWealth).toBe(250000);
    expect(summary.availableForGoals).toBe(50000);
  });

  it('keeps reserved completed-goal money out of subsequent goals (spec §16.6)', () => {
    const goals = [
      goal({ id: 'car', order: 0, isCompleted: true, completionChoice: 'reserve', reservedAmount: 30000 }),
      goal({ id: 'flat', order: 1, targetAmount: 500000 }),
    ];
    const summary = service.calculateWealthSummary(
      [asset({ balance: 100000 })],
      goals,
      { ...cushion, isEnabled: false }
    );
    expect(summary.availableForGoals).toBe(70000);
  });

  it('skips skipped goals in the funding sequence (spec §3.2)', () => {
    const goals = [
      goal({ id: 'skip', order: 0, targetAmount: 50000, isSkipped: true }),
      goal({ id: 'next', order: 1, targetAmount: 80000 }),
    ];
    const funding = service.calculateGoalsFundingSummary(goals, 60000);
    expect(funding[0].currentProgress).toBe(0);
    expect(funding[0].estimatedCompletionMonths).toBeNull();
    expect(funding[1].currentProgress).toBe(60000);
  });

  it('reordering goals never changes total wealth (spec §16.7)', () => {
    const a = goal({ id: 'a', order: 0, targetAmount: 10000 });
    const b = goal({ id: 'b', order: 1, targetAmount: 20000 });
    const assets = [asset({ balance: 25000 })];
    const s1 = service.calculateWealthSummary(assets, [a, b], cushion);
    const s2 = service.calculateWealthSummary(assets, [{ ...a, order: 1 }, { ...b, order: 0 }], cushion);
    expect(s1.totalWealth).toBe(s2.totalWealth);
    expect(s1.availableForGoals).toBe(s2.availableForGoals);
  });
});
