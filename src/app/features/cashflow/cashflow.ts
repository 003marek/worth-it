import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-cashflow',
  standalone: true,
  template: `<div class="page"><h2>Cash flow</h2></div>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Cashflow {}
