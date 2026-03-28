/**
 * @purrdict/hip4 — HIP-4 specific types and constants.
 *
 * Leaf module: no imports from other SDK modules.
 * Only contains types and constants that are HIP-4 specific —
 * things that @nktkas/hyperliquid does not already provide.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Prediction market order asset index offset.
 * Asset field: a = PREDICTION_ASSET_OFFSET + coinNum
 *
 * Example: coin #90 → a = 100000090
 */
export const PREDICTION_ASSET_OFFSET = 100_000_000;

/**
 * Spot pair order asset index offset.
 * Asset field: a = SPOT_ASSET_OFFSET + pairIndex
 *
 * Example: USDH/USDC (@1338) → a = 11338
 */
export const SPOT_ASSET_OFFSET = 10_000;

/**
 * Minimum order notional value: 10 USDH.
 * The exchange enforces: size × min(markPx, 1 − markPx) ≥ 10 USDH.
 * Use getMinShares() to compute the share-count minimum for a specific price.
 */
export const MIN_NOTIONAL = 10;

/**
 * Maximum builder fee for spot and prediction markets: 1000 = 1.0%.
 * Unit: tenths of a basis point (1 = 0.001%, 1000 = 1.0%).
 *
 * Note: builder fees on prediction markets apply to the sell side only.
 * Buy-side fee is always 0.
 */
export const MAX_BUILDER_FEE = 1000;

// ---------------------------------------------------------------------------
// Market types
// ---------------------------------------------------------------------------

/** Currently the only supported HIP-4 market class. */
export type MarketType = "priceBinary";

/** Parsed representation of an outcome description field. */
export interface ParsedDescription {
  class: MarketType;
  underlying: string;
  expiry: Date;
  targetPrice: number;
  period: string;
}

/**
 * A single active HIP-4 recurring price binary market.
 *
 * Coin naming conventions:
 *   #<coinNum>   — API coin used in allMids, l2Book, candle, recentTrades
 *   @<pairNum>   — Token pair (EMPTY orderbook — not traded directly)
 *   +<coinNum>   — Token balance key in spotClearinghouseState
 *   a = 100000000 + coinNum — order asset field
 */
export interface Market {
  outcomeId: number;
  underlying: string;
  targetPrice: number;
  expiry: Date;
  period: string;
  /** Raw coin number: outcomeId × 10 */
  yesCoinNum: number;
  /** Raw coin number: outcomeId × 10 + 1 */
  noCoinNum: number;
  /** Coin name, e.g. "#1520" */
  yesCoin: string;
  /** Coin name, e.g. "#1521" */
  noCoin: string;
  /** Order asset field: 100_000_000 + yesCoinNum */
  yesAsset: number;
  /** Order asset field: 100_000_000 + noCoinNum */
  noAsset: number;
}

// ---------------------------------------------------------------------------
// outcomeMeta API response types (HIP-4 specific endpoint)
// ---------------------------------------------------------------------------

export interface OutcomeMeta {
  outcomes: OutcomeEntry[];
  questions: QuestionEntry[];
}

export interface OutcomeEntry {
  outcome: number;
  name: string;
  description: string;
  sideSpecs: { name: string }[];
}

export interface QuestionEntry {
  id: number;
  name: string;
  namedOutcomes: number[];
}

// ---------------------------------------------------------------------------
// Order status narrowing (parseOrderResponse result from nktkas)
// ---------------------------------------------------------------------------

export type OrderStatus =
  | { resting: { oid: number } }
  | { filled: { totalSz: string; avgPx: string; oid: number } }
  | { error: string };

export function isResting(s: OrderStatus): s is { resting: { oid: number } } {
  return "resting" in s;
}

export function isFilled(
  s: OrderStatus,
): s is { filled: { totalSz: string; avgPx: string; oid: number } } {
  return "filled" in s;
}

export function isError(s: OrderStatus): s is { error: string } {
  return "error" in s;
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/** Convert a coin number to its prediction market order asset index. */
export function outcomeToAsset(coinNum: number): number {
  return PREDICTION_ASSET_OFFSET + coinNum;
}
