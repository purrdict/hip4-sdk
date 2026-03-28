/**
 * @purrdict/hip4 — wallet operations: balances, transfers, builder approval.
 *
 * Signing conventions (handled internally by @nktkas/hyperliquid):
 *   sendAsset / usdClassTransfer / approveBuilderFee → EIP-712 user-signed action
 *   Orders / cancels / setLeverage                  → L1 msgpack action
 *
 * Token format for sendAsset:
 *   MUST be "NAME:0x<tokenId>" — bare names (e.g. "USDH") are rejected.
 *   Use resolveToken() to convert known bare names to full format.
 *
 * Builder fee notes:
 *   - Applies to prediction market SELL orders only (buy fee is always 0)
 *   - Builder address must have 100+ USDC in perps account to be approvable
 *   - Address MUST be lowercased (exchange lowercases before hashing)
 *   - Maximum approved rate: set via approveBuilderFee()
 *   - Maximum order-level fee: f=1000 (1.0%)
 *   - Revoke: approveBuilderFee(exchange, builder, "0%")
 */

import type { ExchangeClient, InfoClient } from "@nktkas/hyperliquid";
import type { Balances, TokenBalance, HIP4Config } from "./types.js";
import { KNOWN_TOKEN_IDS } from "./types.js";

// ---------------------------------------------------------------------------
// Balances
// ---------------------------------------------------------------------------

/**
 * Fetch spot token balances for a wallet address.
 * Parses spotClearinghouseState into a structured Balances object.
 */
export async function getBalances(
  info: InfoClient,
  address: string,
): Promise<Balances> {
  const state: any = await info.spotClearinghouseState({
    user: address as `0x${string}`,
  });

  const tokens = new Map<string, TokenBalance>();
  let usdh: TokenBalance = { total: 0, hold: 0, free: 0 };
  let usdc: TokenBalance = { total: 0, hold: 0, free: 0 };

  for (const b of state.balances ?? []) {
    const total = parseFloat(b.total ?? "0");
    const hold = parseFloat(b.hold ?? "0");
    const balance: TokenBalance = { total, hold, free: total - hold };

    if (b.coin === "USDH") {
      usdh = balance;
    } else if (b.coin === "USDC") {
      usdc = balance;
    } else {
      tokens.set(b.coin, balance);
    }
  }

  return { usdh, usdc, tokens };
}

// ---------------------------------------------------------------------------
// Token transfers
// ---------------------------------------------------------------------------

/**
 * Send spot tokens to another address.
 *
 * Uses the sendAsset action with sourceDex:"spot" and destinationDex:"spot".
 *
 * @param token   Token name ("USDH", "USDC") or full format ("USDH:0x471f...")
 * @param amount  Amount as a decimal string (e.g. "50" or "12.5")
 * @returns true if the request was accepted, false on error
 */
export async function sendAsset(
  exchange: ExchangeClient,
  destination: string,
  amount: string,
  token: string,
): Promise<boolean> {
  const resolvedToken = resolveToken(token);

  try {
    await exchange.sendAsset({
      destination: destination as `0x${string}`,
      token: resolvedToken,
      amount,
      sourceDex: "spot",
      destinationDex: "spot",
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Transfer USD between spot and perpetuals accounts.
 *
 * @param amount  Amount in USD as a string (e.g. "50")
 * @param toPerp  true = spot → perp, false = perp → spot
 * @returns true if accepted, false on error
 */
export async function usdClassTransfer(
  exchange: ExchangeClient,
  amount: string,
  toPerp: boolean,
): Promise<boolean> {
  try {
    await exchange.usdClassTransfer({ amount, toPerp });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Builder fee management
// ---------------------------------------------------------------------------

/**
 * Approve a builder fee for a specific builder address.
 *
 * This triggers a wallet signature (EIP-712). The approval caps the maximum
 * fee the builder can charge. Individual orders may use any fee up to this cap.
 *
 * Requirements:
 * - Builder address must hold 100+ USDC in perps account value.
 * - A wallet may have at most 10 active builder approvals.
 * - Revoke by setting maxFeeRate to "0%".
 *
 * @param builder     Builder address (will be lowercased automatically)
 * @param maxFeeRate  Fee cap as a percentage string, e.g. "1%" for 1.0%
 * @returns true if approved, false on error
 */
export async function approveBuilderFee(
  exchange: ExchangeClient,
  builder: string,
  maxFeeRate: string,
): Promise<boolean> {
  try {
    await exchange.approveBuilderFee({
      maxFeeRate,
      builder: builder.toLowerCase() as `0x${string}`,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Query the currently approved builder fee for a user/builder pair.
 *
 * @returns Approved fee value in tenths of a basis point (0 = not approved).
 *          Example: 100 = 0.1%, 1000 = 1.0%
 */
export async function checkBuilderApproval(
  info: InfoClient,
  user: string,
  builder: string,
): Promise<number> {
  try {
    const result: unknown = await (info as any).custom({
      type: "maxBuilderFee",
      user: user as `0x${string}`,
      builder: builder.toLowerCase() as `0x${string}`,
    });
    return typeof result === "number" ? result : 0;
  } catch {
    return 0;
  }
}

/**
 * Ensure the builder fee approval is at least as high as config.builderFee.
 * Checks the current approval; approves if missing or insufficient.
 *
 * @returns true if already approved or newly approved
 */
export async function ensureBuilderApproval(
  exchange: ExchangeClient,
  info: InfoClient,
  userAddress: string,
  config: HIP4Config,
): Promise<boolean> {
  if (config.builderFee <= 0) return true;

  const current = await checkBuilderApproval(
    info,
    userAddress,
    config.builderAddress,
  );

  if (current >= config.builderFee) return true;

  // Convert tenths-of-bps to percentage string: 100 → "0.1%"
  const pct = config.builderFee / 1000;
  return approveBuilderFee(exchange, config.builderAddress, `${pct}%`);
}

// ---------------------------------------------------------------------------
// Token resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a token name to the full "NAME:0x<tokenId>" format required by
 * the exchange sendAsset API.
 *
 * If the string already contains ":" it is returned as-is.
 * Known names (USDH, USDC) are resolved from KNOWN_TOKEN_IDS.
 *
 * @throws Error for unknown bare token names not in KNOWN_TOKEN_IDS
 */
export function resolveToken(token: string): string {
  if (token.includes(":")) return token;
  const known = KNOWN_TOKEN_IDS[token];
  if (known) return known;
  throw new Error(
    `Unknown token "${token}". Use the full format "NAME:0x<tokenId>" ` +
      `or add to KNOWN_TOKEN_IDS.`,
  );
}
