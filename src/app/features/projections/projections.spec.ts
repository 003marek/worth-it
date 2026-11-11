import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { Projections } from './projections';
import { WorthItStore } from '../../core/stores/worth-it.store';
import { StorageService } from '../../core/services/storage.service';
import { FinancialCalculatorService } from '../../core/services/financial-calculator.service';

describe('Projections Component', () => {
  let store: InstanceType<typeof WorthItStore>;
  let storage: StorageService;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [Projections],
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

  it('creates the Projections component', () => {
    const fixture = TestBed.createComponent(Projections);
    const component = fixture.componentInstance;
    expect(component).toBeTruthy();
  });

  it('renders side-by-side Actual vs Projected comparison header', async () => {
    await store.addAsset({
      name: 'Bank',
      type: 'bank_account',
      balance: 40000,
      isGoalEligible: true,
    });
    await store.addIncomeSource({
      name: 'Salary',
      amount: 12000,
      frequency: 'monthly',
      type: 'salary',
    });
    await store.addExpenseCategory({
      name: 'Living',
      expectedMonthlyAmount: 5000,
    });
    await store.addGoal({ name: 'Emergency Fund', targetAmount: 20000 });

    const fixture = TestBed.createComponent(Projections);
    fixture.detectChanges();
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    const header = compiled.querySelector('.actual-vs-projected-header');
    expect(header).toBeTruthy();

    const actualCard = header?.querySelector('.actual-card');
    expect(actualCard).toBeTruthy();
    expect(actualCard?.textContent).toContain('Actual Reality');
    expect(actualCard?.textContent).toContain('Recorded Assets');

    const projectedCard = header?.querySelector('.projected-card');
    expect(projectedCard).toBeTruthy();
    expect(projectedCard?.textContent).toContain('Projected Horizon');
    expect(projectedCard?.textContent).toContain('Expected Monthly Surplus');
    expect(projectedCard?.classList.contains('projected')).toBe(true);
  });

  it('renders assumptions and what-if simulator card with active baseline values', async () => {
    await store.updateCushionSettings({
      isEnabled: true,
      averageMonthlyExpenses: 5000,
      coverageMonths: 6,
    });
    await store.addAsset({
      name: 'Savings',
      type: 'bank_account',
      balance: 15000,
      isGoalEligible: true,
    });
    await store.addIncomeSource({
      name: 'Work',
      amount: 9000,
      frequency: 'monthly',
      type: 'salary',
    });
    await store.addExpenseCategory({
      name: 'Rent',
      expectedMonthlyAmount: 4000,
    });

    const fixture = TestBed.createComponent(Projections);
    fixture.detectChanges();
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    const simCard = compiled.querySelector('.simulator-card');
    expect(simCard).toBeTruthy();
    expect(simCard?.textContent).toContain('Assumptions & What-If Simulator');
    expect(simCard?.textContent).toContain('Goal-Eligible Wealth');
    expect(simCard?.textContent).toContain('Cushion Target');
    expect(simCard?.textContent).toContain('Baseline Surplus');
    expect(simCard?.textContent).toContain('Baseline Active');
  });

  it('interactively updates simulated surplus, dates, and impact banner when simulation inputs change', async () => {
    await store.updateCushionSettings({
      isEnabled: true,
      averageMonthlyExpenses: 5000,
      coverageMonths: 6, // 30,000 target
    });
    await store.addAsset({
      name: 'Savings',
      type: 'bank_account',
      balance: 30000, // cushion fully funded
      isGoalEligible: true,
    });
    await store.addIncomeSource({
      name: 'Salary',
      amount: 10000,
      frequency: 'monthly',
      type: 'salary',
    });
    await store.addExpenseCategory({
      name: 'Expenses',
      expectedMonthlyAmount: 6000,
    }); // surplus = 4,000
    await store.addGoal({ name: 'Car', targetAmount: 40000 }); // baseline: 40000 / 4000 = 10 months

    const fixture = TestBed.createComponent(Projections);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.isSimulationActive()).toBe(false);
    const baselineGoal = component.activeGoalFunding();
    expect(baselineGoal?.estimatedCompletionMonths).toBe(10);

    // Apply simulation: +2000/mo extra savings & 10000 windfall
    component.simModel.set({
      extraMonthlySavings: 2000,
      oneTimeWindfall: 10000,
    });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.isSimulationActive()).toBe(true);
    expect(component.simulatedMonthlySurplus()).toBe(6000); // 4000 + 2000
    expect(component.simulatedAvailableForGoals()).toBe(10000); // 0 + 10000

    const simGoal = component.simulatedActiveGoalFunding();
    // With 10,000 windfall, remaining is 30,000. With 6,000 surplus, months = 30,000 / 6,000 = 5 months!
    expect(simGoal?.estimatedCompletionMonths).toBe(5);

    const compiled = fixture.nativeElement as HTMLElement;
    const statusChip = compiled.querySelector('.sim-status-chip');
    expect(statusChip?.textContent).toContain('Simulation Active');

    const impactBanner = compiled.querySelector('.simulation-impact-banner');
    expect(impactBanner).toBeTruthy();
    expect(impactBanner?.textContent).toContain('What-If Scenario');
    expect(impactBanner?.textContent).toContain('5.0 months sooner');
  });

  it('resets simulation back to baseline when resetSimulation is called', async () => {
    const fixture = TestBed.createComponent(Projections);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    component.simModel.set({
      extraMonthlySavings: 1500,
      oneTimeWindfall: 20000,
    });
    expect(component.isSimulationActive()).toBe(true);

    component.resetSimulation();
    expect(component.isSimulationActive()).toBe(false);
    expect(component.simModel().extraMonthlySavings).toBe(0);
    expect(component.simModel().oneTimeWindfall).toBe(0);
  });

  it('renders Full Funding Waterfall with Cushion, Active Goal, and Upcoming Goals', async () => {
    await store.updateCushionSettings({
      isEnabled: true,
      averageMonthlyExpenses: 4000,
      coverageMonths: 3, // target = 12000
    });
    await store.addAsset({
      name: 'Bank',
      type: 'bank_account',
      balance: 10000, // funded = 10000, deficit = 2000
      isGoalEligible: true,
    });
    await store.addIncomeSource({
      name: 'Salary',
      amount: 8000,
      frequency: 'monthly',
      type: 'salary',
    });
    await store.addExpenseCategory({
      name: 'Expenses',
      expectedMonthlyAmount: 5000,
    }); // surplus = 3000
    await store.addGoal({ name: 'Laptop', targetAmount: 6000 });
    await store.addGoal({ name: 'Trip', targetAmount: 9000 });

    const fixture = TestBed.createComponent(Projections);
    fixture.detectChanges();
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    const wfCard = compiled.querySelector('.waterfall-card');
    expect(wfCard).toBeTruthy();

    // Step 1: Cushion
    const cushionStep = wfCard?.querySelector('.cushion-step');
    expect(cushionStep).toBeTruthy();
    expect(cushionStep?.textContent).toContain('Protected Financial Cushion');

    // Step 2: Active Goal (Laptop)
    const activeStep = wfCard?.querySelector('.active-step');
    expect(activeStep).toBeTruthy();
    expect(activeStep?.textContent).toContain('Laptop');

    // Step 3: Upcoming Goal (Trip)
    const upcomingStep = wfCard?.querySelector('.upcoming-step');
    expect(upcomingStep).toBeTruthy();
    expect(upcomingStep?.textContent).toContain('Trip');
    expect(upcomingStep?.textContent).toContain('Cumulative required');
  });

  it('renders Multi-year projection table with milestones (6 mo, 1 yr, 2 yr, 3 yr, 5 yr)', async () => {
    await store.addAsset({
      name: 'Funds',
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
      expectedMonthlyAmount: 6000,
    }); // surplus = 4000
    await store.addGoal({ name: 'Down Payment', targetAmount: 100000 });

    const fixture = TestBed.createComponent(Projections);
    fixture.detectChanges();
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    const milestonesCard = compiled.querySelector('.milestones-card');
    expect(milestonesCard).toBeTruthy();

    const rows = milestonesCard?.querySelectorAll('tbody tr');
    expect(rows?.length).toBe(5);

    const firstRowText = rows?.[0]?.textContent;
    expect(firstRowText).toContain('6 Months');

    const lastRowText = rows?.[4]?.textContent;
    expect(lastRowText).toContain('5 Years');
  });
});
