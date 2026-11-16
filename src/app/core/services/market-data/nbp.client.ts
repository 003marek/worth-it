import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { FxRate } from '../../models/market-data.model';
import { MarketDataError } from './market-data.error';

export { MarketDataError } from './market-data.error';
export type { MarketDataErrorKind } from './market-data.error';

interface NbpRateEntry {
  no?: string;
  effectiveDate?: string;
  mid?: number;
}

interface NbpExchangeRatePayload {
  table?: string;
  currency?: string;
  code?: string;
  rates?: NbpRateEntry[];
}

@Injectable({
  providedIn: 'root',
})
export class NbpClient {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'https://api.nbp.pl/api/exchangerates/rates/a';

  async getMidRate(code: string): Promise<{ mid: number; effectiveDate: string }> {
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) {
      throw new MarketDataError('invalid_currency', 'Currency code is required.');
    }

    if (cleanCode === 'PLN') {
      return {
        mid: 1,
        effectiveDate: new Date().toISOString().slice(0, 10),
      };
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new MarketDataError('network', 'Device is offline.');
    }

    const url = `${this.baseUrl}/${encodeURIComponent(cleanCode)}/?format=json`;

    let payload: NbpExchangeRatePayload;
    try {
      payload = await firstValueFrom(this.http.get<NbpExchangeRatePayload>(url));
    } catch (err: unknown) {
      throw this.mapHttpError(err, cleanCode);
    }

    const firstRate = payload?.rates?.[0];
    const mid = Number(firstRate?.mid);
    const effectiveDate = firstRate?.effectiveDate;

    if (!firstRate || !Number.isFinite(mid) || mid <= 0 || !effectiveDate) {
      throw new MarketDataError(
        'invalid_currency',
        `Invalid NBP rate response for currency "${cleanCode}".`
      );
    }

    return {
      mid,
      effectiveDate,
    };
  }

  async getRate(from: string, to: string): Promise<FxRate> {
    const fromCode = from.trim().toUpperCase();
    const toCode = to.trim().toUpperCase();

    if (!fromCode || !toCode) {
      throw new MarketDataError('invalid_currency', 'Currency codes are required.');
    }

    const pair = `${fromCode}/${toCode}`;
    const fetchedAt = new Date().toISOString();

    if (fromCode === toCode) {
      return {
        pair,
        from: fromCode,
        to: toCode,
        rate: 1,
        effectiveDate: fetchedAt.slice(0, 10),
        fetchedAt,
      };
    }

    if (toCode === 'PLN') {
      const fromEntry = await this.getMidRate(fromCode);
      return {
        pair,
        from: fromCode,
        to: toCode,
        rate: fromEntry.mid,
        effectiveDate: fromEntry.effectiveDate,
        fetchedAt,
      };
    }

    if (fromCode === 'PLN') {
      const toEntry = await this.getMidRate(toCode);
      return {
        pair,
        from: fromCode,
        to: toCode,
        rate: 1 / toEntry.mid,
        effectiveDate: toEntry.effectiveDate,
        fetchedAt,
      };
    }

    const [fromEntry, toEntry] = await Promise.all([
      this.getMidRate(fromCode),
      this.getMidRate(toCode),
    ]);

    const effectiveDate =
      fromEntry.effectiveDate <= toEntry.effectiveDate
        ? fromEntry.effectiveDate
        : toEntry.effectiveDate;

    return {
      pair,
      from: fromCode,
      to: toCode,
      rate: fromEntry.mid / toEntry.mid,
      effectiveDate,
      fetchedAt,
    };
  }

  private mapHttpError(err: unknown, code: string): MarketDataError {
    if (err instanceof MarketDataError) {
      return err;
    }
    if (err instanceof HttpErrorResponse) {
      if (err.status === 404 || err.status === 400) {
        return new MarketDataError(
          'invalid_currency',
          `Currency "${code}" not found in NBP Table A.`
        );
      }
      return new MarketDataError(
        'network',
        err.message || `Network error contacting NBP for "${code}".`
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    return new MarketDataError(
      'network',
      msg || `Network error contacting NBP for "${code}".`
    );
  }
}
