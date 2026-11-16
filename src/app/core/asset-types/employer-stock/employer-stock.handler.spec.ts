import { describe, expect, it } from 'vitest';
import { StockGrant } from '../../models/employer-stock.model';
import {
  FX_STALE_MS,
  FX_TTL_MS,
  FxRate,
  MarketQuote,
  QUOTE_STALE_MS,
  QUOTE_TTL_MS,
} from '../../models/market-data.model';
import { Asset, StockSale } from '../../models/worth-it.model';
import { AssetValuationContext } from '../asset-type-handler';
import { employerStockHandler } from './employer-stock.handler';

describe('employerStockHandler', () => {
  const nowMs = Date.parse('2026-11-16T12:00:00.000Z');
  const today = '2026-11-16';

  const baseAsset: Asset = {
    id: 'es_1',
    name: 'Alphabet RSU',
    type: 'employer_stock',
    currency: 'USD',
    balance: 0,
    isGoalEligible: true,
    updatedAt: today,
    employerStock: {
      tickerSymbol: 'GOOGL',
    },
  };

  const grants: StockGrant[] = [
    {
      id: 'g1',
      assetId: 'es_1',
      grantDate: '2025-11-15',
      totalShares: 30,
      schedule: { frequency: 'annual', durationMonths: 36, cliffMonths: 12 },
      tranches: [
        { id: 't1', vestDate: '2026-11-15', shares: 10 }, // vested
        { id: 't2', vestDate: '2027-11-15', shares: 10 }, // future
        { id: 't3', vestDate: '2028-11-15', shares: 10 }, // future
      ],
      isScheduleCustomized: false,
      createdAt: '2025-11-15',
      updatedAt: '2025-11-15',
    },
  ];

  function makeContext(
    overrides: Partial<AssetValuationContext> = {}
  ): AssetValuationContext {
    return {
      today,
      baseCurrency: 'PLN',
      grantsByAsset: new Map([['es_1', grants]]),
      salesByAsset: new Map<string, readonly StockSale[]>(),
      quotes: new Map<string, MarketQuote>(),
      fxRates: new Map<string, FxRate>(),
      nowMs,
      ...overrides,
    };
  }

  it('values held shares using live quote and live NBP FX rate', () => {
    const quote: MarketQuote = {
      symbol: 'GOOGL',
      price: 200,
      currency: 'USD',
      fetchedAt: new Date(nowMs - 5 * 60 * 1000).toISOString(), // 5 min ago -> live
    };
    const fx: FxRate = {
      pair: 'USD/PLN',
      from: 'USD',
      to: 'PLN',
      rate: 4.05,
      effectiveDate: '2026-11-16',
      fetchedAt: new Date(nowMs - 60 * 60 * 1000).toISOString(), // 1h ago -> live
    };

    const ctx = makeContext({
      quotes: new Map([['GOOGL', quote]]),
      fxRates: new Map([['USD/PLN', fx]]),
    });

    const val = employerStockHandler.value(baseAsset, ctx);
    expect(val.assetId).toBe('es_1');
    expect(val.unitPrice).toBe(200);
    expect(val.valueInAssetCurrency).toBe(2000); // 10 held * $200
    expect(val.fxRateToBase).toBe(4.05);
    expect(val.valueInBase).toBe(8100); // $2000 * 4.05
    expect(val.priceStatus).toBe('live');
    expect(val.fxStatus).toBe('live');
    expect(val.priceAsOf).toBe(quote.fetchedAt);
    expect(val.fxAsOf).toBe('2026-11-16');
  });

  it('distinguishes cached vs stale quote and FX statuses based on TTL and stale thresholds', () => {
    const cachedQuote: MarketQuote = {
      symbol: 'GOOGL',
      price: 190,
      currency: 'USD',
      fetchedAt: new Date(nowMs - QUOTE_TTL_MS - 1000).toISOString(),
    };
    const staleFx: FxRate = {
      pair: 'USD/PLN',
      from: 'USD',
      to: 'PLN',
      rate: 4.0,
      effectiveDate: '2026-11-10',
      fetchedAt: new Date(nowMs - FX_STALE_MS - 1000).toISOString(),
    };

    const val1 = employerStockHandler.value(
      baseAsset,
      makeContext({
        quotes: new Map([['GOOGL', cachedQuote]]),
        fxRates: new Map([['USD/PLN', staleFx]]),
      })
    );
    expect(val1.priceStatus).toBe('cached');
    expect(val1.fxStatus).toBe('stale');

    const staleQuote: MarketQuote = {
      ...cachedQuote,
      fetchedAt: new Date(nowMs - QUOTE_STALE_MS - 1000).toISOString(),
    };
    const cachedFx: FxRate = {
      ...staleFx,
      fetchedAt: new Date(nowMs - FX_TTL_MS - 1000).toISOString(),
    };

    const val2 = employerStockHandler.value(
      baseAsset,
      makeContext({
        quotes: new Map([['GOOGL', staleQuote]]),
        fxRates: new Map([['USD/PLN', cachedFx]]),
      })
    );
    expect(val2.priceStatus).toBe('stale');
    expect(val2.fxStatus).toBe('cached');
  });

  it('falls back to manualPrice and manualFxRate when cache has no entry, and missing when neither exists', () => {
    const manualAsset: Asset = {
      ...baseAsset,
      employerStock: {
        tickerSymbol: 'GOOGL',
        manualPrice: 175,
        manualFxRate: 3.95,
      },
    };

    const manualVal = employerStockHandler.value(manualAsset, makeContext());
    expect(manualVal.priceStatus).toBe('manual');
    expect(manualVal.fxStatus).toBe('manual');
    expect(manualVal.unitPrice).toBe(175);
    expect(manualVal.valueInAssetCurrency).toBe(1750);
    expect(manualVal.valueInBase).toBe(6912.5);

    const missingVal = employerStockHandler.value(baseAsset, makeContext());
    expect(missingVal.priceStatus).toBe('missing');
    expect(missingVal.fxStatus).toBe('missing');
    expect(missingVal.valueInAssetCurrency).toBe(0);
    expect(missingVal.fxRateToBase).toBe(1);
    expect(missingVal.valueInBase).toBe(0);
  });

  it('trusts cached quote currency when it differs from asset.currency for FX lookup', () => {
    const assetWithWrongCurrency: Asset = {
      ...baseAsset,
      currency: 'EUR', // misconfigured on asset, quote says USD
    };
    const quote: MarketQuote = {
      symbol: 'GOOGL',
      price: 200,
      currency: 'USD',
      fetchedAt: new Date(nowMs).toISOString(),
    };
    const usdFx: FxRate = {
      pair: 'USD/PLN',
      from: 'USD',
      to: 'PLN',
      rate: 4.1,
      effectiveDate: '2026-11-16',
      fetchedAt: new Date(nowMs).toISOString(),
    };

    const val = employerStockHandler.value(
      assetWithWrongCurrency,
      makeContext({
        quotes: new Map([['GOOGL', quote]]),
        fxRates: new Map([['USD/PLN', usdFx]]),
      })
    );
    expect(val.fxRateToBase).toBe(4.1);
    expect(val.valueInBase).toBe(8200);
  });

  it('produces projectedInflows for future tranches valued at today price and FX', () => {
    const quote: MarketQuote = {
      symbol: 'GOOGL',
      price: 200,
      currency: 'USD',
      fetchedAt: new Date(nowMs).toISOString(),
    };
    const fx: FxRate = {
      pair: 'USD/PLN',
      from: 'USD',
      to: 'PLN',
      rate: 4.0,
      effectiveDate: '2026-11-16',
      fetchedAt: new Date(nowMs).toISOString(),
    };

    const inflows = employerStockHandler.projectedInflows(
      baseAsset,
      makeContext({
        quotes: new Map([['GOOGL', quote]]),
        fxRates: new Map([['USD/PLN', fx]]),
      })
    );

    expect(inflows).toEqual([
      {
        date: '2027-11-15',
        amountInBase: 8000, // 10 * 200 * 4.0
        assetId: 'es_1',
        sourceId: 't2',
        label: 'GOOGL vest · 10 sh',
      },
      {
        date: '2028-11-15',
        amountInBase: 8000,
        assetId: 'es_1',
        sourceId: 't3',
        label: 'GOOGL vest · 10 sh',
      },
    ]);
  });
});
