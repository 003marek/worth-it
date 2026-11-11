import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-stock-sales',
  standalone: true,
  template: `<div class="page"><h2>Stock sales</h2></div>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StockSales {}
