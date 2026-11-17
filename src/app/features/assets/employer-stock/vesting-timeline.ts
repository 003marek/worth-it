import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { compareIsoDates } from '../../../core/asset-types/date-utils';
import { StockGrant, VestingTranche } from '../../../core/models/employer-stock.model';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';

export interface TimelineTrancheItem extends VestingTranche {
  grantId: string;
  grantLabel: string;
  isPastOrToday: boolean;
  estimatedValueInBase: number;
}

@Component({
  selector: 'app-vesting-timeline',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DecimalPipe, MatChipsModule, MatIconModule, MoneyPipe],
  template: `
    <section class="vesting-timeline-card" aria-label="Vesting schedule timeline">
      <div class="timeline-header">
        <div class="header-copy">
          <h3 class="timeline-title">Vesting Timeline</h3>
          <p class="timeline-subtitle">
            Past vested tranches vs. future scheduled inflows
          </p>
        </div>

        @if (grants().length > 1) {
          <mat-chip-listbox
            aria-label="Filter timeline by grant"
            class="grant-filter-chips"
          >
            <mat-chip-option
              [selected]="selectedGrantId() === null"
              (click)="selectGrant(null)"
              class="filter-chip"
            >
              All Grants
            </mat-chip-option>
            @for (g of grants(); track g.id; let idx = $index) {
              <mat-chip-option
                [selected]="selectedGrantId() === g.id"
                (click)="selectGrant(g.id)"
                class="filter-chip"
              >
                {{ g.name || 'Grant #' + (idx + 1) }}
              </mat-chip-option>
            }
          </mat-chip-listbox>
        }
      </div>

      @if (allItems().length === 0) {
        <div class="timeline-empty">
          <mat-icon aria-hidden="true">timeline</mat-icon>
          <span>No vesting tranches to display yet.</span>
        </div>
      } @else {
        <div class="timeline-scrubber" role="list">
          <!-- Past / Vested Tranches -->
          @for (item of pastItems(); track item.id) {
            <article
              class="tranche-node past-node"
              role="listitem"
              [attr.aria-label]="
                'Vested on ' + item.vestDate + ': ' + item.shares + ' shares'
              "
            >
              <div class="node-track">
                <span class="track-line solid-line" aria-hidden="true"></span>
                <span class="node-dot past-dot" aria-hidden="true">
                  <mat-icon>done</mat-icon>
                </span>
              </div>
              <div class="tranche-card past-card">
                <div class="tranche-date mono-nums">
                  {{ item.vestDate | date:'d MMM yyyy' }}
                </div>
                <div class="tranche-shares mono-nums">
                  <strong>{{ item.shares | number:'1.0-4' }} sh</strong>
                  <span class="state-tag vested-tag">· Vested</span>
                </div>
                @if (item.estimatedValueInBase > 0) {
                  <div class="tranche-value mono-nums">
                    {{ item.estimatedValueInBase | money:'PLN' }}
                  </div>
                }
                @if (grants().length > 1) {
                  <div class="grant-name-tag">{{ item.grantLabel }}</div>
                }
              </div>
            </article>
          }

          <!-- Today Divider Marker -->
          <div
            class="today-marker"
            role="separator"
            [attr.aria-label]="'Today: ' + effectiveToday()"
          >
            <div class="today-pill">Today</div>
            <div class="today-line" aria-hidden="true"></div>
            <div class="today-date mono-nums">
              {{ effectiveToday() | date:'d MMM yyyy' }}
            </div>
          </div>

          <!-- Future / Projected Tranches -->
          @for (item of futureItems(); track item.id) {
            <article
              class="tranche-node future-node"
              role="listitem"
              [attr.aria-label]="
                'Projected vest on ' + item.vestDate + ': ' + item.shares + ' shares'
              "
            >
              <div class="node-track">
                <span class="track-line dashed-line" aria-hidden="true"></span>
                <span class="node-dot future-dot" aria-hidden="true">
                  <mat-icon>event</mat-icon>
                </span>
              </div>
              <div class="tranche-card future-card">
                <div class="tranche-date mono-nums">
                  {{ item.vestDate | date:'d MMM yyyy' }}
                </div>
                <div class="tranche-shares mono-nums projected-text">
                  <strong>{{ item.shares | number:'1.0-4' }} sh</strong>
                  <span class="state-tag projected-tag">· Projected</span>
                </div>
                @if (item.estimatedValueInBase > 0) {
                  <div class="tranche-value mono-nums projected-text">
                    ≈ {{ item.estimatedValueInBase | money:'PLN' }}
                  </div>
                }
                @if (grants().length > 1) {
                  <div class="grant-name-tag">{{ item.grantLabel }}</div>
                }
              </div>
            </article>
          }
        </div>
      }
    </section>
  `,
  styles: `
    .vesting-timeline-card {
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding: 16px;
      border-radius: 12px;
      background: var(--mat-sys-surface-container);
      border: 1px solid var(--mat-sys-outline-variant);
      min-width: 0;
      overflow: hidden;
    }

    .timeline-header {
      display: flex;
      flex-direction: column;
      gap: 12px;

      @media (min-width: 768px) {
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
      }
    }

    .timeline-title {
      margin: 0;
      font-size: 1rem;
      font-weight: 600;
      color: var(--mat-sys-on-surface);
    }

    .timeline-subtitle {
      margin: 2px 0 0;
      font-size: 0.8125rem;
      color: var(--mat-sys-on-surface-variant);
    }

    .grant-filter-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .filter-chip {
      min-height: 48px;
    }

    .timeline-empty {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 16px;
      color: var(--mat-sys-on-surface-variant);
      font-size: 0.875rem;
    }

    .timeline-scrubber {
      display: flex;
      align-items: stretch;
      gap: 12px;
      overflow-x: auto;
      padding: 8px 4px 12px;
      scroll-snap-type: x proximity;
    }

    .tranche-node {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 152px;
      max-width: 190px;
      flex-shrink: 0;
      scroll-snap-align: start;
    }

    .node-track {
      display: flex;
      align-items: center;
      position: relative;
      height: 28px;
    }

    .track-line {
      position: absolute;
      left: 0;
      right: -12px;
      top: 50%;
      transform: translateY(-50%);
      z-index: 0;
    }

    .solid-line {
      height: 3px;
      background: var(--worth-it-positive, #1b6b3a);
    }

    .dashed-line {
      height: 0;
      border-top: 2px dashed var(--mat-sys-tertiary);
    }

    .node-dot {
      position: relative;
      z-index: 1;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;

      mat-icon {
        font-size: 0.875rem;
        width: 0.875rem;
        height: 0.875rem;
      }
    }

    .past-dot {
      background: var(--worth-it-positive, #1b6b3a);
      color: #ffffff;
    }

    .future-dot {
      background: var(--mat-sys-surface-container-high);
      color: var(--mat-sys-tertiary);
      border: 1.5px solid var(--mat-sys-tertiary);
    }

    .tranche-card {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 12px;
      border-radius: 10px;
      background: var(--mat-sys-surface);
      flex: 1;
    }

    .past-card {
      border: 1.5px solid var(--worth-it-positive, #1b6b3a);
    }

    .future-card {
      border: 1.5px dashed var(--mat-sys-tertiary);
      background: var(--mat-sys-surface-container-low);
    }

    .tranche-date {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--mat-sys-on-surface-variant);
    }

    .tranche-shares {
      font-size: 0.875rem;
      color: var(--mat-sys-on-surface);
    }

    .vested-tag {
      color: var(--worth-it-positive, #1b6b3a);
      font-weight: 500;
      font-size: 0.75rem;
    }

    .projected-tag {
      color: var(--mat-sys-tertiary);
      font-style: italic;
      font-size: 0.75rem;
    }

    .tranche-value {
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--mat-sys-on-surface);
    }

    .projected-text {
      font-style: italic;
      color: var(--mat-sys-tertiary);
    }

    .grant-name-tag {
      margin-top: 2px;
      font-size: 0.6875rem;
      color: var(--mat-sys-on-surface-variant);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .today-marker {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      padding: 0 8px;
      flex-shrink: 0;
      scroll-snap-align: center;
    }

    .today-pill {
      padding: 3px 10px;
      border-radius: 999px;
      background: var(--mat-sys-primary);
      color: var(--mat-sys-on-primary);
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.03em;
      white-space: nowrap;
    }

    .today-line {
      width: 2px;
      flex: 1;
      min-height: 64px;
      background: var(--mat-sys-primary);
      margin: 4px 0;
    }

    .today-date {
      font-size: 0.6875rem;
      color: var(--mat-sys-on-surface-variant);
      white-space: nowrap;
    }

    .mono-nums {
      font-family: 'Roboto Mono', monospace;
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class VestingTimeline {
  readonly grants = input<readonly StockGrant[]>([]);
  readonly today = input<string>('');
  readonly stockPrice = input<number>(0);
  readonly fxRate = input<number>(1);

  protected readonly selectedGrantId = signal<string | null>(null);

  protected readonly effectiveToday = computed(() => {
    const t = this.today()?.trim();
    return t || new Date().toISOString().slice(0, 10);
  });

  protected readonly allItems = computed<TimelineTrancheItem[]>(() => {
    const filterId = this.selectedGrantId();
    const todayStr = this.effectiveToday();
    const unitBase = (Number(this.stockPrice()) || 0) * (Number(this.fxRate()) || 1);

    const items: TimelineTrancheItem[] = [];
    this.grants().forEach((grant, idx) => {
      if (filterId && grant.id !== filterId) return;
      const grantLabel = grant.name?.trim() || `Grant #${idx + 1}`;
      for (const tranche of grant.tranches) {
        const isPastOrToday = compareIsoDates(tranche.vestDate, todayStr) <= 0;
        items.push({
          ...tranche,
          grantId: grant.id,
          grantLabel,
          isPastOrToday,
          estimatedValueInBase: Math.round((Number(tranche.shares) || 0) * unitBase * 100) / 100,
        });
      }
    });

    return items.sort((a, b) => {
      const cmp = compareIsoDates(a.vestDate, b.vestDate);
      return cmp !== 0 ? cmp : a.id.localeCompare(b.id);
    });
  });

  protected readonly pastItems = computed(() =>
    this.allItems().filter((i) => i.isPastOrToday)
  );

  protected readonly futureItems = computed(() =>
    this.allItems().filter((i) => !i.isPastOrToday)
  );

  protected selectGrant(grantId: string | null): void {
    this.selectedGrantId.set(grantId === this.selectedGrantId() ? null : grantId);
  }
}

export { VestingTimeline as VestingTimelineComponent };
