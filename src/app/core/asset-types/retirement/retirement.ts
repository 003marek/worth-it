import {
  RETIREMENT_LIMIT_PRESETS_2026,
  RetirementAccountKind,
  RetirementDetails,
  RetirementSnapshot,
  RetirementTransfer,
} from '../../models/retirement.model';
import { Asset } from '../../models/worth-it.model';

/**
 * Resolves normalized RetirementDetails for a `retirement` asset.
 */
export function resolveRetirementDetails(
  asset: Pick<Asset, 'name' | 'retirement'>,
  evalYear: number
): Required<RetirementDetails> {
  const raw = asset.retirement;
  const inferredKind: RetirementAccountKind =
    raw?.accountKind ??
    (/\bikze\b/i.test(asset.name)
      ? 'ikze_standard'
      : /\bike\b/i.test(asset.name)
        ? 'ike'
        : 'custom');

  const defaultLimit =
    inferredKind !== 'custom' ? RETIREMENT_LIMIT_PRESETS_2026[inferredKind] : 0;

  const annualLimit =
    raw?.annualLimit !== undefined && Number.isFinite(Number(raw.annualLimit))
      ? Math.max(0, Math.round(Number(raw.annualLimit) * 100) / 100)
      : defaultLimit;

  const ytdContributionsBaseline = Math.max(
    0,
    Math.round((Number(raw?.ytdContributionsBaseline) || 0) * 100) / 100
  );
  const ytdBaselineYear = Number(raw?.ytdBaselineYear) || evalYear;

  return {
    accountKind: inferredKind,
    annualLimit,
    ytdContributionsBaseline,
    ytdBaselineYear,
  };
}

/**
 * Computes the annual contribution limit snapshot for a `retirement` asset in the year of `evalDate` (spec §8.3).
 */
export function retirementSnapshot(
  asset: Asset,
  transfers: readonly RetirementTransfer[],
  evalDate: string
): RetirementSnapshot {
  const year = Number(evalDate.slice(0, 4)) || new Date().getFullYear();
  const details = resolveRetirementDetails(asset, year);

  const baselineYtd =
    details.ytdBaselineYear === year ? details.ytdContributionsBaseline : 0;

  const transferredYtd =
    Math.round(
      transfers
        .filter(
          (tr) =>
            tr.toAssetId === asset.id &&
            Number(tr.date.slice(0, 4)) === year &&
            Number.isFinite(Number(tr.amount)) &&
            Number(tr.amount) > 0
        )
        .reduce((acc, tr) => acc + Number(tr.amount), 0) * 100
    ) / 100;

  const contributedYtd = Math.round((baselineYtd + transferredYtd) * 100) / 100;
  const annualLimit = details.annualLimit;
  const remainingLimit =
    annualLimit > 0
      ? Math.max(0, Math.round((annualLimit - contributedYtd) * 100) / 100)
      : 0;
  const limitUsagePercent =
    annualLimit > 0
      ? Math.min(
          100,
          Math.max(0, Math.round(((contributedYtd / annualLimit) * 100) * 10) / 10)
        )
      : 0;
  const isLimitReached = annualLimit > 0 && contributedYtd >= annualLimit;

  return {
    assetId: asset.id,
    year,
    accountKind: details.accountKind,
    annualLimit,
    baselineYtd,
    transferredYtd,
    contributedYtd,
    remainingLimit,
    limitUsagePercent,
    isLimitReached,
  };
}
