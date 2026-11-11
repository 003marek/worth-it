import { Component, inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  isDestructive?: boolean;
}

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <p>{{ data.message }}</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="onCancel()">
        {{ data.cancelText || 'Cancel' }}
      </button>
      <button
        mat-flat-button
        [color]="isDestructive() ? 'warn' : 'primary'"
        [class.destructive-button]="isDestructive()"
        (click)="onConfirm()"
      >
        {{ data.confirmText || 'Confirm' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      mat-dialog-content {
        padding-top: 0.5rem;
        padding-bottom: 0.5rem;
      }
      p {
        margin: 0;
        color: var(--mat-sys-on-surface-variant);
      }
      .destructive-button {
        --mdc-filled-button-container-color: var(--mat-sys-error);
        --mdc-filled-button-label-text-color: var(--mat-sys-on-error);
      }
    `,
  ],
})
export class ConfirmDialog {
  protected readonly dialogRef = inject(MatDialogRef<ConfirmDialog>);
  protected readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);

  protected isDestructive(): boolean {
    return Boolean(this.data.destructive ?? this.data.isDestructive);
  }

  protected onCancel(): void {
    this.dialogRef.close(false);
  }

  protected onConfirm(): void {
    this.dialogRef.close(true);
  }
}

export { ConfirmDialog as ConfirmDialogComponent };
