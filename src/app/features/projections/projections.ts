import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-projections',
  standalone: true,
  template: `<div class="page"><h2>Projections</h2></div>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Projections {}
