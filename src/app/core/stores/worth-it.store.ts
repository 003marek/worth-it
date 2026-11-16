import { computed, inject, Injector } from '@angular/core';
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
  AssetValuation,
  AssetValuationContext,
  ProjectedInflow,
} from '../asset-types/asset-type-handler';
import {
  collectProjectedInflows,
  toValuedAsset,
  valueAssets,
} from '../asset-types/asset-valuation';
import { employerStockSnapshot } from '../asset-types/employer-stock/vesting';
import {
  EmployerStockDetails,
  EmployerStockSnapshot,
  StockGrant,
} from '../models/employer-stock.model';
import { FxRate, MarketQuote } from '../models/market-data.model';
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
import {
  MarketDataService,
  MarketRefreshResult,
} from '../services/market-data/market-data.service';
import { DEFAULT_SETTINGS, StorageService } from '../services/storage.service';

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'id_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
}

function todayIsoString(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseIsoDateLocal(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return new Date();
  }
  return new Date(y, m - 1, d);
}

export interface WorthItState {
  assets: Asset[];
  assetHistory: AssetBalanceHistory[];
  incomeSources: IncomeSource[];
  incomeRecords: IncomeRecord[];
  expenseCategories: ExpenseCategory[];
  expenseRecords: ExpenseRecord[];
  stockSales: StockSale[];
  stockGrants: StockGrant[];
  marketQuotes: MarketQuote[];
  fxRates: FxRate[];
  today: string;
  marketDataRefreshing: boolean;
  lastMarketRefresh: MarketRefreshResult | null;
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
  stockGrants: [],
  marketQuotes: [],
  fxRates: [],
  today: todayIsoString(),
  marketDataRefreshing: false,
  lastMarketRefresh: null,
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

    const employerStockAssets = computed<Asset[]>(() =>
      store.assets().filter((a) => a.type === 'employer_stock')
    );

    const grantsByAsset = computed<Map<string, StockGrant[]>>(() => {
      const map = new Map<string, StockGrant[]>();
      for (const asset of store.assets()) {
        if (asset.type === 'employer_stock') {
          map.set(asset.id, []);
        }
      }
      for (const grant of store.stockGrants()) {
        const list = map.get(grant.assetId) ?? [];
        list.push(grant);
        map.set(grant.assetId, list);
      }
      for (const [assetId, list] of map.entries()) {
        map.set(
          assetId,
          list.slice().sort((a, b) => a.grantDate.localeCompare(b.grantDate))
        );
      }
      return map;
    });

    const salesByAsset = computed<Map<string, StockSale[]>>(() => {
      const map = new Map<string, StockSale[]>();
      for (const sale of store.stockSales()) {
        if (!sale.sourceAssetId) continue;
        const list = map.get(sale.sourceAssetId) ?? [];
        list.push(sale);
        map.set(sale.sourceAssetId, list);
      }
      return map;
    });

    const quotesMap = computed<Map<string, MarketQuote>>(() => {
      const map = new Map<string, MarketQuote>();
      for (const quote of store.marketQuotes()) {
        map.set(quote.symbol.trim().toUpperCase(), quote);
      }
      return map;
    });

    const fxRatesMap = computed<Map<string, FxRate>>(() => {
      const map = new Map<string, FxRate>();
      for (const rate of store.fxRates()) {
        map.set(rate.pair.trim().toUpperCase(), rate);
      }
      return map;
    });

    const valuationContext = computed<AssetValuationContext>(() => ({
      today: store.today(),
      baseCurrency: store.settings().baseCurrency || 'PLN',
      grantsByAsset: grantsByAsset(),
      salesByAsset: salesByAsset(),
      quotes: quotesMap(),
      fxRates: fxRatesMap(),
      nowMs: Date.now(),
    }));

    const assetValuations = computed<Map<string, AssetValuation>>(() =>
      valueAssets(store.assets(), valuationContext())
    );

    const valuedAssets = computed<Asset[]>(() => {
      const valuations = assetValuations();
      return store.assets().map((asset) => {
        const valuation = valuations.get(asset.id);
        return valuation ? toValuedAsset(asset, valuation) : asset;
      });
    });

    const employerStockSnapshots = computed<Map<string, EmployerStockSnapshot>>(
      () => {
        const map = new Map<string, EmployerStockSnapshot>();
        const grantsMap = grantsByAsset();
        const salesMap = salesByAsset();
        const today = store.today();
        for (const asset of employerStockAssets()) {
          const grants = grantsMap.get(asset.id) ?? [];
          const sales = salesMap.get(asset.id) ?? [];
          map.set(
            asset.id,
            employerStockSnapshot(asset, grants, sales, today)
          );
        }
        return map;
      }
    );

    const projectedInflows = computed<ProjectedInflow[]>(() =>
      collectProjectedInflows(store.assets(), valuationContext(), {
        goalEligibleOnly: true,
      })
    );

