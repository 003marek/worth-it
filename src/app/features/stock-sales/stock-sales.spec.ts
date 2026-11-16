import 'fake-indexeddb/auto';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { StorageService } from '../../core/services/storage.service';
import { FinancialCalculatorService } from '../../core/services/financial-calculator.service';
import { WorthItStore } from '../../core/stores/worth-it.store';
import { StockSales } from './stock-sales';
import { StockSaleDialog, StockSaleDialogResult } from './stock-sale-dialog';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { submit } from '@angular/forms/signals';
import { StockSale } from '../../core/models/worth-it.model';

describe('StockSales', () => {
  let fixture: ComponentFixture<StockSales>;
  let component: StockSales;
  let store: InstanceType<typeof WorthItStore>;
  let storage: StorageService;
  let mockDialog: { open: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockDialog = {
      open: vi.fn(),
    };

    TestBed.configureTestingModule({
      imports: [StockSales],
      providers: [
        StorageService,
        FinancialCalculatorService,
        WorthItStore,
        { provide: MatDialog, useValue: mockDialog },
      ],
    });

    storage = TestBed.inject(StorageService);
    await storage.open();
    await storage.clearAllData();

    store = TestBed.inject(WorthItStore);
    await store.loadAll();

    fixture = TestBed.createComponent(StockSales);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('creates the component', () => {
    expect(component).toBeTruthy();
  });

  it('renders the standalone historical notice banner', () => {
    const el = fixture.nativeElement as HTMLElement;
    const banner = el.querySelector('.standalone-banner');
    expect(banner).toBeTruthy();
    expect(banner?.textContent).toContain('Standalone historical log');
    expect(banner?.textContent).toContain('Stock sales recorded here do not automatically modify your asset balances');
  });

  it('shows empty state when there are no stock sales', () => {
    const el = fixture.nativeElement as HTMLElement;
    const emptyState = el.querySelector('app-empty-state');
    expect(emptyState).toBeTruthy();
    expect(emptyState?.textContent).toContain('No stock sales recorded');
    expect(el.querySelector('.sales-table')).toBeNull();
  });

  it('renders summary tiles and table when stock sales exist', async () => {
    await store.addStockSale({
      companyOrTicker: 'AAPL',
      saleDate: '2026-03-01',
      sharesSold: 10,
      pricePerShare: 200,
      currency: 'USD',
      grossValue: 2000,
      plnEquivalent: 8000,
    });
    await store.addStockSale({
      companyOrTicker: 'GPW / CDR',
      saleDate: '2026-03-05',
      sharesSold: 50,
      pricePerShare: 100,
      currency: 'PLN',
      grossValue: 5000,
      plnEquivalent: 5000,
    });

    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.totalSalesCount()).toBe(2);
    expect(component.totalPlnEquivalent()).toBe(13000);
    expect(component.currencyBreakdown()).toHaveLength(2);

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-empty-state')).toBeNull();

    const table = el.querySelector('.sales-table');
    expect(table).toBeTruthy();

    // Verify sort order: saleDate descending (2026-03-05 first, then 2026-03-01)
    const sorted = component.sortedStockSales();
    expect(sorted[0].companyOrTicker).toBe('GPW / CDR');
    expect(sorted[1].companyOrTicker).toBe('AAPL');
  });

  it('displays linked employer stock badge when sale has sourceAssetId', async () => {
    const asset = await store.addAsset({
      name: 'Alphabet Inc.',
      type: 'employer_stock',
      currency: 'USD',
      balance: 0,
      employerStock: {
        tickerSymbol: 'GOOGL',
      },
    });

    await store.addStockSale({
      sourceAssetId: asset.id,
      companyOrTicker: 'GOOGL',
      saleDate: '2026-03-10',
      sharesSold: 5,
      pricePerShare: 175,
      currency: 'USD',
      grossValue: 875,
    });

    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    const badge = el.querySelector('.source-asset-chip');
    expect(badge).toBeTruthy();
    expect(badge?.textContent).toContain('Alphabet Inc.');
    expect(badge?.textContent).toContain('Deducted from held shares');
  });

  it('opens StockSaleDialog and adds sale with sourceAssetId on completion', async () => {
    const dialogResult: StockSaleDialogResult = {
      sourceAssetId: 'emp-123',
      companyOrTicker: 'TSLA',
      saleDate: '2026-04-10',
      sharesSold: 5,
      pricePerShare: 200,
      currency: 'USD',
      grossValue: 1000,
      plnEquivalent: 4000,
    };

    mockDialog.open.mockReturnValue({
      afterClosed: () => of(dialogResult),
    });

    await component.openAddDialog('emp-123');

    expect(mockDialog.open).toHaveBeenCalledWith(StockSaleDialog, {
      data: { preselectedAssetId: 'emp-123' },
      autoFocus: 'first-tabbable',
    });
    expect(store.stockSales()).toHaveLength(1);
    expect(store.stockSales()[0].companyOrTicker).toBe('TSLA');
    expect(store.stockSales()[0].sourceAssetId).toBe('emp-123');
    expect(store.stockSales()[0].grossValue).toBe(1000);
  });

  it('opens StockSaleDialog and updates sale on completion', async () => {
    const sale = await store.addStockSale({
      companyOrTicker: 'MSFT',
      saleDate: '2026-02-15',
      sharesSold: 10,
      pricePerShare: 400,
      currency: 'USD',
      grossValue: 4000,
      plnEquivalent: 16000,
    });

    const updateResult: StockSaleDialogResult = {
      sourceAssetId: 'asset-msft',
      companyOrTicker: 'MSFT',
      saleDate: '2026-02-15',
      sharesSold: 12,
      pricePerShare: 400,
      currency: 'USD',
      grossValue: 4800,
      plnEquivalent: 19200,
    };

    mockDialog.open.mockReturnValue({
      afterClosed: () => of(updateResult),
    });

    await component.openEditDialog(sale);

    const updated = store.stockSales().find((s) => s.id === sale.id);
    expect(updated?.sharesSold).toBe(12);
    expect(updated?.sourceAssetId).toBe('asset-msft');
    expect(updated?.grossValue).toBe(4800);
  });

  it('deletes sale after user confirms', async () => {
    const sale = await store.addStockSale({
      companyOrTicker: 'NVDA',
      saleDate: '2026-03-20',
      sharesSold: 15,
      pricePerShare: 100,
      currency: 'USD',
      grossValue: 1500,
    });

    mockDialog.open.mockReturnValue({
      afterClosed: () => of(true),
    });

    await component.deleteSale(sale);

    expect(store.stockSales()).toHaveLength(0);
  });

  it('does not delete sale if user cancels confirm dialog', async () => {
    const sale = await store.addStockSale({
      companyOrTicker: 'NVDA',
      saleDate: '2026-03-20',
      sharesSold: 15,
      pricePerShare: 100,
      currency: 'USD',
      grossValue: 1500,
    });

    mockDialog.open.mockReturnValue({
      afterClosed: () => of(false),
    });

    await component.deleteSale(sale);

    expect(store.stockSales()).toHaveLength(1);
  });
});

