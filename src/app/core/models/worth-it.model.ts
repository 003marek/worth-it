export type GoalCompletionChoice = 'spend' | 'reserve' | 'release';

export type AssetType =
  | 'bank_account'
  | 'cash'
  | 'stocks_etf'
  | 'employer_stock'
  | 'retirement'
  | 'other';

export type IncomeType = 'salary' | 'other';

export type IncomeFrequency = 'monthly' | 'one_time' | 'annual';

export type DashboardLayout = 'goal_first' | 'financial_overview';

export type AppTheme = 'light' | 'dark' | 'system';

export interface Goal {
  id: string;
  name: string;
  targetAmount: number;
  order: number;
  isCompleted: boolean;
  completionChoice?: GoalCompletionChoice;
  spentAmount?: number;
  reservedAmount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Asset {
  id: string;
  name: string;
  type: AssetType;
  currency: string;
  balance: number;
  isGoalEligible: boolean;
  updatedAt: string;
}

export interface AssetBalanceHistory {
  id: string;
  assetId: string;
  balance: number;
  date: string;
  note?: string;
}

export interface IncomeSource {
  id: string;
  name: string;
  type: IncomeType;
  amount: number;
  currency: string;
  frequency: IncomeFrequency;
  isEnabled: boolean;
  effectiveDate?: string;
}

export interface IncomeRecord {
  id: string;
  incomeSourceId?: string;
  name: string;
  type: IncomeType;
  amount: number;
  currency: string;
  receivedDate: string;
  isActual: boolean;
  note?: string;
}

export interface ExpenseCategory {
  id: string;
  name: string;
  expectedMonthlyAmount: number;
  currency: string;
  isEnabled: boolean;
  order: number;
}

export interface ExpenseRecord {
  id: string;
  categoryId?: string;
  categoryName: string;
  amount: number;
  currency: string;
  date: string;
  isActual: boolean;
  note?: string;
}

export interface FinancialCushionSettings {
  isEnabled: boolean;
  averageMonthlyExpenses: number;
  coverageMonths: number;
}

export interface StockSale {
  id: string;
  companyOrTicker: string;
  saleDate: string;
  sharesSold: number;
  pricePerShare: number;
  currency: string;
  grossValue: number;
  plnEquivalent?: number;
  notes?: string;
}

export interface ApplicationSettings {
  id: string;
  baseCurrency: string;
  defaultDashboard: DashboardLayout;
  theme: AppTheme;
  cushion: FinancialCushionSettings;
}

export interface WealthSummary {
  totalWealth: number;
  goalEligibleWealth: number;
  excludedWealth: number;
  cushionTarget: number;
  cushionFunded: number;
  cushionDeficit: number;
  cushionPercent: number;
  isCushionFullyFunded: boolean;
  reservedAmounts: number;
  availableForGoals: number;
}

export interface FinancialCushionStatus {
  target: number;
  funded: number;
  deficit: number;
  percent: number;
  isFullyFunded: boolean;
  isEnabled: boolean;
  estimatedCompletionMonths: number | null;
  estimatedCompletionDate: string | null;
}

export interface MonthlySurplusSummary {
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlySurplus: number;
}

export interface GoalFundingSummary {
  goal: Goal;
  currentProgress: number;
  remainingAmount: number;
  progressPercent: number;
  isFullyFunded: boolean;
  estimatedCompletionMonths: number | null;
  estimatedCompletionDate: string | null;
}

export interface ProjectionSummary {
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlySurplus: number;
  cushionMonthsToFund: number | null;
  cushionEstimatedCompletionDate: string | null;
  goalsTimeline: GoalFundingSummary[];
}

export interface WorthItBackupData {
  version: number;
  exportedAt: string;
  appName: string;
  data: {
    goals: Goal[];
    assets: Asset[];
    assetHistory: AssetBalanceHistory[];
    incomeSources: IncomeSource[];
    incomeRecords: IncomeRecord[];
    expenseCategories: ExpenseCategory[];
    expenseRecords: ExpenseRecord[];
    stockSales: StockSale[];
    settings: ApplicationSettings[];
  };
}
