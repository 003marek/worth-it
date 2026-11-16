export type MarketDataSource = 'twelve_data' | 'nbp' | 'manual';
/** live = fetched within TTL; cached = older than TTL but usable; stale = older than stale limit;
 *  manual = manual override used; missing = nothing available; */
export type MarketDataStatus = 'live' | 'cached' | 'stale' | 'manual' | 'missing';

export interface MarketQuote {
  symbol: string;        // PK, upper-case
  price: number;
  currency: string;      // as reported by Twelve Data
  name?: string;         // instrument name, used to prefill asset name
  exchange?: string;
  fetchedAt: string;     // ISO timestamp
}

export interface FxRate {
  pair: string;          // PK, `${from}/${to}`, e.g. 'USD/PLN'
  from: string;
  to: string;
  rate: number;          // 1 from = rate to
  effectiveDate: string; // NBP table date (yyyy-mm-dd)
  fetchedAt: string;
}

export const QUOTE_TTL_MS = 15 * 60 * 1000;          // 15 min → 'live'
export const QUOTE_STALE_MS = 3 * 24 * 3600 * 1000;  // > 3 days → 'stale'
export const FX_TTL_MS = 12 * 3600 * 1000;
export const FX_STALE_MS = 5 * 24 * 3600 * 1000;     // NBP has no weekend/holiday tables
