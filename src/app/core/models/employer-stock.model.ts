export type VestingFrequency = 'monthly' | 'quarterly' | 'annual';

export interface VestingScheduleParams {
  frequency: VestingFrequency;
  /** Total vesting period in months (e.g. 12, 24, 36, 48). Must be a multiple of the period length. */
  durationMonths: number;
  /** Months after grantDate before the first vest. 0 = no cliff. Tranches before the cliff are merged into the cliff tranche. */
  cliffMonths: number;
  /** Optional explicit first vest date (yyyy-mm-dd). If set, tranche k vests at firstVestDate + (k-1)·period; cliff is ignored. */
  firstVestDate?: string;
}

export interface VestingTranche {
  id: string;
  vestDate: string; // yyyy-mm-dd
  shares: number;   // > 0
}

export interface StockGrant {
  id: string;
  assetId: string;          // FK → Asset.id (type 'employer_stock')
  name?: string;
  grantDate: string;        // yyyy-mm-dd
  totalShares: number;      // net shares (no tax handling — spec §8)
  schedule: VestingScheduleParams;
  /** Concrete, user-editable schedule. Source of truth for all math. */
  tranches: VestingTranche[];
  /** true once the user edited any tranche manually (UI warns before regenerating). */
  isScheduleCustomized: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Type-specific configuration stored on Asset.employerStock. */
export interface EmployerStockDetails {
  tickerSymbol: string;               // upper-case, e.g. 'GOOGL'
  /** Optional baseline: the user states "I hold N vested shares as of date D" (spec §6.1/§6.3). */
  vestedSharesBaseline?: number;
  vestedSharesBaselineDate?: string;  // yyyy-mm-dd, required when baseline is set
  /** Manual fallbacks used when no cached API value exists (or the user prefers manual). */
  manualPrice?: number;               // in Asset.currency
  manualFxRate?: number;              // 1 Asset.currency = N base currency
}

export interface EmployerStockSnapshot {
  assetId: string;
  date: string;
  totalGrantedShares: number;
  vestedSharesGross: number;   // Σ tranches with vestDate ≤ date (ignores baseline)
  heldShares: number;          // per spec §6.3 (baseline-aware, minus linked sales)
  unvestedShares: number;      // Σ tranches with vestDate > date
  soldSharesCounted: number;   // linked sales actually subtracted
  nextVest?: { date: string; shares: number };
}
