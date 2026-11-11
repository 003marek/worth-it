import { computed, inject } from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';
import {
  addEntity,
  removeEntity,
  setAllEntities,
  updateEntity,
  withEntities,
} from '@ngrx/signals/entities';
import {
  ApplicationSettings,
  Asset,
  AssetBalanceHistory,
  ExpenseCategory,
  ExpenseRecord,
  FinancialCushionSettings,
  Goal,
  GoalCompletionChoice,
  IncomeRecord,
  IncomeSource,
  StockSale,
} from '../models/worth-it.model';
import { FinancialCalculatorService } from '../services/financial-calculator.service';
import { DEFAULT_SETTINGS, StorageService } from '../services/storage.service';

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'id_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
}

export interface WorthItState {
  assets: Asset[];
  assetHistory: AssetBalanceHistory[];
  incomeSources: IncomeSource[];
  incomeRecords: IncomeRecord[];
  expenseCategories: ExpenseCategory[];
  expenseRecords: ExpenseRecord[];
  stockSales: StockSale[];
  settings: ApplicationSettings;
  isLoading: boolean;
  error: string | null;
}

export const initialWorthItState: WorthItState = {
  assets: [],
  assetHistory: [],
  incomeSources: [],
  incomeRecords: [],
  expenseCategories: [],
  expenseRecords: [],
  stockSales: [],
  settings: DEFAULT_SETTINGS,
  isLoading: false,
  error: null,
};

