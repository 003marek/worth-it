import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  template: `<div class="page"><h2>Dashboard</h2></div>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dashboard {}
