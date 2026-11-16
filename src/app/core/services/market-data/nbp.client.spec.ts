import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MarketDataError, NbpClient } from './nbp.client';

describe('NbpClient', () => {
  let client: NbpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), NbpClient],
    });
    client = TestBed.inject(NbpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    vi.restoreAllMocks();
  });

  it('fetches mid rate from NBP Table A', async () => {
    const promise = client.getMidRate('usd');

    const req = httpMock.expectOne(
      'https://api.nbp.pl/api/exchangerates/rates/a/USD/?format=json'
    );
    expect(req.request.method).toBe('GET');

    req.flush({
      table: 'A',
      currency: 'dolar amerykański',
      code: 'USD',
      rates: [{ no: '064/A/NBP/2026', effectiveDate: '2026-04-01', mid: 3.985 }],
    });

    const res = await promise;
    expect(res).toEqual({
      mid: 3.985,
      effectiveDate: '2026-04-01',
    });
  });

  it('returns rate for foreign currency to PLN with a single NBP request', async () => {
    const promise = client.getRate('USD', 'PLN');

    const req = httpMock.expectOne(
      'https://api.nbp.pl/api/exchangerates/rates/a/USD/?format=json'
    );
    req.flush({
      table: 'A',
      code: 'USD',
      rates: [{ effectiveDate: '2026-04-01', mid: 4.02 }],
    });

    const fx = await promise;
    expect(fx.pair).toBe('USD/PLN');
    expect(fx.from).toBe('USD');
    expect(fx.to).toBe('PLN');
    expect(fx.rate).toBe(4.02);
    expect(fx.effectiveDate).toBe('2026-04-01');
  });

  it('computes cross-rate (e.g. USD → EUR) as mid(from)/mid(to) and picks the older effectiveDate', async () => {
    const promise = client.getRate('USD', 'EUR');

    const usdReq = httpMock.expectOne(
      'https://api.nbp.pl/api/exchangerates/rates/a/USD/?format=json'
    );
    const eurReq = httpMock.expectOne(
      'https://api.nbp.pl/api/exchangerates/rates/a/EUR/?format=json'
    );

    usdReq.flush({
      table: 'A',
      code: 'USD',
      rates: [{ effectiveDate: '2026-04-02', mid: 4.0 }],
    });
    eurReq.flush({
      table: 'A',
      code: 'EUR',
      rates: [{ effectiveDate: '2026-04-01', mid: 4.32 }],
    });

    const fx = await promise;
    expect(fx.pair).toBe('USD/EUR');
    expect(fx.rate).toBeCloseTo(4.0 / 4.32, 6);
    expect(fx.effectiveDate).toBe('2026-04-01');
  });

  it('computes inverse rate for PLN → foreign currency (1 / mid(to))', async () => {
    const promise = client.getRate('PLN', 'EUR');

    const req = httpMock.expectOne(
      'https://api.nbp.pl/api/exchangerates/rates/a/EUR/?format=json'
    );
    req.flush({
      table: 'A',
      code: 'EUR',
      rates: [{ effectiveDate: '2026-04-01', mid: 4.0 }],
    });

    const fx = await promise;
    expect(fx.pair).toBe('PLN/EUR');
    expect(fx.rate).toBe(0.25);
    expect(fx.effectiveDate).toBe('2026-04-01');
  });

  it('maps HTTP 404 to MarketDataError(invalid_currency)', async () => {
    const promise = client.getMidRate('XYZ');

    const req = httpMock.expectOne(
      'https://api.nbp.pl/api/exchangerates/rates/a/XYZ/?format=json'
    );
    req.flush('404 NotFound', { status: 404, statusText: 'Not Found' });

    await expect(promise).rejects.toEqual(
      expect.objectContaining<Partial<MarketDataError>>({
        kind: 'invalid_currency',
      })
    );
  });

  it('throws network without making an HTTP request when offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

    await expect(client.getRate('USD', 'PLN')).rejects.toEqual(
      expect.objectContaining<Partial<MarketDataError>>({
        kind: 'network',
      })
    );
    httpMock.expectNone(() => true);
  });
});
