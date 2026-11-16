import { describe, expect, it } from 'vitest';
import { StockGrant } from '../models/employer-stock.model';
import { FxRate, MarketQuote } from '../models/market-data.model';
import { Asset, StockSale } from '../models/worth-it.model';
import { AssetValuationContext } from './asset-type-handler';
import {
  collectProjectedInflows,
  toValuedAsset,
  valueAssets,
} from './asset-valuation';

describe('asset-valuation', () => {
  const nowMs = Date.parse('2026-11-16T12:00:00.000Z');
  const today = '2026-11-16';

  const plnBank: Asset = {
    id: 'bank_pln',
    name: 'Main Bank',
    type: 'bank_account',
    currency: 'PLN',
    balance: 25000,
    isGoalEligible: true,
    updatedAt: today,
  };

  const eurSavings: Asset = {
    id: 'bank_eur',
    name: 'EUR Account',
    type: 'bank_account',
    currency: 'EUR',
    balance: 1000,
    exchangeRateToBase: 4.2,
    isGoalEligible: true,
    updatedAt: today,
  };

  const eligibleStock: Asset = {
    id: 'es_eligible',
    name: 'Alphabet RSU',
    type: 'employer_stock',
    currency: 'USD',
    balance: 0,
    isGoalEligible: true,
    updatedAt: today,
    employerStock: { tickerSymbol: 'GOOGL' },
  };

  const excludedStock: Asset = {
    id: 'es_excluded',
    name: 'Excluded Stock',
    type: 'employer_stock',
    currency: 'USD',
    balance: 0,
    isGoalEligible: false,
    updatedAt: today,
    employerStock: { tickerSymbol: 'MSFT' },
  };

  const grantsByAsset = new Map<string, readonly StockGrant[]>([
    [
      'es_eligible',
      [
        {
          id: 'g_elig',
          assetId: 'es_eligible',
          grantDate: '2026-01-01',
          totalShares: 20,
          schedule: { frequency: 'annual', durationMonths: 24, cliffMonths: 0 },
          tranches: [
            { id: 'te1', vestDate: '2026-06-01', shares: 10 },
            { id: 'te2', vestDate: '2027-06-01', shares: 10 },
          ],
          isScheduleCustomized: false,
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
      ],
    ],
    [
      'es_excluded',
      [
        {
          id: 'g_excl',
          assetId: 'es_excluded',
          grantDate: '2026-01-01',
          totalShares: 20,
          schedule: { frequency: 'annual', durationMonths: 24, cliffMonths: 0 },
          tranches: [
            { id: 'tx1', vestDate: '2026-05-01', shares: 10 },
            { id: 'tx2', vestDate: '2027-03-01', shares: 10 },
          ],
          isScheduleCustomized: false,
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
      ],
    ],
  ]);

  const quotes = new Map<string, MarketQuote>([
    [
      'GOOGL',
      {
        symbol: 'GOOGL',
        price: 200,
        currency: 'USD',
        fetchedAt: new Date(nowMs).toISOString(),
      },
    ],
    [
      'MSFT',
      {
        symbol: 'MSFT',
        price: 400,
        currency: 'USD',
        fetchedAt: new Date(nowMs).toISOString(),
      },
    ],
  ]);

  const fxRates = new Map<string, FxRate>([
    [
      'USD/PLN',
      {
        pair: 'USD/PLN',
        from: 'USD',
        to: 'PLN',
        rate: 4.0,
        effectiveDate: today,
        fetchedAt: new Date(nowMs).toISOString(),
      },
    ],
    [
      'EUR/PLN',
      {
        pair: 'EUR/PLN',
        from: 'EUR',
        to: 'PLN',
        rate: 4.35, // cached NBP rate wins over manual exchangeRateToBase (4.2)
        effectiveDate: today,
        fetchedAt: new Date(nowMs).toISOString(),
      },
    ],
  ]);

  const ctx: AssetValuationContext = {
    today,
    baseCurrency: 'PLN',
    grantsByAsset,
    salesByAsset: new Map<string, readonly StockSale[]>(),
    quotes,
    fxRates,
    nowMs,
  };

  it('values balance and employer_stock assets and adapts them via toValuedAsset', () => {
    const assets = [plnBank, eurSavings, eligibleStock];
    const valuations = valueAssets(assets, ctx);

    const plnVal = valuations.get('bank_pln')!;
    expect(plnVal.valueInBase).toBe(25000);
    expect(plnVal.fxStatus).toBe('live');

    const eurVal = valuations.get('bank_eur')!;
    expect(eurVal.fxRateToBase).toBe(4.35);
    expect(eurVal.valueInBase).toBe(4350);

    const stockVal = valuations.get('es_eligible')!;
    expect(stockVal.valueInAssetCurrency).toBe(2000); // 10 held shares * $200
    expect(stockVal.valueInBase).toBe(8000); // $2000 * 4.0

    const valuedStock = toValuedAsset(eligibleStock, stockVal);
    expect(valuedStock.balance).toBe(2000);
    expect(valuedStock.exchangeRateToBase).toBe(4.0);
  });

  it('filters projected inflows by goal eligibility by default and sorts chronologically', () => {
    const assets = [plnBank, eligibleStock, excludedStock];

    const eligibleOnly = collectProjectedInflows(assets, ctx);
    expect(eligibleOnly).toHaveLength(1);
    expect(eligibleOnly[0].assetId).toBe('es_eligible');
    expect(eligibleOnly[0].date).toBe('2027-06-01');
    expect(eligibleOnly[0].amountInBase).toBe(8000);

    const allInflows = collectProjectedInflows(assets, ctx, {
      goalEligibleOnly: false,
    });
    expect(allInflows).toHaveLength(2);
    expect(allInflows.map((i) => i.date)).toEqual(['2027-03-01', '2027-06-01']);
  });
});
