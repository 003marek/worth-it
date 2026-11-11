import { describe, expect, it } from 'vitest';
import { MonthsPipe } from './months.pipe';

describe('MonthsPipe', () => {
  const pipe = new MonthsPipe();

  it('formats null and undefined as em dash', () => {
    expect(pipe.transform(null)).toBe('—');
    expect(pipe.transform(undefined)).toBe('—');
  });

  it('formats 0 as "Now"', () => {
    expect(pipe.transform(0)).toBe('Now');
  });

  it('formats months under 1 year', () => {
    expect(pipe.transform(1)).toBe('1 mo');
    expect(pipe.transform(3)).toBe('3 mo');
    expect(pipe.transform(11)).toBe('11 mo');
  });

  it('formats exact years', () => {
    expect(pipe.transform(12)).toBe('1 yr');
    expect(pipe.transform(24)).toBe('2 yr');
  });

  it('formats years and months combined', () => {
    expect(pipe.transform(16)).toBe('1 yr 4 mo');
    expect(pipe.transform(25)).toBe('2 yr 1 mo');
  });
});
