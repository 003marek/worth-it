import 'fake-indexeddb/auto';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { FX_TTL_MS, QUOTE_TTL_MS } from '../../models/market-data.model';
import { StorageService } from '../storage.service';
import { MarketDataError, MarketDataService } from './market-data.service';
import { NbpClient } from './nbp.client';
import { TwelveDataClient } from './twelve-data.client';

describe('MarketDataService', () => {
  let service: MarketDataService;
  let storage: StorageService;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        StorageService,
        TwelveDataClient,
        NbpClient,
        MarketDataService,
      ],
    });
    storage = TestBed.inject(StorageService);
    await storage.open();
    await storage.clearAllData();

    service = TestBed.inject(MarketDataService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    httpMock.verify();
    vi.restoreAllMocks();
    await storage.clearAllData();
  });

  describe('lookupSymbol', () => {
    it('throws no_api_key without making an HTTP request when API key is missing', async () => {
      await expect(service.lookupSymbol('GOOGL')).rejects.toEqual(
        expect.objectContaining<Partial<MarketDataError>>({
          kind: 'no_api_key',
        })
      );
      httpMock.expectNone(() => true);
    });

    it('throws network without making an HTTP request when offline', async () => {
      await storage.updateSettings({ twelveDataApiKey: 'test-key' });
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

      await expect(service.lookupSymbol('GOOGL')).rejects.toEqual(
        expect.objectContaining<Partial<MarketDataError>>({
          kind: 'network',
        })
      );
      httpMock.expectNone(() => true);
    });

    it('always fetches from network and caches the quote in StorageService', async () => {
      await storage.updateSettings({ twelveDataApiKey: 'test-key' });

      // Even if a fresh quote is cached, lookupSymbol must hit the network
      await storage.saveMarketQuote({
        symbol: 'GOOGL',
        price: 150,
        currency: 'USD',
        fetchedAt: new Date().toISOString(),
      });

      const promise = service.lookupSymbol('googl');
      const req = await vi.waitFor(() =>
        httpMock.expectOne(
          'https://api.twelvedata.com/quote?symbol=GOOGL&apikey=test-key'
        )
      );
      req.flush({
        symbol: 'GOOGL',
        name: 'Alphabet Inc.',
        exchange: 'NASDAQ',
        currency: 'USD',
        close: '192.30',
      });

      const quote = await promise;
      expect(quote.price).toBe(192.3);
      expect(quote.name).toBe('Alphabet Inc.');

      const cached = await storage.getMarketQuote('GOOGL');
      expect(cached?.price).toBe(192.3);
    });
  });

  describe('refreshQuotes', () => {
    it('skips symbols within QUOTE_TTL_MS unless force is true', async () => {
      await storage.updateSettings({ twelveDataApiKey: 'test-key' });

      const freshTime = new Date(Date.now() - QUOTE_TTL_MS / 2).toISOString();
      const expiredTime = new Date(Date.now() - QUOTE_TTL_MS - 5000).toISOString();

      await storage.saveMarketQuote({
        symbol: 'GOOGL',
        price: 180,
        currency: 'USD',
        fetchedAt: freshTime,
      });
      await storage.saveMarketQuote({
        symbol: 'MSFT',
        price: 410,
        currency: 'USD',
        fetchedAt: expiredTime,
      });

      const refreshPromise = service.refreshQuotes(['GOOGL', 'MSFT', 'googl']);

      // Only MSFT should be requested (GOOGL is fresh and de-duplicated)
      const msftReq = await vi.waitFor(() =>
        httpMock.expectOne(
          'https://api.twelvedata.com/quote?symbol=MSFT&apikey=test-key'
        )
      );
      httpMock.expectNone(
        'https://api.twelvedata.com/quote?symbol=GOOGL&apikey=test-key'
      );
      msftReq.flush({
        symbol: 'MSFT',
        currency: 'USD',
        close: '425.00',
      });

      const result = await refreshPromise;
      expect(result.skipped).toEqual(['GOOGL']);
      expect(result.updated).toEqual(['MSFT']);
      expect(result.errors).toEqual([]);
      expect((await storage.getMarketQuote('MSFT'))?.price).toBe(425);
    });

    it('refreshes fresh symbols when force: true is passed, sequentially and de-duplicated', async () => {
      await storage.updateSettings({ twelveDataApiKey: 'test-key' });
      await storage.saveMarketQuote({
        symbol: 'GOOGL',
        price: 180,
        currency: 'USD',
        fetchedAt: new Date().toISOString(),
      });

      const order: string[] = [];
      const refreshPromise = service.refreshQuotes(
        ['googl', 'GOOGL', 'MSFT'],
        { force: true }
      );

      // Sequential execution: first request is GOOGL; MSFT has not been issued yet
      const googlReq = await vi.waitFor(() =>
        httpMock.expectOne(
          'https://api.twelvedata.com/quote?symbol=GOOGL&apikey=test-key'
        )
      );
      httpMock.expectNone(
        'https://api.twelvedata.com/quote?symbol=MSFT&apikey=test-key'
      );
      order.push('GOOGL');
      googlReq.flush({ symbol: 'GOOGL', currency: 'USD', close: '188.00' });

      // After GOOGL resolves, MSFT request is issued
      const msftReq = await vi.waitFor(() =>
        httpMock.expectOne(
          'https://api.twelvedata.com/quote?symbol=MSFT&apikey=test-key'
        )
      );
      order.push('MSFT');
      msftReq.flush({ symbol: 'MSFT', currency: 'USD', close: '430.00' });

      const result = await refreshPromise;
      expect(order).toEqual(['GOOGL', 'MSFT']);
      expect(result.updated).toEqual(['GOOGL', 'MSFT']);
      expect(result.skipped).toEqual([]);
      expect(result.errors).toEqual([]);
    });

    it('short-circuits with no_api_key error and makes no HTTP calls when API key is missing', async () => {
      const result = await service.refreshQuotes(['GOOGL', 'MSFT']);
      httpMock.expectNone(() => true);

      expect(result.updated).toEqual([]);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0].key).toBe('GOOGL');
      expect(result.errors[0].error.kind).toBe('no_api_key');
    });

    it('short-circuits with network error and makes no HTTP calls when offline', async () => {
      await storage.updateSettings({ twelveDataApiKey: 'test-key' });
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

      const result = await service.refreshQuotes(['GOOGL']);
      httpMock.expectNone(() => true);

      expect(result.updated).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error.kind).toBe('network');
    });

    it('reports per-item errors without throwing and continues refreshing remaining symbols', async () => {
      await storage.updateSettings({ twelveDataApiKey: 'test-key' });

      const refreshPromise = service.refreshQuotes(['BADTICKER', 'GOOGL']);

      const badReq = await vi.waitFor(() =>
        httpMock.expectOne(
          'https://api.twelvedata.com/quote?symbol=BADTICKER&apikey=test-key'
        )
      );
      badReq.flush({
        status: 'error',
        code: 404,
        message: 'Symbol not found',
      });

      const googlReq = await vi.waitFor(() =>
        httpMock.expectOne(
          'https://api.twelvedata.com/quote?symbol=GOOGL&apikey=test-key'
        )
      );
      googlReq.flush({ symbol: 'GOOGL', currency: 'USD', close: '190.00' });

      const result = await refreshPromise;
      expect(result.updated).toEqual(['GOOGL']);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].key).toBe('BADTICKER');
      expect(result.errors[0].error.kind).toBe('invalid_symbol');
    });
  });

  describe('refreshFxRates', () => {
    it('skips base currency and entries still within FX_TTL_MS unless force is true', async () => {
      const freshTime = new Date(Date.now() - FX_TTL_MS / 2).toISOString();
      await storage.saveFxRate({
        pair: 'USD/PLN',
        from: 'USD',
        to: 'PLN',
        rate: 3.95,
        effectiveDate: '2026-04-01',
        fetchedAt: freshTime,
      });

      const refreshPromise = service.refreshFxRates(
        ['PLN', 'USD', 'EUR', 'usd'],
        'PLN'
      );

      const eurReq = await vi.waitFor(() =>
        httpMock.expectOne(
          'https://api.nbp.pl/api/exchangerates/rates/a/EUR/?format=json'
        )
      );
      httpMock.expectNone(
        'https://api.nbp.pl/api/exchangerates/rates/a/USD/?format=json'
      );
      eurReq.flush({
        table: 'A',
        code: 'EUR',
        rates: [{ effectiveDate: '2026-04-02', mid: 4.28 }],
      });

      const result = await refreshPromise;
      expect(result.skipped).toEqual(['USD/PLN']);
      expect(result.updated).toEqual(['EUR/PLN']);
      expect(result.errors).toEqual([]);
      expect((await storage.getFxRate('EUR/PLN'))?.rate).toBe(4.28);
    });

    it('short-circuits with network error when offline', async () => {
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

      const result = await service.refreshFxRates(['USD'], 'PLN');
      httpMock.expectNone(() => true);

      expect(result.updated).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].key).toBe('USD/PLN');
      expect(result.errors[0].error.kind).toBe('network');
    });
  });
});
