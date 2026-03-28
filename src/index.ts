/**
 * @purrdict/hip4 — HIP-4 prediction market SDK.
 *
 * This SDK adds the HIP-4 knowledge layer on top of @nktkas/hyperliquid.
 * It covers only what nktkas does not provide:
 *
 * - Market discovery: parseDescription, discoverMarkets
 * - Coin/asset mapping helpers: outcomeToAsset, Market type
 * - Minimum order size formula: getMinShares
 * - 5-sig-fig tick size and price formatting: computeTickSize, formatPrice, stripZeros
 * - Order action construction: buildOrderAction (asset encoding, trailing zeros, builder fee)
 * - HIP-4 specific types and constants
 *
 * For network I/O (info queries, order submission, WebSocket subscriptions)
 * use @nktkas/hyperliquid directly with the types and helpers from this package.
 *
 * import {
 *   discoverMarkets,
 *   getMinShares,
 *   buildOrderAction,
 *   formatPrice,
 * } from "@purrdict/hip4";
 */

// Types, constants, and helpers
export {
  PREDICTION_ASSET_OFFSET,
  SPOT_ASSET_OFFSET,
  MIN_NOTIONAL,
  MAX_BUILDER_FEE,
  outcomeToAsset,
  isResting,
  isFilled,
  isError,
} from "./types.js";
export type {
  MarketType,
  ParsedDescription,
  Market,
  OrderStatus,
  OutcomeMeta,
  OutcomeEntry,
  QuestionEntry,
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
  computeTickSize,
  roundToTick,
  formatPrice,
  stripZeros,
} from "./pricing.js";

// Order action construction
export { buildOrderAction } from "./orders.js";
export type { OrderParams, OrderAction, SingleOrder } from "./orders.js";
