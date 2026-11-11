import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MoneyPipe } from '../../pipes/money.pipe';

export type MetricTileTone = 'default' | 'positive' | 'negative' | 'projected';

@Component({
  selector: 'app-metric-tile',
  standalone: true,
  imports: [MatCardModule, MatIconModule, MoneyPipe],
  template: `
    <mat-card class="metric-card" [class]="'tone-' + tone()">
      <mat-card-content class="metric-content">
        <div class="metric-header">
          <span class="metric-label">{{ label() }}</span>
          @if (icon()) {
            <mat-icon class="metric-icon" aria-hidden="true">{{ icon() }}</mat-icon>
          }
        </div>
        <div class="metric-value" [class]="tone()">
          {{ value() | money:currency() }}
        </div>
        @if (hint()) {
          <div class="metric-hint" [class.projected]="tone() === 'projected'">
            {{ hint() }}
          </div>
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: [
    `
      .metric-card {
        border-radius: 12px;
        height: 100%;
        box-sizing: border-box;
      }
      .metric-content {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }
      .metric-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .metric-label {
        font-size: 0.8125rem;
        font-weight: 500;
        color: var(--mat-sys-on-surface-variant);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .metric-icon {
        font-size: 1.25rem;
        width: 1.25rem;
        height: 1.25rem;
        color: var(--mat-sys-on-surface-variant);
        opacity: 0.7;
      }
      .metric-value {
        font-size: 1.5rem;
        font-weight: 600;
        line-height: 1.2;
        color: var(--mat-sys-on-surface);

        &.positive {
          color: var(--worth-it-positive, #1b6b3a);
        }
        &.negative {
          color: var(--mat-sys-error);
        }
        &.projected {
          font-style: italic;
          color: var(--mat-sys-tertiary);
        }
      }
      .metric-hint {
        font-size: 0.75rem;
        color: var(--mat-sys-on-surface-variant);
        margin-top: 0.125rem;

        &.projected {
          font-style: italic;
          color: var(--mat-sys-tertiary);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MetricTile {
  readonly label = input.required<string>();
  readonly value = input.required<number>();
  readonly hint = input<string>();
  readonly icon = input<string>();
  readonly tone = input<MetricTileTone>('default');
  readonly currency = input<string>('PLN');
}

export { MetricTile as MetricTileComponent };
