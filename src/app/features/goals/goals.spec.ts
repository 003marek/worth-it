import 'fake-indexeddb/auto';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FinancialCalculatorService } from '../../core/services/financial-calculator.service';
import { StorageService } from '../../core/services/storage.service';
import { WorthItStore } from '../../core/stores/worth-it.store';
import { GoalCompleteDialog, GoalCompleteResult } from './goal-complete-dialog';
import { GoalFormDialog, GoalFormValue } from './goal-form-dialog';
import { Goals } from './goals';

try {
  getTestBed().initTestEnvironment(
    BrowserTestingModule,
    platformBrowserTesting()
  );
} catch {
  // already initialized
}

describe('Goals Component & Flow', () => {
  let fixture: ComponentFixture<Goals>;
  let component: Goals;
  let store: InstanceType<typeof WorthItStore>;
  let storage: StorageService;
  let dialog: MatDialog;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Goals],
      providers: [StorageService, FinancialCalculatorService, WorthItStore],
    }).compileComponents();

    storage = TestBed.inject(StorageService);
    await storage.open();
    await storage.clearAllData();

    store = TestBed.inject(WorthItStore);
    await store.loadAll();

    dialog = TestBed.inject(MatDialog);

    fixture = TestBed.createComponent(Goals);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(async () => {
    await storage.clearAllData();
  });

  describe('Rendering', () => {
    it('renders empty state when there are no goals', async () => {
      expect(store.goals()).toHaveLength(0);
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('.empty-state-wrapper')).toBeTruthy();
      expect(compiled.textContent).toContain('No goals yet');
    });

    it('renders top summary strip tiles', () => {
      const compiled = fixture.nativeElement as HTMLElement;
      const tiles = compiled.querySelectorAll('app-metric-tile');
      expect(tiles.length).toBe(3);
      expect(compiled.textContent).toContain('Available for goals');
      expect(compiled.textContent).toContain('Financial cushion');
      expect(compiled.textContent).toContain('Reserved for goals');
    });

    it('renders funding sequence with active and upcoming badges', async () => {
      await store.addGoal({ name: 'Emergency Fund', targetAmount: 20000 });
      await store.addGoal({ name: 'New Car', targetAmount: 50000 });

      fixture.detectChanges();
      await fixture.whenStable();

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('.empty-state-wrapper')).toBeFalsy();

      // Check Active Goal badge
      const activeBadge = compiled.querySelector('.active-badge');
      expect(activeBadge).toBeTruthy();
      expect(activeBadge?.textContent).toContain('Active Goal');

      // Check Upcoming badge
      const upcomingBadge = compiled.querySelector('.upcoming-badge');
      expect(upcomingBadge).toBeTruthy();
      expect(upcomingBadge?.textContent).toContain('Upcoming #2');

      // Check Goal names
      expect(compiled.textContent).toContain('Emergency Fund');
      expect(compiled.textContent).toContain('New Car');

      // Check card styling for active goal
      const activeCard = compiled.querySelector('.goal-card.active-card');
      expect(activeCard).toBeTruthy();
    });

    it('displays cushion warning banner when cushion has a deficit', async () => {
      // Cushion target is 36,000 PLN by default (6000 * 6)
      // With 0 assets, cushion deficit is 36,000 PLN
      fixture.detectChanges();
      await fixture.whenStable();

      const compiled = fixture.nativeElement as HTMLElement;
      const banner = compiled.querySelector('.warning-banner');
      expect(banner).toBeTruthy();
      expect(banner?.textContent).toContain('Financial Cushion Deficit');
    });
  });

  describe('Adding a goal', () => {
    it('opens GoalFormDialog and adds goal to store', async () => {
      const formValue: GoalFormValue = {
        name: 'Home Renovation',
        targetAmount: 45000,
      };

      vi.spyOn(dialog, 'open').mockReturnValue({
        afterClosed: () => of(formValue),
      } as any);

      await component.openAddGoalDialog();
      await fixture.whenStable();

      expect(store.goals()).toHaveLength(1);
      expect(store.goals()[0].name).toBe('Home Renovation');
      expect(store.goals()[0].targetAmount).toBe(45000);
      expect(store.activeGoal()?.name).toBe('Home Renovation');
    });
  });

  describe('Skipping and Resuming a goal', () => {
    it('skips a goal and displays it in Skipped Goals section, then unskips it', async () => {
      const g1 = await store.addGoal({ name: 'Goal 1', targetAmount: 10000 });
      const g2 = await store.addGoal({ name: 'Goal 2', targetAmount: 20000 });

      expect(store.activeGoal()?.id).toBe(g1.id);

      // Skip Goal 1
      await component.skipGoal(g1.id);
      fixture.detectChanges();
      await fixture.whenStable();

      expect(store.skippedGoals()).toHaveLength(1);
      expect(store.skippedGoals()[0].id).toBe(g1.id);
      expect(store.activeGoal()?.id).toBe(g2.id);

      const compiled = fixture.nativeElement as HTMLElement;
      const skippedSection = compiled.querySelector('.skipped-section');
      expect(skippedSection).toBeTruthy();
      expect(skippedSection?.textContent).toContain('Skipped Goals (1)');
      expect(skippedSection?.textContent).toContain('Goal 1');

      // Resume Goal 1
      await component.unskipGoal(g1.id);
      fixture.detectChanges();
      await fixture.whenStable();

      expect(store.skippedGoals()).toHaveLength(0);
      expect(store.activeGoal()?.id).toBe(g1.id);
      expect(compiled.querySelector('.skipped-section')).toBeFalsy();
    });
  });

  describe('Completing a goal with 3 choices', () => {
    beforeEach(async () => {
      // Set up wealth so funds are available
      await store.addAsset({
        name: 'Main Bank Account',
        type: 'bank_account',
        balance: 100000,
        isGoalEligible: true,
      });
      // Disable cushion to simplify checking
      await store.updateCushionSettings({ isEnabled: false });
    });

    it('completes with "reserve" choice: earmarks funds and updates reservedAmounts', async () => {
      const goal = await store.addGoal({ name: 'Motorcycle', targetAmount: 25000 });

      const dialogResult: GoalCompleteResult = {
        choice: 'reserve',
        reservedAmount: 25000,
      };

      vi.spyOn(dialog, 'open').mockReturnValue({
        afterClosed: () => of(dialogResult),
      } as any);

      await component.openCompleteDialog(goal);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(store.completedGoals()).toHaveLength(1);
      const completed = store.completedGoals()[0];
      expect(completed.completionChoice).toBe('reserve');
      expect(completed.reservedAmount).toBe(25000);

      // Reserved amounts reflects in wealth summary
      expect(store.wealthSummary().reservedAmounts).toBe(25000);
      expect(store.wealthSummary().availableForGoals).toBe(75000);

      // UI displays the Completed section with reserve badge
      const compiled = fixture.nativeElement as HTMLElement;
      const completedSection = compiled.querySelector('.completed-section');
      expect(completedSection).toBeTruthy();
      expect(completedSection?.querySelector('.reserve-badge')).toBeTruthy();
      expect(completedSection?.textContent).toContain('Motorcycle');
    });

    it('completes with "spend" choice: records an actual expense reducing wealth', async () => {
      const goal = await store.addGoal({ name: 'Laptop', targetAmount: 8000 });

      const dialogResult: GoalCompleteResult = {
        choice: 'spend',
        spentAmount: 7500,
      };

      vi.spyOn(dialog, 'open').mockReturnValue({
        afterClosed: () => of(dialogResult),
      } as any);

      await component.openCompleteDialog(goal);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(store.completedGoals()).toHaveLength(1);
      const completed = store.completedGoals()[0];
      expect(completed.completionChoice).toBe('spend');
      expect(completed.spentAmount).toBe(7500);

      // Expense record is created
      const expenses = store.expenseRecords();
      const goalExpense = expenses.find((e) => e.goalId === goal.id);
      expect(goalExpense).toBeTruthy();
      expect(goalExpense?.amount).toBe(7500);
      expect(goalExpense?.isActual).toBe(true);
      expect(goalExpense?.isReflectedInBalances).toBe(false);

      // Pending adjustment reduces total wealth
      expect(store.wealthSummary().pendingAdjustments).toBe(-7500);
      expect(store.wealthSummary().totalWealth).toBe(92500);

      // UI displays spend badge
      const compiled = fixture.nativeElement as HTMLElement;
      const completedSection = compiled.querySelector('.completed-section');
      expect(completedSection?.querySelector('.spend-badge')).toBeTruthy();
    });

    it('completes with "release" choice: all funds remain available', async () => {
      const goal = await store.addGoal({ name: 'Wedding Trip', targetAmount: 12000 });

      const dialogResult: GoalCompleteResult = {
        choice: 'release',
      };

      vi.spyOn(dialog, 'open').mockReturnValue({
        afterClosed: () => of(dialogResult),
      } as any);

      await component.openCompleteDialog(goal);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(store.completedGoals()).toHaveLength(1);
      const completed = store.completedGoals()[0];
      expect(completed.completionChoice).toBe('release');
      expect(completed.spentAmount).toBeUndefined();
      expect(completed.reservedAmount).toBeUndefined();

      // No reserve and no expense created
      expect(store.wealthSummary().reservedAmounts).toBe(0);
      expect(store.wealthSummary().availableForGoals).toBe(100000);
      expect(store.expenseRecords().some((e) => e.goalId === goal.id)).toBe(false);

      // UI displays release badge
      const compiled = fixture.nativeElement as HTMLElement;
      const completedSection = compiled.querySelector('.completed-section');
      expect(completedSection?.querySelector('.release-badge')).toBeTruthy();
    });

    it('changes allocation on completed goal from spend to reserve, cleaning up the auto-expense', async () => {
      const goal = await store.addGoal({ name: 'Phone', targetAmount: 4000 });

      // First complete as spend
      await store.completeGoal(goal.id, 'spend', 4000);
      expect(store.expenseRecords().filter((e) => e.goalId === goal.id)).toHaveLength(1);

      // Change allocation to reserve
      const dialogResult: GoalCompleteResult = {
        choice: 'reserve',
        reservedAmount: 4000,
      };

      vi.spyOn(dialog, 'open').mockReturnValue({
        afterClosed: () => of(dialogResult),
      } as any);

      const completedGoal = store.completedGoals()[0];
      await component.openChangeAllocationDialog(completedGoal);
      await fixture.whenStable();

      // Old expense must be removed
      expect(store.expenseRecords().filter((e) => e.goalId === goal.id)).toHaveLength(0);
      // New reserve must be active
      expect(store.completedGoals()[0].completionChoice).toBe('reserve');
      expect(store.wealthSummary().reservedAmounts).toBe(4000);
    });

    it('reopens a completed goal', async () => {
      const goal = await store.addGoal({ name: 'Tablet', targetAmount: 3000 });
      await store.completeGoal(goal.id, 'spend', 3000);
      expect(store.completedGoals()).toHaveLength(1);

      await component.reopenGoal(goal.id);
      expect(store.completedGoals()).toHaveLength(0);
      expect(store.activeGoal()?.id).toBe(goal.id);
      expect(store.expenseRecords().filter((e) => e.goalId === goal.id)).toHaveLength(0);
    });
  });

  describe('Reordering goals', () => {
    it('moves goals up and down updating sequence', async () => {
      const g1 = await store.addGoal({ name: 'First Goal', targetAmount: 1000 });
      const g2 = await store.addGoal({ name: 'Second Goal', targetAmount: 2000 });

      expect(store.goals()[0].id).toBe(g1.id);
      expect(store.goals()[1].id).toBe(g2.id);

      // Move first goal down
      await component.moveGoalDown(0);
      await fixture.whenStable();

      expect(store.goals()[0].id).toBe(g2.id);
      expect(store.goals()[1].id).toBe(g1.id);

      // Move second goal up
      await component.moveGoalUp(1);
      await fixture.whenStable();

      expect(store.goals()[0].id).toBe(g1.id);
      expect(store.goals()[1].id).toBe(g2.id);
    });
  });
});

