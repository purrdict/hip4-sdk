/**
 * @purrdict/hip4 — pricing utilities.
 *
 * Includes:
 * - Normal CDF for Black-Scholes binary option pricing
 * - Tick size computation (5 significant figures, Hyperliquid requirement)
 * - Price formatting with trailing-zero stripping (required for signing)
 * - Stoikov-inspired market making quote generation
 */

import type { QuoteLevel, Quote } from "./types.js";

// ---------------------------------------------------------------------------
// Normal CDF
// ---------------------------------------------------------------------------

/**
 * Normal cumulative distribution function.
 * Uses the Abramowitz & Stegun approximation, accurate to ~1e-7.
 */
export function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x) / Math.SQRT2;
  const t = 1.0 / (1.0 + p * absX);
  const y =
    1.0 -
    ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) *
      t *
      Math.exp(-absX * absX);
  return 0.5 * (1.0 + sign * y);
}

// ---------------------------------------------------------------------------
// Volatility
// ---------------------------------------------------------------------------

/** Annualized implied volatility estimates by underlying symbol. */
export const BASE_VOL: Record<string, number> = {
  BTC: 0.60,
  ETH: 0.75,
  SOL: 0.90,
  HYPE: 1.20,
};

/** Fallback annualized volatility for symbols not in BASE_VOL. */
export const DEFAULT_VOL = 0.80;

/**
 * Return the annualized vol for a symbol, scaled by an optional multiplier.
 * Useful for widening quotes in high-uncertainty conditions.
 */
export function scaledVol(symbol: string, multiplier: number = 1.0): number {
  return (BASE_VOL[symbol] ?? DEFAULT_VOL) * multiplier;
}

// ---------------------------------------------------------------------------
// Fair price (binary option model)
// ---------------------------------------------------------------------------

/**
 * Compute the fair probability of a "Yes" (above target) outcome.
 *
 * Model: P(up) = Φ((S − K) / (K × σ × √T))
 *
 * Where:
 *   S = current underlying price
 *   K = target/strike price
 *   σ = annualized volatility × volMultiplier
 *   T = time to expiry in years
 *   Φ = standard normal CDF
 *
 * @param underlyingPrice  Current spot price (S)
 * @param targetPrice      Strike price (K)
 * @param ttlMinutes       Time to expiry in minutes
 * @param symbol           Underlying symbol for volatility lookup
 * @param volMultiplier    Scale factor on base vol (default 1.5)
 * @returns                Fair probability clamped to [0.005, 0.995]
 */
export function fairPrice(
  underlyingPrice: number,
  targetPrice: number,
  ttlMinutes: number,
  symbol: string,
  volMultiplier: number = 1.5,
): number {
  if (ttlMinutes <= 0) {
    return underlyingPrice > targetPrice ? 1.0 : 0.0;
  }

  const annualVol = scaledVol(symbol, volMultiplier);
  const T = ttlMinutes / (365.25 * 24 * 60);
  const sigma = annualVol * Math.sqrt(T);

  if (sigma < 1e-10) {
    return underlyingPrice > targetPrice ? 0.995 : 0.005;
  }

  const d = (underlyingPrice - targetPrice) / (targetPrice * sigma);
  return Math.max(0.005, Math.min(0.995, normalCDF(d)));
}

// ---------------------------------------------------------------------------
// Tick size
// ---------------------------------------------------------------------------

/**
 * Compute the tick size for a given price (5 significant figures).
 *
 * Formula: tick = 10^(floor(log10(price)) − 4)
 *
 * Examples:
 *   price 0.55  → tick 0.00001
 *   price 1.0   → tick 0.0001
 *   price 65000 → tick 1
 *
 * All order prices must be divisible by the tick size or the exchange
 * will reject with an "Invalid price" error.
 */
export function computeTickSize(price: number): number {
  if (price <= 0) return 0.00001;
  return Math.pow(10, Math.floor(Math.log10(price)) - 4);
}

