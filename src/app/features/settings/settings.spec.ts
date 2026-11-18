import 'fake-indexeddb/auto';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { submit } from '@angular/forms/signals';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FinancialCalculatorService } from '../../core/services/financial-calculator.service';
import { StorageService } from '../../core/services/storage.service';
import { ThemeService } from '../../core/services/theme.service';
import { WorthItStore } from '../../core/stores/worth-it.store';
import { MarketDataError } from '../../core/services/market-data/market-data.error';
import { Settings } from './settings';

describe('Settings', () => {
  let fixture: ComponentFixture<Settings>;
  let component: Settings;
  let store: InstanceType<typeof WorthItStore>;
  let storage: StorageService;
  let themeService: ThemeService;
  let mockDialog: { open: ReturnType<typeof vi.fn> };
  let mockSnackBar: { open: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockDialog = {
      open: vi.fn(),
    };
    mockSnackBar = {
      open: vi.fn(),
    };

    TestBed.configureTestingModule({
      imports: [Settings],
      providers: [
        StorageService,
        FinancialCalculatorService,
        WorthItStore,
        ThemeService,
        provideRouter([]),
        { provide: MatDialog, useValue: mockDialog },
        { provide: MatSnackBar, useValue: mockSnackBar },
      ],
    });

    storage = TestBed.inject(StorageService);
    await storage.open();
    await storage.clearAllData();

    store = TestBed.inject(WorthItStore);
    await store.loadAll();

    themeService = TestBed.inject(ThemeService);

    fixture = TestBed.createComponent(Settings);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('creates the component and initializes forms from store', () => {
    expect(component).toBeTruthy();
    expect(component.cushionModel().isEnabled).toBe(true);
    expect(component.cushionModel().averageMonthlyExpenses).toBe(6000);
    expect(component.cushionModel().coverageMonths).toBe(6);
    expect(component.prefsModel().baseCurrency).toBe('PLN');
  });

  describe('Financial Cushion Configuration', () => {
    it('live-computes cushion target formula', () => {
      expect(component.liveCushionTarget()).toBe(36000);

      component.cushionModel.set({
        isEnabled: true,
        averageMonthlyExpenses: 5000,
        coverageMonths: 3,
      });

      expect(component.liveCushionTarget()).toBe(15000);

      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.formula-math')?.textContent).toContain(
        'Financial Cushion Target = Average Monthly Expenses × Number of Months'
      );
    });

    it('copies monthly expenses from expense categories via quick button', async () => {
      await store.addExpenseCategory({
        name: 'Rent',
        expectedMonthlyAmount: 3200,
      });
      await store.addExpenseCategory({
        name: 'Food',
        expectedMonthlyAmount: 1800,
      });

      component.useExpensesFromCategories();

      expect(component.cushionModel().averageMonthlyExpenses).toBe(5000);
    });

    it('saves updated cushion settings to store and shows notification', async () => {
      component.cushionModel.set({
        isEnabled: false,
        averageMonthlyExpenses: 7500,
        coverageMonths: 12,
      });

      // Submit cushion form action
      await submit(component.cushionForm);

      expect(store.settings().cushion.isEnabled).toBe(false);
      expect(store.settings().cushion.averageMonthlyExpenses).toBe(7500);
      expect(store.settings().cushion.coverageMonths).toBe(12);
      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Financial cushion settings saved',
        'OK',
        expect.any(Object)
      );
    });

    it('displays priority rule explanation', () => {
      const el = fixture.nativeElement as HTMLElement;
      const ruleText = el.querySelector('.priority-rule-callout')?.textContent;
      expect(ruleText).toContain('Priority Rule:');
      expect(ruleText).toContain('The cushion must be 100% funded before any goal-eligible wealth can be allocated to goals');
    });
  });

  describe('Application Preferences', () => {
    it('does not render Default Dashboard selector and keeps goal_first as store default', () => {
      const el = fixture.nativeElement as HTMLElement;
      expect(el.textContent).not.toContain('Default Dashboard');
      expect(store.settings().defaultDashboard).toBe('goal_first');
    });

    it('saves preferences and updates theme', async () => {
      const themeSpy = vi.spyOn(themeService, 'setTheme');

      component.prefsModel.set({
        baseCurrency: 'EUR',
        theme: 'dark',
      });

      await submit(component.prefsForm);

      expect(themeSpy).toHaveBeenCalledWith('dark');
      expect(store.settings().baseCurrency).toBe('EUR');
      expect(store.settings().defaultDashboard).toBe('goal_first');
      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Preferences saved',
        'OK',
        expect.any(Object)
      );
    });
  });

  describe('Twelve Data API Key Configuration', () => {
    it('renders the API key section with visibility toggle and IndexedDB privacy notice', () => {
      const el = fixture.nativeElement as HTMLElement;
      const card = el.querySelector('.api-key-card');
      expect(card).toBeTruthy();
      expect(card?.textContent).toContain('Twelve Data API Key');
      expect(card?.textContent).toContain('Live market prices for employer stock tickers');

      const privacy = card?.querySelector('.api-key-privacy-notice');
      expect(privacy).toBeTruthy();
      expect(privacy?.textContent).toContain('Your API key is stored locally in IndexedDB');
      expect(privacy?.textContent).toContain('never uploaded to any external server other than twelvedata.com');

      // Toggles visibility
      expect(component.hideApiKey()).toBe(true);
      component.hideApiKey.set(false);
      expect(component.hideApiKey()).toBe(false);
    });

    it('saves Twelve Data API key to store and displays confirmation snackbar', async () => {
      component.apiKeyModel.set({
        twelveDataApiKey: 'test-api-key-12345',
      });

      await submit(component.apiKeyForm);

      expect(store.settings().twelveDataApiKey).toBe('test-api-key-12345');
      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Twelve Data API key saved',
        'OK',
        expect.any(Object)
      );
    });

    it('tests key with store.lookupTicker and shows valid status chip on success', async () => {
      component.apiKeyModel.set({ twelveDataApiKey: 'valid-api-key' });
      vi.spyOn(store, 'lookupTicker').mockResolvedValue({
        symbol: 'AAPL',
        price: 220,
        currency: 'USD',
        name: 'Apple Inc.',
        exchange: 'NASDAQ',
        fetchedAt: new Date().toISOString(),
      });

      await component.testApiKey();

      expect(store.lookupTicker).toHaveBeenCalledWith('AAPL');
      expect(component.apiKeyTestState().status).toBe('valid');
      expect(component.apiKeyTestState().message).toContain('Valid key (AAPL quote received)');

      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      const chip = el.querySelector('.valid-chip');
      expect(chip).toBeTruthy();
      expect(chip?.textContent).toContain('Valid key');
    });

    it('shows invalid status chip when API key fails authentication', async () => {
      component.apiKeyModel.set({ twelveDataApiKey: 'bad-key' });
      vi.spyOn(store, 'lookupTicker').mockRejectedValue(
        new MarketDataError('auth', 'Invalid API key.')
      );

      await component.testApiKey();

      expect(component.apiKeyTestState().status).toBe('invalid');
      expect(component.apiKeyTestState().message).toContain('Invalid API key. Check key and retry.');

      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      const chip = el.querySelector('.invalid-chip');
      expect(chip).toBeTruthy();
      expect(chip?.textContent).toContain('Invalid API key');
    });

    it('shows offline status chip when network error occurs', async () => {
      component.apiKeyModel.set({ twelveDataApiKey: 'any-key' });
      vi.spyOn(store, 'lookupTicker').mockRejectedValue(
        new MarketDataError('network', 'Network offline.')
      );

      await component.testApiKey();

      expect(component.apiKeyTestState().status).toBe('offline');
      expect(component.apiKeyTestState().message).toContain('Network offline. Connect and retry.');

      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      const chip = el.querySelector('.invalid-chip');
      expect(chip).toBeTruthy();
      expect(chip?.textContent).toContain('Network offline');
    });
  });

  describe('Google Drive Sync', () => {
    it('renders the Google Drive Sync card with default folder WorthIt Backups', () => {
      const el = fixture.nativeElement as HTMLElement;
      const card = el.querySelector('.google-drive-card');
      expect(card).toBeTruthy();
      expect(card?.textContent).toContain('Google Drive Sync');
      expect(component.driveModel().googleDriveBackupFolder).toBe('WorthIt Backups');
      expect(component.hideClientId()).toBe(true);
    });

    it('saves Google Drive settings via form submission', async () => {
      component.driveModel.set({
        googleClientId: 'my-oauth-client-id',
        googleDriveBackupFolder: 'WorthIt Cloud',
      });

      await submit(component.driveForm);

      expect(store.settings().googleClientId).toBe('my-oauth-client-id');
      expect(store.settings().googleDriveBackupFolder).toBe('WorthIt Cloud');
      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Google Drive settings saved',
        'OK',
        expect.any(Object)
      );
    });

    it('warns when trying to export or import without a Google Client ID', async () => {
      component.driveModel.set({
        googleClientId: '',
        googleDriveBackupFolder: 'WorthIt Backups',
      });

      await component.exportToDrive();
      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Please configure Google Client ID first',
        'OK',
        expect.any(Object)
      );

      mockSnackBar.open.mockClear();
      await component.importFromDrive();
      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Please configure Google Client ID first',
        'OK',
        expect.any(Object)
      );
    });

    it('exports to Google Drive and shows success snackbar', async () => {
      const exportSpy = vi.spyOn(store, 'exportToDrive').mockResolvedValue(undefined);
      component.driveModel.set({
        googleClientId: 'valid-client-id',
        googleDriveBackupFolder: 'WorthIt Backups',
      });

      await component.exportToDrive();

      expect(exportSpy).toHaveBeenCalled();
      expect(store.settings().googleClientId).toBe('valid-client-id');
      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Successfully exported to Google Drive!',
        'OK',
        expect.any(Object)
      );
    });

    it('imports from Google Drive after confirmation and shows success snackbar', async () => {
      mockDialog.open.mockReturnValue({
        afterClosed: () => of(true),
      });
      const importSpy = vi.spyOn(store, 'importFromDrive').mockResolvedValue(undefined);

      component.driveModel.set({
        googleClientId: 'valid-client-id',
        googleDriveBackupFolder: 'WorthIt Backups',
      });

      await component.importFromDrive();

      expect(mockDialog.open).toHaveBeenCalled();
      expect(importSpy).toHaveBeenCalled();
      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Successfully imported from Google Drive!',
        'OK',
        expect.any(Object)
      );
    });
  });

  describe('Quick Management Links', () => {
    it('displays counts and router links for assets, goals, cashflow, and stock sales', async () => {
      await store.addAsset({ name: 'Checking', type: 'bank_account', balance: 10000 });
      await store.addGoal({ name: 'Car', targetAmount: 50000 });
      await store.addStockSale({
        companyOrTicker: 'AAPL',
        saleDate: '2026-03-01',
        sharesSold: 10,
        pricePerShare: 150,
      });

      fixture.detectChanges();
      await fixture.whenStable();

      const el = fixture.nativeElement as HTMLElement;
      const text = el.textContent ?? '';

      expect(text).toContain('Assets');
      expect(text).toContain('1 asset(s) recorded');
      expect(text).toContain('Goals');
      expect(text).toContain('1 goal(s)');
      expect(text).toContain('Stock Sales');
      expect(text).toContain('1 sale(s) logged');
    });
  });

  describe('Backup & Restore', () => {
    it('exports all data to JSON and triggers download', async () => {
      const exportSpy = vi.spyOn(storage, 'exportAllData').mockResolvedValue('{"version":1}');
      const clickSpy = vi.fn();
      const origCreateElement = document.createElement.bind(document);

      const createSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        if (tagName === 'a') {
          return {
            href: '',
            download: '',
            click: clickSpy,
          } as unknown as HTMLElement;
        }
        return origCreateElement(tagName);
      });

      const origCreateObjectURL = globalThis.URL.createObjectURL;
      const origRevokeObjectURL = globalThis.URL.revokeObjectURL;
      globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:test');
      globalThis.URL.revokeObjectURL = vi.fn();

      await component.exportBackup();

      expect(exportSpy).toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalled();
      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Backup exported successfully',
        'OK',
        expect.any(Object)
      );

      createSpy.mockRestore();
      globalThis.URL.createObjectURL = origCreateObjectURL;
      globalThis.URL.revokeObjectURL = origRevokeObjectURL;
    });

    it('restores data from file after user confirmation', async () => {
      mockDialog.open.mockReturnValue({
        afterClosed: () => of(true),
      });

      const importSpy = vi.spyOn(storage, 'importAllData').mockResolvedValue(undefined);
      const reloadSpy = vi.spyOn(store, 'reload').mockResolvedValue(undefined);

      const fakeFile = new File(['{"version":1,"data":{}}'], 'backup.json', {
        type: 'application/json',
      });

      const event = {
        target: {
          files: [fakeFile],
          value: 'backup.json',
        },
      } as unknown as Event;

      await component.onFileSelected(event);

      expect(mockDialog.open).toHaveBeenCalled();
      expect(importSpy).toHaveBeenCalledWith('{"version":1,"data":{}}');
      expect(reloadSpy).toHaveBeenCalled();
      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Data restored successfully from backup',
        'OK',
        expect.any(Object)
      );
    });

    it('loads demo data when confirmed', async () => {
      mockDialog.open.mockReturnValue({
        afterClosed: () => of(true),
      });

      const seedSpy = vi.spyOn(storage, 'seedDemoData').mockResolvedValue(undefined);
      const reloadSpy = vi.spyOn(store, 'reload').mockResolvedValue(undefined);

      await component.loadDemoData();

      expect(mockDialog.open).toHaveBeenCalled();
      expect(seedSpy).toHaveBeenCalledWith(true);
      expect(reloadSpy).toHaveBeenCalled();
      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Demo data loaded successfully',
        'OK',
        expect.any(Object)
      );
    });

    it('clears all data when confirmed', async () => {
      mockDialog.open.mockReturnValue({
        afterClosed: () => of(true),
      });

      const clearSpy = vi.spyOn(storage, 'clearAllData').mockResolvedValue(undefined);
      const reloadSpy = vi.spyOn(store, 'reload').mockResolvedValue(undefined);

      await component.clearAllData();

      expect(mockDialog.open).toHaveBeenCalled();
      expect(clearSpy).toHaveBeenCalled();
      expect(reloadSpy).toHaveBeenCalled();
      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'All local data cleared',
        'OK',
        expect.any(Object)
      );
    });
  });

  describe('Security & Privacy Notice', () => {
    it('renders the security notice explaining offline-first storage and unencrypted local data', () => {
      const el = fixture.nativeElement as HTMLElement;
      const securityCard = el.querySelector('.security-card');
      expect(securityCard).toBeTruthy();
      expect(securityCard?.textContent).toContain('Security & Privacy Notice');
      expect(securityCard?.textContent).toContain('offline-first local application');
      expect(securityCard?.textContent).toContain('No Cloud Backend');
      expect(securityCard?.textContent).toContain('Device-Level Security');
      expect(securityCard?.textContent).toContain('Backup Frequency');
    });
  });

  describe('App Version & Secret Admin Mode', () => {
    it('renders the app version at the bottom of the page', () => {
      const el = fixture.nativeElement as HTMLElement;
      const versionEl = el.querySelector('.version-info');
      expect(versionEl).toBeTruthy();
      expect(versionEl?.textContent).toMatch(/Version \d+\.\d+\.\d+/);
    });

    it('navigates with admin query param after 3 clicks within 60 seconds', () => {
      const router = TestBed.inject(Router);
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      const el = fixture.nativeElement as HTMLElement;
      const versionEl = el.querySelector('.version-info') as HTMLElement;
      expect(versionEl).toBeTruthy();

      versionEl.click();
      versionEl.click();
      expect(navigateSpy).not.toHaveBeenCalled();

      versionEl.click();
      expect(navigateSpy).toHaveBeenCalledWith([], {
        relativeTo: expect.anything(),
        queryParams: { admin: 'true' },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    });

    it('resets click count if clicks are separated by more than 60 seconds', () => {
      const router = TestBed.inject(Router);
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      const el = fixture.nativeElement as HTMLElement;
      const versionEl = el.querySelector('.version-info') as HTMLElement;

      const dateNowSpy = vi.spyOn(Date, 'now');
      dateNowSpy.mockReturnValue(1000);
      versionEl.click();
      versionEl.click();

      // Advance time by 61 seconds
      dateNowSpy.mockReturnValue(1000 + 61000);
      versionEl.click();

      // Only 1 click counted after reset, so navigate should not have been called
      expect(navigateSpy).not.toHaveBeenCalled();

      dateNowSpy.mockRestore();
    });
  });
});
