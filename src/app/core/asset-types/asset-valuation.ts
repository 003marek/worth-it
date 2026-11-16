import { Asset } from '../models/worth-it.model';
import {
  AssetValuation,
  AssetValuationContext,
  ProjectedInflow,
  resolveFxRate,
} from './asset-type-handler';
import { getAssetTypeHandler } from './asset-type-registry';
import { compareIsoDates } from './date-utils';

export { resolveFxRate };

export function valueAssets(
  assets: readonly Asset[],
  ctx: AssetValuationContext
): Map<string, AssetValuation> {
  const result = new Map<string, AssetValuation>();
  for (const asset of assets) {
    const handler = getAssetTypeHandler(asset.type);
    result.set(asset.id, handler.value(asset, ctx));
  }
  return result;
}

/**
 * Adapter for the existing calculator:
 * balance := valueInAssetCurrency, exchangeRateToBase := fxRateToBase.
 */
export function toValuedAsset(asset: Asset, v: AssetValuation): Asset {
  return {
    ...asset,
    balance: v.valueInAssetCurrency,
    exchangeRateToBase: v.fxRateToBase,
  };
}

/**
 * Collects future projected inflows across assets, sorted chronologically by date.
 * By default only includes goal-eligible assets (`goalEligibleOnly = true`).
 */
export function collectProjectedInflows(
  assets: readonly Asset[],
  ctx: AssetValuationContext,
  opts?: { goalEligibleOnly?: boolean }
): ProjectedInflow[] {
  const goalEligibleOnly = opts?.goalEligibleOnly ?? true;
  const targetAssets = goalEligibleOnly
    ? assets.filter((a) => a.isGoalEligible)
    : assets;

  const inflows: ProjectedInflow[] = [];
  for (const asset of targetAssets) {
    const handler = getAssetTypeHandler(asset.type);
    inflows.push(...handler.projectedInflows(asset, ctx));
  }

  return inflows.sort((a, b) => {
    const cmp = compareIsoDates(a.date, b.date);
    return cmp !== 0 ? cmp : a.sourceId.localeCompare(b.sourceId);
  });
}
