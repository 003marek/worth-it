import { AssetType } from '../models/worth-it.model';
import { AssetTypeHandler } from './asset-type-handler';
import { balanceHandler, createBalanceHandler } from './balance.handler';
import { employerStockHandler } from './employer-stock/employer-stock.handler';

export const ASSET_TYPE_HANDLERS: Readonly<Record<AssetType, AssetTypeHandler>> = {
  bank_account: createBalanceHandler('bank_account'),
  cash: createBalanceHandler('cash'),
  stocks_etf: createBalanceHandler('stocks_etf'),
  employer_stock: employerStockHandler,
  retirement: createBalanceHandler('retirement'),
  other: createBalanceHandler('other'),
};

export function getAssetTypeHandler(type: AssetType): AssetTypeHandler {
  return ASSET_TYPE_HANDLERS[type] ?? balanceHandler;
}
