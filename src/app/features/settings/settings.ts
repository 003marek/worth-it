import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-settings',
  standalone: true,
  template: `<div class="page"><h2>Settings</h2></div>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Settings {}
