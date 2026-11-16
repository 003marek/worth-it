import { EmployerStockDetails } from '../../models/employer-stock.model';
import { MarketDataStatus } from '../../models/market-data.model';
import { Asset } from '../../models/worth-it.model';
import {
  AssetTypeHandler,
  AssetValuation,
  AssetValuationContext,
  evaluateQuoteStatus,
  ProjectedInflow,
  resolveFxRate,
} from '../asset-type-handler';
import { compareIsoDates } from '../date-utils';
import { futureTranches, heldSharesAt } from './vesting';

interface ResolvedPrice {
  unitPrice?: number;
  priceStatus: MarketDataStatus;
  priceAsOf?: string;
  quoteCurrency?: string;
}

function resolvePrice(
  details: EmployerStockDetails,
  ctx: AssetValuationContext
): ResolvedPrice {
  const symbol = (details.tickerSymbol || '').trim().toUpperCase();
  const quote = symbol ? ctx.quotes.get(symbol) : undefined;

  if (quote && Number.isFinite(quote.price) && quote.price >= 0) {
    return {
      unitPrice: quote.price,
      priceStatus: evaluateQuoteStatus(quote.fetchedAt, ctx.nowMs),
      priceAsOf: quote.fetchedAt,
      quoteCurrency: quote.currency ? quote.currency.trim().toUpperCase() : undefined,
    };
  }

  if (
    details.manualPrice !== undefined &&
    details.manualPrice !== null &&
    Number.isFinite(details.manualPrice) &&
    details.manualPrice >= 0
  ) {
    return {
      unitPrice: details.manualPrice,
      priceStatus: 'manual',
    };
  }

  return {
    priceStatus: 'missing',
  };
}

export const employerStockHandler: AssetTypeHandler = {
  type: 'employer_stock',

  value(asset: Asset, ctx: AssetValuationContext): AssetValuation {
    const details: EmployerStockDetails = asset.employerStock ?? { tickerSymbol: '' };
    const grants = ctx.grantsByAsset.get(asset.id) ?? [];
    const sales = ctx.salesByAsset.get(asset.id) ?? [];

    const heldShares = heldSharesAt(details, grants, sales, ctx.today);
    const { unitPrice, priceStatus, priceAsOf, quoteCurrency } = resolvePrice(details, ctx);

    const effectiveCurrency = quoteCurrency || asset.currency || ctx.baseCurrency;
    const manualFx = details.manualFxRate ?? asset.exchangeRateToBase;
    const fx = resolveFxRate(effectiveCurrency, ctx.baseCurrency, ctx, manualFx);

    const price = unitPrice ?? 0;
    const valueInAssetCurrency = Math.round(heldShares * price * 100) / 100;
    const valueInBase = Math.round(valueInAssetCurrency * fx.rate * 100) / 100;

    return {
      assetId: asset.id,
      valueInAssetCurrency,
      fxRateToBase: fx.rate,
      valueInBase,
      priceStatus,
      fxStatus: fx.status,
      unitPrice,
      priceAsOf,
      fxAsOf: fx.asOf,
    };
  },

  projectedInflows(asset: Asset, ctx: AssetValuationContext): ProjectedInflow[] {
    const details: EmployerStockDetails = asset.employerStock ?? { tickerSymbol: '' };
    const grants = ctx.grantsByAsset.get(asset.id) ?? [];

    const { unitPrice, quoteCurrency } = resolvePrice(details, ctx);
    const effectiveCurrency = quoteCurrency || asset.currency || ctx.baseCurrency;
    const manualFx = details.manualFxRate ?? asset.exchangeRateToBase;
    const fx = resolveFxRate(effectiveCurrency, ctx.baseCurrency, ctx, manualFx);
    const price = unitPrice ?? 0;

    const hasFutureBaseline =
      details.vestedSharesBaseline !== undefined &&
      details.vestedSharesBaseline !== null &&
      Boolean(details.vestedSharesBaselineDate) &&
      compareIsoDates(details.vestedSharesBaselineDate!, ctx.today) > 0;

    const afterDate = hasFutureBaseline ? details.vestedSharesBaselineDate! : ctx.today;
    const upcoming = futureTranches(grants, afterDate);
    const symbolLabel = (details.tickerSymbol || '').trim().toUpperCase() || asset.name;

    return upcoming.map((tranche) => ({
      date: tranche.vestDate,
      amountInBase: Math.round(tranche.shares * price * fx.rate * 100) / 100,
      assetId: asset.id,
      sourceId: tranche.id,
      label: `${symbolLabel} vest · ${tranche.shares} sh`,
    }));
  },
};
