/**
 * @purrdict/hip4 — market discovery and utilities.
 *
 * Recurring HIP-4 markets have a pipe-delimited description in outcomeMeta:
 *   class:priceBinary|underlying:BTC|expiry:20260310-0300|targetPrice:66200|period:15m
 *
 * NOTE: Expired recurring markets are purged from the exchange API entirely.
 * Archive market data before expiry if historical records are needed.
 */

import {
  PREDICTION_ASSET_OFFSET,
  type ParsedDescription,
  type Market,
  type OutcomeMeta,
} from "./types.js";

// ---------------------------------------------------------------------------
// Description parsing
// ---------------------------------------------------------------------------

/**
 * Parse a pipe-delimited outcome description string.
 *
 * Returns null if the input is not a valid priceBinary description or
 * any required field (underlying, expiry, targetPrice, period) is missing.
 */
export function parseDescription(desc: string): ParsedDescription | null {
  if (!desc || !desc.includes("|")) return null;

  const fields: Record<string, string> = {};
  for (const pair of desc.split("|")) {
    const idx = pair.indexOf(":");
    if (idx > 0) {
      fields[pair.slice(0, idx)] = pair.slice(idx + 1);
    }
  }

  if (fields.class !== "priceBinary") return null;

  if (
    !fields.underlying ||
    !fields.expiry ||
    !fields.targetPrice ||
    !fields.period
  ) {
    return null;
  }

  return {
    class: "priceBinary",
    underlying: fields.underlying,
    expiry: parseExpiry(fields.expiry),
    targetPrice: parseFloat(fields.targetPrice),
    period: fields.period,
  };
}

/** Parse an expiry string in YYYYMMDD-HHMM format to a UTC Date. */
function parseExpiry(s: string): Date {
  const year = parseInt(s.slice(0, 4));
  const month = parseInt(s.slice(4, 6)) - 1;
  const day = parseInt(s.slice(6, 8));
  const hour = parseInt(s.slice(9, 11));
  const min = parseInt(s.slice(11, 13));
  return new Date(Date.UTC(year, month, day, hour, min));
}

// ---------------------------------------------------------------------------
// Market discovery
// ---------------------------------------------------------------------------

/**
 * Discover all active priceBinary markets from outcomeMeta + allMids.
 *
 * A market is included when:
 * 1. Its description parses as class:priceBinary.
 * 2. Expiry is in the future.
 * 3. A live price exists in `mids` for the underlying (e.g. "BTC").
 *
 * Coin derivation:
 *   yesCoinNum = outcomeId × 10
 *   noCoinNum  = outcomeId × 10 + 1
 *   yesAsset   = 100_000_000 + yesCoinNum   (order "a" field)
 */
export function discoverMarkets(
  meta: OutcomeMeta,
  mids: Record<string, string>,
): Market[] {
  const markets: Market[] = [];

  for (const outcome of meta.outcomes) {
    const parsed = parseDescription(outcome.description);
    if (!parsed) continue;
    if (!mids[parsed.underlying]) continue;
    if (parsed.expiry.getTime() <= Date.now()) continue;

    const yesCoinNum = outcome.outcome * 10;
    const noCoinNum = outcome.outcome * 10 + 1;

    markets.push({
      outcomeId: outcome.outcome,
      underlying: parsed.underlying,
      targetPrice: parsed.targetPrice,
      expiry: parsed.expiry,
      period: parsed.period,
      yesCoinNum,
      noCoinNum,
      yesCoin: `#${yesCoinNum}`,
      noCoin: `#${noCoinNum}`,
      yesAsset: PREDICTION_ASSET_OFFSET + yesCoinNum,
      noAsset: PREDICTION_ASSET_OFFSET + noCoinNum,
    });
  }

  return markets;
}

// ---------------------------------------------------------------------------
// Time utilities
// ---------------------------------------------------------------------------

/** Minutes until market expires. Negative value means already expired. */
export function timeToExpiry(market: Market): number {
  return (market.expiry.getTime() - Date.now()) / 60_000;
}

/**
 * Parse a period string to minutes.
 * "1m"→1, "5m"→5, "15m"→15, "1h"→60, "4h"→240, "1d"→1440
 * Falls back to 15 for unrecognised formats.
 */
export function periodMinutes(period: string): number {
  const match = period.match(/^(\d+)(m|h|d)$/);
  if (!match) return 15;

  const value = parseInt(match[1]);
  switch (match[2]) {
    case "m":
      return value;
    case "h":
      return value * 60;
    case "d":
      return value * 1440;
    default:
      return 15;
  }
}

// ---------------------------------------------------------------------------
// Label formatting
// ---------------------------------------------------------------------------

/**
 * Human-readable label for a market.
 * Examples: "BTC-1d", "HYPE-15m", "ETH-4h"
 */
export function formatLabel(market: Market): string {
  return `${market.underlying}-${market.period}`;
}

// ---------------------------------------------------------------------------
// Minimum order size
// ---------------------------------------------------------------------------

/**
 * Calculate the minimum order size (in shares) for a prediction market coin.
 *
 * The exchange enforces:
 *   size × min(markPx, 1 − markPx) ≥ 10 USDH
 *
 * Solving for size:
 *   size ≥ 10 / min(markPx, 1 − markPx)
 *
 * The min() reflects that Yes and No share the same collateral pool — a share
 * priced near 0 or near 1 is "cheap" on one side but requires more units to
 * meet the notional threshold.
 *
 * Edge-case: markPx at or beyond 0 or 1 is clamped to 0.01 to avoid division
 * by zero or negative denominators. Maximum result: 1000 shares.
 *
 * All prediction market orders must use whole numbers (no fractional shares).
 *
 * @param markPx - The mark price from spotMetaAndAssetCtxs for the # coin
 *                 (a number between 0 and 1)
 * @returns Minimum number of whole shares required for a valid order
 */
export function getMinShares(markPx: number): number {
  const effectivePx = Math.max(Math.min(markPx, 1 - markPx), 0.01);
  return Math.ceil(10 / effectivePx);
}
