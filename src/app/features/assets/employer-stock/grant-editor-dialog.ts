import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { form, FormField, FormRoot, min, required, validate } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';
import { addMonthsClamped } from '../../../core/asset-types/date-utils';
import {
  generateTranches,
  validateTranches,
} from '../../../core/asset-types/employer-stock/vesting';
import {
  StockGrant,
  VestingFrequency,
  VestingScheduleParams,
  VestingTranche,
} from '../../../core/models/employer-stock.model';
import { WorthItStore } from '../../../core/stores/worth-it.store';
import { ConfirmDialog } from '../../../shared/components/confirm-dialog/confirm-dialog';

export type CliffMode = 'none' | 'one_year' | 'custom';

export interface GrantEditorDialogData {
  assetId: string;
  grant?: StockGrant;
  /** Defaults to true: persists grant via WorthItStore before closing. */
  saveToStore?: boolean;
}

export interface GrantFormValue {
  name: string;
  grantDate: string;
  totalShares: number;
  frequency: VestingFrequency;
  durationMonths: number;
  cliffMode: CliffMode;
  firstVestDate: string;
  tranches: VestingTranche[];
  isScheduleCustomized: boolean;
}

export interface GrantEditorDialogResult {
  grant?: StockGrant;
  name?: string;
  grantDate: string;
  totalShares: number;
  schedule: VestingScheduleParams;
  tranches: VestingTranche[];
  isScheduleCustomized: boolean;
}

export const DURATION_OPTIONS = [12, 24, 36, 48] as const;

function createTrancheId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'tranche_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
}

