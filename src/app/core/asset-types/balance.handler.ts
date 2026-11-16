import { Asset, AssetType } from '../models/worth-it.model';
import {
  AssetTypeHandler,
  AssetValuation,
  AssetValuationContext,
  ProjectedInflow,
  resolveFxRate,
} from './asset-type-handler';

export function createBalanceHandler(type: AssetType): AssetTypeHandler {
  return {
    type,
    value(asset: Asset, ctx: AssetValuationContext): AssetValuation {
      const valueInAssetCurrency = Math.round((Number(asset.balance) || 0) * 100) / 100;
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
      return [];
    },
  };
}

export const balanceHandler: AssetTypeHandler = createBalanceHandler('bank_account');
