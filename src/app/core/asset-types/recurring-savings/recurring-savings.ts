import {
  RecurringSavingsDetails,
  RecurringSavingsSnapshot,
} from '../../models/recurring-savings.model';
import { Asset } from '../../models/worth-it.model';
import { addMonthsClamped, compareIsoDates, toIsoDate } from '../date-utils';

/**
 * Normalizes a RecurringSavingsDetails object from an Asset, falling back safely
 * when optional fields are missing.
 */
export function resolveRecurringSavingsDetails(
  asset: Pick<Asset, 'balance' | 'recurringSavings'>,
  fallbackDate: string
): RecurringSavingsDetails {
  const raw = asset.recurringSavings;
  const baselineAmount = Math.max(
    0,
    Math.round((Number(raw?.baselineAmount ?? asset.balance) || 0) * 100) / 100
  );
  const baselineDate =
    raw?.baselineDate && raw.baselineDate.trim()
      ? toIsoDate(raw.baselineDate.trim())
      : toIsoDate(fallbackDate);
  const monthlyContribution = Math.max(
    0,
    Math.round((Number(raw?.monthlyContribution) || 0) * 100) / 100
  );
  const isContributing = raw?.isContributing ?? true;

  return {
    baselineAmount,
    baselineDate,
    monthlyContribution,
    isContributing,
  };
}

/**
 * Pure calculation of completed monthly contribution intervals m(t) since baselineDate (spec §7.3):
 * m(t) = max { k >= 0 | addMonthsClamped(baselineDate, k) <= evalDate } when isContributing && evalDate >= baselineDate,
 * else 0.
 */
export function elapsedContributionMonths(
  baselineDate: string,
  evalDate: string,
  isContributing = true
): number {
  if (!isContributing || !baselineDate?.trim() || !evalDate?.trim()) {
    return 0;
  }

  const baseIso = toIsoDate(baselineDate.trim());
  const evalIso = toIsoDate(evalDate.trim());

  if (compareIsoDates(evalIso, baseIso) < 0) {
    return 0;
  }

  const [y1, m1] = baseIso.split('-').map(Number);
  const [y2, m2] = evalIso.split('-').map(Number);
  if (
    !Number.isFinite(y1) ||
    !Number.isFinite(m1) ||
    !Number.isFinite(y2) ||
    !Number.isFinite(m2)
  ) {
    return 0;
  }

  let k = Math.max(0, (y2 - y1) * 12 + (m2 - m1));
  while (k > 0 && compareIsoDates(addMonthsClamped(baseIso, k), evalIso) > 0) {
    k--;
  }
  while (compareIsoDates(addMonthsClamped(baseIso, k + 1), evalIso) <= 0) {
    k++;
  }
  return k;
}

/**
 * Calculates the accrued balance at `evalDate` in the asset's currency (spec §7.3):
 * AccruedBalance(t) = baselineAmount + m(t) * monthlyContribution
 */
export function accruedBalanceAt(
  details: RecurringSavingsDetails,
  evalDate: string
): number {
  const base = Math.max(0, Number(details.baselineAmount) || 0);
  const monthly = Math.max(0, Number(details.monthlyContribution) || 0);
  const months = elapsedContributionMonths(
    details.baselineDate,
    evalDate,
    details.isContributing
  );
  return Math.round((base + months * monthly) * 100) / 100;
}

/**
 * Returns the next scheduled monthly contribution date strictly after `evalDate`
 * when `isContributing === true` and `monthlyContribution > 0`.
 */
export function nextContributionDateAfter(
  details: RecurringSavingsDetails,
  evalDate: string
): string | undefined {
  const monthly = Math.max(0, Number(details.monthlyContribution) || 0);
  if (!details.isContributing || monthly <= 0 || !details.baselineDate?.trim()) {
    return undefined;
  }

  const baseIso = toIsoDate(details.baselineDate.trim());
  const evalIso = toIsoDate(evalDate.trim());

  if (compareIsoDates(evalIso, baseIso) < 0) {
    return addMonthsClamped(baseIso, 1);
  }

  const months = elapsedContributionMonths(baseIso, evalIso, true);
  return addMonthsClamped(baseIso, months + 1);
}

/**
 * Builds the full RecurringSavingsSnapshot for an asset at `evalDate`.
 */
export function recurringSavingsSnapshot(
  asset: Asset,
  evalDate: string
): RecurringSavingsSnapshot {
  const evalIso = toIsoDate(evalDate.trim());
  const details = resolveRecurringSavingsDetails(asset, evalIso);
  const monthsElapsed = elapsedContributionMonths(
    details.baselineDate,
    evalIso,
    details.isContributing
  );
  const accruedContributions =
    Math.round(monthsElapsed * details.monthlyContribution * 100) / 100;
  const currentAccruedBalance =
    Math.round((details.baselineAmount + accruedContributions) * 100) / 100;
  const nextContributionDate = nextContributionDateAfter(details, evalIso);

  return {
    assetId: asset.id,
    date: evalIso,
    baselineAmount: details.baselineAmount,
    baselineDate: details.baselineDate,
    monthlyContribution: details.monthlyContribution,
    isContributing: details.isContributing,
    monthsElapsed,
    accruedContributions,
    currentAccruedBalance,
    nextContributionDate,
  };
}
