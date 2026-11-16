import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MarketQuote } from '../../models/market-data.model';
import { MarketDataError, MarketDataErrorKind } from './market-data.error';

export { MarketDataError } from './market-data.error';
export type { MarketDataErrorKind } from './market-data.error';

interface TwelveDataQuotePayload {
  status?: string;
  code?: number;
  message?: string;
  symbol?: string;
  name?: string;
  exchange?: string;
  currency?: string;
  close?: string | number;
  price?: string | number;
}

@Injectable({
  providedIn: 'root',
})
export class TwelveDataClient {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'https://api.twelvedata.com/quote';

  async getQuote(symbol: string, apiKey: string): Promise<MarketQuote> {
    const cleanSymbol = symbol.trim().toUpperCase();
    if (!cleanSymbol) {
      throw new MarketDataError('invalid_symbol', 'Ticker symbol is required.');
    }

    const cleanKey = apiKey.trim();
    if (!cleanKey) {
      throw new MarketDataError(
        'no_api_key',
        'Twelve Data API key is not configured.'
      );
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new MarketDataError('network', 'Device is offline.');
    }

    const url = `${this.baseUrl}?symbol=${encodeURIComponent(cleanSymbol)}&apikey=${encodeURIComponent(cleanKey)}`;

    let payload: TwelveDataQuotePayload;
    try {
      payload = await firstValueFrom(this.http.get<TwelveDataQuotePayload>(url));
    } catch (err: unknown) {
      throw this.mapHttpError(err, cleanSymbol);
    }

    if (!payload || typeof payload !== 'object') {
      throw new MarketDataError(
        'network',
        `Empty response from Twelve Data for "${cleanSymbol}".`
      );
    }

    if (payload.status === 'error' || payload.code !== undefined) {
      const kind = this.classifyPayloadError(payload.code, payload.message);
      throw new MarketDataError(
        kind,
        payload.message || `Twelve Data error for "${cleanSymbol}".`
      );
    }

    const rawPrice = payload.close ?? payload.price;
    const price = Number(rawPrice);
    if (!Number.isFinite(price) || price <= 0) {
      throw new MarketDataError(
        'invalid_symbol',
        `Invalid or missing quote price for symbol "${cleanSymbol}".`
      );
    }

    const quote: MarketQuote = {
      symbol: (payload.symbol || cleanSymbol).trim().toUpperCase(),
      price,
      currency: (payload.currency || 'USD').trim().toUpperCase(),
      fetchedAt: new Date().toISOString(),
    };

    if (payload.name) {
      quote.name = payload.name.trim();
    }
    if (payload.exchange) {
      quote.exchange = payload.exchange.trim();
    }

    return quote;
  }

  private classifyPayloadError(
    code?: number,
    message?: string
  ): MarketDataErrorKind {
    if (code === 401 || code === 403) {
      return 'auth';
    }
    if (code === 429) {
      return 'rate_limit';
    }
    if (code === 400 || code === 404) {
      return 'invalid_symbol';
    }
    if (code !== undefined && code >= 500) {
      return 'network';
    }

    const msg = (message || '').toLowerCase();
    if (msg.includes('apikey') || msg.includes('api key') || msg.includes('unauthorized')) {
      return 'auth';
    }
    if (msg.includes('rate limit') || msg.includes('credits') || msg.includes('minute')) {
      return 'rate_limit';
    }
    if (msg.includes('symbol') || msg.includes('not found') || msg.includes('invalid')) {
      return 'invalid_symbol';
    }
    return 'invalid_symbol';
  }

  private mapHttpError(err: unknown, symbol: string): MarketDataError {
    if (err instanceof MarketDataError) {
      return err;
    }
    if (err instanceof HttpErrorResponse) {
      if (err.status === 401 || err.status === 403) {
        return new MarketDataError('auth', err.message || 'Invalid Twelve Data API key.');
      }
      if (err.status === 429) {
        return new MarketDataError('rate_limit', err.message || 'Twelve Data rate limit exceeded.');
      }
      if (err.status === 400 || err.status === 404) {
        return new MarketDataError('invalid_symbol', `Symbol "${symbol}" not found.`);
      }
      return new MarketDataError('network', err.message || 'Network error contacting Twelve Data.');
    }
    const msg = err instanceof Error ? err.message : String(err);
    return new MarketDataError('network', msg || 'Network error contacting Twelve Data.');
  }
}
