/**
 * @purrdict/hip4 — order placement and cancellation.
 *
 * Wraps @nktkas/hyperliquid ExchangeClient with HIP-4 conventions:
 * - Builder fee attachment (referral revenue, sell side only)
 * - Prediction market asset encoding (100_000_000 + coinNum)
 * - Minimum notional guard (10 USDH)
 * - Tick-accurate price formatting with trailing-zero stripping
 *
 * CRITICAL signing note:
 * The exchange strips trailing zeros from price and size strings before
 * msgpack hashing. "0.650" hashes differently from "0.65", causing the
 * recovered signer address to differ. Always use formatPrice() / stripZeros().
 *
 * CRITICAL builder fee note:
 * On prediction markets, the builder fee is applied to the sell side only.
 * Buy orders always have fee = 0. The fee is deducted from USDH received.
 * Builder address MUST be lowercased in the order payload.
 */

import type { ExchangeClient, InfoClient } from "@nktkas/hyperliquid";
import type { HIP4Config, OrderStatus, OpenOrder } from "./types.js";
import { MIN_NOTIONAL } from "./types.js";
import { getMinShares } from "./markets.js";
import { formatPrice, stripZeros } from "./pricing.js";

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
   * If provided, getMinShares(markPx) is used. If omitted, only
   * the MIN_NOTIONAL (price × size ≥ 10) check is applied.
   */
  markPx?: number;
}

// ---------------------------------------------------------------------------
// Place prediction market order
// ---------------------------------------------------------------------------

/**
 * Place a prediction market limit order with automatic builder fee.
 *
 * Validates:
 * 1. size ≥ getMinShares(markPx) when markPx is provided, otherwise size ≥ 1
 * 2. price × size ≥ MIN_NOTIONAL (10 USDH)
 *
 * Returns a normalised OrderStatus (resting | filled | error).
 */
export async function placeOrder(
  exchange: ExchangeClient,
  config: HIP4Config,
  params: OrderParams,
): Promise<OrderStatus> {
  const { asset, isBuy, price, size, tif = "Gtc", reduceOnly = false, markPx } = params;

  if (size < 1) {
    return { error: `Size must be at least 1 share, got ${size}` };
  }

  if (markPx !== undefined) {
    const minShares = getMinShares(markPx);
    if (size < minShares) {
      return {
        error: `Size ${size} below minimum ${minShares} shares (markPx=${markPx})`,
      };
    }
  }

  const notional = price * size;
  if (notional < MIN_NOTIONAL) {
    return {
      error: `Notional $${notional.toFixed(2)} below minimum $${MIN_NOTIONAL}`,
    };
  }

  const priceStr = formatPrice(price);

  try {
    const result = await exchange.order({
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
      builder:
        config.builderFee > 0
          ? { b: config.builderAddress, f: config.builderFee }
          : undefined,
    });

    return parseOrderResponse(result);
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// Place perp order
// ---------------------------------------------------------------------------

export interface PerpOrderParams {
  /** Perp asset index (integer, e.g. 135 for HYPE-PERP) */
  asset: number;
  isBuy: boolean;
  /** Price as a string — trailing zeros will be stripped */
  price: string;
  /** Size as a string — trailing zeros will be stripped */
  size: string;
  tif?: "Gtc" | "Ioc" | "Alo";
  reduceOnly?: boolean;
}

/**
 * Place a perpetual futures order.
 *
 * Trailing zeros are stripped from both price and size before signing.
 * This is mandatory: the exchange strips before msgpack hashing and a
 * mismatch in the client causes signature recovery to fail.
 */
export async function placePerpOrder(
  exchange: ExchangeClient,
  config: HIP4Config,
  params: PerpOrderParams,
): Promise<OrderStatus> {
  const { asset, isBuy, price, size, tif = "Gtc", reduceOnly = false } = params;

  try {
    const result = await exchange.order({
      orders: [
        {
          a: asset,
          b: isBuy,
          p: stripZeros(price),
          s: stripZeros(size),
          r: reduceOnly,
          t: { limit: { tif } },
        },
      ],
      grouping: "na",
      builder:
        config.builderFee > 0
          ? { b: config.builderAddress, f: config.builderFee }
          : undefined,
    });

    return parseOrderResponse(result);
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// Cancel
// ---------------------------------------------------------------------------

/**
 * Cancel a single order by asset + oid.
 *
 * CRITICAL: The `a` field in the cancel request must use the same asset index
 * format that was used to place the order (100_000_000 + coinNum for prediction
 * markets, or the coin name string for spot orders via the nktkas library).
 *
 * @returns true if the cancel request was accepted, false on error
 */
export async function cancelOrder(
  exchange: ExchangeClient,
  asset: number,
  oid: number,
): Promise<boolean> {
  try {
    await exchange.cancel({ cancels: [{ a: asset, o: oid }] });
    return true;
  } catch {
    return false;
  }
}

/**
 * Cancel all open orders for a user, optionally filtered to specific coins.
 *
 * @param coins  Optional coin names to filter (e.g. ["#9860", "#9861"]).
 *               If omitted, all open orders are cancelled.
 * @returns Number of orders successfully cancelled.
 */
export async function cancelAllOrders(
  exchange: ExchangeClient,
  info: InfoClient,
  userAddress: string,
  coins?: string[],
): Promise<number> {
  const openOrders: OpenOrder[] = (await info.openOrders({
    user: userAddress as `0x${string}`,
  })) as unknown as OpenOrder[];

  const toCancel = coins
    ? openOrders.filter((o) => coins.includes(o.coin))
    : openOrders;

  if (toCancel.length === 0) return 0;

  let cancelled = 0;
  for (const order of toCancel) {
    try {
      await exchange.cancel({ cancels: [{ a: order.coin, o: order.oid }] });
      cancelled++;
    } catch {
      // Order may have already been filled or cancelled
    }
  }

  return cancelled;
}

// ---------------------------------------------------------------------------
// Response parsing (internal)
// ---------------------------------------------------------------------------

function parseOrderResponse(result: unknown): OrderStatus {
  const statuses = (result as any)?.response?.data?.statuses;
  if (!statuses || statuses.length === 0) {
    return { error: "No status in response" };
  }

  const status = statuses[0];

  if (status.resting) {
    return { resting: { oid: status.resting.oid } };
  }

  if (status.filled) {
    return {
      filled: {
        totalSz: status.filled.totalSz,
        avgPx: status.filled.avgPx,
        oid: status.filled.oid,
      },
    };
  }

  if (status.error) {
    return { error: status.error };
  }

  return { error: `Unknown order status: ${JSON.stringify(status)}` };
}
