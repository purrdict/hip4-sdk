/**
 * @purrdict/hip4 — client factory.
 *
 * Creates pre-configured HTTP and WebSocket transports and exposes
 * InfoClient, SubscriptionClient, and an ExchangeClient factory.
 *
 * Usage:
 *   const client = createClient({ builderAddress: "0x...", builderFee: 100 });
 *   const mids = await client.info.allMids();
 *   const exchange = client.exchange(privateKeyAccount);
 *   await placeOrder(exchange, client.config, { ... });
 */

import {
  HttpTransport,
  WebSocketTransport,
  InfoClient,
  ExchangeClient,
  SubscriptionClient,
} from "@nktkas/hyperliquid";
import type { HIP4Config } from "./types.js";

// ---------------------------------------------------------------------------
// Client config
// ---------------------------------------------------------------------------

export interface ClientConfig {
  /**
   * Connect to testnet endpoints. Default: false (mainnet).
   * Alias for isTestnet — either name is accepted.
   *
   * @example
   *   createClient({ testnet: true, builderAddress: "0x...", builderFee: 0 })
   *   createClient({ isTestnet: true, builderAddress: "0x...", builderFee: 0 })
   */
  testnet?: boolean;
  /** Alias for testnet. */
  isTestnet?: boolean;
  /**
   * Builder address that receives referral fees on sell orders.
   * Automatically lowercased — checksummed addresses are accepted and normalised.
   * Optional — pass an empty string or omit to disable builder fees entirely.
   */
  builderAddress?: string;
  /**
   * Builder fee in tenths of a basis point.
   * 0 = no fee. 100 = 0.1%. 1000 = 1.0% (maximum).
   * Default: 0.
   */
  builderFee?: number;
}

// ---------------------------------------------------------------------------
// HIP4Client
// ---------------------------------------------------------------------------

export interface HIP4Client {
  /** InfoClient for all read-only queries (allMids, outcomeMeta, fills, etc.) */
  info: InfoClient;
  /** SubscriptionClient for real-time WebSocket streams */
  sub: SubscriptionClient;
  /** Resolved configuration with lowercased builder address */
  config: HIP4Config;
  /**
   * Create an ExchangeClient for a specific wallet.
   * Pass a viem PrivateKeyAccount (from privateKeyToAccount) or any
   * wallet object compatible with @nktkas/hyperliquid.
   */
  exchange(wallet: unknown): ExchangeClient;
  /** Close the underlying WebSocket transport */
  close(): Promise<void>;
}

/**
 * Create a HIP-4 client with HTTP and WebSocket transports.
 *
 * The builder address is automatically lowercased. The exchange lowercases
 * addresses before computing the msgpack action hash, so a checksummed
 * address in the order payload produces a different hash and a wrong
 * recovered signer, resulting in authentication errors.
 */
export function createClient(opts: ClientConfig): HIP4Client {
  // Accept either `testnet` or `isTestnet` — `testnet` takes precedence for
  // consistency with @nktkas/hyperliquid transport options.
  const isTestnet = opts.testnet ?? opts.isTestnet ?? false;

  const config: HIP4Config = {
    apiUrl: isTestnet
      ? "https://api.hyperliquid-testnet.xyz"
      : "https://api.hyperliquid.xyz",
    wsUrl: isTestnet
      ? "wss://api.hyperliquid-testnet.xyz/ws"
      : "wss://api.hyperliquid.xyz/ws",
    isTestnet,
    builderAddress: (opts.builderAddress ?? "").toLowerCase(),
    builderFee: opts.builderFee ?? 0,
  };

  const httpTransport = new HttpTransport({ isTestnet });
  const wsTransport = new WebSocketTransport({ isTestnet });

  const info = new InfoClient({ transport: httpTransport });
  const sub = new SubscriptionClient({ transport: wsTransport });

  function exchange(wallet: unknown): ExchangeClient {
    return new ExchangeClient({ transport: httpTransport, wallet: wallet as any });
  }

  async function close(): Promise<void> {
    await wsTransport.close();
  }

  return { info, sub, config, exchange, close };
}
