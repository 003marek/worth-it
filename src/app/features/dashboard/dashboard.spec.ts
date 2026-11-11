import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { Dashboard } from './dashboard';
import { WorthItStore } from '../../core/stores/worth-it.store';
import { StorageService } from '../../core/services/storage.service';
import { FinancialCalculatorService } from '../../core/services/financial-calculator.service';

describe('Dashboard Component', () => {
  let store: InstanceType<typeof WorthItStore>;
  let storage: StorageService;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [
        provideRouter([]),
        StorageService,
        FinancialCalculatorService,
        WorthItStore,
      ],
    });

    storage = TestBed.inject(StorageService);
    await storage.open();
    await storage.clearAllData();

    store = TestBed.inject(WorthItStore);
    await store.loadAll();
  });

  afterEach(async () => {
    await storage.clearAllData();
  });

  it('creates the Dashboard component', () => {
    const fixture = TestBed.createComponent(Dashboard);
    const component = fixture.componentInstance;
    expect(component).toBeTruthy();
  });

  it('shows onboarding card when database is completely empty', async () => {
    const fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.onboarding-card')).toBeTruthy();
    expect(compiled.textContent).toContain('Welcome to Worth It');
    expect(compiled.textContent).toContain('Load sample financial journey (Demo Data)');
  });

  it('calls seedDemoData and reload when loading demo data', async () => {
    const fixture = TestBed.createComponent(Dashboard);
    const component = fixture.componentInstance;
    const seedSpy = vi.spyOn(storage, 'seedDemoData');
    const reloadSpy = vi.spyOn(store, 'reload');

    await component.loadDemoData();

    expect(seedSpy).toHaveBeenCalledWith(false);
    expect(reloadSpy).toHaveBeenCalled();
  });

  it('switches layout via onLayoutChange', async () => {
    const fixture = TestBed.createComponent(Dashboard);
    const component = fixture.componentInstance;

    expect(component.currentLayout()).toBe('goal_first');

    await component.onLayoutChange('financial_overview');
    expect(store.settings().defaultDashboard).toBe('financial_overview');
    expect(component.currentLayout()).toBe('financial_overview');

    await component.onLayoutChange('goal_first');
    expect(store.settings().defaultDashboard).toBe('goal_first');
    expect(component.currentLayout()).toBe('goal_first');
  });

  it('renders Goal-First layout with hero active goal, cushion status, and upcoming goals', async () => {
    // Seed some data
    await store.addAsset({
      name: 'Checking',
      type: 'bank_account',
      balance: 50000,
      isGoalEligible: true,
    });
    await store.addIncomeSource({
      name: 'Salary',
      amount: 10000,
      frequency: 'monthly',
      type: 'salary',
    });
    await store.addExpenseCategory({
      name: 'Living',
      expectedMonthlyAmount: 4000,
    });
    await store.addGoal({ name: 'Emergency Reserve', targetAmount: 20000 });
    await store.addGoal({ name: 'New Car', targetAmount: 60000 });

    const fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;

    // Database is no longer empty, onboarding card should not be present
    expect(compiled.querySelector('.onboarding-card')).toBeFalsy();

    // Hero goal card
    const heroCard = compiled.querySelector('.hero-goal-card');
    expect(heroCard).toBeTruthy();
    expect(heroCard?.textContent).toContain('Emergency Reserve');
    expect(heroCard?.querySelector('.projected-completion-box')).toBeTruthy();
    expect(heroCard?.querySelector('.projected-completion-box')?.classList.contains('projected')).toBe(true);

    // Cushion card
    const cushionCard = compiled.querySelector('.cushion-card');
    expect(cushionCard).toBeTruthy();
    expect(cushionCard?.textContent).toContain('Financial Cushion Status');

    // Upcoming goals queue
    const upcomingCard = compiled.querySelector('.upcoming-goals-card');
    expect(upcomingCard).toBeTruthy();
    expect(upcomingCard?.textContent).toContain('New Car');
  });

  it('shows cushion priority banner when cushion is enabled and has deficit', async () => {
    await store.updateCushionSettings({
      isEnabled: true,
      averageMonthlyExpenses: 5000,
      coverageMonths: 6, // target = 30,000
    });
    await store.addAsset({
      name: 'Checking',
      type: 'bank_account',
      balance: 10000, // funded = 10,000, deficit = 20,000
      isGoalEligible: true,
    });
    await store.addGoal({ name: 'Vacation', targetAmount: 5000 });

    const fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    const banner = compiled.querySelector('.priority-banner');
    expect(banner).toBeTruthy();
    expect(banner?.textContent).toContain('Protected reserve has funding priority');
    expect(banner?.textContent).toContain('needed');
  });

  it('renders Financial Overview layout with wealth breakdown, cash flow, and asset breakdown', async () => {
    await store.updateSettings({ defaultDashboard: 'financial_overview' });
    await store.addAsset({
      name: 'PKO Bank',
      type: 'bank_account',
      balance: 30000,
      isGoalEligible: true,
    });
    await store.addAsset({
      name: 'IKE Account',
      type: 'retirement',
      balance: 20000,
      isGoalEligible: false,
    });
    await store.addIncomeSource({
      name: 'Job',
      amount: 8000,
      frequency: 'monthly',
      type: 'salary',
    });
    await store.addExpenseCategory({
      name: 'Rent',
      expectedMonthlyAmount: 3000,
    });
    await store.addGoal({ name: 'Car', targetAmount: 25000 });

    const fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;

    // Financial overview layout
    expect(compiled.querySelector('.financial-overview-layout')).toBeTruthy();

    // Wealth breakdown tiles
    const tiles = compiled.querySelectorAll('app-metric-tile');
    expect(tiles.length).toBeGreaterThanOrEqual(5);

    // Cash flow card
    const cashFlowCard = compiled.querySelector('.cash-flow-card');
    expect(cashFlowCard).toBeTruthy();
    expect(cashFlowCard?.textContent).toContain('Monthly Cash Flow & Surplus');

    // Assets breakdown list
    const assetsCard = compiled.querySelector('.assets-card');
    expect(assetsCard).toBeTruthy();
    expect(assetsCard?.textContent).toContain('PKO Bank');
    expect(assetsCard?.textContent).toContain('IKE Account');

    // Active goal summary
    const activeGoalCard = compiled.querySelector('.active-goal-summary-card');
    expect(activeGoalCard).toBeTruthy();
    expect(activeGoalCard?.textContent).toContain('Car');
  });
});
