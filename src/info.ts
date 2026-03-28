/**
 * @purrdict/hip4 — typed info endpoint wrappers.
 *
 * Convenience functions that wrap @nktkas/hyperliquid InfoClient with
 * HIP-4 specific return types. All functions accept the same InfoClient
 * instance created by createClient().
 *
 * These wrappers exist to:
 * 1. Return strongly-typed data instead of `any`.
 * 2. Provide a simple fetch-based fallback pattern for non-SDK usage.
 * 3. Hide the InfoClient abstraction from consumers who prefer plain functions.
 *
 * Usage:
 *   const client = createClient({ testnet: true, builderFee: 0 });
 *   const meta = await fetchOutcomeMeta(client.info);
 *   const mids = await fetchAllMids(client.info);
 */

import type { InfoClient } from "@nktkas/hyperliquid";
import type {
  OutcomeMeta,
  L2Book,
  SpotState,
  OpenOrder,
} from "./types.js";

// ---------------------------------------------------------------------------
// SpotMeta types
// ---------------------------------------------------------------------------

export interface SpotToken {
  name: string;
  tokenId: string;
  szDecimals: number;
  evmContract: string | null;
  fullName: string | null;
}

export interface SpotPair {
  tokens: [number, number];
  name: string;
  index: number;
  isCanonical: boolean;
}

export interface SpotMeta {
  tokens: SpotToken[];
  universe: SpotPair[];
}

export interface SpotAssetCtx {
  dayNtlVlm: string;
  markPx: string;
  midPx: string | null;
  circulatingSupply: string;
  coin: string;
}

// ---------------------------------------------------------------------------
// UserFees types
// ---------------------------------------------------------------------------

export interface UserFees {
  activeReferralDiscount: string;
  trialFeeDiscount: string;
  userCrossRate: string;
  userAddRate: string;
  levels: Array<{
    ntlCutoff: string;
    makerRate: string;
    takerRate: string;
  }>;
}

// ---------------------------------------------------------------------------
// Typed info wrappers
// ---------------------------------------------------------------------------

/**
 * Fetch all active HIP-4 outcomes and question groups.
 *
 * Returns outcomes (individual binary sides) and questions (grouped outcomes
 * for multi-outcome markets). Expired recurring markets are purged from the
 * response entirely.
 */
export async function fetchOutcomeMeta(info: InfoClient): Promise<OutcomeMeta> {
  return (await (info as any).custom({ type: "outcomeMeta" })) as OutcomeMeta;
}

/**
 * Fetch all mid prices in one request.
 *
 * Keys are coin names:
 *   "BTC"    — perpetual mid price
 *   "#9860"  — prediction market yes coin mid
 *   "@1338"  — spot pair mid (USDH/USDC — usually ~1.0)
 *
 * Returns a Record<string, string> where values are decimal strings.
 * Use `parseFloat(mids["#9860"])` or check for undefined before parsing.
 */
export async function fetchAllMids(
  info: InfoClient,
): Promise<Record<string, string>> {
  return (await (info as any).custom({ type: "allMids" })) as Record<
    string,
    string
  >;
}

/**
 * Fetch the L2 orderbook for a specific coin.
 *
 * @param coin  Coin name (e.g. "#9860", "BTC", "@1338")
 *
 * Returns bids and asks sorted by price descending and ascending respectively.
 * For prediction markets, the orderbook is mirrored: a bid on Yes at 0.55
 * automatically creates an ask on No at 0.45.
 */
export async function fetchL2Book(
  info: InfoClient,
  coin: string,
): Promise<L2Book> {
  return (await (info as any).custom({ type: "l2Book", coin })) as L2Book;
}

/**
 * Fetch spot token balances for a wallet address.
 *
 * @param user  Wallet address as "0x..." string
 *
 * Returns balances for all spot tokens the user holds (USDH, USDC, outcome tokens).
 * Outcome tokens use the "+" prefix in the coin field (e.g. "+9860").
 */
export async function fetchSpotState(
  info: InfoClient,
  user: string,
): Promise<SpotState> {
  return (await (info as any).custom({
    type: "spotClearinghouseState",
    user,
  })) as SpotState;
}

/**
 * Fetch open orders for a wallet address.
 *
 * @param user  Wallet address as "0x..." string
 *
 * Returns all resting orders across all spot and prediction market coins.
 * Prediction market coins use the "#" prefix in the coin field.
 */
export async function fetchOpenOrders(
  info: InfoClient,
  user: string,
): Promise<OpenOrder[]> {
  return (await (info as any).custom({
    type: "frontendOpenOrders",
    user,
  })) as OpenOrder[];
}

/**
 * Fetch user fee schedule.
 *
 * Note: Prediction markets do not charge protocol fees. The fee schedule
 * applies to perpetuals and regular spot trading only. Builder fees on
 * prediction markets are configured separately via approveBuilderFee().
 *
 * @param user  Wallet address as "0x..." string
 */
export async function fetchUserFees(
  info: InfoClient,
  user: string,
): Promise<UserFees> {
  return (await (info as any).custom({
    type: "userFees",
    user,
  })) as UserFees;
}

/**
 * Fetch spot meta and asset contexts.
 *
 * SpotMeta contains all token definitions and trading pair universe.
 * SpotAssetCtx contains per-pair market data (mark price, volume, etc.).
 *
 * Tuple index corresponds to the pair index in universe:
 *   spotMetaAndAssetCtxs[1][i] matches universe[i] in spotMetaAndAssetCtxs[0]
 *
 * The markPx in SpotAssetCtx for "#" coins is used by getMinShares() to
 * compute the minimum order size.
 */
export async function fetchSpotMetaAndAssetCtxs(
  info: InfoClient,
): Promise<[SpotMeta, SpotAssetCtx[]]> {
  return (await (info as any).custom({
    type: "spotMetaAndAssetCtxs",
  })) as [SpotMeta, SpotAssetCtx[]];
}
