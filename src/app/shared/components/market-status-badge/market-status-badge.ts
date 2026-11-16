import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MarketDataSource, MarketDataStatus } from '../../../core/models/market-data.model';

@Component({
  selector: 'app-market-status-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, MatTooltipModule],
  template: `
    <span
      class="market-status-badge"
      [class]="'status-' + status()"
      [matTooltip]="tooltipText()"
      role="status"
      [attr.aria-label]="displayText() + '. ' + tooltipText()"
    >
      @switch (status()) {
        @case ('live') {
          <span class="status-dot" aria-hidden="true"></span>
        }
        @case ('cached') {
          <mat-icon class="badge-icon" aria-hidden="true">history</mat-icon>
        }
        @case ('stale') {
          <mat-icon class="badge-icon" aria-hidden="true">schedule</mat-icon>
        }
        @case ('manual') {
          <mat-icon class="badge-icon" aria-hidden="true">edit</mat-icon>
        }
        @default {
          <mat-icon class="badge-icon" aria-hidden="true">warning</mat-icon>
        }
      }
      <span class="badge-text">{{ displayText() }}</span>
    </span>
  `,
  styles: `
    :host {
      display: inline-flex;
      vertical-align: middle;
    }

    .market-status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 500;
      line-height: 1.25;
      font-variant-numeric: tabular-nums;
      border: 1px solid transparent;
      max-width: 100%;
      box-sizing: border-box;
      user-select: none;
    }

    .badge-text {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .status-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background-color: var(--worth-it-positive, #1b6b3a);
      flex-shrink: 0;
    }

    .badge-icon {
      font-size: 0.875rem;
      width: 0.875rem;
      height: 0.875rem;
      flex-shrink: 0;
    }

    .status-live {
      background-color: var(--mat-sys-surface-container);
      color: var(--mat-sys-on-surface);
      border-color: var(--mat-sys-outline-variant);
    }

    .status-cached {
      background-color: var(--mat-sys-surface-container-low);
      color: var(--mat-sys-on-surface-variant);
      border-color: var(--mat-sys-outline-variant);
    }

    .status-stale {
      background-color: var(--mat-sys-tertiary-container);
      color: var(--mat-sys-on-tertiary-container);
      border-color: var(--mat-sys-tertiary);
    }

    .status-manual {
      background-color: transparent;
      color: var(--mat-sys-on-surface-variant);
      border-color: var(--mat-sys-outline);
    }

    .status-missing {
      background-color: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
      border-color: var(--mat-sys-error);
    }
  `,
})
export class MarketStatusBadge {
  readonly status = input<MarketDataStatus>('missing');
  readonly source = input<MarketDataSource>('manual');
  readonly asOf = input<string | undefined>(undefined);
  readonly symbolOrPair = input<string | undefined>(undefined);

  protected readonly sourceLabel = computed(() => {
    switch (this.source()) {
      case 'twelve_data':
        return 'Twelve Data';
      case 'nbp':
        return 'NBP';
      case 'manual':
      default:
        return 'Manual';
    }
  });

  protected readonly isFx = computed(() => {
    const pair = this.symbolOrPair() ?? '';
    return this.source() === 'nbp' || pair.includes('/') || pair.includes('→');
  });

  protected readonly relativeAge = computed(() => {
    const raw = this.asOf()?.trim();
    if (!raw) return '';

    const parsedMs = Date.parse(raw);
    if (!Number.isFinite(parsedMs)) return raw;

    const ageMs = Math.max(0, Date.now() - parsedMs);
    const minutes = Math.round(ageMs / 60_000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;

    const hours = Math.round(ageMs / 3_600_000);
    if (hours < 24) return `${hours} h ago`;

    const days = Math.round(ageMs / 86_400_000);
    return `${days} d ago`;
  });

  protected readonly displayText = computed(() => {
    const st = this.status();
    const sym = this.symbolOrPair()?.trim();
    const src = this.sourceLabel();
    const age = this.relativeAge();

    switch (st) {
      case 'live':
        return [sym, src, 'live'].filter(Boolean).join(' · ');
      case 'cached':
        return [sym, src, age || 'cached'].filter(Boolean).join(' · ');
      case 'stale':
        return [sym, src, age || 'stale'].filter(Boolean).join(' · ');
      case 'manual': {
        const label = this.isFx() ? 'Manual FX' : 'Manual price';
        return sym ? `${sym} · ${label}` : label;
      }
      case 'missing':
      default: {
        const label = this.isFx() ? 'Missing FX · Tap to fix' : 'Missing price · Tap to fix';
        return sym ? `${sym} · ${label}` : label;
      }
    }
  });

  protected readonly tooltipText = computed(() => {
    const st = this.status();
    const asOfVal = this.asOf()?.trim();

    switch (st) {
      case 'live':
        return this.isFx()
          ? 'Exchange rate fetched within TTL from NBP. Up to date.'
          : 'Price fetched within the last 15 min. Up to date.';
      case 'cached':
        return this.isFx()
          ? `Cached market data from NBP Table A${asOfVal ? ` (effective: ${asOfVal.slice(0, 10)})` : ''}.`
          : `Cached quote from Twelve Data${asOfVal ? ` (as of ${asOfVal.slice(0, 16).replace('T', ' ')})` : ''}.`;
      case 'stale':
        return 'Market data is stale. Connect to internet and tap refresh.';
      case 'manual':
        return 'Manual override active. Tap to update or fetch live.';
      case 'missing':
      default:
        return 'No market data available. Enter manual value or configure Twelve Data key.';
    }
  });
}

export { MarketStatusBadge as MarketStatusBadgeComponent };