export const WorthItStore = signalStore(
  { providedIn: 'root' },
  withEntities<Goal>(),
  withState<WorthItState>(initialWorthItState),
  withComputed((store) => {
    const calculator = inject(FinancialCalculatorService);

    const goals = computed(() =>
      store.entities().slice().sort((a, b) => a.order - b.order)
    );

    const activeGoal = computed(() => {
      return goals().find((g) => !g.isCompleted && !g.isSkipped) ?? null;
    });

    const upcomingGoals = computed(() => {
      const uncompleted = goals().filter((g) => !g.isCompleted && !g.isSkipped);
      return uncompleted.slice(1);
    });

    const skippedGoals = computed(() => {
      return goals().filter((g) => !g.isCompleted && g.isSkipped);
    });

    const completedGoals = computed(() => {
      return goals().filter((g) => g.isCompleted);
    });

    const wealthSummary = computed(() => {
      return calculator.calculateWealthSummary(
        store.assets(),
        store.entities(),
        store.settings().cushion,
        store.incomeRecords(),
        store.expenseRecords()
      );
    });

    /** Actual records not yet reflected in asset balances (they adjust wealth). */
    const pendingIncomeRecords = computed(() =>
      store.incomeRecords().filter((r) => r.isActual && !r.isReflectedInBalances)
    );
    const pendingExpenseRecords = computed(() =>
      store.expenseRecords().filter((r) => r.isActual && !r.isReflectedInBalances)
    );

    const monthlySurplusSummary = computed(() => {
      return calculator.calculateMonthlySurplusSummary(
        store.incomeSources(),
        store.expenseCategories(),
        store.settings().cushion
      );
    });

    const financialCushionStatus = computed(() => {
      const wealth = wealthSummary();
      const surplus = monthlySurplusSummary().monthlySurplus;
      return calculator.calculateFinancialCushionStatus(
        wealth.goalEligibleWealth,
        store.settings().cushion,
        surplus
      );
    });

    const goalsWithFunding = computed(() => {
      const wealth = wealthSummary();
      const surplus = monthlySurplusSummary().monthlySurplus;
      return calculator.calculateGoalsFundingSummary(
        goals(),
        wealth.availableForGoals,
        wealth.cushionDeficit,
        surplus
      );
    });

    const projectionSummary = computed(() => {
      const wealth = wealthSummary();
      return calculator.calculateProjectionSummary(
        store.incomeSources(),
        store.expenseCategories(),
        store.settings().cushion,
        goals(),
        wealth.availableForGoals,
        wealth.cushionDeficit
      );
    });

    return {
      goals,
      activeGoal,
      upcomingGoals,
      skippedGoals,
      completedGoals,
      wealthSummary,
      pendingIncomeRecords,
      pendingExpenseRecords,
      monthlySurplusSummary,
      financialCushionStatus,
      goalsWithFunding,
      projectionSummary,
    };
  }),
  withMethods((store) => {
    const storage = inject(StorageService);

    return {
      setLoading(isLoading: boolean) {
        patchState(store, { isLoading });
      },

      setError(error: string | null) {
        patchState(store, { error });
      },

      async loadAll(): Promise<void> {
        patchState(store, { isLoading: true, error: null });
        try {
          const [
            settings,
            goals,
            assets,
            assetHistory,
            incomeSources,
            incomeRecords,
            expenseCategories,
            expenseRecords,
            stockSales,
          ] = await Promise.all([
            storage.getSettings(),
            storage.getAllGoals(),
            storage.getAllAssets(),
            storage.getAllAssetHistory(),
            storage.getAllIncomeSources(),
            storage.getAllIncomeRecords(),
            storage.getAllExpenseCategories(),
            storage.getAllExpenseRecords(),
            storage.getAllStockSales(),
          ]);

          patchState(
            store,
            setAllEntities(goals),
            {
              assets,
              assetHistory,
              incomeSources,
              incomeRecords,
              expenseCategories,
              expenseRecords,
              stockSales,
              settings,
              isLoading: false,
              error: null,
            }
          );
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          patchState(store, { isLoading: false, error: message });
        }
      },

      // --- Goals Methods ---
      async addGoal(
        goalInput: Partial<Goal> & { name: string; targetAmount: number }
      ): Promise<Goal> {
        const now = new Date().toISOString();
        const currentGoals = store.entities();
        const newGoal: Goal = {
          id: goalInput.id || generateId(),
          name: goalInput.name.trim(),
          targetAmount: Math.max(0, Number(goalInput.targetAmount) || 0),
          order: goalInput.order ?? currentGoals.length,
          isCompleted: goalInput.isCompleted ?? false,
          completionChoice: goalInput.completionChoice,
          spentAmount: goalInput.spentAmount,
          reservedAmount: goalInput.reservedAmount,
          createdAt: goalInput.createdAt || now,
          updatedAt: now,
        };

        await storage.saveGoal(newGoal);
        patchState(store, addEntity(newGoal));
        return newGoal;
      },

      async updateGoal(
        id: string,
        changes: Partial<Goal>
      ): Promise<Goal | undefined> {
        const current = store.entityMap()[id];
        if (!current) return undefined;

        const updated: Goal = {
          ...current,
          ...changes,
          id,
          updatedAt: new Date().toISOString(),
        };

        await storage.saveGoal(updated);
        patchState(store, updateEntity({ id, changes: updated }));
        return updated;
      },

      async deleteGoal(id: string): Promise<void> {
        await storage.deleteGoal(id);
        patchState(store, removeEntity(id));
      },

      async reorderGoals(reordered: Goal[]): Promise<void> {
        const now = new Date().toISOString();
        const updated = reordered.map((goal, idx) => ({
          ...goal,
          order: idx,
          updatedAt: now,
        }));

        await storage.saveGoals(updated);
        patchState(store, setAllEntities(updated));
      },

      async completeGoal(
        id: string,
        completionChoice: GoalCompletionChoice,
        spentAmount?: number,
        reservedAmount?: number
      ): Promise<Goal | undefined> {
        const current = store.entityMap()[id];
        if (!current) return undefined;

        const now = new Date().toISOString();
        const updated: Goal = {
          ...current,
          isCompleted: true,
          completionChoice,
          spentAmount:
            completionChoice === 'spend'
              ? (spentAmount ?? current.targetAmount)
              : undefined,
          reservedAmount:
            completionChoice === 'reserve'
              ? (reservedAmount ?? current.targetAmount)
              : undefined,
          updatedAt: now,
        };

        await storage.saveGoal(updated);
        patchState(store, updateEntity({ id, changes: updated }));

        // Spec §3.3: "Spend" records the actual amount spent and reduces total wealth.
        // It is stored as an actual expense so the standard accounting rule applies
        // (it stops adjusting wealth once the user reflects it in asset balances).
        if (completionChoice === 'spend' && (updated.spentAmount ?? 0) > 0) {
          const expense: ExpenseRecord = {
            id: generateId(),
            categoryName: `Goal: ${updated.name}`,
            amount: updated.spentAmount ?? 0,
            currency: store.settings().baseCurrency || 'PLN',
            date: now,
            isActual: true,
            isReflectedInBalances: false,
            goalId: id,
            note: 'Recorded when the goal was completed',
          };
          await storage.saveExpenseRecord(expense);
          patchState(store, (state) => ({
            expenseRecords: [...state.expenseRecords, expense],
          }));
        }
        return updated;
      },

      async skipGoal(id: string, isSkipped = true): Promise<Goal | undefined> {
        const current = store.entityMap()[id];
        if (!current || current.isCompleted) return undefined;
        const updated: Goal = {
          ...current,
          isSkipped,
          updatedAt: new Date().toISOString(),
        };
        await storage.saveGoal(updated);
        patchState(store, updateEntity({ id, changes: updated }));
        return updated;
      },

      async uncompleteGoal(id: string): Promise<Goal | undefined> {
        const current = store.entityMap()[id];
        if (!current) return undefined;

        // Undo the auto-created "spend" expense, if any.
        const goalExpenses = store.expenseRecords().filter((r) => r.goalId === id);
        for (const r of goalExpenses) {
          await storage.deleteExpenseRecord(r.id);
        }
        if (goalExpenses.length) {
          patchState(store, (state) => ({
            expenseRecords: state.expenseRecords.filter((r) => r.goalId !== id),
          }));
        }

        const now = new Date().toISOString();
        const updated: Goal = {
          ...current,
          isCompleted: false,
          completionChoice: undefined,
          spentAmount: undefined,
          reservedAmount: undefined,
          updatedAt: now,
        };

        await storage.saveGoal(updated);
        patchState(store, updateEntity({ id, changes: updated }));
        return updated;
      },

      // --- Assets Methods ---
      async addAsset(
        assetInput: Partial<Asset> & {
          name: string;
          type: Asset['type'];
          balance: number;
        },
        initialHistoryNote?: string
      ): Promise<Asset> {
        const now = new Date().toISOString();
        const baseCurrency = store.settings().baseCurrency || 'PLN';

        const newAsset: Asset = {
          id: assetInput.id || generateId(),
          name: assetInput.name.trim(),
          type: assetInput.type,
          currency: assetInput.currency || baseCurrency,
          balance: Number(assetInput.balance) || 0,
          isGoalEligible: assetInput.isGoalEligible ?? true,
          updatedAt: now,
        };

        await storage.saveAsset(newAsset);

        const initialHistory: AssetBalanceHistory = {
          id: generateId(),
          assetId: newAsset.id,
          balance: newAsset.balance,
          date: now,
          note: initialHistoryNote ?? 'Initial balance',
        };

        await storage.saveAssetHistory(initialHistory);

        patchState(store, (state) => ({
          assets: [...state.assets, newAsset],
          assetHistory: [...state.assetHistory, initialHistory],
        }));

        return newAsset;
      },

      async updateAsset(
        id: string,
        changes: Partial<Asset>,
        historyNote?: string
      ): Promise<Asset | undefined> {
        const current = store.assets().find((a) => a.id === id);
        if (!current) return undefined;

        const now = new Date().toISOString();
        const updated: Asset = {
          ...current,
          ...changes,
          id,
          updatedAt: now,
        };

        await storage.saveAsset(updated);

        let newHistoryRecord: AssetBalanceHistory | null = null;
        if (
          changes.balance !== undefined &&
          changes.balance !== current.balance
        ) {
          newHistoryRecord = {
            id: generateId(),
            assetId: id,
            balance: changes.balance,
            date: now,
            note: historyNote ?? 'Balance update',
          };
          await storage.saveAssetHistory(newHistoryRecord);
        }

        patchState(store, (state) => ({
          assets: state.assets.map((a) => (a.id === id ? updated : a)),
          assetHistory: newHistoryRecord
            ? [...state.assetHistory, newHistoryRecord]
            : state.assetHistory,
        }));

        return updated;
      },

      async updateAssetBalance(
        id: string,
        newBalance: number,
        note?: string
      ): Promise<Asset | undefined> {
        return this.updateAsset(id, { balance: newBalance }, note);
      },

      async deleteAsset(id: string): Promise<void> {
        await storage.deleteAsset(id);
        patchState(store, (state) => ({
          assets: state.assets.filter((a) => a.id !== id),
          assetHistory: state.assetHistory.filter((h) => h.assetId !== id),
        }));
      },

      // --- Asset Balance History Methods ---
      async addAssetHistory(
        recordData: Partial<AssetBalanceHistory> & {
          assetId: string;
          balance: number;
        }
      ): Promise<AssetBalanceHistory> {
        const newRecord: AssetBalanceHistory = {
          id: recordData.id || generateId(),
          assetId: recordData.assetId,
          balance: Number(recordData.balance) || 0,
          date: recordData.date || new Date().toISOString(),
          note: recordData.note,
        };

        await storage.saveAssetHistory(newRecord);
        patchState(store, (state) => ({
          assetHistory: [...state.assetHistory, newRecord],
        }));
        return newRecord;
      },

      async deleteAssetHistory(id: string): Promise<void> {
        await storage.deleteAssetHistory(id);
        patchState(store, (state) => ({
          assetHistory: state.assetHistory.filter((h) => h.id !== id),
        }));
      },

      // --- Income Methods ---
      async addIncomeSource(
        sourceInput: Partial<IncomeSource> & { name: string; amount: number }
      ): Promise<IncomeSource> {
        const baseCurrency = store.settings().baseCurrency || 'PLN';
        const newSource: IncomeSource = {
          id: sourceInput.id || generateId(),
          name: sourceInput.name.trim(),
          type: sourceInput.type || 'salary',
          amount: Number(sourceInput.amount) || 0,
          currency: sourceInput.currency || baseCurrency,
          frequency: sourceInput.frequency || 'monthly',
          isEnabled: sourceInput.isEnabled ?? true,
          effectiveDate: sourceInput.effectiveDate,
        };

        await storage.saveIncomeSource(newSource);
        patchState(store, (state) => ({
          incomeSources: [...state.incomeSources, newSource],
        }));
        return newSource;
      },

      async updateIncomeSource(
        id: string,
        changes: Partial<IncomeSource>
      ): Promise<IncomeSource | undefined> {
        const current = store.incomeSources().find((s) => s.id === id);
        if (!current) return undefined;

        const updated: IncomeSource = { ...current, ...changes, id };
        await storage.saveIncomeSource(updated);

        patchState(store, (state) => ({
          incomeSources: state.incomeSources.map((s) =>
            s.id === id ? updated : s
          ),
        }));
        return updated;
      },

      async deleteIncomeSource(id: string): Promise<void> {
        await storage.deleteIncomeSource(id);
        patchState(store, (state) => ({
          incomeSources: state.incomeSources.filter((s) => s.id !== id),
          incomeRecords: state.incomeRecords.map((r) =>
            r.incomeSourceId === id ? { ...r, incomeSourceId: undefined } : r
          ),
        }));
      },

      async addIncomeRecord(
        recordInput: Partial<IncomeRecord> & { name: string; amount: number }
      ): Promise<IncomeRecord> {
        const baseCurrency = store.settings().baseCurrency || 'PLN';
        const newRecord: IncomeRecord = {
          id: recordInput.id || generateId(),
          incomeSourceId: recordInput.incomeSourceId,
          name: recordInput.name.trim(),
          type: recordInput.type || 'salary',
          amount: Number(recordInput.amount) || 0,
          currency: recordInput.currency || baseCurrency,
          receivedDate: recordInput.receivedDate || new Date().toISOString(),
          isActual: recordInput.isActual ?? true,
          note: recordInput.note,
        };

        await storage.saveIncomeRecord(newRecord);
        patchState(store, (state) => ({
          incomeRecords: [...state.incomeRecords, newRecord],
        }));
        return newRecord;
      },

      async deleteIncomeRecord(id: string): Promise<void> {
        await storage.deleteIncomeRecord(id);
        patchState(store, (state) => ({
          incomeRecords: state.incomeRecords.filter((r) => r.id !== id),
        }));
      },

      async updateIncomeRecord(
        id: string,
        changes: Partial<IncomeRecord>
      ): Promise<IncomeRecord | undefined> {
        const current = store.incomeRecords().find((r) => r.id === id);
        if (!current) return undefined;
        const updated: IncomeRecord = { ...current, ...changes, id };
        await storage.saveIncomeRecord(updated);
        patchState(store, (state) => ({
          incomeRecords: state.incomeRecords.map((r) => (r.id === id ? updated : r)),
        }));
        return updated;
      },

      /**
       * Marks actual income/expense records as reflected in asset balances, so they stop
       * adjusting wealth (prevents double counting after a manual balance update).
       * With no ids given, all currently pending records are marked.
       */
      async markRecordsReflected(ids?: {
        incomeIds?: string[];
        expenseIds?: string[];
      }): Promise<void> {
        const incomeIds = new Set(
          ids?.incomeIds ??
            store.incomeRecords().filter((r) => r.isActual && !r.isReflectedInBalances).map((r) => r.id)
        );
        const expenseIds = new Set(
          ids?.expenseIds ??
            store.expenseRecords().filter((r) => r.isActual && !r.isReflectedInBalances).map((r) => r.id)
        );
        const income = store
          .incomeRecords()
          .map((r) => (incomeIds.has(r.id) ? { ...r, isReflectedInBalances: true } : r));
        const expenses = store
          .expenseRecords()
          .map((r) => (expenseIds.has(r.id) ? { ...r, isReflectedInBalances: true } : r));
        for (const r of income.filter((r) => incomeIds.has(r.id))) {
          await storage.saveIncomeRecord(r);
        }
        for (const r of expenses.filter((r) => expenseIds.has(r.id))) {
          await storage.saveExpenseRecord(r);
        }
        patchState(store, { incomeRecords: income, expenseRecords: expenses });
      },

      // --- Expense Methods ---
      async addExpenseCategory(
        catInput: Partial<ExpenseCategory> & {
          name: string;
          expectedMonthlyAmount: number;
        }
      ): Promise<ExpenseCategory> {
        const baseCurrency = store.settings().baseCurrency || 'PLN';
        const currentCats = store.expenseCategories();
        const newCat: ExpenseCategory = {
          id: catInput.id || generateId(),
          name: catInput.name.trim(),
          expectedMonthlyAmount: Number(catInput.expectedMonthlyAmount) || 0,
          currency: catInput.currency || baseCurrency,
          isEnabled: catInput.isEnabled ?? true,
          order: catInput.order ?? currentCats.length,
        };

        await storage.saveExpenseCategory(newCat);
        patchState(store, (state) => ({
          expenseCategories: [...state.expenseCategories, newCat],
        }));
        return newCat;
      },

      async updateExpenseCategory(
        id: string,
        changes: Partial<ExpenseCategory>
      ): Promise<ExpenseCategory | undefined> {
        const current = store.expenseCategories().find((c) => c.id === id);
        if (!current) return undefined;

        const updated: ExpenseCategory = { ...current, ...changes, id };
        await storage.saveExpenseCategory(updated);

        patchState(store, (state) => ({
          expenseCategories: state.expenseCategories.map((c) =>
            c.id === id ? updated : c
          ),
        }));
        return updated;
      },

      async deleteExpenseCategory(id: string): Promise<void> {
        await storage.deleteExpenseCategory(id);
        patchState(store, (state) => ({
          expenseCategories: state.expenseCategories.filter((c) => c.id !== id),
          expenseRecords: state.expenseRecords.map((r) =>
            r.categoryId === id ? { ...r, categoryId: undefined } : r
          ),
        }));
      },

      async reorderExpenseCategories(
        reordered: ExpenseCategory[]
      ): Promise<void> {
        const updated = reordered.map((c, idx) => ({ ...c, order: idx }));
        await storage.saveExpenseCategories(updated);
        patchState(store, { expenseCategories: updated });
      },

      async addExpenseRecord(
        recordInput: Partial<ExpenseRecord> & {
          categoryName: string;
          amount: number;
        }
      ): Promise<ExpenseRecord> {
        const baseCurrency = store.settings().baseCurrency || 'PLN';
        const newRecord: ExpenseRecord = {
          id: recordInput.id || generateId(),
          categoryId: recordInput.categoryId,
          categoryName: recordInput.categoryName.trim(),
          amount: Number(recordInput.amount) || 0,
          currency: recordInput.currency || baseCurrency,
          date: recordInput.date || new Date().toISOString(),
          isActual: recordInput.isActual ?? true,
          note: recordInput.note,
        };

        await storage.saveExpenseRecord(newRecord);
        patchState(store, (state) => ({
          expenseRecords: [...state.expenseRecords, newRecord],
        }));
        return newRecord;
      },

      async deleteExpenseRecord(id: string): Promise<void> {
        await storage.deleteExpenseRecord(id);
        patchState(store, (state) => ({
          expenseRecords: state.expenseRecords.filter((r) => r.id !== id),
        }));
      },

      async updateExpenseRecord(
        id: string,
        changes: Partial<ExpenseRecord>
      ): Promise<ExpenseRecord | undefined> {
        const current = store.expenseRecords().find((r) => r.id === id);
        if (!current) return undefined;
        const updated: ExpenseRecord = { ...current, ...changes, id };
        await storage.saveExpenseRecord(updated);
        patchState(store, (state) => ({
          expenseRecords: state.expenseRecords.map((r) => (r.id === id ? updated : r)),
        }));
        return updated;
      },

      // --- Stock Sales Methods ---
      async addStockSale(
        saleInput: Partial<StockSale> & {
          companyOrTicker: string;
          sharesSold: number;
          pricePerShare: number;
        }
      ): Promise<StockSale> {
        const sharesSold = Number(saleInput.sharesSold) || 0;
        const pricePerShare = Number(saleInput.pricePerShare) || 0;
        const grossValue =
          saleInput.grossValue !== undefined
            ? Number(saleInput.grossValue)
            : Math.round(sharesSold * pricePerShare * 100) / 100;

        const newSale: StockSale = {
          id: saleInput.id || generateId(),
          companyOrTicker: saleInput.companyOrTicker.trim(),
          saleDate: saleInput.saleDate || new Date().toISOString(),
          sharesSold,
          pricePerShare,
          currency: saleInput.currency || 'USD',
          grossValue,
          plnEquivalent: saleInput.plnEquivalent,
          notes: saleInput.notes,
        };

        await storage.saveStockSale(newSale);
        patchState(store, (state) => ({
          stockSales: [...state.stockSales, newSale],
        }));
        return newSale;
      },

      async deleteStockSale(id: string): Promise<void> {
        await storage.deleteStockSale(id);
        patchState(store, (state) => ({
          stockSales: state.stockSales.filter((s) => s.id !== id),
        }));
      },

      /** Stock sales are standalone: updating one never touches assets or wealth (spec §10.2). */
      async updateStockSale(
        id: string,
        changes: Partial<StockSale>
      ): Promise<StockSale | undefined> {
        const current = store.stockSales().find((s) => s.id === id);
        if (!current) return undefined;
        const merged: StockSale = { ...current, ...changes, id };
        const updated: StockSale = {
          ...merged,
          grossValue:
            changes.grossValue !== undefined
              ? Number(changes.grossValue)
              : Math.round(merged.sharesSold * merged.pricePerShare * 100) / 100,
        };
        await storage.saveStockSale(updated);
        patchState(store, (state) => ({
          stockSales: state.stockSales.map((s) => (s.id === id ? updated : s)),
        }));
        return updated;
      },

      /** Reloads everything from IndexedDB (e.g. after a JSON import). */
      async reload(): Promise<void> {
        await this.loadAll();
      },

      // --- Settings Methods ---
      async updateSettings(
        partial: Partial<ApplicationSettings>
      ): Promise<ApplicationSettings> {
        const updated = await storage.updateSettings(partial);
        patchState(store, { settings: updated });
        return updated;
      },

      async updateCushionSettings(
        cushion: Partial<FinancialCushionSettings>
      ): Promise<ApplicationSettings> {
        const current = store.settings();
        const updated = await storage.updateSettings({
          cushion: {
            ...current.cushion,
            ...cushion,
          },
        });
        patchState(store, { settings: updated });
        return updated;
      },
    };
  }),
  withHooks({
    onInit(store) {
      store.loadAll();
    },
  })
);
