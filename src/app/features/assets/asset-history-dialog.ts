import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { form, FormField, FormRoot, min, required } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Asset } from '../../core/models/worth-it.model';
import { WorthItStore } from '../../core/stores/worth-it.store';
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
    MatCardModule,
    MatChipsModule,
    MatTableModule,
    MatFormFieldModule,
    MatInput,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    FormRoot,
    FormField,
    MoneyPipe,
  ],
  template: `
    <div class="dialog-header">
      <h2 mat-dialog-title>History: {{ data.asset.name }}</h2>
      <mat-chip-set>
        <mat-chip>{{ data.asset.currency }}</mat-chip>
      </mat-chip-set>
    </div>

    <mat-dialog-content class="history-content">
      <!-- Manual Snapshot Signal Form -->
      <mat-card appearance="outlined" class="snapshot-card">
        <mat-card-header>
          <mat-card-title class="snapshot-title">Log historical snapshot</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <form [formRoot]="snapshotForm" class="snapshot-form">
            <div class="snapshot-row">
              <div class="col-field date-field">
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>Date</mat-label>
                  <input matInput type="date" [formField]="snapshotForm.date" />
                  @for (error of snapshotForm.date().errors(); track $index) {
                    <mat-error>{{ error.message }}</mat-error>
                  }
                </mat-form-field>
              </div>

              <div class="col-field balance-field">
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>Balance</mat-label>
                  <input matInput type="number" step="any" [formField]="snapshotForm.balance" />
                  <span matTextSuffix>{{ data.asset.currency }}</span>
                  @for (error of snapshotForm.balance().errors(); track $index) {
                    <mat-error>{{ error.message }}</mat-error>
                  }
                </mat-form-field>
              </div>

              <div class="col-field note-field">
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
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
        </mat-card-content>
      </mat-card>

      <!-- History Material Table -->
      <section class="history-list-section">
        <div class="table-container">
          <table mat-table [dataSource]="historyRows()" class="history-table">
            <ng-container matColumnDef="date">
              <th mat-header-cell *matHeaderCellDef>Date</th>
              <td mat-cell *matCellDef="let row" class="date-cell">
                {{ row.date | date:'yyyy-MM-dd' }}
              </td>
            </ng-container>

            <ng-container matColumnDef="balance">
              <th mat-header-cell *matHeaderCellDef>Balance</th>
              <td mat-cell *matCellDef="let row" class="balance-cell">
                {{ row.balance | money:data.asset.currency }}
              </td>
            </ng-container>

            <ng-container matColumnDef="delta">
              <th mat-header-cell *matHeaderCellDef>Change</th>
              <td mat-cell *matCellDef="let row" class="delta-cell">
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
                  <mat-chip class="initial-tag">Initial</mat-chip>
                }
              </td>
            </ng-container>

            <ng-container matColumnDef="note">
              <th mat-header-cell *matHeaderCellDef>Note</th>
              <td mat-cell *matCellDef="let row" class="note-cell">{{ row.note || '—' }}</td>
            </ng-container>

            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef class="action-col"></th>
              <td mat-cell *matCellDef="let row" class="action-cell">
                <button
                  mat-icon-button
                  (click)="onDeleteHistory(row.id)"
                  matTooltip="Delete this entry"
                  aria-label="Delete history entry"
                  color="warn"
                >
                  <mat-icon>delete</mat-icon>
                </button>
              </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
            <tr mat-row *matRowDef="let row; columns: displayedColumns"></tr>

            <tr class="mat-row" *matNoDataRow>
              <td class="mat-cell empty-cell" colspan="5">
                No balance history recorded for this asset yet.
              </td>
            </tr>
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

      .snapshot-title {
        font-size: 0.9375rem;
        font-weight: 600;
        margin-bottom: 8px;
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

      .note-cell {
        color: var(--mat-sys-on-surface-variant);
        max-width: 180px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .action-cell {
        text-align: right;
        width: 44px;
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

  protected readonly displayedColumns = ['date', 'balance', 'delta', 'note', 'actions'] as const;

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
