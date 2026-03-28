/**
 * @purrdict/hip4 — pricing utilities.
 *
 * Includes:
 * - Tick size computation (5 significant figures, Hyperliquid requirement)
 * - Price formatting with trailing-zero stripping (required for signing)
 */

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