@Component({
  selector: 'app-grant-editor-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonToggleModule,
    MatRadioModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    MatTooltipModule,
    FormRoot,
    FormField,
  ],
  template: `
    <h2 mat-dialog-title>
      {{
        data.grant
          ? 'Edit ' + (data.grant.name || 'Stock Grant')
          : 'New Stock Grant'
      }}
    </h2>

    <form [formRoot]="grantForm">
      <mat-dialog-content class="grant-dialog-content">
        <!-- Section A: Grant Details -->
        <section class="editor-section" aria-label="Grant details">
          <h3 class="section-heading">Grant Details</h3>
          <div class="details-grid">
            <mat-form-field appearance="outline" class="name-col">
              <mat-label>Grant name / label (optional)</mat-label>
              <input
                matInput
                [formField]="grantForm.name"
                placeholder="e.g. 2026 Promo Grant"
              />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Grant date</mat-label>
              <input
                matInput
                type="date"
                class="mono-nums"
                [formField]="grantForm.grantDate"
              />
              @for (error of grantForm.grantDate().errors(); track $index) {
                <mat-error>{{ error.message }}</mat-error>
              }
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Total shares granted</mat-label>
              <input
                matInput
                type="number"
                step="0.0001"
                class="mono-nums"
                [formField]="grantForm.totalShares"
              />
              <span matTextSuffix>sh</span>
              @for (error of grantForm.totalShares().errors(); track $index) {
                <mat-error>{{ error.message }}</mat-error>
              }
            </mat-form-field>
          </div>
        </section>

        <mat-divider></mat-divider>

        <!-- Section B: Schedule Generator Parameters -->
        <section class="editor-section generator-section" aria-label="Schedule generator">
          <div class="section-header-row">
            <h3 class="section-heading">Schedule Generator Parameters</h3>
            @if (model().isScheduleCustomized) {
              <span class="customized-badge">Custom schedule edited</span>
            }
          </div>

          <div class="generator-controls">
            <div class="control-block">
              <span class="control-label" id="freq-label">Vesting frequency</span>
              <mat-button-toggle-group
                [value]="model().frequency"
                (change)="onFrequencyChange($event.value)"
                aria-labelledby="freq-label"
                class="freq-toggle-group"
              >
                <mat-button-toggle value="monthly">Monthly</mat-button-toggle>
                <mat-button-toggle value="quarterly">Quarterly</mat-button-toggle>
                <mat-button-toggle value="annual">Annual</mat-button-toggle>
              </mat-button-toggle-group>
            </div>

            <div class="control-block duration-block">
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Duration (months)</mat-label>
                <mat-select [formField]="grantForm.durationMonths">
                  @for (dur of durationOptions; track dur) {
                    <mat-option [value]="dur">{{ dur }} months</mat-option>
                  }
                </mat-select>
              </mat-form-field>
            </div>
          </div>

          <div class="cliff-row">
            <span class="control-label" id="cliff-label">Cliff option</span>
            <mat-radio-group
              [value]="model().cliffMode"
              (change)="onCliffModeChange($event.value)"
              aria-labelledby="cliff-label"
              class="cliff-radio-group"
            >
              <mat-radio-button value="none">
                None (immediate vesting)
              </mat-radio-button>
              <mat-radio-button value="one_year">
                1-Year Cliff (12 months)
              </mat-radio-button>
              <mat-radio-button value="custom">
                Custom First Vest Date
              </mat-radio-button>
            </mat-radio-group>

            @if (model().cliffMode === 'custom') {
              <mat-form-field
                appearance="outline"
                class="custom-vest-field"
                subscriptSizing="dynamic"
              >
                <mat-label>First vest date</mat-label>
                <input
                  matInput
                  type="date"
                  class="mono-nums"
                  [formField]="grantForm.firstVestDate"
                />
              </mat-form-field>
            }
          </div>

          <div class="generator-cta-row">
            <button
              mat-stroked-button
              color="primary"
              type="button"
              class="generate-btn"
              (click)="onGenerateSchedule()"
            >
              <mat-icon>auto_fix_high</mat-icon>
              <span>Generate Schedule</span>
            </button>
          </div>
        </section>

        <mat-divider></mat-divider>

        <!-- Section C: Concrete Vesting Schedule (Editable Tranches) -->
        <section class="editor-section tranches-section" aria-label="Vesting tranches schedule">
          <div class="tranches-header-row">
            <h3 class="section-heading">
              Vesting Tranches ({{ model().tranches.length }})
            </h3>
            <button
              mat-stroked-button
              type="button"
              class="add-tranche-btn"
              (click)="addTranche()"
              aria-label="Add vesting tranche"
            >
              <mat-icon>add</mat-icon>
              <span>Add tranche</span>
            </button>
          </div>

          <!-- Allocation Status Bar -->
          <div
            class="allocation-status-bar"
            [class.allocation-exact]="isAllocationExact()"
            [class.allocation-mismatch]="!isAllocationExact()"
            role="status"
            aria-live="polite"
          >
            <div class="allocation-text mono-nums">
              Total allocated:
              <strong>{{ allocatedShares() | number:'1.0-4' }}</strong>
              / {{ model().totalShares | number:'1.0-4' }} sh
            </div>
            <div class="allocation-pill">
              @if (isAllocationExact()) {
                <mat-icon aria-hidden="true">done</mat-icon>
                <span>Exact match</span>
              } @else {
                <mat-icon aria-hidden="true">error</mat-icon>
                <span class="mono-nums">
                  Diff: {{ allocationDiff() > 0 ? '+' : '' }}{{ allocationDiff() | number:'1.0-4' }} sh
                </span>
              }
            </div>
          </div>

          <!-- Inline Validation Errors on Tranches -->
          @if (grantForm.tranches().errors().length > 0) {
            <div class="tranche-errors-banner" role="alert" aria-live="polite">
              @for (error of grantForm.tranches().errors(); track $index) {
                <div class="tranche-error-item">
                  <mat-icon aria-hidden="true">error_outline</mat-icon>
                  <span>{{ error.message }}</span>
                </div>
              }
            </div>
          }

          <!-- Tranche Rows (Stacked on narrow mobile, inline/tabular on wider screens) -->
          <div
            class="tranches-table"
            role="table"
            aria-label="Vesting tranches schedule"
          >
            <div class="tranches-thead" role="row">
              <span class="col-idx" role="columnheader">#</span>
              <span class="col-date" role="columnheader">Vest Date</span>
              <span class="col-shares" role="columnheader">Shares</span>
              <span class="col-pct" role="columnheader">% of Grant</span>
              <span class="col-del" role="columnheader"></span>
            </div>

            @for (tranche of model().tranches; track tranche.id; let idx = $index) {
              <div class="tranche-row" role="row">
                <div class="tranche-fields-group">
                  <span class="col-idx mono-nums" role="cell">{{ idx + 1 }}</span>

                  <div class="col-date" role="cell">
                    <mat-form-field appearance="outline" subscriptSizing="dynamic">
                      <mat-label>Vest date #{{ idx + 1 }}</mat-label>
                      <input
                        matInput
                        type="date"
                        class="mono-nums"
                        [value]="tranche.vestDate"
                        (input)="onTrancheDateInput(idx, $event)"
                      />
                    </mat-form-field>
                  </div>

                  <div class="col-shares" role="cell">
                    <mat-form-field appearance="outline" subscriptSizing="dynamic">
                      <mat-label>Shares #{{ idx + 1 }}</mat-label>
                      <input
                        matInput
                        type="number"
                        step="0.0001"
                        class="mono-nums"
                        [value]="tranche.shares"
                        (input)="onTrancheSharesInput(idx, $event)"
                      />
                      <span matTextSuffix>sh</span>
                    </mat-form-field>
                  </div>

                  <span class="col-pct mono-nums" role="cell">
                    {{ getTranchePercent(tranche.shares) | number:'1.0-1' }}%
                  </span>
                </div>

                <div class="col-del" role="cell">
                  <button
                    mat-icon-button
                    type="button"
                    color="warn"
                    class="delete-tranche-btn"
                    (click)="removeTranche(idx)"
                    [disabled]="model().tranches.length <= 1"
                    [attr.aria-label]="
                      'Delete tranche vesting on ' + (tranche.vestDate || 'row ' + (idx + 1))
                    "
                    matTooltip="Delete tranche"
                  >
                    <mat-icon>delete</mat-icon>
                  </button>
                </div>
              </div>
            }
          </div>
        </section>
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-stroked-button type="button" mat-dialog-close>Cancel</button>
        <button
          mat-flat-button
          color="primary"
          type="submit"
          [disabled]="!grantForm().valid() || grantForm().submitting()"
        >
          Save Grant
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .grant-dialog-content {
      display: flex;
      flex-direction: column;
      gap: 16px;
      width: min(720px, 90vw);
      max-height: 76vh;
      padding-top: 8px;
      box-sizing: border-box;
    }

    .editor-section {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .section-header-row,
    .tranches-header-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 8px;
    }

    .section-heading {
      margin: 0;
      font-size: 0.9375rem;
      font-weight: 600;
      color: var(--mat-sys-on-surface);
    }

    .customized-badge {
      font-size: 0.75rem;
      font-weight: 500;
      padding: 2px 8px;
      border-radius: 999px;
      background: var(--mat-sys-tertiary-container);
      color: var(--mat-sys-on-tertiary-container);
    }

    .details-grid {
      display: grid;
      grid-template-columns: 1.5fr 1fr 1fr;
      gap: 12px;

      @media (max-width: 640px) {
        grid-template-columns: 1fr;
      }
    }

    .generator-controls {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      gap: 16px;
    }

    .control-block {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .duration-block {
      min-width: 160px;
    }

    .control-label {
      font-size: 0.75rem;
      font-weight: 500;
      color: var(--mat-sys-on-surface-variant);
    }

    .cliff-row {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .cliff-radio-group {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }

    .custom-vest-field {
      max-width: 240px;
    }

    .generator-cta-row {
      display: flex;
      justify-content: flex-start;
    }

    .generate-btn,
    .add-tranche-btn {
      min-height: 48px;
    }

    .allocation-status-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 8px;
      padding: 10px 12px;
      border-radius: 10px;
      font-size: 0.8125rem;
      border: 1px solid var(--mat-sys-outline-variant);
      background: var(--mat-sys-surface-container);
    }

    .allocation-exact .allocation-pill {
      color: var(--worth-it-positive, #1b6b3a);
      font-weight: 600;
    }

    .allocation-mismatch {
      border-color: var(--mat-sys-error);
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);

      .allocation-pill {
        color: var(--mat-sys-error);
        font-weight: 600;
      }
    }

    .allocation-pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;

      mat-icon {
        font-size: 1rem;
        width: 1rem;
        height: 1rem;
      }
    }

    .tranche-errors-banner {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 10px 12px;
      border-radius: 8px;
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
      font-size: 0.8125rem;
    }

    .tranche-error-item {
      display: flex;
      align-items: center;
      gap: 6px;

      mat-icon {
        font-size: 1rem;
        width: 1rem;
        height: 1rem;
        flex-shrink: 0;
      }
    }

    .tranches-table {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .tranches-thead {
      display: none;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--mat-sys-on-surface-variant);
      padding: 4px 8px;

      @media (min-width: 640px) {
        display: grid;
        grid-template-columns: 36px 1fr 1fr 72px 48px;
        gap: 10px;
        align-items: center;
      }
    }

    .tranche-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 8px;
      border-radius: 10px;
      background: var(--mat-sys-surface-container-low);
      border: 1px solid var(--mat-sys-outline-variant);
    }

    .tranche-fields-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
      flex: 1;

      /* Mobile standard 390px+: inline Date + Shares */
      @media (min-width: 390px) and (max-width: 639px) {
        flex-direction: row;
        align-items: center;

        .col-idx,
        .col-pct {
          display: none;
        }
        .col-date {
          flex: 1.1;
        }
        .col-shares {
          flex: 0.9;
        }
      }

      /* Narrow mobile < 390px: stacked Date on top, Shares below */
      @media (max-width: 389px) {
        .col-idx,
        .col-pct {
          display: none;
        }
      }

      /* Tablet / Desktop >= 640px: full tabular grid */
      @media (min-width: 640px) {
        display: grid;
        grid-template-columns: 36px 1fr 1fr 72px;
        gap: 10px;
        align-items: center;
      }

      mat-form-field {
        width: 100%;
      }
    }

    .col-idx {
      font-size: 0.8125rem;
      color: var(--mat-sys-on-surface-variant);
      text-align: center;
    }

    .col-pct {
      font-size: 0.8125rem;
      color: var(--mat-sys-on-surface-variant);
      text-align: right;
    }

    .delete-tranche-btn {
      min-width: 48px;
      min-height: 48px;
    }

    .mono-nums {
      font-family: 'Roboto Mono', monospace;
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class GrantEditorDialog {
  protected readonly data = inject<GrantEditorDialogData>(MAT_DIALOG_DATA);
  protected readonly store = inject(WorthItStore);
  private readonly dialog = inject(MatDialog);
  private readonly dialogRef = inject(
    MatDialogRef<GrantEditorDialog, GrantEditorDialogResult>
  );

  protected readonly durationOptions = DURATION_OPTIONS;

  protected readonly model = signal<GrantFormValue>(this.createInitialModel());

  protected readonly allocatedShares = computed(() => {
    const sum = this.model().tranches.reduce(
      (acc, t) => acc + (Number(t.shares) || 0),
      0
    );
    return Math.round(sum * 10000) / 10000;
  });

  protected readonly allocationDiff = computed(() => {
    const total = Number(this.model().totalShares) || 0;
    return Math.round((this.allocatedShares() - total) * 10000) / 10000;
  });

  protected readonly isAllocationExact = computed(
    () => Math.abs(this.allocationDiff()) <= 0.001
  );

  protected readonly grantForm = form(
    this.model,
    (path) => {
      required(path.grantDate, { message: 'Grant date is required' });
      required(path.totalShares, { message: 'Total shares is required' });
      min(path.totalShares, 0.0001, { message: 'Must be greater than 0' });

      // UX §6.1 Custom validation rule: Tranche sum must match total shares
      validate(path.tranches, (ctx) => {
        const total = Number(ctx.valueOf(path.totalShares)) || 0;
        const tranches = ctx.value() ?? [];
        if (tranches.length === 0) {
          return {
            kind: 'empty_tranches',
            message: 'At least one vesting tranche is required',
          };
        }
        const sum = tranches.reduce((acc, t) => acc + (Number(t.shares) || 0), 0);
        const diff = Math.abs(sum - total);
        if (diff > 0.001) {
          return {
            kind: 'sum_mismatch',
            message: `Tranches sum (${sum.toFixed(4)}) must equal total shares (${total.toFixed(4)}). Difference: ${diff.toFixed(4)}`,
          };
        }
        return null;
      });

      // UX §6.1 Custom validation rule: Chronological order, no duplicate dates, > 0 shares
      validate(path.tranches, (ctx) => {
        const tranches = ctx.value() ?? [];
        for (let i = 0; i < tranches.length; i++) {
          if (!tranches[i].vestDate || !/^\d{4}-\d{2}-\d{2}$/.test(tranches[i].vestDate)) {
            return {
              kind: 'invalid_date',
              message: `Tranche ${i + 1} requires a valid date (YYYY-MM-DD)`,
            };
          }
          if (!(Number(tranches[i].shares) > 0)) {
            return {
              kind: 'zero_shares',
              message: `Tranche ${i + 1} shares must be > 0`,
            };
          }
          if (i > 0 && tranches[i].vestDate <= tranches[i - 1].vestDate) {
            return {
              kind: 'date_order',
              message: `Tranche ${i + 1} date must be strictly after tranche ${i} date`,
            };
          }
        }
        return null;
      });
    },
    {
      submission: {
        action: async () => {
          const val = this.model();
          const schedule = this.buildScheduleParams(val);
          const cleanName = val.name.trim() || undefined;
          const totalShares = Number(val.totalShares);
          const tranches = val.tranches.map((t) => ({
            id: t.id || createTrancheId(),
            vestDate: t.vestDate,
            shares: Number(t.shares),
          }));

          // Double-check with domain validateTranches
          const domainErrors = validateTranches({ totalShares, tranches });
          if (domainErrors.length > 0) {
            return undefined;
          }

          let savedGrant: StockGrant | undefined;
          if (this.data.saveToStore !== false) {
            if (this.data.grant?.id) {
              savedGrant = await this.store.updateStockGrant(this.data.grant.id, {
                name: cleanName,
                grantDate: val.grantDate,
                totalShares,
                schedule,
                tranches,
                isScheduleCustomized: val.isScheduleCustomized,
              });
            } else {
              savedGrant = await this.store.addStockGrant({
                assetId: this.data.assetId,
                name: cleanName,
                grantDate: val.grantDate,
                totalShares,
                schedule,
                tranches,
                isScheduleCustomized: val.isScheduleCustomized,
              });
            }
          }

          this.dialogRef.close({
            grant: savedGrant,
            name: cleanName,
            grantDate: val.grantDate,
            totalShares,
            schedule,
            tranches,
            isScheduleCustomized: val.isScheduleCustomized,
          });
          return undefined;
        },
      },
    }
  );

  protected getTranchePercent(shares: number): number {
    const total = Number(this.model().totalShares) || 0;
    if (total <= 0) return 0;
    return ((Number(shares) || 0) / total) * 100;
  }

  protected onFrequencyChange(frequency: VestingFrequency): void {
    this.model.update((m) => ({ ...m, frequency }));
  }

  protected onCliffModeChange(cliffMode: CliffMode): void {
    this.model.update((m) => ({
      ...m,
      cliffMode,
      firstVestDate:
        cliffMode === 'custom' && !m.firstVestDate
          ? addMonthsClamped(m.grantDate || this.store.today(), 3)
          : m.firstVestDate,
    }));
  }

  protected async onGenerateSchedule(): Promise<void> {
    if (this.model().isScheduleCustomized) {
      const ref = this.dialog.open(ConfirmDialog, {
        data: {
          title: 'Overwrite custom schedule?',
          message:
            'You have made manual edits to individual tranches. Regenerating will reset dates and share counts to default splits.',
          confirmText: 'Regenerate',
          cancelText: 'Cancel',
          destructive: true,
        },
      });
      const confirmed = await firstValueFrom(ref.afterClosed());
      if (!confirmed) return;
    }

    this.applyGeneratedSchedule();
  }

  protected applyGeneratedSchedule(): void {
    const val = this.model();
    const totalShares = Number(val.totalShares);
    if (!val.grantDate || !(totalShares > 0)) return;

    const params = this.buildScheduleParams(val);
    try {
      const generated = generateTranches(val.grantDate, totalShares, params);
      this.model.update((m) => ({
        ...m,
        tranches: generated,
        isScheduleCustomized: false,
      }));
    } catch {
      // Keep current tranches if schedule parameters are invalid
    }
  }

  protected onTrancheDateInput(index: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    this.updateTrancheDate(index, input.value);
  }

  protected onTrancheSharesInput(index: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    this.updateTrancheShares(index, Number(input.value));
  }

  protected updateTrancheDate(index: number, vestDate: string): void {
    this.model.update((m) => {
      const tranches = m.tranches.map((t, idx) =>
        idx === index ? { ...t, vestDate } : t
      );
      return { ...m, tranches, isScheduleCustomized: true };
    });
  }

  protected updateTrancheShares(index: number, shares: number): void {
    this.model.update((m) => {
      const tranches = m.tranches.map((t, idx) =>
        idx === index ? { ...t, shares } : t
      );
      return { ...m, tranches, isScheduleCustomized: true };
    });
  }

  protected addTranche(): void {
    this.model.update((m) => {
      const lastDate =
        m.tranches.length > 0
          ? m.tranches[m.tranches.length - 1].vestDate
          : m.grantDate || this.store.today();
      const nextDate = addMonthsClamped(lastDate, 3);
      const remaining = Math.max(
        0,
        Math.round(((Number(m.totalShares) || 0) - this.allocatedShares()) * 10000) / 10000
      );
      const nextTranche: VestingTranche = {
        id: createTrancheId(),
        vestDate: nextDate,
        shares: remaining > 0 ? remaining : 1,
      };
      return {
        ...m,
        tranches: [...m.tranches, nextTranche],
        isScheduleCustomized: true,
      };
    });
  }

  protected removeTranche(index: number): void {
    this.model.update((m) => {
      if (m.tranches.length <= 1) return m;
      return {
        ...m,
        tranches: m.tranches.filter((_, idx) => idx !== index),
        isScheduleCustomized: true,
      };
    });
  }

  private createInitialModel(): GrantFormValue {
    const g = this.data.grant;
    if (g) {
      let cliffMode: CliffMode = 'none';
      if (g.schedule.firstVestDate) {
        cliffMode = 'custom';
      } else if (g.schedule.cliffMonths >= 12) {
        cliffMode = 'one_year';
      }
      return {
        name: g.name ?? '',
        grantDate: g.grantDate,
        totalShares: g.totalShares,
        frequency: g.schedule.frequency,
        durationMonths: g.schedule.durationMonths,
        cliffMode,
        firstVestDate: g.schedule.firstVestDate ?? '',
        tranches: g.tranches.map((t) => ({ ...t })),
        isScheduleCustomized: g.isScheduleCustomized,
      };
    }

    const grantDate = this.store.today();
    const totalShares = 48;
    const schedule: VestingScheduleParams = {
      frequency: 'quarterly',
      durationMonths: 48,
      cliffMonths: 12,
    };
    const tranches = generateTranches(grantDate, totalShares, schedule);

    return {
      name: '',
      grantDate,
      totalShares,
      frequency: 'quarterly',
      durationMonths: 48,
      cliffMode: 'one_year',
      firstVestDate: '',
      tranches,
      isScheduleCustomized: false,
    };
  }

  private buildScheduleParams(val: GrantFormValue): VestingScheduleParams {
    const frequency = val.frequency;
    const durationMonths = Number(val.durationMonths) || 48;
    if (val.cliffMode === 'custom' && val.firstVestDate.trim()) {
      return {
        frequency,
        durationMonths,
        cliffMonths: 0,
        firstVestDate: val.firstVestDate.trim(),
      };
    }
    return {
      frequency,
      durationMonths,
      cliffMonths: val.cliffMode === 'one_year' ? 12 : 0,
    };
  }
}

export { GrantEditorDialog as GrantEditorDialogComponent };
