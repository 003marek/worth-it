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
    it('saves preferences and updates theme', async () => {
      const themeSpy = vi.spyOn(themeService, 'setTheme');

      component.prefsModel.set({
        baseCurrency: 'EUR',
        defaultDashboard: 'financial_overview',
        theme: 'dark',
      });

      await submit(component.prefsForm);

      expect(themeSpy).toHaveBeenCalledWith('dark');
      expect(store.settings().baseCurrency).toBe('EUR');
      expect(store.settings().defaultDashboard).toBe('financial_overview');
      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Preferences saved',
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
