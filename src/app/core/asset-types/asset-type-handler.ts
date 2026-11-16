import { StockGrant } from '../models/employer-stock.model';
import {
  FX_STALE_MS,
  FX_TTL_MS,
  FxRate,
  MarketDataStatus,
  MarketQuote,
  QUOTE_STALE_MS,
  QUOTE_TTL_MS,
} from '../models/market-data.model';
import { Asset, AssetType, StockSale } from '../models/worth-it.model';

export interface AssetValuationContext {
  today: string;                                        // yyyy-mm-dd
  baseCurrency: string;
  grantsByAsset: ReadonlyMap<string, readonly StockGrant[]>;
  salesByAsset: ReadonlyMap<string, readonly StockSale[]>;   // only sales with sourceAssetId
  quotes: ReadonlyMap<string, MarketQuote>;             // key: symbol
  fxRates: ReadonlyMap<string, FxRate>;                 // key: 'FROM/TO'
  nowMs: number;                                        // for status (TTL) evaluation
}

export interface AssetValuation {
  assetId: string;
  valueInAssetCurrency: number;
  fxRateToBase: number;        // 1 when currency === baseCurrency
  valueInBase: number;
  priceStatus: MarketDataStatus;   // 'manual' for balance-based assets? → use 'manual'
  fxStatus: MarketDataStatus;
  unitPrice?: number;          // employer stock: price per share in asset currency
  priceAsOf?: string;          // ISO timestamp / date of price used
  fxAsOf?: string;             // NBP effectiveDate of rate used
}

export interface ProjectedInflow {
  date: string;          // yyyy-mm-dd, strictly > today
  amountInBase: number;
  assetId: string;
  sourceId: string;      // e.g. tranche id
  label: string;         // e.g. 'GOOGL vest · 12 sh'
}

export interface AssetTypeHandler {
  readonly type: AssetType;
  value(asset: Asset, ctx: AssetValuationContext): AssetValuation;
  /** Future inflows that are NOT yet part of actual wealth. Default handler returns []. */
  projectedInflows(asset: Asset, ctx: AssetValuationContext): ProjectedInflow[];
}

export interface ResolvedFxRate {
  rate: number;
  status: MarketDataStatus;
  asOf?: string;
}

export function evaluateAgeStatus(
  fetchedAtIso: string,
  nowMs: number,
  ttlMs: number,
  staleMs: number
): MarketDataStatus {
  const fetchedMs = Date.parse(fetchedAtIso);
  if (!Number.isFinite(fetchedMs)) {
    return 'stale';
  }
  const ageMs = Math.max(0, nowMs - fetchedMs);
  if (ageMs <= ttlMs) {
    return 'live';
  }
  if (ageMs <= staleMs) {
    return 'cached';
  }
  return 'stale';
}

export function evaluateQuoteStatus(fetchedAtIso: string, nowMs: number): MarketDataStatus {
  return evaluateAgeStatus(fetchedAtIso, nowMs, QUOTE_TTL_MS, QUOTE_STALE_MS);
}

export function evaluateFxStatus(fetchedAtIso: string, nowMs: number): MarketDataStatus {
  return evaluateAgeStatus(fetchedAtIso, nowMs, FX_TTL_MS, FX_STALE_MS);
}

/**
 * Shared FX resolution helper (arch §4.1):
 * - if currency === baseCurrency -> 1 / 'live'
 * - else cached fxRates.get(`${currency}/${base}`) -> status by age
 * - else manualFxRate -> 'manual'
 * - else rate 1, status 'missing'
 */
export function resolveFxRate(
  currency: string,
  baseCurrency: string,
  ctx: AssetValuationContext,
  manualFxRate?: number
): ResolvedFxRate {
  const from = (currency || baseCurrency || 'PLN').trim().toUpperCase();
  const to = (baseCurrency || 'PLN').trim().toUpperCase();

  if (from === to) {
    return { rate: 1, status: 'live' };
  }

  const cached = ctx.fxRates.get(`${from}/${to}`);
  if (cached && Number.isFinite(cached.rate) && cached.rate > 0) {
    return {
      rate: cached.rate,
      status: evaluateFxStatus(cached.fetchedAt, ctx.nowMs),
      asOf: cached.effectiveDate,
    };
  }

  if (manualFxRate !== undefined && Number.isFinite(manualFxRate) && manualFxRate > 0) {
    return {
      rate: manualFxRate,
      status: 'manual',
    };
  }

  return {
    rate: 1,
    status: 'missing',
  };
}
