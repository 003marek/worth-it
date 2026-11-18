import { Asset } from '../../models/worth-it.model';
import {
  AssetTypeHandler,
  AssetValuation,
  AssetValuationContext,
  ProjectedInflow,
  resolveFxRate,
} from '../asset-type-handler';
import {
  accruedBalanceAt,
  resolveRecurringSavingsDetails,
} from './recurring-savings';

export const recurringSavingsHandler: AssetTypeHandler = {
  type: 'recurring_savings',

  value(asset: Asset, ctx: AssetValuationContext): AssetValuation {
    const details = resolveRecurringSavingsDetails(asset, ctx.today);
    const valueInAssetCurrency = accruedBalanceAt(details, ctx.today);
    const fx = resolveFxRate(
      asset.currency,
      ctx.baseCurrency,
      ctx,
      asset.exchangeRateToBase
    );
    const valueInBase = Math.round(valueInAssetCurrency * fx.rate * 100) / 100;

    return {
      assetId: asset.id,
      valueInAssetCurrency,
      fxRateToBase: fx.rate,
      valueInBase,
      priceStatus: 'manual',
      fxStatus: fx.status,
      fxAsOf: fx.asOf,
    };
  },

  projectedInflows(_asset: Asset, _ctx: AssetValuationContext): ProjectedInflow[] {
    // Recurring monthly contributions are incorporated into EffectiveMonthlySurplus (spec §10.2).
    return [];
  },
};
