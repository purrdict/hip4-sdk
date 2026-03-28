/**
 * @purrdict/hip4 — order payload construction.
 *
 * Builds the order action object for prediction market orders following
 * HIP-4 conventions. Pass the returned object directly to nktkas
 * ExchangeClient.order().
 *
 * Why this module exists (things nktkas does NOT do):
 * - Encodes the prediction market asset format (100_000_000 + coinNum)
 * - Enforces 5-sig-fig tick size and strips trailing zeros from price strings
 * - Validates minimum shares (exchange enforces size × min(px, 1−px) ≥ 10 USDH)
 * - Lowercases the builder address (exchange lowercases before hashing; a
 *   checksummed address produces a wrong recovered signer)
 * - Assembles the field order required by msgpack: a, b, p, s, r, t
 *
 * CRITICAL: Trailing zeros break signing. "0.650" produces a different hash
 * from "0.65" because the exchange strips zeros before computing the action
 * hash. Always use formatPrice() or stripZeros() on any price or size value
 * in a signed payload.
 */

import { MIN_NOTIONAL } from "./types.js";
import { getMinShares } from "./markets.js";
import { formatPrice } from "./pricing.js";

// ---------------------------------------------------------------------------
// Order params
// ---------------------------------------------------------------------------

export interface OrderParams {
  /** Order asset index: PREDICTION_ASSET_OFFSET + coinNum */
  asset: number;
  /** true = buy, false = sell */
  isBuy: boolean;
  /** Price as a number — formatted to tick size and trailing zeros stripped */
  price: number;
  /** Number of shares (whole number). Use getMinShares(markPx) for the minimum. */
  size: number;
  /** Time in force. Default: "Gtc" */
  tif?: "Gtc" | "Ioc" | "Alo";
  /** Reduce-only flag. Default: false */
  reduceOnly?: boolean;
  /**
   * Mark price of the coin, used for the minimum notional check.
   * When provided, getMinShares(markPx) is enforced.
   * When omitted, only size ≥ 1 and price × size ≥ MIN_NOTIONAL are checked.
   */
  markPx?: number;
  /**
   * Builder address for referral fees (sell side only).
   * CRITICAL: Will be lowercased — checksummed addresses are accepted.
   * Pass an empty string or omit to disable builder fees.
   */
  builderAddress?: string;
  /**
   * Builder fee in tenths of a basis point.
   * 0 = no fee. 100 = 0.1%. 1000 = 1.0% (maximum).
   */
  builderFee?: number;
}

// ---------------------------------------------------------------------------
// Order action types
// ---------------------------------------------------------------------------

export interface SingleOrder {
  a: number;
  b: boolean;
  p: string;
  s: string;
  r: boolean;
  t: { limit: { tif: string } };
}

export interface OrderAction {
  orders: SingleOrder[];
  grouping: "na";
  builder?: { b: string; f: number };
}

// ---------------------------------------------------------------------------
// Build order action
// ---------------------------------------------------------------------------

/**
 * Build a prediction market order action payload for nktkas ExchangeClient.
 *
 * Returns an { ok: OrderAction } on success or { err: string } on validation
 * failure so callers can handle errors without try/catch.
 *
 * Usage:
 *   const result = buildOrderAction({ asset: 100001520, isBuy: true, price: 0.55, size: 25 });
 *   if ("err" in result) throw new Error(result.err);
 *   await exchange.order(result.ok);
 */
export function buildOrderAction(
  params: OrderParams,
): { ok: OrderAction } | { err: string } {
  const {
    asset,
    isBuy,
    price,
    size,
    tif = "Gtc",
    reduceOnly = false,
    markPx,
    builderAddress = "",
    builderFee = 0,
  } = params;

  if (size < 1) {
    return { err: `Size must be at least 1 share, got ${size}` };
  }

  if (markPx !== undefined) {
    const minShares = getMinShares(markPx);
    if (size < minShares) {
      return {
        err: `Size ${size} below minimum ${minShares} shares (markPx=${markPx})`,
      };
    }
  }

  const notional = price * size;
  if (notional < MIN_NOTIONAL) {
    return {
      err: `Notional $${notional.toFixed(2)} below minimum $${MIN_NOTIONAL}`,
    };
  }

  const priceStr = formatPrice(price);

  const action: OrderAction = {
    orders: [
      {
        a: asset,
        b: isBuy,
        p: priceStr,
        s: String(size),
        r: reduceOnly,
        t: { limit: { tif } },
      },
    ],
    grouping: "na",
  };

  if (builderFee > 0 && builderAddress) {
    action.builder = {
      b: builderAddress.toLowerCase(),
      f: builderFee,
    };
  }

  return { ok: action };
}
