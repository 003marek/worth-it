import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { form, FormField, FormRoot, min, required } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Asset } from '../../core/models/worth-it.model';
import { WorthItStore } from '../../core/stores/worth-it.store';
import { FieldErrors } from '../../shared/components/field-errors/field-errors';
import { MoneyPipe } from '../../shared/pipes/money.pipe';

export interface HistoryRow {
  id: string;
  date: string;
  balance: number;
  delta: number | null;
  note?: string;
}

export interface SnapshotFormValue {
  balance: number;
  date: string;
  note: string;
}

@Component({
  selector: 'app-asset-history-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    MatDialogModule,
    MatFormFieldModule,
    MatInput,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    FormRoot,
    FormField,
    FieldErrors,
    MoneyPipe,
  ],
  template: `
    <div class="dialog-header">
      <h2 mat-dialog-title>History: {{ data.asset.name }}</h2>
      <span class="asset-currency-badge">{{ data.asset.currency }}</span>
    </div>

    <mat-dialog-content class="history-content">
      <!-- Manual Snapshot Signal Form -->
      <section class="snapshot-card">
        <h3 class="snapshot-title">Log historical snapshot</h3>
        <form [formRoot]="snapshotForm" class="snapshot-form">
          <div class="snapshot-row">
            <div class="col-field date-field">
              <mat-form-field appearance="outline" density="compact">
                <mat-label>Date</mat-label>
                <input matInput type="date" [formField]="snapshotForm.date" />
              </mat-form-field>
              <app-field-errors [field]="snapshotForm.date" />
            </div>

            <div class="col-field balance-field">
              <mat-form-field appearance="outline" density="compact">
                <mat-label>Balance</mat-label>
                <input matInput type="number" step="any" [formField]="snapshotForm.balance" />
                <span matTextSuffix>{{ data.asset.currency }}</span>
              </mat-form-field>
              <app-field-errors [field]="snapshotForm.balance" />
            </div>

            <div class="col-field note-field">
              <mat-form-field appearance="outline" density="compact">
                <mat-label>Note (optional)</mat-label>
                <input
                  matInput
                  [formField]="snapshotForm.note"
                  placeholder="e.g. End of year snapshot"
                />
              </mat-form-field>
            </div>

            <div class="col-action">
              <button
                mat-flat-button
                type="submit"
                [disabled]="snapshotForm().submitting()"
                class="add-btn"
              >
                <mat-icon>add</mat-icon>
                <span>Add</span>
              </button>
            </div>
          </div>
        </form>
      </section>

      <!-- History Table / List -->
      <section class="history-list-section">
        <div class="table-container">
          <table class="history-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Balance</th>
                <th>Change</th>
                <th>Note</th>
                <th class="action-col"></th>
              </tr>
            </thead>
            <tbody>
              @for (row of historyRows(); track row.id) {
                <tr class="history-row">
                  <td class="date-cell">{{ row.date | date:'yyyy-MM-dd' }}</td>
                  <td class="balance-cell">{{ row.balance | money:data.asset.currency }}</td>
                  <td class="delta-cell">
                    @if (row.delta !== null) {
                      <span
                        class="delta-badge"
                        [class.positive]="row.delta > 0"
                        [class.negative]="row.delta < 0"
                        [class.zero]="row.delta === 0"
                      >
                        {{ row.delta > 0 ? '+' : '' }}{{ row.delta | money:data.asset.currency }}
                      </span>
                    } @else {
                      <span class="initial-tag">Initial</span>
                    }
                  </td>
                  <td class="note-cell">{{ row.note || '—' }}</td>
                  <td class="action-cell">
                    <button
                      mat-icon-button
                      (click)="onDeleteHistory(row.id)"
                      matTooltip="Delete this entry"
                      aria-label="Delete history entry"
                      class="delete-btn"
                    >
                      <mat-icon>delete</mat-icon>
                    </button>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="5" class="empty-cell">
                    No balance history recorded for this asset yet.
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Close</button>
    </mat-dialog-actions>
  `,
  styles: `
    .dialog-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-right: 24px;

      h2 {
        margin: 0;
      }

      .asset-currency-badge {
        font-size: 0.75rem;
        font-weight: 600;
        padding: 3px 8px;
        border-radius: 6px;
        background: var(--mat-sys-surface-container-high);
        color: var(--mat-sys-on-surface);
      }
    }

    .history-content {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-width: min(600px, 90vw);
      max-height: 70vh;
      padding-top: 8px;
    }

    .snapshot-card {
      background: var(--mat-sys-surface-container);
      border-radius: 12px;
      padding: 14px 16px;

      .snapshot-title {
        margin: 0 0 10px;
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--mat-sys-on-surface);
      }
    }

    .snapshot-row {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      gap: 8px;

      .date-field {
        flex: 1 1 130px;
      }
      .balance-field {
        flex: 1 1 130px;
      }
      .note-field {
        flex: 2 1 180px;
      }
      .col-action {
        display: flex;
        align-items: flex-start;
        padding-top: 4px;
      }

      mat-form-field {
        width: 100%;
      }
    }

    .add-btn {
      height: 48px;
    }

    .table-container {
      overflow-x: auto;
      border: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
      border-radius: 10px;
    }

    .history-table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 0.875rem;

      th {
        padding: 10px 12px;
        background: var(--mat-sys-surface-container);
        color: var(--mat-sys-on-surface-variant);
        font-weight: 600;
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        border-bottom: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
      }

      td {
        padding: 10px 12px;
        border-bottom: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.08));
        color: var(--mat-sys-on-surface);
      }

      tr:last-child td {
        border-bottom: none;
      }

      .date-cell {
        font-family: monospace;
        font-size: 0.8125rem;
        white-space: nowrap;
      }

      .balance-cell {
        font-weight: 600;
        white-space: nowrap;
      }

      .delta-cell {
        white-space: nowrap;
      }

      .delta-badge {
        font-weight: 500;
        font-size: 0.8125rem;

        &.positive {
          color: var(--worth-it-positive, #1b6b3a);
        }
        &.negative {
          color: var(--mat-sys-error);
        }
        &.zero {
          color: var(--mat-sys-on-surface-variant);
        }
      }

      .initial-tag {
        font-size: 0.75rem;
        padding: 2px 6px;
        border-radius: 4px;
        background: var(--mat-sys-surface-container-high);
        color: var(--mat-sys-on-surface-variant);
      }

      .note-cell {
        color: var(--mat-sys-on-surface-variant);
        max-width: 180px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .action-cell {
        text-align: right;
        padding-right: 6px;
        width: 44px;
      }

      .delete-btn {
        color: var(--mat-sys-on-surface-variant);
        opacity: 0.7;

        &:hover {
          opacity: 1;
          color: var(--mat-sys-error);
        }
      }

      .empty-cell {
        text-align: center;
        padding: 24px;
        color: var(--mat-sys-on-surface-variant);
      }
    }
  `,
})
export class AssetHistoryDialog {
  protected readonly data = inject<{ asset: Asset }>(MAT_DIALOG_DATA);
  protected readonly store = inject(WorthItStore);
  private readonly dialogRef = inject(MatDialogRef<AssetHistoryDialog>);

