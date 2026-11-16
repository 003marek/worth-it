export type MarketDataErrorKind =
  | 'no_api_key'
  | 'invalid_symbol'
  | 'invalid_currency'
  | 'auth'
  | 'rate_limit'
  | 'network'
  | 'unknown';

export class MarketDataError extends Error {
  override readonly name = 'MarketDataError';

  constructor(
    public readonly kind: MarketDataErrorKind,
    message: string
  ) {
    super(message);
    Object.setPrototypeOf(this, MarketDataError.prototype);
  }
}
