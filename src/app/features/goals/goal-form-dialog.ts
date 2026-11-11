import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { form, FormField, FormRoot, min, required } from '@angular/forms/signals';
import { MatButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { Goal } from '../../core/models/worth-it.model';
import { FieldErrors } from '../../shared/components/field-errors/field-errors';

/**
 * REFERENCE IMPLEMENTATION of the Signal Forms pattern used across Worth It.
 * Every form in the app must follow this structure (see docs/CONVENTIONS.md).
 */
export interface GoalFormValue {
  name: string;
  targetAmount: number;
}

@Component({
  selector: 'app-goal-form-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatFormFieldModule, MatInput, MatButton, FormRoot, FormField, FieldErrors],
  template: `
    <h2 mat-dialog-title>{{ data.goal ? 'Edit goal' : 'New goal' }}</h2>
    <form [formRoot]="goalForm">
      <mat-dialog-content class="form-grid">
        <mat-form-field appearance="outline">
          <mat-label>Goal name</mat-label>
          <input matInput [formField]="goalForm.name" placeholder="e.g. Apartment" />
        </mat-form-field>
        <app-field-errors [field]="goalForm.name" />

        <mat-form-field appearance="outline">
          <mat-label>Additional amount needed</mat-label>
          <input matInput type="number" [formField]="goalForm.targetAmount" />
          <span matTextSuffix>PLN</span>
        </mat-form-field>
        <app-field-errors [field]="goalForm.targetAmount" />
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancel</button>
        <button mat-flat-button type="submit" [disabled]="goalForm().submitting()">Save</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .form-grid { display: flex; flex-direction: column; gap: 4px; min-width: min(420px, 80vw); }
  `,
})
export class GoalFormDialog {
  protected readonly data = inject<{ goal?: Goal }>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<GoalFormDialog, GoalFormValue>);

  /** 1. The model is a writable signal holding a plain object. */
  private readonly model = signal<GoalFormValue>({
    name: this.data.goal?.name ?? '',
    targetAmount: this.data.goal?.targetAmount ?? 0,
  });

  /** 2. form(model, schemaFn, { submission }) — validation lives in the schema function. */
  protected readonly goalForm = form(
    this.model,
    (path) => {
      required(path.name, { message: 'Give the goal a name' });
      required(path.targetAmount, { message: 'Enter the amount needed' });
      min(path.targetAmount, 1, { message: 'Amount must be greater than 0' });
    },
    {
      /** 3. The submission action only runs when the form is valid; <form [formRoot]> calls it. */
      submission: {
        action: async () => {
          this.dialogRef.close({ ...this.model(), name: this.model().name.trim() });
          return undefined;
        },
      },
    }
  );
}