    const wealthSummary = computed(() => {
      return calculator.calculateWealthSummary(
        valuedAssets(),
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
      const refDate = parseIsoDateLocal(store.today());
      return calculator.calculateFinancialCushionStatus(
        wealth.goalEligibleWealth,
        store.settings().cushion,
        surplus,
        refDate,
        projectedInflows()
      );
    });

    const goalsWithFunding = computed(() => {
      const wealth = wealthSummary();
      const surplus = monthlySurplusSummary().monthlySurplus;
      const refDate = parseIsoDateLocal(store.today());
      return calculator.calculateGoalsFundingSummary(
        goals(),
        wealth.availableForGoals,
        wealth.cushionDeficit,
        surplus,
        refDate,
        projectedInflows()
      );
    });

    const projectionSummary = computed(() => {
      const wealth = wealthSummary();
      const refDate = parseIsoDateLocal(store.today());
      return calculator.calculateProjectionSummary(
        store.incomeSources(),
        store.expenseCategories(),
        store.settings().cushion,
        goals(),
        wealth.availableForGoals,
        wealth.cushionDeficit,
        refDate,
        projectedInflows()
      );
    });

    return {
      goals,
      activeGoal,
      upcomingGoals,
      skippedGoals,
      completedGoals,
      valuationContext,
      assetValuations,
      valuedAssets,
      employerStockSnapshots,
      grantsByAsset,
      projectedInflows,
      employerStockAssets,
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
    const injector = inject(Injector);
    let marketDataService: MarketDataService | null = null;

    function getMarketDataService(): MarketDataService {
      if (!marketDataService) {
        marketDataService = injector.get(MarketDataService);
      }
      return marketDataService;
    }

    return {
      setLoading(isLoading: boolean) {
        patchState(store, { isLoading });
      },

      setError(error: string | null) {
        patchState(store, { error });
      },

      refreshToday(dateOverride?: string): void {
        patchState(store, {
          today:
            dateOverride && dateOverride.trim()
              ? dateOverride.trim().slice(0, 10)
              : todayIsoString(),
        });
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
            stockGrants,
            marketQuotes,
            fxRates,
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
            storage.getAllStockGrants(),
            storage.getAllMarketQuotes(),
            storage.getAllFxRates(),
          ]);

          patchState(store, setAllEntities(goals), {
            assets,
            assetHistory,
            incomeSources,
            incomeRecords,
            expenseCategories,
            expenseRecords,
            stockSales,
            stockGrants,
            marketQuotes,
            fxRates,
            today: todayIsoString(),
            isLoading: false,
            error: null,
          });

          const isOnline =
            typeof navigator === 'undefined' || navigator.onLine !== false;
          if (isOnline && settings.twelveDataApiKey?.trim()) {
            void this.refreshMarketData().catch(() => undefined);
          }
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
          balance?: number;
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
          balance:
            assetInput.type === 'employer_stock'
              ? 0
              : Number(assetInput.balance) || 0,
          exchangeRateToBase: assetInput.exchangeRateToBase,
          employerStock: assetInput.employerStock,
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

      async toggleGoalEligible(
        id: string,
        isGoalEligible?: boolean
      ): Promise<Asset | undefined> {
        const current = store.assets().find((a) => a.id === id);
        if (!current) return undefined;
        return this.updateAsset(id, {
          isGoalEligible: isGoalEligible ?? !current.isGoalEligible,
        });
      },

      async deleteAsset(id: string): Promise<void> {
        await storage.deleteAsset(id);
        patchState(store, (state) => ({
          assets: state.assets.filter((a) => a.id !== id),
          assetHistory: state.assetHistory.filter((h) => h.assetId !== id),
          stockGrants: state.stockGrants.filter((g) => g.assetId !== id),
          stockSales: state.stockSales.map((s) =>
            s.sourceAssetId === id ? { ...s, sourceAssetId: undefined } : s
          ),
        }));
      },

      // --- Employer Stock Grants & Baseline Methods (arch §8) ---
      async addStockGrant(
        input: Omit<StockGrant, 'id' | 'createdAt' | 'updatedAt'> &
          Partial<Pick<StockGrant, 'id' | 'createdAt' | 'updatedAt'>>
      ): Promise<StockGrant> {
        const now = new Date().toISOString();
        const newGrant: StockGrant = {
          ...input,
          id: input.id || generateId(),
          name: input.name?.trim() || undefined,
          createdAt: input.createdAt || now,
          updatedAt: input.updatedAt || now,
        };

        await storage.saveStockGrant(newGrant);
        patchState(store, (state) => ({
          stockGrants: [...state.stockGrants, newGrant],
        }));
        return newGrant;
      },

      async updateStockGrant(
        id: string,
        patch: Partial<StockGrant>
      ): Promise<StockGrant | undefined> {
        const current = store.stockGrants().find((g) => g.id === id);
        if (!current) return undefined;

        const updated: StockGrant = {
          ...current,
          ...patch,
          id,
          updatedAt: new Date().toISOString(),
        };

        await storage.saveStockGrant(updated);
        patchState(store, (state) => ({
          stockGrants: state.stockGrants.map((g) =>
            g.id === id ? updated : g
          ),
        }));
        return updated;
      },

      async deleteStockGrant(id: string): Promise<void> {
        await storage.deleteStockGrant(id);
        patchState(store, (state) => ({
          stockGrants: state.stockGrants.filter((g) => g.id !== id),
        }));
      },

      async setVestedSharesBaseline(
        assetId: string,
        shares: number,
        date?: string
      ): Promise<Asset | undefined> {
        const current = store.assets().find((a) => a.id === assetId);
        if (!current) return undefined;

        const baselineDate =
          date && date.trim() ? date.trim().slice(0, 10) : store.today();
        const updatedDetails: EmployerStockDetails = {
          tickerSymbol: current.employerStock?.tickerSymbol ?? '',
          ...current.employerStock,
          vestedSharesBaseline: Math.max(0, Number(shares) || 0),
          vestedSharesBaselineDate: baselineDate,
        };

        return this.updateAsset(assetId, { employerStock: updatedDetails });
      },

      async clearVestedSharesBaseline(
        assetId: string
      ): Promise<Asset | undefined> {
        const current = store.assets().find((a) => a.id === assetId);
        if (!current) return undefined;

        const updatedDetails: EmployerStockDetails = {
          tickerSymbol: current.employerStock?.tickerSymbol ?? '',
          ...current.employerStock,
          vestedSharesBaseline: undefined,
          vestedSharesBaselineDate: undefined,
        };

        return this.updateAsset(assetId, { employerStock: updatedDetails });
      },

      // --- Market Data Methods (arch §8) ---
      async lookupTicker(symbol: string): Promise<MarketQuote> {
        const quote = await getMarketDataService().lookupSymbol(symbol);
        const symUpper = quote.symbol.trim().toUpperCase();
        patchState(store, (state) => {
          const filtered = state.marketQuotes.filter(
            (q) => q.symbol.trim().toUpperCase() !== symUpper
          );
          return { marketQuotes: [...filtered, quote] };
        });
        return quote;
      },

      async refreshMarketData(opts?: {
        force?: boolean;
      }): Promise<MarketRefreshResult> {
        patchState(store, { marketDataRefreshing: true });
        try {
          const mds = getMarketDataService();
          const tickers = Array.from(
            new Set(
              store
                .employerStockAssets()
                .map((a) => a.employerStock?.tickerSymbol?.trim().toUpperCase() ?? '')
                .filter(Boolean)
            )
          );

          const quoteResult = await mds.refreshQuotes(tickers, opts);
          const marketQuotes = await storage.getAllMarketQuotes();

          const baseCurrency = (
            store.settings().baseCurrency || 'PLN'
          ).toUpperCase();
          const quoteBySymbol = new Map(
            marketQuotes.map((q) => [q.symbol.trim().toUpperCase(), q])
          );

          const currencies = new Set<string>();
          for (const asset of store.assets()) {
            if (asset.currency) {
              currencies.add(asset.currency.trim().toUpperCase());
            }
            if (asset.type === 'employer_stock') {
              const sym = asset.employerStock?.tickerSymbol?.trim().toUpperCase();
              const q = sym ? quoteBySymbol.get(sym) : undefined;
              if (q?.currency) {
                currencies.add(q.currency.trim().toUpperCase());
              }
            }
          }
          currencies.delete(baseCurrency);

          const fxResult = await mds.refreshFxRates(
            Array.from(currencies),
            baseCurrency,
            opts
          );
          const fxRates = await storage.getAllFxRates();

          const combined: MarketRefreshResult = {
            updated: [...quoteResult.updated, ...fxResult.updated],
            skipped: [...quoteResult.skipped, ...fxResult.skipped],
            errors: [...quoteResult.errors, ...fxResult.errors],
          };

          patchState(store, {
            marketQuotes,
            fxRates,
            marketDataRefreshing: false,
            lastMarketRefresh: combined,
          });
          return combined;
        } catch (err: unknown) {
          patchState(store, { marketDataRefreshing: false });
          throw err;
        }
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
          incomeRecords: state.incomeRecords.map((r) =>
            r.id === id ? updated : r
          ),
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
            store
              .incomeRecords()
              .filter((r) => r.isActual && !r.isReflectedInBalances)
              .map((r) => r.id)
        );
        const expenseIds = new Set(
          ids?.expenseIds ??
            store
              .expenseRecords()
              .filter((r) => r.isActual && !r.isReflectedInBalances)
              .map((r) => r.id)
        );
        const income = store
          .incomeRecords()
          .map((r) =>
            incomeIds.has(r.id) ? { ...r, isReflectedInBalances: true } : r
          );
        const expenses = store
          .expenseRecords()
          .map((r) =>
            expenseIds.has(r.id) ? { ...r, isReflectedInBalances: true } : r
          );
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
          expenseRecords: state.expenseRecords.map((r) =>
            r.id === id ? updated : r
          ),
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
          sourceAssetId: saleInput.sourceAssetId,
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
