import { describe, expect, it } from 'vitest';
import { MoneyPipe } from './money.pipe';

describe('MoneyPipe', () => {
  const pipe = new MoneyPipe();

  it('formats null and undefined as em dash', () => {
    expect(pipe.transform(null)).toBe('—');
    expect(pipe.transform(undefined)).toBe('—');
    expect(pipe.transform(NaN)).toBe('—');
  });

  it('formats PLN currency by default with 0 fraction digits', () => {
    const formatted = pipe.transform(1250);
    const normalized = formatted.replace(/\s/g, ' ');
    expect(normalized).toContain('1250');
    expect(normalized).toContain('zł');
  });

  it('supports custom currency and fraction digits', () => {
    const formatted = pipe.transform(99.5, 'USD', 2);
    const normalized = formatted.replace(/\s/g, ' ');
    expect(normalized).toContain('99,50');
    expect(normalized).toContain('USD');
  });
});
