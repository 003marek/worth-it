/**
 * Type-specific configuration stored on Asset.recurringSavings (spec §7.2, §14.3).
 */
export interface RecurringSavingsDetails {
  /** Verified balance held in the account as of baselineDate (in Asset.currency, >= 0). */
  baselineAmount: number;
  /** Anchor date (yyyy-mm-dd) from which recurring monthly contributions accrue. */
  baselineDate: string;
  /** Single combined recurring monthly contribution amount (in Asset.currency, >= 0). */
  monthlyContribution: number;
  /** Whether monthly contributions are currently active (default true). */
  isContributing: boolean;
}

/**
 * Computed domain snapshot for a recurring_savings asset at a given evaluation date (spec §7.3, §14.3).
 */
export interface RecurringSavingsSnapshot {
  assetId: string;
  date: string;
  baselineAmount: number;
  baselineDate: string;
  monthlyContribution: number;
  isContributing: boolean;
  /** Number of completed monthly contribution intervals since baselineDate. */
  monthsElapsed: number;
  /** Total contributions accrued since baselineDate (monthsElapsed * monthlyContribution). */
  accruedContributions: number;
  /** Current total accrued balance (baselineAmount + accruedContributions) in Asset.currency. */
  currentAccruedBalance: number;
  /** Next scheduled monthly contribution date (yyyy-mm-dd) when isContributing === true and monthlyContribution > 0. */
  nextContributionDate?: string;
}
