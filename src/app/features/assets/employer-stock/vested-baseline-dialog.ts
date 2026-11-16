import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { form, FormField, FormRoot, min, required } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import {
  heldSharesAt,
  unvestedSharesAt,
} from '../../../core/asset-types/employer-stock/vesting';
import { Asset } from '../../../core/models/worth-it.model';
import { WorthItStore } from '../../../core/stores/worth-it.store';

export interface VestedBaselineDialogData {
  asset: Asset;
}

export interface VestedBaselineFormValue {
  vestedSharesBaseline: number;
  vestedSharesBaselineDate: string;
}

export interface VestedBaselineDialogResult {
  action: 'saved' | 'cleared';
  vestedSharesBaseline?: number;
  vestedSharesBaselineDate?: string;
}

@Component({
  selector: 'app-vested-baseline-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    DecimalPipe,
    MatDialogModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    FormRoot,
    FormField,
  ],
  template: `
    <h2 mat-dialog-title>Set Vested Baseline · {{ data.asset.name }}</h2>

    <form [formRoot]="baselineForm">
      <mat-dialog-content class="baseline-content">
        <!-- Guidance Card -->
        <mat-card appearance="outlined" class="guidance-card">
          <mat-card-content class="guidance-body">
            <mat-icon class="guidance-icon" aria-hidden="true">verified</mat-icon>
            <p class="guidance-copy">
              Set the exact number of vested shares currently held in your brokerage account today.
              Any vesting tranches or sales dated on or before the baseline date will be disregarded
              in held share calculations.
            </p>
          </mat-card-content>
        </mat-card>

        <div class="fields-row">
          <mat-form-field appearance="outline">
            <mat-label>Verified vested shares held</mat-label>
            <input
              matInput
              type="number"
              step="0.0001"
              class="mono-nums"
              [formField]="baselineForm.vestedSharesBaseline"
            />
            <span matTextSuffix>sh</span>
            @for (error of baselineForm.vestedSharesBaseline().errors(); track $index) {
              <mat-error>{{ error.message }}</mat-error>
            }
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>As of baseline date</mat-label>
            <input
              matInput
              type="date"
              class="mono-nums"
              [formField]="baselineForm.vestedSharesBaselineDate"
            />
            @for (error of baselineForm.vestedSharesBaselineDate().errors(); track $index) {
              <mat-error>{{ error.message }}</mat-error>
            }
          </mat-form-field>
        </div>

        <!-- Live Preview Calculation -->
        <mat-card appearance="outlined" class="preview-card" role="status" aria-live="polite">
          <mat-card-content class="preview-body">
            <div class="preview-line">
              <span>New held shares today:</span>
              <strong class="mono-nums positive-value">
                {{ previewHeldSharesToday() | number:'1.0-4' }} sh
              </strong>
            </div>
            <div class="preview-subline">
              Future scheduled vests after
              <strong class="mono-nums">{{ model().vestedSharesBaselineDate | date:'mediumDate' }}</strong>
              (<span class="mono-nums projected-text">+{{ futureSharesAfterBaseline() | number:'1.0-4' }} sh</span>)
              will add to this count.
            </div>
          </mat-card-content>
        </mat-card>
      </mat-dialog-content>

      <mat-dialog-actions align="end" class="baseline-actions">
        @if (hasActiveBaseline()) {
          <button
            mat-button
            color="warn"
            type="button"
            class="clear-btn"
            (click)="onClearBaseline()"
          >
            <mat-icon>restart_alt</mat-icon>
            <span>Clear Baseline</span>
          </button>
          <span class="spacer"></span>
        }
        <button mat-stroked-button type="button" mat-dialog-close>Cancel</button>
        <button
          mat-flat-button
          color="primary"
          type="submit"
          [disabled]="!baselineForm().valid() || baselineForm().submitting()"
        >
          Save Baseline
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .baseline-content {
      display: flex;
      flex-direction: column;
      gap: 14px;
      min-width: min(460px, 88vw);
      padding-top: 8px;
    }

    .guidance-card {
      background: var(--mat-sys-surface-container);
    }

    .guidance-body {
      display: flex;
      align-items: flex-start;
      gap: 10px;
    }

    .guidance-icon {
      color: var(--mat-sys-primary);
      flex-shrink: 0;
      margin-top: 2px;
    }

    .guidance-copy {
      margin: 0;
      font-size: 0.8125rem;
      line-height: 1.45;
      color: var(--mat-sys-on-surface-variant);
    }

    .fields-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;

      @media (max-width: 520px) {
        grid-template-columns: 1fr;
      }
    }

    .preview-card {
      background: var(--mat-sys-surface-container-low);
      border-color: var(--mat-sys-outline-variant);
    }

    .preview-body {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .preview-line {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      font-size: 0.9375rem;
      color: var(--mat-sys-on-surface);
    }

    .positive-value {
      font-size: 1.125rem;
      color: var(--worth-it-positive, #1b6b3a);
    }

    .preview-subline {
      font-size: 0.8125rem;
      color: var(--mat-sys-on-surface-variant);
      line-height: 1.4;
    }

    .projected-text {
      font-style: italic;
      color: var(--mat-sys-tertiary);
    }

    .baseline-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
    }

    .clear-btn {
      color: var(--mat-sys-error);
    }

    .mono-nums {
      font-family: 'Roboto Mono', monospace;
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class VestedBaselineDialog {
  protected readonly data = inject<VestedBaselineDialogData>(MAT_DIALOG_DATA);
  protected readonly store = inject(WorthItStore);
  private readonly dialogRef = inject(
    MatDialogRef<VestedBaselineDialog, VestedBaselineDialogResult>
  );

  protected readonly hasActiveBaseline = computed(() => {
    const details = this.data.asset.employerStock;
    return (
      details?.vestedSharesBaseline !== undefined &&
      Boolean(details?.vestedSharesBaselineDate)
    );
  });

  protected readonly model = signal<VestedBaselineFormValue>({
    vestedSharesBaseline:
      this.data.asset.employerStock?.vestedSharesBaseline ??
      this.store.employerStockSnapshots().get(this.data.asset.id)?.heldShares ??
      0,
    vestedSharesBaselineDate:
      this.data.asset.employerStock?.vestedSharesBaselineDate ??
      this.store.today(),
  });

  protected readonly previewHeldSharesToday = computed(() => {
    const val = this.model();
    const grants = this.store.grantsByAsset().get(this.data.asset.id) ?? [];
    const sales = this.store
      .stockSales()
      .filter((s) => s.sourceAssetId === this.data.asset.id);
    return heldSharesAt(
      {
        tickerSymbol: this.data.asset.employerStock?.tickerSymbol ?? '',
        vestedSharesBaseline: Math.max(0, Number(val.vestedSharesBaseline) || 0),
        vestedSharesBaselineDate: val.vestedSharesBaselineDate || this.store.today(),
      },
      grants,
      sales,
      this.store.today()
    );
  });

  protected readonly futureSharesAfterBaseline = computed(() => {
    const val = this.model();
    const grants = this.store.grantsByAsset().get(this.data.asset.id) ?? [];
    return unvestedSharesAt(grants, val.vestedSharesBaselineDate || this.store.today());
  });

  protected readonly baselineForm = form(
    this.model,
    (path) => {
      required(path.vestedSharesBaseline, {
        message: 'Baseline share count is required',
      });
      min(path.vestedSharesBaseline, 0, {
        message: 'Baseline shares cannot be negative',
      });
      required(path.vestedSharesBaselineDate, {
        message: 'Baseline date is required',
      });
    },
    {
      submission: {
        action: async () => {
          const val = this.model();
          const shares = Math.max(0, Number(val.vestedSharesBaseline) || 0);
          const date = val.vestedSharesBaselineDate.trim() || this.store.today();
          await this.store.setVestedSharesBaseline(this.data.asset.id, shares, date);
          this.dialogRef.close({
            action: 'saved',
            vestedSharesBaseline: shares,
            vestedSharesBaselineDate: date,
          });
          return undefined;
        },
      },
    }
  );

  protected async onClearBaseline(): Promise<void> {
    await this.store.clearVestedSharesBaseline(this.data.asset.id);
    this.dialogRef.close({ action: 'cleared' });
  }
}

export { VestedBaselineDialog as VestedBaselineDialogComponent };
