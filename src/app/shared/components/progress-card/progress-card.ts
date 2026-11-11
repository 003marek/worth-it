import { Component, input, computed, ChangeDetectionStrategy } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MoneyPipe } from '../../pipes/money.pipe';

@Component({
  selector: 'app-progress-card',
  standalone: true,
  imports: [MatCardModule, MatProgressBarModule, MoneyPipe],
  template: `
    <mat-card [class.projected-card]="projected()">
      <mat-card-content>
        <div class="header-row">
          <div class="label-group">
            <span class="label" [class.projected]="projected()">{{ label() }}</span>
            @if (subtitle()) {
              <span class="subtitle">{{ subtitle() }}</span>
            }
          </div>
          <span class="percent" [class.projected]="projected()">{{ displayPercent() }}%</span>
        </div>

        <mat-progress-bar
          mode="determinate"
          [value]="displayPercent()"
          [class.projected-bar]="projected()"
        ></mat-progress-bar>

        <div class="amounts-row">
          <span class="current" [class.projected]="projected()">
            {{ current() | money:currency() }}
          </span>
          <span class="separator">/</span>
          <span class="target">{{ target() | money:currency() }}</span>
        </div>
      </mat-card-content>
    </mat-card>
  `,
  styles: [
    `
      mat-card {
        border-radius: 12px;
      }
      .header-row {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 0.75rem;
      }
      .label-group {
        display: flex;
        flex-direction: column;
      }
      .label {
        font-weight: 500;
        font-size: 1rem;
        color: var(--mat-sys-on-surface);
      }
      .subtitle {
        font-size: 0.8125rem;
        color: var(--mat-sys-on-surface-variant);
        margin-top: 0.125rem;
      }
      .percent {
        font-size: 0.9375rem;
        font-weight: 600;
        color: var(--mat-sys-primary);
      }
      mat-progress-bar {
        border-radius: 4px;
        height: 8px;
        margin-bottom: 0.75rem;
      }
      .projected-bar {
        --mdc-linear-progress-active-indicator-color: var(--mat-sys-tertiary);
      }
      .amounts-row {
        display: flex;
        align-items: baseline;
        gap: 0.35rem;
        font-size: 0.875rem;
        color: var(--mat-sys-on-surface-variant);
      }
      .current {
        font-weight: 600;
        color: var(--mat-sys-on-surface);
      }
      .separator {
        opacity: 0.6;
      }
      .target {
        opacity: 0.8;
      }
      .projected {
        font-style: italic;
        color: var(--mat-sys-tertiary) !important;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProgressCard {
  readonly label = input.required<string>();
  readonly current = input.required<number>();
  readonly target = input.required<number>();
  readonly percent = input<number>();
  readonly subtitle = input<string>();
  readonly projected = input<boolean>(false);
  readonly currency = input<string>('PLN');

  protected readonly displayPercent = computed(() => {
    const p = this.percent();
    if (p !== undefined && p !== null) return Math.round(p);
    const t = this.target();
    if (t <= 0) return 0;
    return Math.min(100, Math.round((this.current() / t) * 100));
  });
}

export { ProgressCard as ProgressCardComponent };
