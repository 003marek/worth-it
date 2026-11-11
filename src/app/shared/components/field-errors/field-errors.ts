import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FieldTree } from '@angular/forms/signals';

/**
 * Renders validation messages for a Signal Forms field, only after the field was touched.
 * Usage: <app-field-errors [field]="myForm.name" />
 */
@Component({
  selector: 'app-field-errors',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      @for (error of field()().errors(); track $index) {
        <span class="field-error">{{ error.message ?? fallback(error.kind) }}</span>
      }
    }
  `,
  styles: `
    :host { display: block; min-height: 1.1rem; }
    .field-error { display: block; font: var(--mat-sys-body-small); color: var(--mat-sys-error); }
  `,
})
export class FieldErrors {
  readonly field = input.required<FieldTree<unknown>>();

  protected readonly visible = computed(() => {
    const state = this.field()();
    return state.touched() && state.invalid();
  });

  protected fallback(kind: string): string {
    switch (kind) {
      case 'required':
        return 'This field is required';
      case 'min':
        return 'Value is too small';
      case 'max':
        return 'Value is too large';
      case 'minLength':
        return 'Too short';
      default:
        return 'Invalid value';
    }
  }
}
