import { describe, expect, it } from 'vitest';
import {
  Asset,
  ExpenseCategory,
  FinancialCushionSettings,
  Goal,
  IncomeSource,
} from '../models/worth-it.model';
import { FinancialCalculatorService } from './financial-calculator.service';

describe('FinancialCalculatorService', () => {
  const service = new FinancialCalculatorService();

  describe('Wealth Calculations', () => {
    it('calculates total wealth as sum of all asset balances', () => {
      const assets: Asset[] = [
        {
          id: '1',
          name: 'Main Bank',
          type: 'bank_account',
          currency: 'PLN',
          balance: 15420.5,
          isGoalEligible: true,
          updatedAt: '2026-11-01',
        },
        {
          id: '2',
          name: 'Cash',
          type: 'cash',
          currency: 'PLN',
          balance: 2500,
          isGoalEligible: true,
          updatedAt: '2026-11-01',
        },
        {
          id: '3',
          name: 'Retirement PPK',
          type: 'retirement',
          currency: 'PLN',
          balance: 32000,
          isGoalEligible: false,
          updatedAt: '2026-11-01',
        },
      ];

      expect(service.calculateTotalWealth(assets)).toBe(49920.5);
      expect(service.calculateGoalEligibleWealth(assets)).toBe(17920.5);
      expect(service.calculateExcludedWealth(assets)).toBe(32000);
    });

    it('handles empty assets gracefully', () => {
      expect(service.calculateTotalWealth([])).toBe(0);
      expect(service.calculateGoalEligibleWealth([])).toBe(0);
      expect(service.calculateExcludedWealth([])).toBe(0);
    });
  });

  describe('Financial Cushion Target & Funding', () => {
    it('calculates cushion target when enabled', () => {
      const cushion: FinancialCushionSettings = {
        isEnabled: true,
        averageMonthlyExpenses: 6000,
        coverageMonths: 6,
      };

      expect(service.calculateCushionTarget(cushion)).toBe(36000);
    });

    it('returns 0 cushion target when disabled or null', () => {
      expect(
        service.calculateCushionTarget({
          isEnabled: false,
          averageMonthlyExpenses: 6000,
          coverageMonths: 6,
        })
      ).toBe(0);
      expect(service.calculateCushionTarget(null)).toBe(0);
      expect(service.calculateCushionTarget(undefined)).toBe(0);
    });

    it('computes cushion funded, deficit and percent accurately', () => {
      const target = 36000;

      // Partial funding
      expect(service.calculateCushionFunded(20000, target)).toBe(20000);
      expect(service.calculateCushionDeficit(target, 20000)).toBe(16000);
      expect(service.calculateCushionPercent(target, 20000)).toBe(55.56);

      // Full funding
      expect(service.calculateCushionFunded(36000, target)).toBe(36000);
      expect(service.calculateCushionDeficit(target, 36000)).toBe(0);
      expect(service.calculateCushionPercent(target, 36000)).toBe(100);

      // Overfunded
      expect(service.calculateCushionFunded(50000, target)).toBe(36000);
      expect(service.calculateCushionDeficit(target, 36000)).toBe(0);
      expect(service.calculateCushionPercent(target, 36000)).toBe(100);

      // Target = 0 (e.g. disabled)
      expect(service.calculateCushionFunded(50000, 0)).toBe(0);
      expect(service.calculateCushionDeficit(0, 0)).toBe(0);
      expect(service.calculateCushionPercent(0, 0)).toBe(100);
    });
  });

  describe('Reserves and Available Goal Wealth', () => {
    it('sums reserved amount only for completed goals with reserve choice', () => {
      const goals: Goal[] = [
        {
          id: '1',
          name: 'Car deposit',
          targetAmount: 20000,
          order: 0,
          isCompleted: true,
          completionChoice: 'reserve',
          reservedAmount: 20000,
          createdAt: '',
          updatedAt: '',
        },
        {
          id: '2',
          name: 'Laptop',
          targetAmount: 8000,
          order: 1,
          isCompleted: true,
          completionChoice: 'spend',
          spentAmount: 8000,
          createdAt: '',
          updatedAt: '',
        },
        {
          id: '3',
          name: 'Vacation',
          targetAmount: 10000,
          order: 2,
          isCompleted: true,
          completionChoice: 'release',
          createdAt: '',
          updatedAt: '',
        },
        {
          id: '4',
          name: 'Apartment',
          targetAmount: 300000,
          order: 3,
          isCompleted: false,
          reservedAmount: 50000, // Should be ignored because isCompleted is false
          createdAt: '',
          updatedAt: '',
        },
      ];

      expect(service.calculateReservedAmounts(goals)).toBe(20000);
    });

    it('calculates available wealth for goals after cushion and reserves', () => {
      // 100k eligible - 36k cushion - 20k reserves = 44k
      expect(service.calculateAvailableForGoals(100000, 36000, 20000)).toBe(
        44000
      );

      // Floor at 0 if reserves/cushion exceed eligible wealth
      expect(service.calculateAvailableForGoals(30000, 30000, 5000)).toBe(0);
    });

    it('assembles a full WealthSummary matching spec example', () => {
      const assets: Asset[] = [
        {
          id: '1',
          name: 'Bank',
          type: 'bank_account',
          currency: 'PLN',
          balance: 100000,
          isGoalEligible: true,
          updatedAt: '',
        },
        {
          id: '2',
          name: 'Retirement (Excluded)',
          type: 'retirement',
          currency: 'PLN',
          balance: 50000,
          isGoalEligible: false,
          updatedAt: '',
        },
      ];

      const goals: Goal[] = [
        {
          id: 'g1',
          name: 'Completed Reserve Goal',
          targetAmount: 10000,
          order: 0,
          isCompleted: true,
          completionChoice: 'reserve',
          reservedAmount: 10000,
          createdAt: '',
          updatedAt: '',
        },
      ];

      const cushion: FinancialCushionSettings = {
        isEnabled: true,
        averageMonthlyExpenses: 6000,
        coverageMonths: 6, // target = 36000
      };

      const summary = service.calculateWealthSummary(assets, goals, cushion);

      expect(summary.totalWealth).toBe(150000);
      expect(summary.goalEligibleWealth).toBe(100000);
      expect(summary.excludedWealth).toBe(50000);
      expect(summary.cushionTarget).toBe(36000);
      expect(summary.cushionFunded).toBe(36000);
      expect(summary.cushionDeficit).toBe(0);
      expect(summary.cushionPercent).toBe(100);
      expect(summary.isCushionFullyFunded).toBe(true);
      expect(summary.reservedAmounts).toBe(10000);
      // available = 100000 - 36000 - 10000 = 54000
      expect(summary.availableForGoals).toBe(54000);
    });
  });

  describe('Monthly Income, Expenses and Surplus', () => {
    it('normalizes income sources to monthly amounts', () => {
      const sources: IncomeSource[] = [
        {
          id: '1',
          name: 'Salary',
          type: 'salary',
          amount: 10000,
          currency: 'PLN',
          frequency: 'monthly',
          isEnabled: true,
        },
        {
          id: '2',
          name: 'Annual Bonus',
          type: 'other',
          amount: 24000,
          currency: 'PLN',
          frequency: 'annual',
          isEnabled: true,
        },
        {
          id: '3',
          name: 'One-off gift',
          type: 'other',
          amount: 5000,
          currency: 'PLN',
          frequency: 'one_time',
          isEnabled: true,
        },
        {
          id: '4',
          name: 'Old Freelance',
          type: 'other',
          amount: 3000,
          currency: 'PLN',
          frequency: 'monthly',
          isEnabled: false,
        },
      ];

      // 10000 (monthly) + 24000/12 (2000) = 12000
      expect(service.calculateMonthlyIncome(sources)).toBe(12000);
    });

    it('calculates monthly expenses from enabled categories', () => {
      const categories: ExpenseCategory[] = [
        {
          id: '1',
          name: 'Rent',
          expectedMonthlyAmount: 3500,
          currency: 'PLN',
          isEnabled: true,
          order: 0,
        },
        {
          id: '2',
          name: 'Groceries',
          expectedMonthlyAmount: 2000,
          currency: 'PLN',
          isEnabled: true,
          order: 1,
        },
        {
          id: '3',
          name: 'Disabled Gym',
          expectedMonthlyAmount: 200,
          currency: 'PLN',
          isEnabled: false,
          order: 2,
        },
      ];

      expect(service.calculateMonthlyExpenses(categories)).toBe(5500);
    });

    it('falls back to cushion averageMonthlyExpenses when no expense categories are configured', () => {
      const cushion: FinancialCushionSettings = {
        isEnabled: true,
        averageMonthlyExpenses: 6500,
        coverageMonths: 6,
      };

      expect(service.calculateMonthlyExpenses([], cushion)).toBe(6500);
    });

    it('calculates monthly surplus correctly', () => {
      expect(service.calculateMonthlySurplus(12000, 5500)).toBe(6500);
      expect(service.calculateMonthlySurplus(5000, 6000)).toBe(-1000);
    });
  });

  describe('Sequential Goals Cascading and Timeline Projections', () => {
    const refDate = new Date('2026-11-01T00:00:00Z');

    it('cascades available wealth through uncompleted goals in priority order', () => {
      const goals: Goal[] = [
        {
          id: 'g1',
          name: 'Emergency Fund Goal (done)',
          targetAmount: 10000,
          order: 0,
          isCompleted: true,
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 'g2',
          name: 'Active: Car',
          targetAmount: 50000,
          order: 1,
          isCompleted: false,
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 'g3',
          name: 'Upcoming: Wedding',
          targetAmount: 40000,
          order: 2,
          isCompleted: false,
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 'g4',
          name: 'Upcoming: Apartment',
          targetAmount: 200000,
          order: 3,
          isCompleted: false,
          createdAt: '',
          updatedAt: '',
        },
      ];

      // Available wealth: 70,000 PLN.
      // g1 is completed -> progress 10,000, 100%, 0 remaining.
      // g2 takes 50,000 -> progress 50,000 (100%), remaining 0.
      // g3 takes 20,000 -> progress 20,000 (50%), remaining 20,000.
      // g4 takes 0 -> progress 0 (0%), remaining 200,000.
      const summaries = service.calculateGoalsFundingSummary(
        goals,
        70000,
        0, // no cushion deficit
        10000, // 10,000 PLN monthly surplus
        refDate
      );

      expect(summaries).toHaveLength(4);

      // g1 (completed)
      expect(summaries[0].currentProgress).toBe(10000);
      expect(summaries[0].remainingAmount).toBe(0);
      expect(summaries[0].progressPercent).toBe(100);
      expect(summaries[0].isFullyFunded).toBe(true);
      expect(summaries[0].estimatedCompletionMonths).toBe(0);

      // g2 (active, fully funded by available wealth)
      expect(summaries[1].currentProgress).toBe(50000);
      expect(summaries[1].remainingAmount).toBe(0);
      expect(summaries[1].progressPercent).toBe(100);
      expect(summaries[1].isFullyFunded).toBe(true);
      expect(summaries[1].estimatedCompletionMonths).toBe(0);

      // g3 (upcoming, partially funded)
      expect(summaries[2].currentProgress).toBe(20000);
      expect(summaries[2].remainingAmount).toBe(20000);
      expect(summaries[2].progressPercent).toBe(50);
      expect(summaries[2].isFullyFunded).toBe(false);
      // Needs 20,000 remaining / 10,000 surplus = 2 months
      expect(summaries[2].estimatedCompletionMonths).toBe(2);

      // g4 (upcoming, unfunded)
      expect(summaries[3].currentProgress).toBe(0);
      expect(summaries[3].remainingAmount).toBe(200000);
      expect(summaries[3].progressPercent).toBe(0);
      expect(summaries[3].isFullyFunded).toBe(false);
      // Needs 20,000 (for g3) + 200,000 = 220,000 / 10,000 surplus = 22 months
      expect(summaries[3].estimatedCompletionMonths).toBe(22);
    });

    it('prioritizes cushion deficit before goal funding timeline', () => {
      const goals: Goal[] = [
        {
          id: 'g1',
          name: 'First Goal',
          targetAmount: 30000,
          order: 0,
          isCompleted: false,
          createdAt: '',
          updatedAt: '',
        },
      ];

      // Available wealth: 0. Cushion deficit: 15,000. Monthly surplus: 5,000.
      // Cushion takes 15,000 / 5,000 = 3 months.
      // Goal 1 takes cushion (15k) + goal (30k) = 45k / 5k = 9 months!
      const summaries = service.calculateGoalsFundingSummary(
        goals,
        0,
        15000,
        5000,
        refDate
      );

      expect(summaries[0].currentProgress).toBe(0);
      expect(summaries[0].remainingAmount).toBe(30000);
      expect(summaries[0].estimatedCompletionMonths).toBe(9);
      expect(summaries[0].estimatedCompletionDate).toBeTruthy();
    });

    it('handles zero or negative surplus with null completion estimates', () => {
      const goals: Goal[] = [
        {
          id: 'g1',
          name: 'Goal',
          targetAmount: 30000,
          order: 0,
          isCompleted: false,
          createdAt: '',
          updatedAt: '',
        },
      ];

      const summariesZero = service.calculateGoalsFundingSummary(
        goals,
        0,
        0,
        0,
        refDate
      );
      expect(summariesZero[0].estimatedCompletionMonths).toBeNull();
      expect(summariesZero[0].estimatedCompletionDate).toBeNull();

      const summariesNegative = service.calculateGoalsFundingSummary(
        goals,
        0,
        0,
        -500,
        refDate
      );
      expect(summariesNegative[0].estimatedCompletionMonths).toBeNull();
      expect(summariesNegative[0].estimatedCompletionDate).toBeNull();
    });
  });

  describe('Cushion Status and Date Formatter', () => {
    it('formats date from months accurately', () => {
      const ref = new Date(2026, 10, 1); // 2026-11-01
      expect(service.calculateDateFromNow(0, ref)).toBe('2026-11-01');
      expect(service.calculateDateFromNow(null, ref)).toBeNull();

      const oneMonthLater = service.calculateDateFromNow(1, ref);
      expect(oneMonthLater).toBe('2026-12-01');
    });

    it('calculates Financial Cushion status completely', () => {
      const cushion: FinancialCushionSettings = {
        isEnabled: true,
        averageMonthlyExpenses: 5000,
        coverageMonths: 6, // 30,000 target
      };

      const status = service.calculateFinancialCushionStatus(
        10000, // 10,000 eligible wealth
        cushion,
        4000, // 4,000 surplus
        new Date('2026-11-01')
      );

      expect(status.isEnabled).toBe(true);
      expect(status.target).toBe(30000);
      expect(status.funded).toBe(10000);
      expect(status.deficit).toBe(20000);
      expect(status.percent).toBe(33.33);
      expect(status.isFullyFunded).toBe(false);
      // 20000 deficit / 4000 surplus = 5.0 months
      expect(status.estimatedCompletionMonths).toBe(5);
      expect(status.estimatedCompletionDate).toBeTruthy();
    });
  });
});
