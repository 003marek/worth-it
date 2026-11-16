import { Injectable, inject } from '@angular/core';
import {
  FX_TTL_MS,
  MarketQuote,
  QUOTE_TTL_MS,
} from '../../models/market-data.model';
import { StorageService } from '../storage.service';
import { MarketDataError } from './market-data.error';
import { NbpClient } from './nbp.client';
import { TwelveDataClient } from './twelve-data.client';

export { MarketDataError } from './market-data.error';
export type { MarketDataErrorKind } from './market-data.error';

export interface MarketRefreshResult {
  updated: string[];
  skipped: string[];
  errors: Array<{ key: string; error: MarketDataError }>;
}

@Injectable({
  providedIn: 'root',
})
export class MarketDataService {
  private readonly twelveData = inject(TwelveDataClient);
  private readonly nbp = inject(NbpClient);
  private readonly storage = inject(StorageService);

  async lookupSymbol(symbol: string): Promise<MarketQuote> {
    const cleanSymbol = symbol.trim().toUpperCase();
    if (!cleanSymbol) {
      throw new MarketDataError('invalid_symbol', 'Ticker symbol is required.');
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new MarketDataError('network', 'Device is offline.');
    }

    const settings = await this.storage.getSettings();
    const apiKey = settings.twelveDataApiKey?.trim() ?? '';
    if (!apiKey) {
      throw new MarketDataError(
        'no_api_key',
        'Twelve Data API key is not configured.'
      );
    }

    const quote = await this.twelveData.getQuote(cleanSymbol, apiKey);
    await this.storage.saveMarketQuote(quote);
    return quote;
  }

  async refreshQuotes(
    symbols: string[],
    opts?: { force?: boolean }
  ): Promise<MarketRefreshResult> {
    const uniqueSymbols = Array.from(
      new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))
    );

    const updated: string[] = [];
    const skipped: string[] = [];
    const errors: Array<{ key: string; error: MarketDataError }> = [];

    if (uniqueSymbols.length === 0) {
      return { updated, skipped, errors };
    }

    const cachedQuotes = await this.storage.getAllMarketQuotes();
    const quoteMap = new Map(
      cachedQuotes.map((q) => [q.symbol.toUpperCase(), q])
    );
    const nowMs = Date.now();
    const force = !!opts?.force;

    const toFetch: string[] = [];
    for (const sym of uniqueSymbols) {
      const existing = quoteMap.get(sym);
      if (!force && existing && this.isWithinTtl(existing.fetchedAt, QUOTE_TTL_MS, nowMs)) {
        skipped.push(sym);
      } else {
        toFetch.push(sym);
      }
    }

    if (toFetch.length === 0) {
      return { updated, skipped, errors };
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      const offlineErr = new MarketDataError('network', 'Device is offline.');
      for (const sym of toFetch) {
        errors.push({ key: sym, error: offlineErr });
      }
      return { updated, skipped, errors };
    }

    const settings = await this.storage.getSettings();
    const apiKey = settings.twelveDataApiKey?.trim() ?? '';
    if (!apiKey) {
      const keyErr = new MarketDataError(
        'no_api_key',
        'Twelve Data API key is not configured.'
      );
      for (const sym of toFetch) {
        errors.push({ key: sym, error: keyErr });
      }
      return { updated, skipped, errors };
    }

    // Sequential de-duplicated refresh per arch §6 (Twelve Data free tier = 8 req/min)
    for (const sym of toFetch) {
      try {
        const quote = await this.twelveData.getQuote(sym, apiKey);
        await this.storage.saveMarketQuote(quote);
        updated.push(sym);
      } catch (err: unknown) {
        const marketErr =
          err instanceof MarketDataError
            ? err
            : new MarketDataError(
                'unknown',
                err instanceof Error ? err.message : String(err)
              );
        errors.push({ key: sym, error: marketErr });
      }
    }

    return { updated, skipped, errors };
  }

  async refreshFxRates(
    currencies: string[],
    base: string,
    opts?: { force?: boolean }
  ): Promise<MarketRefreshResult> {
    const baseCode = base.trim().toUpperCase();
    const uniqueCurrencies = Array.from(
      new Set(
        currencies
          .map((c) => c.trim().toUpperCase().split('/')[0])
          .filter((c) => c.length > 0 && c !== baseCode)
      )
    );

    const updated: string[] = [];
    const skipped: string[] = [];
    const errors: Array<{ key: string; error: MarketDataError }> = [];

    if (uniqueCurrencies.length === 0 || !baseCode) {
      return { updated, skipped, errors };
    }

    const cachedRates = await this.storage.getAllFxRates();
    const rateMap = new Map(
      cachedRates.map((r) => [r.pair.toUpperCase(), r])
    );
    const nowMs = Date.now();
    const force = !!opts?.force;

    const toFetch: Array<{ currency: string; pair: string }> = [];
    for (const currency of uniqueCurrencies) {
      const pair = `${currency}/${baseCode}`;
      const existing = rateMap.get(pair);
      if (!force && existing && this.isWithinTtl(existing.fetchedAt, FX_TTL_MS, nowMs)) {
        skipped.push(pair);
      } else {
        toFetch.push({ currency, pair });
      }
    }

    if (toFetch.length === 0) {
      return { updated, skipped, errors };
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      const offlineErr = new MarketDataError('network', 'Device is offline.');
      for (const item of toFetch) {
        errors.push({ key: item.pair, error: offlineErr });
      }
      return { updated, skipped, errors };
    }

    for (const item of toFetch) {
      try {
        const rate = await this.nbp.getRate(item.currency, baseCode);
        await this.storage.saveFxRate(rate);
        updated.push(item.pair);
      } catch (err: unknown) {
        const marketErr =
          err instanceof MarketDataError
            ? err
            : new MarketDataError(
                'unknown',
                err instanceof Error ? err.message : String(err)
              );
        errors.push({ key: item.pair, error: marketErr });
      }
    }

    return { updated, skipped, errors };
  }

  private isWithinTtl(fetchedAt: string, ttlMs: number, nowMs: number): boolean {
    const fetchedMs = Date.parse(fetchedAt);
    if (!Number.isFinite(fetchedMs)) {
      return false;
    }
    return nowMs - fetchedMs >= 0 && nowMs - fetchedMs < ttlMs;
  }
}
