import { Injectable, inject, effect, signal, computed } from '@angular/core';
import { AppTheme } from '../models/worth-it.model';
import { WorthItStore } from '../stores/worth-it.store';

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  private readonly store = inject(WorthItStore);

  private readonly systemDark = signal<boolean>(
    typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  readonly currentTheme = computed<AppTheme>(() => this.store.settings().theme);
  readonly theme = this.currentTheme;

  readonly isDark = computed<boolean>(() => {
    const mode = this.currentTheme();
    if (mode === 'dark') return true;
    if (mode === 'light') return false;
    return this.systemDark();
  });

  constructor() {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      mediaQuery.addEventListener('change', (e) => {
        this.systemDark.set(e.matches);
      });
    }

    effect(() => {
      const dark = this.isDark();
      if (typeof document !== 'undefined' && document.body) {
        if (dark) {
          document.body.classList.add('dark-theme');
        } else {
          document.body.classList.remove('dark-theme');
        }
      }
    });
  }

  async setTheme(theme: AppTheme): Promise<void> {
    await this.store.updateSettings({ theme });
  }
}
