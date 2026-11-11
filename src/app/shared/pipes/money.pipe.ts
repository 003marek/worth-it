import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'money',
  standalone: true,
  pure: true,
})
export class MoneyPipe implements PipeTransform {
  transform(
    value: number | null | undefined,
    currency = 'PLN',
    digits = 0
  ): string {
    if (value === null || value === undefined || (typeof value === 'number' && isNaN(value))) {
      return '—';
    }

    return new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency: currency || 'PLN',
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  }
}
