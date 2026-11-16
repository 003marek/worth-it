import {
  EmployerStockDetails,
  EmployerStockSnapshot,
  StockGrant,
  VestingFrequency,
  VestingScheduleParams,
  VestingTranche,
} from '../../models/employer-stock.model';
import { Asset, StockSale } from '../../models/worth-it.model';
import { addMonthsClamped, compareIsoDates } from '../date-utils';

const PERIOD_MONTHS: Readonly<Record<VestingFrequency, number>> = {
  monthly: 1,
  quarterly: 3,
  annual: 12,
};

function defaultIdFactory(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'tranche_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
}

function roundShares(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/**
 * Generates concrete vesting tranches according to arch §4.2 rules:
 * - Period months: monthly 1, quarterly 3, annual 12. n = durationMonths / period (reject non-integer).
 * - Without firstVestDate: tranche k vests at addMonthsClamped(grantDate, k·period), k = 1..n.
 *   Tranches whose date is before addMonthsClamped(grantDate, cliffMonths) are merged into the first
 *   tranche on/after the cliff date.
 * - With firstVestDate: k-th at addMonthsClamped(firstVestDate, (k-1)·period); cliff is ignored.
 * - Share split: if totalShares is an integer -> shares_k = floor(T·k/n) - floor(T·(k-1)/n).
 *   Otherwise equal split rounded to 4 decimals with the last tranche absorbing the remainder.
 */
export function generateTranches(
  grantDate: string,
  totalShares: number,
  params: VestingScheduleParams,
  idFactory: () => string = defaultIdFactory
): VestingTranche[] {
  const period = PERIOD_MONTHS[params.frequency];
  if (!period) {
    throw new Error(`Invalid vesting frequency: ${String(params.frequency)}`);
  }
  if (
    !Number.isFinite(params.durationMonths) ||
    params.durationMonths <= 0 ||
    params.durationMonths % period !== 0
  ) {
    throw new Error(
      `durationMonths (${params.durationMonths}) must be a positive multiple of ${period}`
    );
  }
  if (!Number.isFinite(totalShares) || totalShares <= 0) {
    throw new Error(`totalShares (${totalShares}) must be greater than 0`);
  }

  const n = params.durationMonths / period;
  const isWholeShares = Number.isInteger(totalShares);
  const equalBase = isWholeShares ? 0 : roundShares(totalShares / n);

  const rawTranches: Array<{ vestDate: string; shares: number }> = [];
  const hasExplicitFirstVest = Boolean(params.firstVestDate && params.firstVestDate.trim());
  const firstVestAnchor = hasExplicitFirstVest ? params.firstVestDate!.trim() : grantDate;

  for (let k = 1; k <= n; k++) {
    const vestDate = hasExplicitFirstVest
      ? addMonthsClamped(firstVestAnchor, (k - 1) * period)
      : addMonthsClamped(grantDate, k * period);

    let shares: number;
    if (isWholeShares) {
      shares =
        Math.floor((totalShares * k) / n) - Math.floor((totalShares * (k - 1)) / n);
    } else if (k < n) {
      shares = equalBase;
    } else {
      shares = roundShares(totalShares - equalBase * (n - 1));
    }

    rawTranches.push({ vestDate, shares });
  }

  // Apply cliff merge only when firstVestDate is not set and cliffMonths > 0
  let merged = rawTranches;
  if (!hasExplicitFirstVest && params.cliffMonths > 0) {
    const cliffDate = addMonthsClamped(grantDate, params.cliffMonths);
    const firstOnOrAfterIdx = rawTranches.findIndex(
      (t) => compareIsoDates(t.vestDate, cliffDate) >= 0
    );

    if (firstOnOrAfterIdx > 0) {
      let preCliffShares = 0;
      for (let i = 0; i < firstOnOrAfterIdx; i++) {
        preCliffShares = roundShares(preCliffShares + rawTranches[i].shares);
      }
      const targetTranche = rawTranches[firstOnOrAfterIdx];
      merged = [
        {
          vestDate: targetTranche.vestDate,
          shares: roundShares(preCliffShares + targetTranche.shares),
        },
        ...rawTranches.slice(firstOnOrAfterIdx + 1),
      ];
    } else if (firstOnOrAfterIdx === -1 && rawTranches.length > 0) {
      // Cliff exceeds entire schedule duration: merge all into a single tranche at cliffDate
      const total = rawTranches.reduce((acc, t) => roundShares(acc + t.shares), 0);
      merged = [{ vestDate: cliffDate, shares: total }];
    }
  }

  return merged
    .filter((t) => t.shares > 0)
    .map((t) => ({
      id: idFactory(),
      vestDate: t.vestDate,
      shares: t.shares,
    }));
}

/**
 * Sum of all tranche shares across grants with vestDate <= date (ignores baseline).
 */
export function vestedSharesAt(grants: readonly StockGrant[], date: string): number {
  let sum = 0;
  for (const grant of grants) {
    for (const tranche of grant.tranches) {
      if (compareIsoDates(tranche.vestDate, date) <= 0) {
        sum += Number(tranche.shares) || 0;
      }
    }
  }
  return roundShares(sum);
}

/**
 * Sum of all tranche shares across grants with vestDate > date.
 */
export function unvestedSharesAt(grants: readonly StockGrant[], date: string): number {
  let sum = 0;
  for (const grant of grants) {
    for (const tranche of grant.tranches) {
      if (compareIsoDates(tranche.vestDate, date) > 0) {
        sum += Number(tranche.shares) || 0;
      }
    }
  }
  return roundShares(sum);
}

function hasActiveBaselineAt(
  details: EmployerStockDetails | undefined,
  date: string
): details is EmployerStockDetails & {
  vestedSharesBaseline: number;
  vestedSharesBaselineDate: string;
} {
  if (!details) return false;
  if (
    details.vestedSharesBaseline === undefined ||
    details.vestedSharesBaseline === null ||
    !Number.isFinite(details.vestedSharesBaseline)
  ) {
    return false;
  }
  if (!details.vestedSharesBaselineDate || !details.vestedSharesBaselineDate.trim()) {
    return false;
  }
  return compareIsoDates(date, details.vestedSharesBaselineDate) >= 0;
}

/**
 * Held vested shares at `date` per spec §6.3 and arch §4.2:
 * - Without baseline (or when date < baselineDate):
 *   max(0, vested(<=date) - Σ linked sales with saleDate <= date)
 * - With baseline (B, D) and date >= D:
 *   max(0, B + Σ tranches D < vestDate <= date - Σ sales D < saleDate <= date)
 */
export function heldSharesAt(
  details: EmployerStockDetails,
  grants: readonly StockGrant[],
  sales: readonly StockSale[],
  date: string
): number {
  if (hasActiveBaselineAt(details, date)) {
    const baselineDate = details.vestedSharesBaselineDate;
    let vestedAfter = 0;
    for (const grant of grants) {
      for (const tranche of grant.tranches) {
        if (
          compareIsoDates(tranche.vestDate, baselineDate) > 0 &&
          compareIsoDates(tranche.vestDate, date) <= 0
        ) {
          vestedAfter += Number(tranche.shares) || 0;
        }
      }
    }

    let soldAfter = 0;
    for (const sale of sales) {
      if (
        compareIsoDates(sale.saleDate, baselineDate) > 0 &&
        compareIsoDates(sale.saleDate, date) <= 0
      ) {
        soldAfter += Number(sale.sharesSold) || 0;
      }
    }

    return Math.max(
      0,
      roundShares(details.vestedSharesBaseline + vestedAfter - soldAfter)
    );
  }

  const vested = vestedSharesAt(grants, date);
  let sold = 0;
  for (const sale of sales) {
    if (compareIsoDates(sale.saleDate, date) <= 0) {
      sold += Number(sale.sharesSold) || 0;
    }
  }
  return Math.max(0, roundShares(vested - sold));
}

/**
 * Returns all future tranches across `grants` with vestDate > after, sorted by vestDate ascending.
 */
export function futureTranches(
  grants: readonly StockGrant[],
  after: string
): Array<VestingTranche & { grantId: string }> {
  const result: Array<VestingTranche & { grantId: string }> = [];
  for (const grant of grants) {
    for (const tranche of grant.tranches) {
      if (compareIsoDates(tranche.vestDate, after) > 0) {
        result.push({
          ...tranche,
          grantId: grant.id,
        });
      }
    }
  }
  return result.sort((a, b) => {
    const cmp = compareIsoDates(a.vestDate, b.vestDate);
    return cmp !== 0 ? cmp : a.id.localeCompare(b.id);
  });
}

/**
 * Computes a complete snapshot of an employer_stock asset at `date`.
 */
export function employerStockSnapshot(
  asset: Asset,
  grants: readonly StockGrant[],
  sales: readonly StockSale[],
  date: string
): EmployerStockSnapshot {
  const details: EmployerStockDetails = asset.employerStock ?? { tickerSymbol: '' };
  const assetGrants = grants.filter((g) => !g.assetId || g.assetId === asset.id);
  const assetSales = sales.filter((s) => !s.sourceAssetId || s.sourceAssetId === asset.id);

  const totalGrantedShares = roundShares(
    assetGrants.reduce((acc, g) => acc + (Number(g.totalShares) || 0), 0)
  );
  const vestedSharesGross = vestedSharesAt(assetGrants, date);
  const heldShares = heldSharesAt(details, assetGrants, assetSales, date);
  const unvestedShares = unvestedSharesAt(assetGrants, date);

  let soldSharesCounted = 0;
  if (hasActiveBaselineAt(details, date)) {
    const baselineDate = details.vestedSharesBaselineDate;
    for (const sale of assetSales) {
      if (
        compareIsoDates(sale.saleDate, baselineDate) > 0 &&
        compareIsoDates(sale.saleDate, date) <= 0
      ) {
        soldSharesCounted += Number(sale.sharesSold) || 0;
      }
    }
  } else {
    for (const sale of assetSales) {
      if (compareIsoDates(sale.saleDate, date) <= 0) {
        soldSharesCounted += Number(sale.sharesSold) || 0;
      }
    }
  }
  soldSharesCounted = roundShares(soldSharesCounted);

  const upcoming = futureTranches(assetGrants, date);
  let nextVest: { date: string; shares: number } | undefined;
  if (upcoming.length > 0) {
    const nextDate = upcoming[0].vestDate;
    const nextShares = roundShares(
      upcoming
        .filter((t) => compareIsoDates(t.vestDate, nextDate) === 0)
        .reduce((acc, t) => acc + (Number(t.shares) || 0), 0)
    );
    nextVest = { date: nextDate, shares: nextShares };
  }

  return {
    assetId: asset.id,
    date,
    totalGrantedShares,
    vestedSharesGross,
    heldShares,
    unvestedShares,
    soldSharesCounted,
    nextVest,
  };
}

/**
 * Validates a grant's tranches and returns an array of human-readable error messages
 * (empty array when valid).
 */
export function validateTranches(
  grant: Pick<StockGrant, 'totalShares' | 'tranches'>
): string[] {
  const errors: string[] = [];
  const tranches = grant.tranches ?? [];

  if (tranches.length === 0) {
    errors.push('At least one vesting tranche is required.');
    return errors;
  }

  const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
  let hasInvalidDate = false;
  let hasNonPositiveShares = false;
  let hasUnsortedDates = false;
  let hasDuplicateDates = false;
  const seenDates = new Set<string>();
  let sumShares = 0;

  for (let i = 0; i < tranches.length; i++) {
    const t = tranches[i];
    if (!t.vestDate || !isoDateRegex.test(t.vestDate)) {
      hasInvalidDate = true;
    } else {
      if (seenDates.has(t.vestDate)) {
        hasDuplicateDates = true;
      }
      seenDates.add(t.vestDate);

      if (i > 0 && isoDateRegex.test(tranches[i - 1].vestDate)) {
        const cmp = compareIsoDates(tranches[i - 1].vestDate, t.vestDate);
        if (cmp > 0) {
          hasUnsortedDates = true;
        }
      }
    }

    if (!Number.isFinite(t.shares) || t.shares <= 0) {
      hasNonPositiveShares = true;
    } else {
      sumShares += t.shares;
    }
  }

  if (hasInvalidDate) {
    errors.push('Every tranche must have a valid vest date (YYYY-MM-DD).');
  }
  if (hasNonPositiveShares) {
    errors.push('Every tranche must have more than 0 shares.');
  }
  if (hasDuplicateDates) {
    errors.push('Tranche vest dates must not contain duplicates.');
  }
  if (hasUnsortedDates) {
    errors.push('Tranches must be sorted by vest date in ascending order.');
  }

  const roundedSum = roundShares(sumShares);
  const totalShares = Number(grant.totalShares) || 0;
  if (Math.abs(roundedSum - totalShares) > 0.0001) {
    errors.push(
      `Sum of tranche shares (${roundedSum}) must equal total granted shares (${totalShares}).`
    );
  }

  return errors;
}