  private readonly today = () => new Date().toISOString().slice(0, 10);

  protected readonly snapshotModel = signal<SnapshotFormValue>({
    balance: this.data.asset.balance,
    date: this.today(),
    note: '',
  });

  protected readonly historyRows = computed<HistoryRow[]>(() => {
    const list = this.store
      .assetHistory()
      .filter((h) => h.assetId === this.data.asset.id)
      .slice()
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return list.map((item, index) => {
      const prev = list[index + 1];
      const delta = prev !== undefined ? item.balance - prev.balance : null;
      return {
        id: item.id,
        date: item.date,
        balance: item.balance,
        delta,
        note: item.note,
      };
    });
  });

  protected readonly snapshotForm = form(
    this.snapshotModel,
    (path) => {
      required(path.balance, { message: 'Balance is required' });
      min(path.balance, 0, { message: 'Must be ≥ 0' });
      required(path.date, { message: 'Date is required' });
    },
    {
      submission: {
        action: async () => {
          const val = this.snapshotModel();
          await this.store.addAssetHistory({
            assetId: this.data.asset.id,
            balance: Number(val.balance),
            date: new Date(val.date).toISOString(),
            note: val.note.trim() || undefined,
          });

          this.snapshotModel.set({
            balance: this.data.asset.balance,
            date: this.today(),
            note: '',
          });
          this.snapshotForm().reset();
          return undefined;
        },
      },
    }
  );

  protected async onDeleteHistory(id: string): Promise<void> {
    await this.store.deleteAssetHistory(id);
  }
}