describe('GoalCompleteDialog Component', () => {
  let dialogRefMock: { close: ReturnType<typeof vi.fn> };

  const createDialogFixture = async (goal: any) => {
    dialogRefMock = { close: vi.fn() };
    await TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [GoalCompleteDialog],
      providers: [
        { provide: MatDialogRef, useValue: dialogRefMock },
        { provide: MAT_DIALOG_DATA, useValue: { goal } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(GoalCompleteDialog);
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, dialog: fixture.componentInstance };
  };

  it('initializes with default "spend" choice and targetAmount on new goal', async () => {
    const goal = {
      id: 'g1',
      name: 'New Computer',
      targetAmount: 6000,
      order: 0,
      isCompleted: false,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };

    const { fixture } = await createDialogFixture(goal);
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).toContain('Complete goal');
    expect(compiled.textContent).toContain('New Computer');
    expect(compiled.textContent).toContain('Spend the money');
  });

  it('pre-populates choice and amounts when editing allocation of completed goal', async () => {
    const completedGoal = {
      id: 'g2',
      name: 'Old Car',
      targetAmount: 30000,
      order: 1,
      isCompleted: true,
      completionChoice: 'reserve' as const,
      reservedAmount: 28000,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };

    const { fixture, dialog } = await createDialogFixture(completedGoal);
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).toContain('Change allocation');
    expect(dialog['model']().choice).toBe('reserve');
    expect(dialog['model']().reservedAmount).toBe(28000);
  });
});
