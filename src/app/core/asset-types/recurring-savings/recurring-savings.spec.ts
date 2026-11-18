import { describe, expect, it } from 'vitest';
import { Asset } from '../../models/worth-it.model';
import { AssetValuationContext } from '../asset-type-handler';
import {
  calculateRecurringMonthlyContributionsInBase,
  valueAssets,
} from '../asset-valuation';
import {
  accruedBalanceAt,
  elapsedContributionMonths,
  nextContributionDateAfter,
  recurringSavingsSnapshot,
} from './recurring-savings';
import { recurringSavingsHandler } from './recurring-savings.handler';

describe('Recurring Savings (PPK / PPO) domain math & handler', () => {
  describe('elapsedContributionMonths', () => {
    it('returns 0 when evalDate is before or equal to baselineDate', () => {
      expect(elapsedContributionMonths('2026-03-15', '2026-03-14', true)).toBe(0);
      expect(elapsedContributionMonths('2026-03-15', '2026-03-15', true)).toBe(0);
    });

    it('returns 0 when isContributing is false even if months have passed', () => {
      expect(elapsedContributionMonths('2026-01-15', '2026-06-15', false)).toBe(0);
    });

    it('counts completed monthly intervals accurately across standard dates', () => {
      expect(elapsedContributionMonths('2026-01-15', '2026-02-14', true)).toBe(0);
      expect(elapsedContributionMonths('2026-01-15', '2026-02-15', true)).toBe(1);
      expect(elapsedContributionMonths('2026-01-15', '2026-05-15', true)).toBe(4);
      expect(elapsedContributionMonths('2026-01-15', '2027-01-15', true)).toBe(12);
    });

    it('clamps month-end dates properly (e.g. Jan 31 -> Feb 28)', () => {
      expect(elapsedContributionMonths('2026-01-31', '2026-02-27', true)).toBe(0);
      expect(elapsedContributionMonths('2026-01-31', '2026-02-28', true)).toBe(1);
      expect(elapsedContributionMonths('2026-01-31', '2026-03-30', true)).toBe(1);
      expect(elapsedContributionMonths('2026-01-31', '2026-03-31', true)).toBe(2);
    });
  });

  describe('accruedBalanceAt & nextContributionDateAfter', () => {
    it('computes baseline + months * monthlyContribution when active', () => {
      const details = {
        baselineAmount: 14000,
        baselineDate: '2026-01-15',
        monthlyContribution: 850,
        isContributing: true,
      };

      expect(accruedBalanceAt(details, '2026-01-15')).toBe(14000);
      expect(accruedBalanceAt(details, '2026-02-15')).toBe(14850);
      expect(accruedBalanceAt(details, '2026-04-20')).toBe(14000 + 3 * 850);
      expect(nextContributionDateAfter(details, '2026-04-20')).toBe('2026-05-15');
    });

    it('keeps baseline amount static and returns undefined next date when paused', () => {
      const details = {
        baselineAmount: 22500,
        baselineDate: '2026-01-10',
        monthlyContribution: 900,
        isContributing: false,
      };

      expect(accruedBalanceAt(details, '2026-08-10')).toBe(22500);
      expect(nextContributionDateAfter(details, '2026-08-10')).toBeUndefined();
    });
  });

  describe('recurringSavingsSnapshot & recurringSavingsHandler', () => {
    const ppkAsset: Asset = {
      id: 'ppk-1',
      name: 'PPK — Nationale-Nederlanden',
      type: 'recurring_savings',
      currency: 'PLN',
      balance: 14000,
      recurringSavings: {
        baselineAmount: 14000,
        baselineDate: '2026-01-15',
        monthlyContribution: 850,
        isContributing: true,
      },
      isGoalEligible: true,
      updatedAt: '2026-01-15T10:00:00.000Z',
    };

    const ppoEurAsset: Asset = {
      id: 'ppo-eur',
      name: 'Employer PPO (EUR)',
      type: 'recurring_savings',
      currency: 'EUR',
      balance: 5000,
      exchangeRateToBase: 4.3,
      recurringSavings: {
        baselineAmount: 5000,
        baselineDate: '2026-01-01',
        monthlyContribution: 200,
        isContributing: true,
      },
      isGoalEligible: true,
      updatedAt: '2026-01-01T10:00:00.000Z',
    };

    const baseCtx: AssetValuationContext = {
      today: '2026-04-15',
      baseCurrency: 'PLN',
      grantsByAsset: new Map(),
      salesByAsset: new Map(),
      quotes: new Map(),
      fxRates: new Map(),
      nowMs: Date.parse('2026-04-15T12:00:00.000Z'),
    };

    it('builds a complete RecurringSavingsSnapshot', () => {
      const snap = recurringSavingsSnapshot(ppkAsset, '2026-04-15');
      expect(snap).toEqual({
        assetId: 'ppk-1',
        date: '2026-04-15',
        baselineAmount: 14000,
        baselineDate: '2026-01-15',
        monthlyContribution: 850,
        isContributing: true,
        monthsElapsed: 3,
        accruedContributions: 2550,
        currentAccruedBalance: 16550,
        nextContributionDate: '2026-05-15',
      });
    });

    it('values recurring_savings assets in asset currency and base currency via handler', () => {
      const vPpk = recurringSavingsHandler.value(ppkAsset, baseCtx);
      expect(vPpk.valueInAssetCurrency).toBe(16550);
      expect(vPpk.valueInBase).toBe(16550);

      // 3 months elapsed from 2026-01-01 to 2026-04-15 -> 5000 + 3 * 200 = 5600 EUR * 4.3 = 24080 PLN
      const valuations = valueAssets([ppkAsset, ppoEurAsset], baseCtx);
      expect(valuations.get('ppo-eur')?.valueInAssetCurrency).toBe(5600);
      expect(valuations.get('ppo-eur')?.valueInBase).toBe(24080);
    });

    it('calculates total recurring monthly contributions in base currency for goal-eligible active assets', () => {
      const excludedPpk: Asset = {
        ...ppkAsset,
        id: 'ppk-excluded',
        isGoalEligible: false,
      };
      const pausedPpo: Asset = {
        ...ppkAsset,
        id: 'ppo-paused',
        recurringSavings: {
          ...ppkAsset.recurringSavings!,
          isContributing: false,
        },
      };

      // ppkAsset: 850 PLN/mo + ppoEurAsset: 200 EUR * 4.3 = 860 PLN/mo -> 1710 PLN/mo
      const monthlyInBase = calculateRecurringMonthlyContributionsInBase(
        [ppkAsset, ppoEurAsset, excludedPpk, pausedPpo],
        baseCtx,
        { goalEligibleOnly: true }
      );
      expect(monthlyInBase).toBe(1710);
    });
  });
});
