/**
 * @purrdict/hip4 — shared types and constants
 *
 * Leaf module: no imports from other SDK modules.
 * All types are derived from the public Hyperliquid API and HIP-4 conventions.
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

/**
 * Default signature chain ID for headless (private-key) contexts.
 * When using a browser wallet, use the wallet's connected chain dynamically.
 * Hyperliquid accepts any EIP-712 chainId in the domain.
 */
export const SIGNATURE_CHAIN_ID = "0x66eee";

/**
 * Well-known token IDs for sendAsset.
 * Format: "NAME:0x<hex>" — required by the exchange API (bare names rejected).
 * These are stable testnet identifiers.
 */
export const KNOWN_TOKEN_IDS: Record<string, string> = {
  USDH: "USDH:0x471fd4480bb9943a1fe080ab0d4ff36c",
  USDC: "USDC:0xeb62eee3685fc4c43992febcd9e75443",
};

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface HIP4Config {
  apiUrl: string;
  wsUrl: string;
  isTestnet: boolean;
  /**
   * Builder address that collects referral fees on sells.
   * CRITICAL: Must be lowercased — the exchange lowercases before hashing.
   * Checksummed address produces a different hash and a wrong recovered signer.
   */
  builderAddress: string;
  /**
   * Builder fee in tenths of a basis point.
   * 100 = 0.1%, 1000 = 1.0% (maximum).
   */
  builderFee: number;
}

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
// Order types
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
// API response types
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

export interface L2Book {
  /** [bids, asks] — each entry is [price, size, numOrders] */
  levels: [BookLevel[], BookLevel[]];
}

export interface BookLevel {
  px: string;
  sz: string;
  n: number;
}

export interface SpotState {
  balances: { coin: string; total: string; hold: string }[];
}

export interface OpenOrder {
  coin: string;
  side: string;
  limitPx: string;
  sz: string;
  oid: number;
}

// ---------------------------------------------------------------------------
// Pricing types
// ---------------------------------------------------------------------------

export interface QuoteLevel {
  price: number;
  size: number;
}

export interface Quote {
  fair: number;
  yesBids: QuoteLevel[];
  noBids: QuoteLevel[];
}

// ---------------------------------------------------------------------------
// Balance types
// ---------------------------------------------------------------------------

export interface TokenBalance {
  total: number;
  hold: number;
  free: number;
}

export interface Balances {
  usdh: TokenBalance;
  usdc: TokenBalance;
  tokens: Map<string, TokenBalance>;
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/** Convert a coin number to its prediction market order asset index. */
export function outcomeToAsset(coinNum: number): number {
  return PREDICTION_ASSET_OFFSET + coinNum;
}
