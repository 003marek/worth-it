import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-assets',
  standalone: true,
  template: `<div class="page"><h2>Assets</h2></div>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Assets {}