/** Round a price to the nearest valid tick. */
export function roundToTick(price: number): number {
  const tick = computeTickSize(price);
  return Math.round(price / tick) * tick;
}

// ---------------------------------------------------------------------------
// Price formatting
// ---------------------------------------------------------------------------

/**
 * Format a price for signing: round to tick size, then strip trailing zeros.
 *
 * CRITICAL: The exchange strips trailing zeros before msgpack hashing.
 * Sending "0.650" when the server hashes "0.65" produces a different hash,
 * which causes the wrong signer address to be recovered. Always use this
 * function (or stripZeros) when constructing signed order payloads.
 */
export function formatPrice(price: number): string {
  const rounded = roundToTick(price);
  const tick = computeTickSize(rounded);
  const decimals = Math.max(0, -Math.floor(Math.log10(tick)));
  let s = rounded.toFixed(decimals);
  if (s.includes(".")) {
    s = s.replace(/\.?0+$/, "");
  }
  return s;
}

/**
 * Strip trailing zeros from a numeric string.
 *
 * Use this for any price or size string before including it in a signed action.
 * Examples: "35.810" → "35.81", "1.0" → "1", "0.650" → "0.65"
 */
export function stripZeros(s: string): string {
  if (!s.includes(".")) return s;
  return s.replace(/\.?0+$/, "");
}

// ---------------------------------------------------------------------------
// Quote generation (Stoikov-inspired)
// ---------------------------------------------------------------------------

function clamp(p: number): number {
  return Math.max(0.01, Math.min(0.98, p));
}

/**
 * Compute market-making quotes using a Stoikov-inspired inventory-aware model.
 *
 * Posts bids on both the Yes and No sides. The exchange's mirrored orderbook
 * mechanism automatically creates the complementary sell:
 *   Buy Yes at 0.55 → visible as Sell No at 0.45
 *   Buy No  at 0.42 → visible as Sell Yes at 0.58
 *
 * This produces a full two-sided book on both coins from a single wallet
 * with no explicit sell orders needed.
 *
 * The reservation price is shifted away from the overweight side via an
 * inventory skew term, naturally managing position without hedging.
 *
 * @param fair          Fair probability of the Yes outcome (0–1)
 * @param spreadBps     Half-spread in basis points (total = 2×)
 * @param levels        Number of price levels per side
 * @param quoteSize     Shares per level
 * @param netInventory  Net position (positive = long yes, negative = long no)
 * @param maxPosition   Max allowed position for normalising the skew
 * @param ttlMinutes    Minutes to expiry — spread widens near expiry
 * @returns             Quote with fair, yesBids, and noBids arrays
 */
export function computeQuote(
  fair: number,
  spreadBps: number,
  levels: number,
  quoteSize: number,
  netInventory: number,
  maxPosition: number,
  ttlMinutes: number,
): Quote {
  const halfSpread = spreadBps / 10_000 / 2;

  const gamma = 0.1;
  const inventoryRatio = maxPosition > 0 ? netInventory / maxPosition : 0;
  const skew = gamma * inventoryRatio * halfSpread;

  const timeMult =
    ttlMinutes < 2 ? 2.0 : ttlMinutes < 5 ? 1.3 : 1.0;
  const adjHalfSpread = halfSpread * timeMult;
  const levelStep = adjHalfSpread * 0.4;

  const yesBids: QuoteLevel[] = [];
  for (let i = 0; i < levels; i++) {
    yesBids.push({
      price: clamp(fair - adjHalfSpread - levelStep * i + skew),
      size: quoteSize,
    });
  }

  const noFair = 1 - fair;
  const noBids: QuoteLevel[] = [];
  for (let i = 0; i < levels; i++) {
    noBids.push({
      price: clamp(noFair - adjHalfSpread - levelStep * i - skew),
      size: quoteSize,
    });
  }

  return { fair, yesBids, noBids };
}
