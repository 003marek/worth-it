import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  form,
  FormField,
  FormRoot,
  min,
  required,
} from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import {
  accruedBalanceAt,
  elapsedContributionMonths,
  nextContributionDateAfter,
  resolveRecurringSavingsDetails,
} from '../../../core/asset-types/recurring-savings/recurring-savings';
import { Asset } from '../../../core/models/worth-it.model';
import { WorthItStore } from '../../../core/stores/worth-it.store';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';

export interface RecurringSavingsBaselineDialogData {
  asset: Asset;
}

export interface RecurringSavingsBaselineFormValue {
  baselineAmount: number;
  baselineDate: string;
  note: string;
}

export interface RecurringSavingsBaselineDialogResult {
  baselineAmount: number;
  baselineDate: string;
  note?: string;
}

@Component({
  selector: 'app-recurring-savings-baseline-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    MatDialogModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    FormRoot,
    FormField,
    MoneyPipe,
  ],
  template: `
    <h2 mat-dialog-title>Update Baseline · {{ data.asset.name }}</h2>

    <form [formRoot]="baselineForm">
      <mat-dialog-content class="baseline-content">
        <mat-card appearance="outlined" class="guidance-card">
          <mat-card-content class="guidance-body">
            <mat-icon class="guidance-icon" aria-hidden="true">verified</mat-icon>
            <p class="guidance-copy">
              Enter the current verified balance from your PPK or PPO account. Any monthly
              contributions scheduled after the baseline date will automatically accrue on top of
              this amount.
            </p>
          </mat-card-content>
        </mat-card>

        <div class="fields-row">
          <mat-form-field appearance="outline">
            <mat-label>Verified baseline balance</mat-label>
            <input
              matInput
              type="number"
              step="0.01"
              class="mono-nums"
              [formField]="baselineForm.baselineAmount"
            />
            <span matTextSuffix>{{ data.asset.currency }}</span>
            @for (error of baselineForm.baselineAmount().errors(); track $index) {
              <mat-error>{{ error.message }}</mat-error>
            }
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>As of baseline date</mat-label>
            <input
              matInput
              type="date"
              class="mono-nums"
              [formField]="baselineForm.baselineDate"
            />
            @for (error of baselineForm.baselineDate().errors(); track $index) {
              <mat-error>{{ error.message }}</mat-error>
            }
          </mat-form-field>
        </div>

        <mat-form-field appearance="outline">
          <mat-label>History note (optional)</mat-label>
          <input
            matInput
            [formField]="baselineForm.note"
            placeholder="e.g. Synced with provider portal balance"
          />
        </mat-form-field>

        <mat-card
          appearance="outlined"
          class="preview-card"
          role="status"
          aria-live="polite"
        >
          <mat-card-content class="preview-body">
            <div class="preview-line">
              <span>Accrued balance today:</span>
              <strong class="mono-nums positive-value">
                {{ previewBalanceToday() | money:data.asset.currency }}
              </strong>
            </div>
            @if (previewMonthsElapsed() > 0) {
              <div class="preview-subline">
                Includes
                <strong class="mono-nums">{{ previewMonthsElapsed() }}</strong>
                elapsed monthly contribution{{ previewMonthsElapsed() === 1 ? '' : 's' }}
                since {{ model().baselineDate | date:'mediumDate' }}.
              </div>
            }
            @if (previewNextDate(); as nextDate) {
              <div class="preview-subline">
                Next monthly increase
                (<span class="mono-nums projected-text"
                  >+{{ currentDetails().monthlyContribution | money:data.asset.currency }}/mo</span
                >) scheduled on
                <strong class="mono-nums">{{ nextDate | date:'mediumDate' }}</strong>.
              </div>
            }
          </mat-card-content>
        </mat-card>
      </mat-dialog-content>

      <mat-dialog-actions align="end" class="baseline-actions">
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

    .mono-nums {
      font-family: 'Roboto Mono', monospace;
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class RecurringSavingsBaselineDialog {
  protected readonly data =
    inject<RecurringSavingsBaselineDialogData>(MAT_DIALOG_DATA);
  protected readonly store = inject(WorthItStore);
  private readonly dialogRef = inject(
    MatDialogRef<
      RecurringSavingsBaselineDialog,
      RecurringSavingsBaselineDialogResult
    >
  );

  protected readonly currentDetails = computed(() =>
    resolveRecurringSavingsDetails(this.data.asset, this.store.today())
  );

  protected readonly model = signal<RecurringSavingsBaselineFormValue>({
    baselineAmount:
      this.store
        .recurringSavingsSnapshots()
        .get(this.data.asset.id)?.currentAccruedBalance ??
      this.currentDetails().baselineAmount,
    baselineDate: this.store.today(),
    note: '',
  });

  protected readonly previewMonthsElapsed = computed(() => {
    const val = this.model();
    const details = this.currentDetails();
    return elapsedContributionMonths(
      val.baselineDate || this.store.today(),
      this.store.today(),
      details.isContributing
    );
  });

  protected readonly previewBalanceToday = computed(() => {
    const val = this.model();
    const details = this.currentDetails();
    return accruedBalanceAt(
      {
        ...details,
        baselineAmount: Math.max(0, Number(val.baselineAmount) || 0),
        baselineDate: val.baselineDate || this.store.today(),
      },
      this.store.today()
    );
  });

  protected readonly previewNextDate = computed(() => {
    const val = this.model();
    const details = this.currentDetails();
    return nextContributionDateAfter(
      {
        ...details,
        baselineAmount: Math.max(0, Number(val.baselineAmount) || 0),
        baselineDate: val.baselineDate || this.store.today(),
      },
      this.store.today()
    );
  });

  protected readonly baselineForm = form(
    this.model,
    (path) => {
      required(path.baselineAmount, {
        message: 'Baseline balance is required',
      });
      min(path.baselineAmount, 0, {
        message: 'Baseline balance cannot be negative',
      });
      required(path.baselineDate, {
        message: 'Baseline date is required',
      });
    },
    {
      submission: {
        action: async () => {
          const val = this.model();
          const amount = Math.max(
            0,
            Math.round((Number(val.baselineAmount) || 0) * 100) / 100
          );
          const date = val.baselineDate.trim() || this.store.today();
          const note = val.note.trim() || undefined;

          await this.store.reanchorRecurringSavingsBaseline(
            this.data.asset.id,
            amount,
            date,
            note
          );

          this.dialogRef.close({
            baselineAmount: amount,
            baselineDate: date,
            note,
          });
          return undefined;
        },
      },
    }
  );
}
