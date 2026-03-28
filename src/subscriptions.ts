/**
 * @purrdict/hip4 — real-time WebSocket subscriptions.
 *
 * Wraps @nktkas/hyperliquid SubscriptionClient with HIP-4 conventions.
 *
 * Recommended subscription strategy:
 * - allMids: best for real-time prices — single subscription covers ALL perps
 *   and prediction market # coins atomically at ~100ms update frequency.
 * - candle: use for mini price charts per coin.
 * - l2Book: per-coin orderbook depth. Always unsubscribe for settled # coins.
 * - trades: per-coin recent trades.
 * - userFills: per-user fills including settlement events.
 *
 * Note: bbo subscription is not supported for # coins (returns 422).
 *
 * IMPORTANT: Always call unsubscribe() for l2Book and trades subscriptions on
 * settled # coins. Settled markets are purged from the API and lingering
 * subscriptions will stop receiving data without explicit cleanup.
 */

import type { SubscriptionClient } from "@nktkas/hyperliquid";

// ---------------------------------------------------------------------------
// Subscription types
// ---------------------------------------------------------------------------

export interface PriceUpdate {
  /** Map of coin/symbol → mid price string (e.g. "{ BTC: '65432.1', '#1520': '0.55' }") */
  mids: Record<string, string>;
}

export interface BookUpdate {
  coin: string;
  /** [bids, asks] — each level has px, sz, n (number of orders) */
  levels: [BookLevel[], BookLevel[]];
  time: number;
}

interface BookLevel {
  px: string;
  sz: string;
  n: number;
}

export interface TradeUpdate {
  coin: string;
  side: string;
  px: string;
  sz: string;
  time: number;
  hash: string;
}

/**
 * A fill event for a user.
 *
 * Settlement fills have:
 *   dir: "Settlement"
 *   px:  "1.0" = winning side, "0.0" = losing side
 *   closedPnl: profit or loss in USDH
 *   fee: "0" (no fee on settlement)
 */
export interface FillUpdate {
  coin: string;
  px: string;
  sz: string;
  side: string;
  time: number;
  dir: string;
  closedPnl: string;
  fee: string;
  oid: number;
}

/** Subscription handle — call unsubscribe() to stop receiving events. */
export interface Subscription {
  unsubscribe(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Price subscriptions (allMids)
// ---------------------------------------------------------------------------

/**
 * Subscribe to all mid prices (~100ms updates).
 *
 * A single subscription covers all perpetuals and all active prediction
 * market # coins simultaneously. This is the most efficient way to track
 * prices across many markets.
 *
 * @param callback  Called on each update with the full mids map
 * @returns Subscription handle with unsubscribe()
 */
export async function subscribePrices(
  sub: SubscriptionClient,
  callback: (update: PriceUpdate) => void,
): Promise<Subscription> {
  const handle = await sub.allMids({}, (event: any) => {
    callback({ mids: event.mids ?? event });
  });

  return { unsubscribe: () => handle.unsubscribe() };
}

// ---------------------------------------------------------------------------
// L2 book subscriptions
// ---------------------------------------------------------------------------

/**
 * Subscribe to L2 orderbook updates for a specific coin.
 *
 * @param coin  Coin name (e.g. "#9860" for a prediction market yes coin)
 *
 * IMPORTANT: Call unsubscribe() when the market settles to free resources.
 */
export async function subscribeBook(
  sub: SubscriptionClient,
  coin: string,
  callback: (update: BookUpdate) => void,
): Promise<Subscription> {
  const handle = await sub.l2Book({ coin }, (event: any) => {
    callback({
      coin,
      levels: event.levels ?? [[], []],
      time: event.time ?? Date.now(),
    });
  });

  return { unsubscribe: () => handle.unsubscribe() };
}

// ---------------------------------------------------------------------------
// Trade subscriptions
// ---------------------------------------------------------------------------

/**
 * Subscribe to trades for a specific coin.
 *
 * @param coin  Coin name (e.g. "#9860")
 */
export async function subscribeTrades(
  sub: SubscriptionClient,
  coin: string,
  callback: (trades: TradeUpdate[]) => void,
): Promise<Subscription> {
  const handle = await sub.trades({ coin }, (event: any) => {
    const trades = Array.isArray(event) ? event : [event];
    callback(
      trades.map((t: any) => ({
        coin,
        side: t.side,
        px: t.px,
        sz: t.sz,
        time: t.time,
        hash: t.hash ?? "",
      })),
    );
  });

  return { unsubscribe: () => handle.unsubscribe() };
}

// ---------------------------------------------------------------------------
// User fill subscriptions
// ---------------------------------------------------------------------------

/**
 * Subscribe to fills for a specific wallet address.
 *
 * Includes trade fills and settlement fills. Settlement fills identify
 * resolved markets and carry profit/loss information:
 *   dir: "Settlement", px: "1.0" = winner, px: "0.0" = loser
 *
 * @param user  Wallet address in "0x..." format
 */
export async function subscribeUserFills(
  sub: SubscriptionClient,
  user: string,
  callback: (fills: FillUpdate[]) => void,
): Promise<Subscription> {
  const handle = await sub.userFills(
    { user: user as `0x${string}` },
    (event: any) => {
      const fills = Array.isArray(event) ? event : [event];
      callback(
        fills.map((f: any) => ({
          coin: f.coin,
          px: f.px,
          sz: f.sz,
          side: f.side,
          time: f.time,
          dir: f.dir ?? "",
          closedPnl: f.closedPnl ?? "0",
          fee: f.fee ?? "0",
          oid: f.oid,
        })),
      );
    },
  );

  return { unsubscribe: () => handle.unsubscribe() };
}
