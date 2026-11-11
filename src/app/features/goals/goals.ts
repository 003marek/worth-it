import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-goals',
  standalone: true,
  template: `<div class="page"><h2>Goals</h2></div>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Goals {}
