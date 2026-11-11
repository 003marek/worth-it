import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { form, FormField, FormRoot, max, min, required } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
  AppTheme,
  DashboardLayout,
  FinancialCushionSettings,
} from '../../core/models/worth-it.model';
import { StorageService } from '../../core/services/storage.service';
import { ThemeService } from '../../core/services/theme.service';
import { WorthItStore } from '../../core/stores/worth-it.store';
import { ConfirmDialog } from '../../shared/components/confirm-dialog/confirm-dialog';
import { FieldErrors } from '../../shared/components/field-errors/field-errors';
import { MoneyPipe } from '../../shared/pipes/money.pipe';

export interface CushionFormModel {
  isEnabled: boolean;
  averageMonthlyExpenses: number;
  coverageMonths: number;
}

export interface PreferencesFormModel {
  baseCurrency: string;
  defaultDashboard: DashboardLayout;
  theme: AppTheme;
}

@Component({
  selector: 'app-settings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatProgressBarModule,
    MatDividerModule,
    RouterLink,
    FormRoot,
    FormField,
    FieldErrors,
    MoneyPipe,
  ],
  template: `
    <div class="page settings-page">
      <header class="page-header">
        <h1 class="page-title">Settings & Data Management</h1>
        <p class="page-subtitle">
          Configure financial cushion reserves, preferences, and local data backups.
        </p>
      </header>

      <!-- 1. Financial Cushion Configuration Card (spec §4.1–4.3, §12) -->
      <mat-card class="settings-card">
        <mat-card-header>
          <mat-icon mat-card-avatar class="card-avatar-icon">shield</mat-icon>
          <mat-card-title>Financial Cushion Configuration</mat-card-title>
          <mat-card-subtitle>Protected liquidity reserve before goals funding</mat-card-subtitle>
        </mat-card-header>

        <mat-card-content class="card-content">
          <form [formRoot]="cushionForm" class="settings-form">
            <div class="toggle-row">
              <mat-slide-toggle [formField]="cushionForm.isEnabled">
                Enable Financial Cushion protected reserve
              </mat-slide-toggle>
              <span class="field-hint">
                Disabling stops reserving money for the cushion without deleting your configuration or history.
              </span>
            </div>

            <div class="form-row">
              <div class="form-field-group">
                <mat-form-field appearance="outline" class="full-width">
                  <mat-label>Average Monthly Expenses</mat-label>
                  <input
                    matInput
                    type="number"
                    step="100"
                    [formField]="cushionForm.averageMonthlyExpenses"
                  />
                  <span matTextSuffix>PLN</span>
                </mat-form-field>
                <app-field-errors [field]="cushionForm.averageMonthlyExpenses" />

                <button
                  type="button"
                  mat-stroked-button
                  class="quick-copy-btn"
                  (click)="useExpensesFromCategories()"
                >
                  <mat-icon>calculate</mat-icon>
                  Use sum of enabled expense categories ({{ store.monthlySurplusSummary().monthlyExpenses | money }})
                </button>
              </div>

              <div class="form-field-group">
                <mat-form-field appearance="outline" class="full-width">
                  <mat-label>Coverage Months</mat-label>
                  <input
                    matInput
                    type="number"
                    step="1"
                    [formField]="cushionForm.coverageMonths"
                  />
                  <span matTextSuffix>months</span>
                  <mat-hint>Recommended: 3 to 12 months (max 60)</mat-hint>
                </mat-form-field>
                <app-field-errors [field]="cushionForm.coverageMonths" />
              </div>
            </div>

            <!-- Live formula display (spec §4.2) -->
            <div class="cushion-formula-box" role="region" aria-label="Cushion formula">
              <div class="formula-label">Financial Cushion Target Formula:</div>
              <div class="formula-math">
                <code>Financial Cushion Target = Average Monthly Expenses × Number of Months</code>
              </div>
              <div class="formula-result">
                {{ cushionModel().averageMonthlyExpenses | money }} × {{ cushionModel().coverageMonths }} months =
                <strong class="target-highlight">{{ liveCushionTarget() | money }}</strong>
              </div>
            </div>

            <!-- Current funding status bar -->
            <div class="cushion-status-box">
              <div class="status-header">
                <span class="status-label">Current Cushion Status</span>
                <span class="status-percent">{{ cushionStatus().percent }}%</span>
              </div>
              <mat-progress-bar
                mode="determinate"
                [value]="cushionStatus().percent"
                class="status-bar"
              ></mat-progress-bar>
              <div class="status-metrics">
                <span>Funded: <strong>{{ cushionStatus().funded | money }}</strong></span>
                <span>Target: <strong>{{ cushionStatus().target | money }}</strong></span>
                @if (cushionStatus().deficit > 0) {
                  <span class="deficit-text">
                    Deficit: <strong>{{ cushionStatus().deficit | money }}</strong>
                  </span>
                } @else {
                  <span class="funded-text">Fully Funded ✓</span>
                }
              </div>

              <div class="priority-rule-callout">
                <mat-icon class="rule-icon">gavel</mat-icon>
                <span>
                  <strong>Priority Rule:</strong> The cushion must be 100% funded before any goal-eligible wealth can be allocated to goals.
                </span>
              </div>
            </div>

            <div class="actions-row">
              <button
                mat-flat-button
                color="primary"
                type="submit"
                [disabled]="cushionForm().submitting()"
              >
                Save Cushion Settings
              </button>
            </div>
          </form>
        </mat-card-content>
      </mat-card>

      <!-- 2. Application Preferences Card (spec §12) -->
      <mat-card class="settings-card">
        <mat-card-header>
          <mat-icon mat-card-avatar class="card-avatar-icon">tune</mat-icon>
          <mat-card-title>Application Preferences</mat-card-title>
          <mat-card-subtitle>Display defaults and visual styling</mat-card-subtitle>
        </mat-card-header>

        <mat-card-content class="card-content">
          <form [formRoot]="prefsForm" class="settings-form">
            <div class="form-row">
              <div class="form-field-group">
                <mat-form-field appearance="outline" class="full-width">
                  <mat-label>Base Currency</mat-label>
                  <mat-select [formField]="prefsForm.baseCurrency">
                    <mat-option value="PLN">PLN (Polish Złoty)</mat-option>
                    <mat-option value="EUR">EUR (Euro)</mat-option>
                    <mat-option value="USD">USD (US Dollar)</mat-option>
                    <mat-option value="GBP">GBP (British Pound)</mat-option>
                    <mat-option value="CHF">CHF (Swiss Franc)</mat-option>
                  </mat-select>
                </mat-form-field>
                <app-field-errors [field]="prefsForm.baseCurrency" />
              </div>

              <div class="form-field-group">
                <mat-form-field appearance="outline" class="full-width">
                  <mat-label>Default Dashboard</mat-label>
                  <mat-select [formField]="prefsForm.defaultDashboard">
                    <mat-option value="goal_first">Goal-first dashboard</mat-option>
                    <mat-option value="financial_overview">Financial overview dashboard</mat-option>
                  </mat-select>
                </mat-form-field>
                <app-field-errors [field]="prefsForm.defaultDashboard" />
              </div>

              <div class="form-field-group">
                <mat-form-field appearance="outline" class="full-width">
                  <mat-label>App Theme</mat-label>
                  <mat-select [formField]="prefsForm.theme">
                    <mat-option value="system">System Default</mat-option>
                    <mat-option value="light">Light Mode</mat-option>
                    <mat-option value="dark">Dark Mode</mat-option>
                  </mat-select>
                </mat-form-field>
                <app-field-errors [field]="prefsForm.theme" />
              </div>
            </div>

            <div class="actions-row">
              <button
                mat-flat-button
                color="primary"
                type="submit"
                [disabled]="prefsForm().submitting()"
              >
                Save Preferences
              </button>
            </div>
          </form>
        </mat-card-content>
      </mat-card>

      <!-- 3. Quick Management Links (spec §12) -->
      <section class="quick-management-section">
        <h2 class="section-title">Quick Management</h2>
        <div class="quick-grid">
          <!-- Assets -->
          <mat-card class="quick-card">
            <mat-card-header>
              <mat-icon mat-card-avatar class="quick-icon">account_balance</mat-icon>
              <mat-card-title>Assets</mat-card-title>
              <mat-card-subtitle>{{ store.assets().length }} asset(s) recorded</mat-card-subtitle>
            </mat-card-header>
            <mat-card-actions align="end">
              <a mat-button color="primary" routerLink="/assets">
                Manage Assets <mat-icon>arrow_forward</mat-icon>
              </a>
            </mat-card-actions>
          </mat-card>

          <!-- Goals -->
          <mat-card class="quick-card">
            <mat-card-header>
              <mat-icon mat-card-avatar class="quick-icon">flag</mat-icon>
              <mat-card-title>Goals</mat-card-title>
              <mat-card-subtitle>
                {{ store.goals().length }} goal(s) ({{ store.completedGoals().length }} completed)
              </mat-card-subtitle>
            </mat-card-header>
            <mat-card-actions align="end">
              <a mat-button color="primary" routerLink="/goals">
                Manage Goals <mat-icon>arrow_forward</mat-icon>
              </a>
            </mat-card-actions>
          </mat-card>

          <!-- Cash Flow -->
          <mat-card class="quick-card">
            <mat-card-header>
              <mat-icon mat-card-avatar class="quick-icon">swap_horiz</mat-icon>
              <mat-card-title>Cash Flow</mat-card-title>
              <mat-card-subtitle>
                {{ store.incomeSources().length }} income, {{ store.expenseCategories().length }} expense categories
              </mat-card-subtitle>
            </mat-card-header>
            <mat-card-actions align="end">
              <a mat-button color="primary" routerLink="/cashflow">
                Manage Cash Flow <mat-icon>arrow_forward</mat-icon>
              </a>
            </mat-card-actions>
          </mat-card>

          <!-- Stock Sales -->
          <mat-card class="quick-card">
            <mat-card-header>
              <mat-icon mat-card-avatar class="quick-icon">show_chart</mat-icon>
              <mat-card-title>Stock Sales</mat-card-title>
              <mat-card-subtitle>{{ store.stockSales().length }} sale(s) logged</mat-card-subtitle>
            </mat-card-header>
            <mat-card-actions align="end">
              <a mat-button color="primary" routerLink="/stock-sales">
                Manage Stock Sales <mat-icon>arrow_forward</mat-icon>
              </a>
            </mat-card-actions>
          </mat-card>
        </div>
      </section>

      <!-- 4. Backup & Restore (JSON Export / Import — spec §14.5, §16.14) -->
      <mat-card class="settings-card">
        <mat-card-header>
          <mat-icon mat-card-avatar class="card-avatar-icon">backup</mat-icon>
          <mat-card-title>Backup & Restore</mat-card-title>
          <mat-card-subtitle>Export, restore, or reset your local financial data</mat-card-subtitle>
        </mat-card-header>

        <mat-card-content class="card-content">
          <p class="backup-description">
            Your data is stored locally in your browser. Regularly export a JSON backup file to prevent data loss.
          </p>

          <div class="backup-actions-grid">
            <!-- Export -->
            <div class="backup-action-box">
              <div class="action-header">
                <mat-icon class="action-icon">file_download</mat-icon>
                <strong>Export Backup</strong>
              </div>
              <p class="action-text">Download a complete JSON snapshot of all goals, assets, transactions, and settings.</p>
              <button mat-flat-button color="primary" (click)="exportBackup()">
                <mat-icon>download</mat-icon> Export backup to JSON
              </button>
            </div>

            <!-- Import -->
            <div class="backup-action-box">
              <div class="action-header">
                <mat-icon class="action-icon">file_upload</mat-icon>
                <strong>Restore from Backup</strong>
              </div>
              <p class="action-text">Restore all data from a previously exported Worth It JSON backup file.</p>
              <input
                type="file"
                #fileInput
                accept=".json"
                style="display: none"
                (change)="onFileSelected($event)"
              />
              <button mat-stroked-button color="primary" (click)="fileInput.click()">
                <mat-icon>upload</mat-icon> Restore from JSON backup
              </button>
            </div>

            <!-- Demo Data -->
            <div class="backup-action-box">
              <div class="action-header">
                <mat-icon class="action-icon">dataset</mat-icon>
                <strong>Demo Data</strong>
              </div>
              <p class="action-text">Populate the app with realistic sample goals, assets, and monthly cash flow.</p>
              <button mat-stroked-button (click)="loadDemoData()">
                <mat-icon>play_circle</mat-icon> Load Demo Data
              </button>
            </div>

            <!-- Clear Data -->
            <div class="backup-action-box destructive-box">
              <div class="action-header">
                <mat-icon class="action-icon error-icon">delete_forever</mat-icon>
                <strong>Reset Application</strong>
              </div>
              <p class="action-text">Permanently delete all goals, assets, and settings from this browser.</p>
              <button mat-flat-button color="warn" class="clear-data-btn" (click)="clearAllData()">
                <mat-icon>delete</mat-icon> Clear All Local Data
              </button>
            </div>
          </div>
        </mat-card-content>
      </mat-card>

      <!-- 5. Security & Privacy Notice Card (spec §14.6) -->
      <mat-card class="security-card" role="region" aria-label="Security and privacy notice">
        <mat-card-header>
          <mat-icon mat-card-avatar class="security-icon">lock</mat-icon>
          <mat-card-title>Security & Privacy Notice</mat-card-title>
          <mat-card-subtitle>Offline-first local storage architecture (spec §14.6)</mat-card-subtitle>
        </mat-card-header>

        <mat-card-content class="security-content">
          <p>
            <strong>Worth It is an offline-first local application.</strong>
            All financial records, balances, income sources, goals, and stock sales are stored solely inside
            your browser's local IndexedDB database.
          </p>
          <ul class="security-list">
            <li>
              <strong>No Cloud Backend:</strong> None of your financial records are transmitted to remote servers or third parties.
            </li>
            <li>
              <strong>Device-Level Security:</strong> The MVP does not encrypt data at rest with a custom password. Anyone with physical access to your unlocked computer/device and browser user profile can view the stored financial data. Please protect your device with full-disk encryption and a strong lock screen password or biometric lock.
            </li>
            <li>
              <strong>Backup Frequency:</strong> Regularly export JSON backups using the Backup & Restore section above. If browser data or profile cookies/storage are cleared, your local database will be erased.
            </li>
          </ul>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [
    `
      .settings-page {
        display: flex;
        flex-direction: column;
        gap: 24px;
      }
      .page-header {
        margin-bottom: 4px;
      }
      .page-title {
        margin: 0;
        font-size: 1.75rem;
        font-weight: 600;
        color: var(--mat-sys-on-surface);
      }
      .page-subtitle {
        margin: 4px 0 0;
        font-size: 0.9375rem;
        color: var(--mat-sys-on-surface-variant);
      }
      .settings-card {
        border-radius: 12px;
      }
      .card-avatar-icon {
        color: var(--mat-sys-primary);
      }
      .card-content {
        padding-top: 16px;
      }
      .settings-form {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .toggle-row {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding-bottom: 8px;
      }
      .field-hint {
        font-size: 0.8125rem;
        color: var(--mat-sys-on-surface-variant);
        margin: 0;
      }
      .form-row {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 16px;
      }
      .form-field-group {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .full-width {
        width: 100%;
      }
      .quick-copy-btn {
        align-self: flex-start;
        margin-top: 2px;
        font-size: 0.8125rem;
      }
      .cushion-formula-box {
        background-color: var(--mat-sys-surface-container);
        border-radius: 8px;
        padding: 14px 16px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .formula-label {
        font-size: 0.8125rem;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--mat-sys-on-surface-variant);
      }
      .formula-math code {
        font-family: monospace;
        font-size: 0.9375rem;
        color: var(--mat-sys-primary);
      }
      .formula-result {
        font-size: 0.9375rem;
        color: var(--mat-sys-on-surface);
      }
      .target-highlight {
        font-size: 1.125rem;
        color: var(--worth-it-positive, #1b6b3a);
      }
      .cushion-status-box {
        background-color: var(--mat-sys-surface-container-low);
        border: 1px solid var(--mat-sys-outline-variant);
        border-radius: 8px;
        padding: 14px 16px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .status-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .status-label {
        font-weight: 500;
        font-size: 0.875rem;
        color: var(--mat-sys-on-surface);
      }
      .status-percent {
        font-weight: 600;
        color: var(--mat-sys-primary);
      }
      .status-bar {
        border-radius: 4px;
        height: 8px;
      }
      .status-metrics {
        display: flex;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 8px;
        font-size: 0.875rem;
        color: var(--mat-sys-on-surface-variant);
      }
      .deficit-text {
        color: var(--mat-sys-error);
      }
      .funded-text {
        color: var(--worth-it-positive, #1b6b3a);
        font-weight: 600;
      }
      .priority-rule-callout {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 4px;
        font-size: 0.8125rem;
        color: var(--mat-sys-on-surface-variant);
        background-color: var(--mat-sys-surface-container);
        padding: 8px 12px;
        border-radius: 6px;
      }
      .rule-icon {
        font-size: 1.125rem;
        width: 1.125rem;
        height: 1.125rem;
        color: var(--mat-sys-primary);
        flex-shrink: 0;
      }
      .actions-row {
        display: flex;
        justify-content: flex-end;
        margin-top: 8px;
      }
      .quick-management-section {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .section-title {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 600;
        color: var(--mat-sys-on-surface);
      }
      .quick-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 16px;
      }
      .quick-card {
        border-radius: 12px;
      }
      .quick-icon {
        color: var(--mat-sys-primary);
      }
      .backup-description {
        margin: 0 0 16px;
        font-size: 0.9375rem;
        color: var(--mat-sys-on-surface-variant);
      }
      .backup-actions-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
        gap: 16px;
      }
      .backup-action-box {
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        background-color: var(--mat-sys-surface-container);
        border-radius: 8px;
        padding: 16px;
        gap: 12px;
      }
      .action-header {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 1rem;
        color: var(--mat-sys-on-surface);
      }
      .action-icon {
        color: var(--mat-sys-primary);
      }
      .action-text {
        margin: 0;
        font-size: 0.8125rem;
        color: var(--mat-sys-on-surface-variant);
        line-height: 1.4;
        flex-grow: 1;
      }
      .destructive-box {
        border-left: 3px solid var(--mat-sys-error);
      }
      .error-icon {
        color: var(--mat-sys-error);
      }
      .clear-data-btn {
        --mdc-filled-button-container-color: var(--mat-sys-error);
        --mdc-filled-button-label-text-color: var(--mat-sys-on-error);
      }
      .security-card {
        border-radius: 12px;
        background-color: var(--mat-sys-surface-container-low);
        border: 1px solid var(--mat-sys-outline-variant);
      }
      .security-icon {
        color: var(--mat-sys-primary);
      }
      .security-content {
        padding-top: 8px;
        font-size: 0.875rem;
        line-height: 1.5;
        color: var(--mat-sys-on-surface-variant);
      }
      .security-list {
        margin: 8px 0 0;
        padding-left: 20px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
    `,
  ],
})
export class Settings {
  protected readonly store = inject(WorthItStore);
  protected readonly storage = inject(StorageService);
  protected readonly themeService = inject(ThemeService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  readonly cushionStatus = this.store.financialCushionStatus;

  // --- Financial Cushion Form ---
  readonly cushionModel = signal<CushionFormModel>({
    isEnabled: this.store.settings().cushion.isEnabled,
    averageMonthlyExpenses: this.store.settings().cushion.averageMonthlyExpenses,
    coverageMonths: this.store.settings().cushion.coverageMonths,
  });

  readonly liveCushionTarget = computed<number>(() => {
    const m = this.cushionModel();
    const expenses = Number(m.averageMonthlyExpenses) || 0;
    const months = Number(m.coverageMonths) || 0;
    return Math.round(expenses * months * 100) / 100;
  });

  readonly cushionForm = form(
    this.cushionModel,
    (path) => {
      required(path.averageMonthlyExpenses, {
        message: 'Average monthly expenses is required',
      });
      min(path.averageMonthlyExpenses, 0, {
        message: 'Monthly expenses must be at least 0',
      });
      required(path.coverageMonths, {
        message: 'Coverage months is required',
      });
      min(path.coverageMonths, 1, {
        message: 'Must be at least 1 month',
      });
      max(path.coverageMonths, 60, {
        message: 'Coverage cannot exceed 60 months',
      });
    },
    {
      submission: {
        action: async () => {
          const m = this.cushionModel();
          await this.store.updateCushionSettings({
            isEnabled: Boolean(m.isEnabled),
            averageMonthlyExpenses: Number(m.averageMonthlyExpenses) || 0,
            coverageMonths: Number(m.coverageMonths) || 1,
          });
          this.snackBar.open('Financial cushion settings saved', 'OK', {
            duration: 3000,
          });
          return undefined;
        },
      },
    }
  );

  // --- Application Preferences Form ---
  readonly prefsModel = signal<PreferencesFormModel>({
    baseCurrency: this.store.settings().baseCurrency || 'PLN',
    defaultDashboard: this.store.settings().defaultDashboard || 'goal_first',
    theme: this.store.settings().theme || 'system',
  });

  readonly prefsForm = form(
    this.prefsModel,
    (path) => {
      required(path.baseCurrency, { message: 'Base currency is required' });
      required(path.defaultDashboard, {
        message: 'Default dashboard is required',
      });
      required(path.theme, { message: 'Theme is required' });
    },
    {
      submission: {
        action: async () => {
          const m = this.prefsModel();
          await this.themeService.setTheme(m.theme);
          await this.store.updateSettings({
            baseCurrency: m.baseCurrency,
            defaultDashboard: m.defaultDashboard,
            theme: m.theme,
          });
          this.snackBar.open('Preferences saved', 'OK', { duration: 3000 });
          return undefined;
        },
      },
    }
  );

  constructor() {
    // Keep form models in sync when store settings change externally (e.g. reload after import)
    effect(() => {
      const s = this.store.settings();
      untracked(() => {
        this.cushionModel.set({
          isEnabled: s.cushion.isEnabled,
          averageMonthlyExpenses: s.cushion.averageMonthlyExpenses,
          coverageMonths: s.cushion.coverageMonths,
        });
        this.prefsModel.set({
          baseCurrency: s.baseCurrency || 'PLN',
          defaultDashboard: s.defaultDashboard || 'goal_first',
          theme: s.theme || 'system',
        });
      });
    });
  }

  useExpensesFromCategories(): void {
    const expenses = this.store.monthlySurplusSummary().monthlyExpenses;
    this.cushionModel.update((m) => ({
      ...m,
      averageMonthlyExpenses: expenses,
    }));
  }

  // --- Backup & Restore ---
  async exportBackup(): Promise<void> {
    try {
      const jsonText = await this.storage.exportAllData();
      const blob = new Blob([jsonText], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const today = new Date().toISOString().split('T')[0];
      a.href = url;
      a.download = `worth-it-backup-${today}.json`;
      a.click();
      URL.revokeObjectURL(url);
      this.snackBar.open('Backup exported successfully', 'OK', { duration: 3000 });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.snackBar.open(`Export failed: ${message}`, 'OK', { duration: 5000 });
    }
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    input.value = '';

    const dialogRef = this.dialog.open(ConfirmDialog, {
      data: {
        title: 'Restore from JSON backup',
        message:
          'Restoring will replace all current goals, assets, records, and settings with the contents of the backup file. Are you sure you want to proceed?',
        confirmText: 'Restore Backup',
        cancelText: 'Cancel',
        destructive: true,
      },
    });

    const confirmed = await firstValueFrom(dialogRef.afterClosed());
    if (!confirmed) return;

    try {
      const jsonText = await file.text();
      await this.storage.importAllData(jsonText);
      await this.store.reload();
      this.snackBar.open('Data restored successfully from backup', 'OK', {
        duration: 3000,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.snackBar.open(`Restore failed: ${message}`, 'OK', { duration: 5000 });
    }
  }

  async loadDemoData(): Promise<void> {
    const dialogRef = this.dialog.open(ConfirmDialog, {
      data: {
        title: 'Load Demo Data',
        message:
          'This will replace your current data with sample demo data. Are you sure you want to proceed?',
        confirmText: 'Load Demo Data',
        cancelText: 'Cancel',
        destructive: true,
      },
    });

    const confirmed = await firstValueFrom(dialogRef.afterClosed());
    if (!confirmed) return;

    try {
      await this.storage.seedDemoData(true);
      await this.store.reload();
      this.snackBar.open('Demo data loaded successfully', 'OK', { duration: 3000 });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.snackBar.open(`Failed to load demo data: ${message}`, 'OK', {
        duration: 5000,
      });
    }
  }

  async clearAllData(): Promise<void> {
    const dialogRef = this.dialog.open(ConfirmDialog, {
      data: {
        title: 'Clear All Local Data',
        message:
          'This will permanently delete all goals, assets, transactions, stock sales, and settings stored on this device. This action cannot be undone.',
        confirmText: 'Clear Everything',
        cancelText: 'Cancel',
        destructive: true,
      },
    });

    const confirmed = await firstValueFrom(dialogRef.afterClosed());
    if (!confirmed) return;

    try {
      await this.storage.clearAllData();
      await this.store.reload();
      this.snackBar.open('All local data cleared', 'OK', { duration: 3000 });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.snackBar.open(`Failed to clear data: ${message}`, 'OK', {
        duration: 5000,
      });
    }
  }
}
