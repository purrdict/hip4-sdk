/**
 * @purrdict/hip4 — barrel exports
 *
 * import {
 *   createClient,
 *   discoverMarkets,
 *   getMinShares,
 *   placeOrder,
 *   fairPrice,
 *   subscribePrices,
 * } from "@purrdict/hip4";
 */

// Client factory
export { createClient } from "./client.js";
export type { ClientConfig, HIP4Client } from "./client.js";

// Types, constants, and helpers
export {
  PREDICTION_ASSET_OFFSET,
  SPOT_ASSET_OFFSET,
  MIN_NOTIONAL,
  MAX_BUILDER_FEE,
  SIGNATURE_CHAIN_ID,
  KNOWN_TOKEN_IDS,
  outcomeToAsset,
  isResting,
  isFilled,
  isError,
} from "./types.js";
export type {
  HIP4Config,
  MarketType,
  ParsedDescription,
  Market,
  OrderStatus,
  OutcomeMeta,
  OutcomeEntry,
  QuestionEntry,
  L2Book,
  BookLevel,
  SpotState,
  OpenOrder,
  QuoteLevel,
  Quote,
  TokenBalance,
  Balances,
} from "./types.js";

// Market discovery
export {
  parseDescription,
  discoverMarkets,
  timeToExpiry,
  periodMinutes,
  formatLabel,
  getMinShares,
} from "./markets.js";

// Pricing
export {
  normalCDF,
  fairPrice,
  computeTickSize,
  roundToTick,
  formatPrice,
  stripZeros,
  computeQuote,
  scaledVol,
  BASE_VOL,
  DEFAULT_VOL,
} from "./pricing.js";

// Orders
export { placeOrder, placePerpOrder, cancelOrder, cancelAllOrders } from "./orders.js";
export type { OrderParams, PerpOrderParams } from "./orders.js";

// Wallet
export {
  getBalances,
  sendAsset,
  usdClassTransfer,
  approveBuilderFee,
  checkBuilderApproval,
  ensureBuilderApproval,
  resolveToken,
} from "./wallet.js";

// Subscriptions
export {
  subscribePrices,
  subscribeBook,
  subscribeTrades,
  subscribeUserFills,
} from "./subscriptions.js";
export type {
  PriceUpdate,
  BookUpdate,
  TradeUpdate,
  FillUpdate,
  Subscription,
} from "./subscriptions.js";

// Info endpoint wrappers
export {
  fetchOutcomeMeta,
  fetchAllMids,
  fetchL2Book,
  fetchSpotState,
  fetchOpenOrders,
  fetchUserFees,
  fetchSpotMetaAndAssetCtxs,
} from "./info.js";
export type {
  SpotToken,
  SpotPair,
  SpotMeta,
  SpotAssetCtx,
  UserFees,
} from "./info.js";
