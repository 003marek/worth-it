import { describe, expect, it } from 'vitest';
import { EmployerStockDetails, StockGrant } from '../../models/employer-stock.model';
import { Asset, StockSale } from '../../models/worth-it.model';
import { addMonthsClamped, compareIsoDates, daysBetween } from '../date-utils';
import {
  employerStockSnapshot,
  futureTranches,
  generateTranches,
  heldSharesAt,
  unvestedSharesAt,
  validateTranches,
  vestedSharesAt,
} from './vesting';

describe('date-utils', () => {
  it('clamps month-end dates always from the anchor date (never chained)', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsClamped('2026-01-31', 2)).toBe('2026-03-31');
    expect(addMonthsClamped('2026-01-31', 3)).toBe('2026-04-30');
    expect(addMonthsClamped('2024-01-31', 1)).toBe('2024-02-29'); // leap year
    expect(addMonthsClamped('2024-02-29', 12)).toBe('2025-02-28');
  });

  it('compares ISO dates lexicographically and calculates daysBetween', () => {
    expect(compareIsoDates('2026-01-01', '2026-01-02')).toBe(-1);
    expect(compareIsoDates('2026-01-02', '2026-01-01')).toBe(1);
    expect(compareIsoDates('2026-01-01', '2026-01-01')).toBe(0);
    expect(daysBetween('2026-11-01', '2026-12-01')).toBe(30);
  });
});

