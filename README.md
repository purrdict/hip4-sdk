# @purrdict/hip4

TypeScript SDK for [HIP-4](https://hyperliquid.xyz) prediction markets on Hyperliquid.

Built on top of [@nktkas/hyperliquid](https://github.com/nktkas/hyperliquid) with HIP-4-specific conventions for market discovery, order placement, real-time subscriptions, and binary option pricing.

> Powered by [purrdict.xyz](https://purrdict.xyz) — prediction markets on Hyperliquid.

---

## Installation

```bash
npm install @purrdict/hip4 @nktkas/hyperliquid viem
# or
bun add @purrdict/hip4 @nktkas/hyperliquid viem
```

`@nktkas/hyperliquid` and `viem` are peer dependencies.

---

## Quick Start

```typescript
import { createClient, discoverMarkets, placeOrder, subscribePrices } from "@purrdict/hip4";
import { privateKeyToAccount } from "viem/accounts";

// 1. Create a client (testnet)
const client = createClient({
  testnet: true,              // or isTestnet: true — both work
  builderAddress: "0xYourBuilderAddress",
  builderFee: 100, // 0.1% on sells
});

// 2. Discover active markets
import { fetchOutcomeMeta, fetchAllMids } from "@purrdict/hip4";

const [meta, mids] = await Promise.all([
  fetchOutcomeMeta(client.info),
  fetchAllMids(client.info),
]);

const markets = discoverMarkets(meta, mids);
console.log(markets.map(m => `${m.underlying}-${m.period} (yes: ${m.yesCoin})`));

// 3. Subscribe to live prices
const sub = await subscribePrices(client.sub, ({ mids }) => {
  const btcMid = mids["BTC"];
  const yesMid = mids["#1520"]; // prediction market # coin
  console.log({ btcMid, yesMid });
});

// 4. Place an order
const wallet = privateKeyToAccount("0xYourPrivateKey");
const exchange = client.exchange(wallet);

const status = await placeOrder(exchange, client.config, {
  asset: markets[0].yesAsset, // 100_000_000 + coinNum
  isBuy: true,
  price: 0.55,
  size: 20,  // shares — use getMinShares(markPx) for the minimum
  tif: "Gtc",
});

console.log(status); // { resting: { oid: 12345 } }

// 5. Clean up
await sub.unsubscribe();
await client.close();
```

---

## API Reference

### Client

```typescript
import { createClient } from "@purrdict/hip4";

const client = createClient({
  testnet: boolean,        // default: false (mainnet). alias: isTestnet
  builderAddress: string,  // your builder address (auto-lowercased). default: ""
  builderFee: number,      // tenths of a bps (100 = 0.1%, 1000 = 1.0% max). default: 0
});

// client.info    — InfoClient (read-only queries)
// client.sub     — SubscriptionClient (WebSocket streams)
// client.config  — HIP4Config (resolved config)
// client.exchange(wallet) — ExchangeClient for a specific wallet
// client.close() — close the WebSocket transport
```

### Markets

```typescript
import { discoverMarkets, getMinShares, parseDescription, formatLabel, periodMinutes, timeToExpiry } from "@purrdict/hip4";

// Discover all active priceBinary markets
const markets = discoverMarkets(outcomeMeta, allMids);

// Minimum shares for an order (formula: ceil(10 / min(markPx, 1 - markPx)))
const minShares = getMinShares(0.55); // → 19

// Human label: "BTC-15m", "HYPE-4h"
const label = formatLabel(market);

// Minutes until expiry (negative = expired)
const ttl = timeToExpiry(market);

// Parse a period string to minutes
const mins = periodMinutes("4h"); // → 240
```

### Pricing

```typescript
import { fairPrice, formatPrice, stripZeros, computeTickSize, computeQuote } from "@purrdict/hip4";

// Fair probability using a Black-Scholes-inspired model
const p = fairPrice(
  65500,   // current underlying price
  65000,   // target/strike price
  30,      // minutes to expiry
  "BTC",   // symbol for vol lookup
  1.5,     // vol multiplier (default)
);

// Format a price for signing (tick-aligned + trailing zeros stripped)
const priceStr = formatPrice(0.65000); // → "0.65"

// Strip trailing zeros from any numeric string
const clean = stripZeros("35.810"); // → "35.81"

// Tick size for a given price (5 significant figures rule)
const tick = computeTickSize(0.55); // → 0.00001
```

### Orders

```typescript
import { placeOrder, placePerpOrder, cancelOrder, cancelAllOrders } from "@purrdict/hip4";

// Prediction market limit order
const status = await placeOrder(exchange, config, {
  asset: market.yesAsset, // 100_000_000 + coinNum
  isBuy: true,
  price: 0.55,
  size: 20,
  tif: "Gtc",         // "Gtc" | "Ioc" | "Alo"
  markPx: 0.55,        // optional — enables getMinShares() validation
  reduceOnly: false,
});

// Perpetual futures order
const perpStatus = await placePerpOrder(exchange, config, {
  asset: 135, // HYPE-PERP
  isBuy: true,
  price: "33.81",  // string, trailing zeros stripped automatically
  size: "10",
});

// Cancel by asset + order ID
const cancelled = await cancelOrder(exchange, market.yesAsset, 12345);

// Cancel all orders (or filter by coin names)
const count = await cancelAllOrders(exchange, info, "0xYourAddress", ["#1520"]);
```

### Wallet

```typescript
import { getBalances, sendAsset, approveBuilderFee, ensureBuilderApproval } from "@purrdict/hip4";

// Spot balances
const balances = await getBalances(info, "0xYourAddress");
console.log(balances.usdh.free); // free USDH

// Send tokens to another address
await sendAsset(exchange, "0xDestination", "50", "USDH");

// Approve builder fee (required before first order with a builder fee)
await approveBuilderFee(exchange, "0xBuilderAddress", "1%");

// Or use ensureBuilderApproval to check and approve only if needed
await ensureBuilderApproval(exchange, info, "0xYourAddress", config);
```

### Subscriptions

```typescript
import { subscribePrices, subscribeBook, subscribeTrades, subscribeUserFills } from "@purrdict/hip4";

// All mid prices (~100ms updates, covers all perps and # coins)
const priceSub = await subscribePrices(client.sub, ({ mids }) => {
  console.log(mids["BTC"], mids["#1520"]);
});

// L2 orderbook for a specific coin
const bookSub = await subscribeBook(client.sub, "#1520", (update) => {
  const [bids, asks] = update.levels;
  console.log("best bid:", bids[0]?.px);
});

// Recent trades
const tradesSub = await subscribeTrades(client.sub, "#1520", (trades) => {
  trades.forEach(t => console.log(t.side, t.px, t.sz));
});

// User fills (including settlement)
const fillsSub = await subscribeUserFills(client.sub, "0xYourAddress", (fills) => {
  fills.forEach(f => {
    if (f.dir === "Settlement") {
      console.log(f.px === "1.0" ? "WON" : "LOST", f.closedPnl);
    }
  });
});

// Always unsubscribe when done (especially for settled # coins)
await priceSub.unsubscribe();
await bookSub.unsubscribe();
```

---

## Key Conventions

### Coin naming

| Prefix | Usage |
|--------|-------|
| `#90`  | API coin — allMids, l2Book, candle, recentTrades |
| `+90`  | Token balance key in spotClearinghouseState |
| `@90`  | Spot token pair (empty orderbook, not traded directly) |

### Order asset field

All prediction market orders use:

```
a = 100_000_000 + coinNum
```

Example: coin `#1520` → `a = 100_001_520`

Spot pairs (e.g. USDH/USDC) use:

```
a = 10_000 + pairIndex
```

### Builder fees

- Applies to **sell orders only** on prediction markets (buy fee is always 0)
- Fee is deducted from USDH received on the sell
- Builder address must hold 100+ USDC in a Hyperliquid perps account
- Address **must be lowercased** — checksummed addresses produce signing errors
- Maximum fee: `f = 1000` (1.0%)
- Revoke: `approveBuilderFee(exchange, builder, "0%")`

### Signing rules

Trailing zeros **must be stripped** from price and size strings before signing:

```typescript
"0.650" // WRONG — causes signing mismatch
"0.65"  // CORRECT
```

The exchange strips trailing zeros before msgpack hashing. If your client sends
a different string, the recovered signer address will differ, producing an
authentication error ("User or API Wallet does not exist").

Use `formatPrice()` for prices and `stripZeros()` for raw numeric strings.

### Mirrored orderbook

HIP-4 markets use a mirrored orderbook: placing a buy on one side automatically
creates the complementary sell on the other side:

- Buy Yes at 0.55 → visible as Sell No at 0.45
- Buy No at 0.42 → visible as Sell Yes at 0.58

This means you only need to post buy orders to make a two-sided market.

---

## Resources

- [Purrdict](https://purrdict.xyz) — HIP-4 prediction market app
- [Hyperliquid](https://hyperliquid.xyz) — underlying exchange
- [@nktkas/hyperliquid](https://github.com/nktkas/hyperliquid) — underlying TypeScript client

---

## License

MIT
