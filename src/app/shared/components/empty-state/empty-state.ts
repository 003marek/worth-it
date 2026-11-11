import { Component, input, ChangeDetectionStrategy, computed } from '@angular/core';
import { MatIcon } from '@angular/material/icon';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [MatIcon],
  template: `
    <div class="empty-state-container">
      <mat-icon class="empty-icon" aria-hidden="true">{{ icon() }}</mat-icon>
      <h3 class="empty-title">{{ title() }}</h3>
      @if (displayMessage()) {
        <p class="empty-message">{{ displayMessage() }}</p>
      }
      <div class="empty-actions">
        <ng-content></ng-content>
      </div>
    </div>
  `,
  styles: [
    `
      .empty-state-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 3rem 1rem;
        text-align: center;
        color: var(--mat-sys-on-surface-variant);
      }
      .empty-icon {
        font-size: 3.5rem;
        width: 3.5rem;
        height: 3.5rem;
        margin-bottom: 1rem;
        opacity: 0.6;
        color: var(--mat-sys-primary);
      }
      .empty-title {
        margin: 0 0 0.5rem;
        font-size: 1.25rem;
        font-weight: 500;
        color: var(--mat-sys-on-surface);
      }
      .empty-message {
        margin: 0 0 1.25rem;
        font-size: 0.9375rem;
        max-width: 380px;
        line-height: 1.5;
      }
      .empty-actions {
        display: flex;
        gap: 0.5rem;
        align-items: center;
        justify-content: center;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmptyState {
  readonly icon = input.required<string>();
  readonly title = input.required<string>();
  readonly message = input<string>();
  readonly description = input<string>();

  protected readonly displayMessage = computed(() => this.message() ?? this.description());
}

export { EmptyState as EmptyStateComponent };