describe('vesting', () => {
  let nextId = 0;
  const testIdFactory = () => `t_${++nextId}`;

  describe('generateTranches', () => {
    it('splits whole shares using floor(T*k/n) - floor(T*(k-1)/n) so sum is exact', () => {
      nextId = 0;
      const tranches = generateTranches(
        '2025-01-15',
        100,
        {
          frequency: 'monthly',
          durationMonths: 48,
          cliffMonths: 0,
        },
        testIdFactory
      );

      expect(tranches).toHaveLength(48);
      for (const t of tranches) {
        expect(Number.isInteger(t.shares)).toBe(true);
        expect(t.shares).toBeGreaterThanOrEqual(2);
        expect(t.shares).toBeLessThanOrEqual(3);
      }
      const total = tranches.reduce((acc, t) => acc + t.shares, 0);
      expect(total).toBe(100);
    });

    it('merges pre-cliff tranches into the first tranche on or after the cliff date', () => {
      nextId = 0;
      const tranches = generateTranches(
        '2025-01-15',
        100,
        {
          frequency: 'monthly',
          durationMonths: 48,
          cliffMonths: 12,
        },
        testIdFactory
      );

      // 11 pre-cliff monthly tranches merged into month 12 -> 37 tranches total
      expect(tranches).toHaveLength(37);
      expect(tranches[0].vestDate).toBe('2026-01-15');
      expect(tranches[0].shares).toBe(25);
      expect(tranches[1].vestDate).toBe('2026-02-15');
      const sum = tranches.reduce((acc, t) => acc + t.shares, 0);
      expect(sum).toBe(100);
    });

    it('clamps month-end dates from grantDate across schedule without chaining drift', () => {
      nextId = 0;
      const tranches = generateTranches(
        '2026-01-31',
        12,
        {
          frequency: 'monthly',
          durationMonths: 3,
          cliffMonths: 0,
        },
        testIdFactory
      );

      expect(tranches.map((t) => t.vestDate)).toEqual([
        '2026-02-28',
        '2026-03-31',
        '2026-04-30',
      ]);
      expect(tranches.map((t) => t.shares)).toEqual([4, 4, 4]);
    });

    it('splits fractional shares to 4 decimals with the last tranche absorbing the remainder', () => {
      nextId = 0;
      const tranches = generateTranches(
        '2026-01-01',
        10.5,
        {
          frequency: 'quarterly',
          durationMonths: 24, // 8 quarters: 10.5 / 8 = 1.3125
          cliffMonths: 0,
        },
        testIdFactory
      );

      expect(tranches).toHaveLength(8);
      expect(tranches[0].shares).toBe(1.3125);
      const sum = Math.round(tranches.reduce((acc, t) => acc + t.shares, 0) * 10000) / 10000;
      expect(sum).toBe(10.5);

      // Non-terminating decimal: 10.1 over 3 annual tranches -> 3.3667, 3.3667, 3.3666
      const annualTranches = generateTranches(
        '2026-01-01',
        10.1,
        {
          frequency: 'annual',
          durationMonths: 36,
          cliffMonths: 0,
        },
        testIdFactory
      );
      expect(annualTranches).toHaveLength(3);
      expect(annualTranches[0].shares).toBe(3.3667);
      expect(annualTranches[1].shares).toBe(3.3667);
      expect(annualTranches[2].shares).toBe(3.3666);
      const annualSum =
        Math.round(annualTranches.reduce((acc, t) => acc + t.shares, 0) * 10000) / 10000;
      expect(annualSum).toBe(10.1);
    });

    it('anchors schedule at firstVestDate and ignores cliffMonths when firstVestDate is set', () => {
      nextId = 0;
      const tranches = generateTranches(
        '2025-01-01',
        40,
        {
          frequency: 'quarterly',
          durationMonths: 12,
          cliffMonths: 12, // should be ignored
          firstVestDate: '2025-05-15',
        },
        testIdFactory
      );

      expect(tranches).toHaveLength(4);
      expect(tranches.map((t) => t.vestDate)).toEqual([
        '2025-05-15',
        '2025-08-15',
        '2025-11-15',
        '2026-02-15',
      ]);
      expect(tranches.map((t) => t.shares)).toEqual([10, 10, 10, 10]);
    });

    it('rejects non-integer number of periods (durationMonths not divisible by period)', () => {
      expect(() =>
        generateTranches('2026-01-01', 100, {
          frequency: 'quarterly',
          durationMonths: 10, // not a multiple of 3
          cliffMonths: 0,
        })
      ).toThrow();

      expect(() =>
        generateTranches('2026-01-01', 100, {
          frequency: 'annual',
          durationMonths: 18, // not a multiple of 12
          cliffMonths: 0,
        })
      ).toThrow();
    });
  });

  describe('vestedSharesAt, unvestedSharesAt, heldSharesAt & employerStockSnapshot', () => {
    const sampleGrants: StockGrant[] = [
      {
        id: 'g1',
        assetId: 'asset_1',
        name: '2025 Annual Grant',
        grantDate: '2025-01-15',
        totalShares: 40,
        schedule: {
          frequency: 'quarterly',
          durationMonths: 12,
          cliffMonths: 0,
        },
        tranches: [
          { id: 'tr1', vestDate: '2025-04-15', shares: 10 },
          { id: 'tr2', vestDate: '2025-07-15', shares: 10 },
          { id: 'tr3', vestDate: '2025-10-15', shares: 10 },
          { id: 'tr4', vestDate: '2026-01-15', shares: 10 },
        ],
        isScheduleCustomized: false,
        createdAt: '2025-01-15',
        updatedAt: '2025-01-15',
      },
      {
        id: 'g2',
        assetId: 'asset_1',
        name: '2026 Refresher',
        grantDate: '2026-01-15',
        totalShares: 20,
        schedule: {
          frequency: 'annual',
          durationMonths: 24,
          cliffMonths: 0,
        },
        tranches: [
          { id: 'tr5', vestDate: '2026-07-15', shares: 10 },
          { id: 'tr6', vestDate: '2027-07-15', shares: 10 },
        ],
        isScheduleCustomized: false,
        createdAt: '2026-01-15',
        updatedAt: '2026-01-15',
      },
    ];

    const sales: StockSale[] = [
      {
        id: 's1',
        sourceAssetId: 'asset_1',
        companyOrTicker: 'GOOGL',
        saleDate: '2025-08-01',
        sharesSold: 8,
        pricePerShare: 180,
        currency: 'USD',
        grossValue: 1440,
      },
      {
        id: 's2',
        sourceAssetId: 'asset_1',
        companyOrTicker: 'GOOGL',
        saleDate: '2026-08-01',
        sharesSold: 5,
        pricePerShare: 200,
        currency: 'USD',
        grossValue: 1000,
      },
    ];

    it('calculates vested and unvested shares accurately at a date', () => {
      // On 2026-06-01: tr1..tr4 (40 sh) vested; tr5, tr6 (20 sh) unvested
      expect(vestedSharesAt(sampleGrants, '2026-06-01')).toBe(40);
      expect(unvestedSharesAt(sampleGrants, '2026-06-01')).toBe(20);

      // On exact tranche date 2026-07-15: tr5 is vested (50 sh), only tr6 unvested (10 sh)
      expect(vestedSharesAt(sampleGrants, '2026-07-15')).toBe(50);
      expect(unvestedSharesAt(sampleGrants, '2026-07-15')).toBe(10);
    });

    it('calculates heldSharesAt without baseline and deducts linked sales up to date', () => {
      const details: EmployerStockDetails = { tickerSymbol: 'GOOGL' };

      // At 2025-09-01: 20 vested (tr1, tr2) - 8 sold (s1) = 12
      expect(heldSharesAt(details, sampleGrants, sales, '2025-09-01')).toBe(12);

      // At 2026-11-16: 50 vested (tr1..tr5) - 13 sold (s1 + s2) = 37
      expect(heldSharesAt(details, sampleGrants, sales, '2026-11-16')).toBe(37);
    });

    it('handles baseline before/after evaluation date and linked sales before/after baseline', () => {
      const detailsWithBaseline: EmployerStockDetails = {
        tickerSymbol: 'GOOGL',
        vestedSharesBaseline: 25,
        vestedSharesBaselineDate: '2026-02-01',
      };

      // Evaluation date AFTER baseline (2026-11-16 >= 2026-02-01):
      // Baseline = 25 (ignores tr1..tr4 and s1 which are <= 2026-02-01)
      // + tr5 (10 shares on 2026-07-15) - s2 (5 shares on 2026-08-01) = 30
      expect(
        heldSharesAt(detailsWithBaseline, sampleGrants, sales, '2026-11-16')
      ).toBe(30);

      // Sale ON the exact baseline date is already reflected in baseline, not subtracted again
      const saleOnBaseline: StockSale = {
        ...sales[0],
        id: 's_on_base',
        saleDate: '2026-02-01',
        sharesSold: 99,
      };
      expect(
        heldSharesAt(
          detailsWithBaseline,
          sampleGrants,
          [...sales, saleOnBaseline],
          '2026-11-16'
        )
      ).toBe(30);

      // Evaluation date BEFORE baseline (2025-09-01 < 2026-02-01):
      // Falls back to no-baseline formula -> 20 vested - 8 sold = 12
      expect(
        heldSharesAt(detailsWithBaseline, sampleGrants, sales, '2025-09-01')
      ).toBe(12);
    });

    it('floors heldSharesAt at 0 when sales exceed vested shares', () => {
      const details: EmployerStockDetails = { tickerSymbol: 'GOOGL' };
      const hugeSale: StockSale[] = [
        {
          id: 's_big',
          sourceAssetId: 'asset_1',
          companyOrTicker: 'GOOGL',
          saleDate: '2025-05-01',
          sharesSold: 100,
          pricePerShare: 150,
          currency: 'USD',
          grossValue: 15000,
        },
      ];
      expect(heldSharesAt(details, sampleGrants, hugeSale, '2025-06-01')).toBe(0);
    });

    it('builds employerStockSnapshot with nextVest and soldSharesCounted', () => {
      const asset: Asset = {
        id: 'asset_1',
        name: 'Alphabet RSU',
        type: 'employer_stock',
        currency: 'USD',
        balance: 0,
        isGoalEligible: true,
        updatedAt: '2026-11-16',
        employerStock: {
          tickerSymbol: 'GOOGL',
          vestedSharesBaseline: 25,
          vestedSharesBaselineDate: '2026-02-01',
        },
      };

      const snap = employerStockSnapshot(asset, sampleGrants, sales, '2026-11-16');
      expect(snap).toEqual({
        assetId: 'asset_1',
        date: '2026-11-16',
        totalGrantedShares: 60,
        vestedSharesGross: 50,
        heldShares: 30,
        unvestedShares: 10,
        soldSharesCounted: 5, // only s2 (after baseline) is counted
        nextVest: { date: '2027-07-15', shares: 10 },
      });
    });

    it('returns sorted futureTranches with grantId', () => {
      const upcoming = futureTranches(sampleGrants, '2025-08-01');
      expect(upcoming.map((t) => ({ id: t.id, grantId: t.grantId, vestDate: t.vestDate }))).toEqual([
        { id: 'tr3', grantId: 'g1', vestDate: '2025-10-15' },
        { id: 'tr4', grantId: 'g1', vestDate: '2026-01-15' },
        { id: 'tr5', grantId: 'g2', vestDate: '2026-07-15' },
        { id: 'tr6', grantId: 'g2', vestDate: '2027-07-15' },
      ]);
    });
  });

  describe('validateTranches', () => {
    it('returns empty array for valid tranches', () => {
      expect(
        validateTranches({
          totalShares: 30,
          tranches: [
            { id: '1', vestDate: '2026-01-15', shares: 10 },
            { id: '2', vestDate: '2026-04-15', shares: 20 },
          ],
        })
      ).toEqual([]);
    });

    it('reports sum mismatch, duplicate dates, unsorted dates, and <= 0 shares', () => {
      const errors = validateTranches({
        totalShares: 50,
        tranches: [
          { id: '1', vestDate: '2026-05-01', shares: 10 },
          { id: '2', vestDate: '2026-05-01', shares: 10 }, // duplicate
          { id: '3', vestDate: '2026-03-01', shares: 0 }, // unsorted & <= 0
        ],
      });

      expect(errors.length).toBeGreaterThanOrEqual(4);
    });
  });
});
