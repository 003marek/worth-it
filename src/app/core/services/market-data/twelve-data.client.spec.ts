import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MarketDataError, TwelveDataClient } from './twelve-data.client';

describe('TwelveDataClient', () => {
  let client: TwelveDataClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        TwelveDataClient,
      ],
    });
    client = TestBed.inject(TwelveDataClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    vi.restoreAllMocks();
  });

  it('fetches and parses a valid quote from Twelve Data', async () => {
    const quotePromise = client.getQuote('googl', 'my-api-key');

    const req = httpMock.expectOne(
      'https://api.twelvedata.com/quote?symbol=GOOGL&apikey=my-api-key'
    );
    expect(req.request.method).toBe('GET');

    req.flush({
      symbol: 'GOOGL',
      name: 'Alphabet Inc.',
      exchange: 'NASDAQ',
      currency: 'USD',
      close: '187.45000',
    });

    const quote = await quotePromise;
    expect(quote.symbol).toBe('GOOGL');
    expect(quote.price).toBe(187.45);
    expect(quote.currency).toBe('USD');
    expect(quote.name).toBe('Alphabet Inc.');
    expect(quote.exchange).toBe('NASDAQ');
    expect(quote.fetchedAt).toBeTruthy();
  });

  it('throws no_api_key without making an HTTP request when apiKey is empty', async () => {
    await expect(client.getQuote('GOOGL', '   ')).rejects.toMatchObject({
      name: 'MarketDataError',
      kind: 'no_api_key',
    });
    httpMock.expectNone(() => true);
  });

  it('throws network without making an HTTP request when navigator.onLine is false', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

    await expect(client.getQuote('GOOGL', 'my-key')).rejects.toMatchObject({
      name: 'MarketDataError',
      kind: 'network',
    });
    httpMock.expectNone(() => true);
  });

  it('maps Twelve Data 200 error payload with code 404 to invalid_symbol', async () => {
    const promise = client.getQuote('INVALID123', 'my-key');

    const req = httpMock.expectOne(
      'https://api.twelvedata.com/quote?symbol=INVALID123&apikey=my-key'
    );
    req.flush({
      status: 'error',
      code: 404,
      message: '**symbol** not found: INVALID123',
    });

    await expect(promise).rejects.toEqual(
      expect.objectContaining<Partial<MarketDataError>>({
        kind: 'invalid_symbol',
        message: '**symbol** not found: INVALID123',
      })
    );
  });

  it('maps Twelve Data 200 error payload with code 401 to auth', async () => {
    const promise = client.getQuote('GOOGL', 'bad-key');

    const req = httpMock.expectOne(
      'https://api.twelvedata.com/quote?symbol=GOOGL&apikey=bad-key'
    );
    req.flush({
      status: 'error',
      code: 401,
      message: '**apikey** parameter is incorrect',
    });

    await expect(promise).rejects.toEqual(
      expect.objectContaining<Partial<MarketDataError>>({
        kind: 'auth',
      })
    );
  });

  it('maps Twelve Data 200 error payload with code 429 to rate_limit', async () => {
    const promise = client.getQuote('GOOGL', 'my-key');

    const req = httpMock.expectOne(
      'https://api.twelvedata.com/quote?symbol=GOOGL&apikey=my-key'
    );
    req.flush({
      status: 'error',
      code: 429,
      message: 'You have run out of API credits for the current minute.',
    });

    await expect(promise).rejects.toEqual(
      expect.objectContaining<Partial<MarketDataError>>({
        kind: 'rate_limit',
      })
    );
  });

  it('maps HTTP network failure to MarketDataError(network)', async () => {
    const promise = client.getQuote('GOOGL', 'my-key');

    const req = httpMock.expectOne(
      'https://api.twelvedata.com/quote?symbol=GOOGL&apikey=my-key'
    );
    req.error(new ProgressEvent('error'));

    await expect(promise).rejects.toEqual(
      expect.objectContaining<Partial<MarketDataError>>({
        kind: 'network',
      })
    );
  });
});
