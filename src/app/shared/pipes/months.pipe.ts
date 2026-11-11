import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'months',
  standalone: true,
  pure: true,
})
export class MonthsPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    if (value === null || value === undefined || (typeof value === 'number' && isNaN(value))) {
      return '—';
    }

    const totalMonths = Math.round(value);
    if (totalMonths <= 0) {
      return 'Now';
    }

    const years = Math.floor(totalMonths / 12);
    const remainingMonths = totalMonths % 12;

    if (years === 0) {
      return `${remainingMonths} mo`;
    }
    if (remainingMonths === 0) {
      return `${years} yr`;
    }
    return `${years} yr ${remainingMonths} mo`;
  }
}