describe('StockSaleDialog', () => {
  it('initializes with default values for new sale', () => {
    TestBed.configureTestingModule({
      imports: [StockSaleDialog],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: {} },
        { provide: MatDialogRef, useValue: { close: vi.fn() } },
      ],
    });

    const fixture = TestBed.createComponent(StockSaleDialog);
    const comp = fixture.componentInstance;
    fixture.detectChanges();

    expect(comp).toBeTruthy();
    expect(comp.calculatedGrossValue()).toBe(0);
  });

  it('computes gross value and PLN equivalent correctly', () => {
    const sale: StockSale = {
      id: 'test-1',
      companyOrTicker: 'GOOGL',
      saleDate: '2026-03-10',
      sharesSold: 10,
      pricePerShare: 180,
      currency: 'USD',
      grossValue: 1800,
      plnEquivalent: 7200,
    };

    TestBed.configureTestingModule({
      imports: [StockSaleDialog],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { sale } },
        { provide: MatDialogRef, useValue: { close: vi.fn() } },
      ],
    });

    const fixture = TestBed.createComponent(StockSaleDialog);
    const comp = fixture.componentInstance;
    fixture.detectChanges();

    expect(comp.calculatedGrossValue()).toBe(1800);
    expect(comp.livePlnDisplay()).toBe(7200);
  });

  it('prefills details from preselectedAssetId and shows amber accounting banner', async () => {
    TestBed.configureTestingModule({
      imports: [StockSaleDialog],
      providers: [
        StorageService,
        FinancialCalculatorService,
        WorthItStore,
        {
          provide: MAT_DIALOG_DATA,
          useValue: { preselectedAssetId: 'googl-asset-id' },
        },
        { provide: MatDialogRef, useValue: { close: vi.fn() } },
      ],
    });

    const storage = TestBed.inject(StorageService);
    await storage.open();
    await storage.clearAllData();
    const store = TestBed.inject(WorthItStore);
    await store.loadAll();

    await store.addAsset({
      id: 'googl-asset-id',
      name: 'Google LLC',
      type: 'employer_stock',
      currency: 'USD',
      balance: 0,
      employerStock: {
        tickerSymbol: 'GOOGL',
      },
    });

    const fixture = TestBed.createComponent(StockSaleDialog);
    const comp = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();

    expect(comp.model().sourceAssetId).toBe('googl-asset-id');
    expect(comp.model().companyOrTicker).toBe('GOOGL');
    expect(comp.model().currency).toBe('USD');
    expect(comp.selectedSourceAsset()?.name).toBe('Google LLC');

    const el = fixture.nativeElement as HTMLElement;
    const banner = el.querySelector('.source-asset-notice');
    expect(banner).toBeTruthy();
    expect(banner?.textContent).toContain("Selling 1 shares will deduct them from Google LLC's held vested shares");
    expect(banner?.textContent).toContain('Sale proceeds do not automatically add to cash accounts');
  });

  it('submits dialog returning sourceAssetId', async () => {
    const closeSpy = vi.fn();
    TestBed.configureTestingModule({
      imports: [StockSaleDialog],
      providers: [
        StorageService,
        FinancialCalculatorService,
        WorthItStore,
        {
          provide: MAT_DIALOG_DATA,
          useValue: { preselectedAssetId: 'test-asset' },
        },
        { provide: MatDialogRef, useValue: { close: closeSpy } },
      ],
    });

    const storage = TestBed.inject(StorageService);
    await storage.open();
    await storage.clearAllData();
    const store = TestBed.inject(WorthItStore);
    await store.loadAll();

    await store.addAsset({
      id: 'test-asset',
      name: 'Acme Corp',
      type: 'employer_stock',
      currency: 'USD',
      balance: 0,
      employerStock: { tickerSymbol: 'ACME' },
    });

    const fixture = TestBed.createComponent(StockSaleDialog);
    const comp = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();

    comp.model.update((m) => ({
      ...m,
      sharesSold: 10,
      pricePerShare: 50,
      currency: 'USD',
      saleDate: '2026-03-15',
    }));

    await submit(comp.saleForm);

    expect(closeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceAssetId: 'test-asset',
        companyOrTicker: 'ACME',
        sharesSold: 10,
        pricePerShare: 50,
        grossValue: 500,
      })
    );
  });
});
