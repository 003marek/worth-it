import {
  ChangeDetectionStrategy,
  Component,
  inject,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { map } from 'rxjs/operators';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { WorthItStore } from './core/stores/worth-it.store';
import { ThemeService } from './core/services/theme.service';
import { PageTitleStrategy } from './core/strategies/page-title.strategy';
import { MoneyPipe } from './shared/pipes/money.pipe';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatToolbarModule,
    MatButtonModule,
    MatChipsModule,
    MatIconModule,
    MatSidenavModule,
    MatListModule,
    MoneyPipe,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly breakpointObserver = inject(BreakpointObserver);
  protected readonly store = inject(WorthItStore);
  // Instantiate root ThemeService on app boot so persisted theme class applies immediately
  protected readonly themeService = inject(ThemeService);
  private readonly pageTitleService = inject(PageTitleStrategy);

  protected readonly pageTitle = this.pageTitleService.title;

  protected readonly isHandset = toSignal(
    this.breakpointObserver.observe(Breakpoints.Handset).pipe(
      map((result) => result.matches)
    ),
    { initialValue: false }
  );

  protected readonly navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { path: '/goals', label: 'Goals', icon: 'flag' },
    { path: '/assets', label: 'Assets', icon: 'account_balance_wallet' },
    { path: '/cashflow', label: 'Cash flow', icon: 'swap_vert' },
    { path: '/projections', label: 'Projections', icon: 'insights' },
    { path: '/stock-sales', label: 'Stock sales', icon: 'show_chart' },
    { path: '/settings', label: 'Settings', icon: 'settings' },
  ];
}

export { App as AppComponent };
