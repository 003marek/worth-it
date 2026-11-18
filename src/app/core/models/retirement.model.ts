export type RetirementAccountKind = 'ike' | 'ikze_standard' | 'ikze_b2b' | 'custom';

/**
 * 2026 statutory Polish contribution limits in PLN (spec §8.1).
 */
export const RETIREMENT_LIMIT_PRESETS_2026: Readonly<
  Record<Exclude<RetirementAccountKind, 'custom'>, number>
> = {
  ike: 28260,
  ikze_standard: 11304,
  ikze_b2b: 16956,
};

export const RETIREMENT_ACCOUNT_KIND_OPTIONS: ReadonlyArray<{
  value: RetirementAccountKind;
  label: string;
  presetLimitPln?: number;
}> = [
  {
    value: 'ike',
    label: 'IKE (2026 limit: 28,260 PLN)',
    presetLimitPln: 28260,
  },
  {
    value: 'ikze_standard',
    label: 'IKZE — Standard (2026 limit: 11,304 PLN)',
    presetLimitPln: 11304,
  },
  {
    value: 'ikze_b2b',
    label: 'IKZE — Self-Employed / B2B (2026 limit: 16,956 PLN)',
    presetLimitPln: 16956,
  },
  {
    value: 'custom',
    label: 'Custom / Other retirement account',
  },
];

/**
 * Type-specific configuration stored on Asset.retirement (spec §8.1, §15.4).
 */
export interface RetirementDetails {
  accountKind: RetirementAccountKind;
  /** Annual contribution limit in the asset's currency (>= 0, 0 or undefined = no cap tracked). */
  annualLimit?: number;
  /** Optional prior YTD contributions made in `ytdBaselineYear` before recording transfers. */
  ytdContributionsBaseline?: number;
  /** Calendar year to which `ytdContributionsBaseline` applies (e.g. 2026). */
  ytdBaselineYear?: number;
}

/**
 * Record of a transfer from a `bank_account` or `cash` asset to a `retirement` (IKE/IKZE) asset (spec §8.2, §15.4).
 */
export interface RetirementTransfer {
  id: string;
  fromAssetId: string;
  fromAssetName: string;
  toAssetId: string;
  toAssetName: string;
  /** Amount added to the destination retirement asset (in destination asset currency, > 0). */
  amount: number;
  /** Amount deducted from the source cash/bank asset (in source asset currency, > 0). */
  sourceAmount: number;
  currency: string;
  /** Transfer date (yyyy-mm-dd). */
  date: string;
  note?: string;
  createdAt: string;
}

/**
 * Computed domain snapshot of annual contribution limit progress for a `retirement` asset (spec §8.3, §15.4).
 */
export interface RetirementSnapshot {
  assetId: string;
  year: number;
  accountKind: RetirementAccountKind;
  annualLimit: number;
  baselineYtd: number;
  transferredYtd: number;
  contributedYtd: number;
  remainingLimit: number;
  limitUsagePercent: number;
  isLimitReached: boolean;
}
