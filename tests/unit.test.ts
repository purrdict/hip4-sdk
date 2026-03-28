import { test, expect, describe } from "bun:test";

// We test compiled output isn't available yet — import directly from src.
// All imports use .js extension (tsconfig moduleResolution: bundler resolves them).
import {
  parseDescription,
  discoverMarkets,
  getMinShares,
  formatLabel,
  periodMinutes,
  timeToExpiry,
} from "../src/markets";

import {
  computeTickSize,
  roundToTick,
  formatPrice,
  stripZeros,
  fairPrice,
  normalCDF,
} from "../src/pricing";

import {
  PREDICTION_ASSET_OFFSET,
  SPOT_ASSET_OFFSET,
  MIN_NOTIONAL,
  MAX_BUILDER_FEE,
  outcomeToAsset,
  isResting,
  isFilled,
  isError,
} from "../src/types";

import { resolveToken } from "../src/wallet";
import { createClient } from "../src/client";

// ---------------------------------------------------------------------------
// types.ts — constants
// ---------------------------------------------------------------------------

describe("constants", () => {
  test("PREDICTION_ASSET_OFFSET is 100_000_000", () => {
    expect(PREDICTION_ASSET_OFFSET).toBe(100_000_000);
  });

  test("SPOT_ASSET_OFFSET is 10_000", () => {
    expect(SPOT_ASSET_OFFSET).toBe(10_000);
  });

  test("MIN_NOTIONAL is 10", () => {
    expect(MIN_NOTIONAL).toBe(10);
  });

  test("MAX_BUILDER_FEE is 1000", () => {
    expect(MAX_BUILDER_FEE).toBe(1000);
  });

  test("outcomeToAsset adds offset", () => {
    expect(outcomeToAsset(90)).toBe(100_000_090);
    expect(outcomeToAsset(0)).toBe(100_000_000);
  });
});

// ---------------------------------------------------------------------------
// types.ts — OrderStatus narrowing
// ---------------------------------------------------------------------------

describe("OrderStatus narrowing", () => {
  test("isResting identifies resting orders", () => {
    expect(isResting({ resting: { oid: 1 } })).toBe(true);
    expect(isResting({ filled: { totalSz: "10", avgPx: "0.5", oid: 1 } })).toBe(false);
    expect(isResting({ error: "fail" })).toBe(false);
  });

  test("isFilled identifies filled orders", () => {
    expect(isFilled({ filled: { totalSz: "10", avgPx: "0.5", oid: 1 } })).toBe(true);
    expect(isFilled({ resting: { oid: 1 } })).toBe(false);
  });

  test("isError identifies error orders", () => {
    expect(isError({ error: "bad price" })).toBe(true);
    expect(isError({ resting: { oid: 1 } })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// markets.ts — parseDescription
// ---------------------------------------------------------------------------

describe("parseDescription", () => {
  const valid =
    "class:priceBinary|underlying:BTC|expiry:20260310-0300|targetPrice:66200|period:15m";

  test("parses a valid priceBinary description", () => {
    const result = parseDescription(valid);
    expect(result).not.toBeNull();
    expect(result!.class).toBe("priceBinary");
    expect(result!.underlying).toBe("BTC");
    expect(result!.targetPrice).toBe(66200);
    expect(result!.period).toBe("15m");
    expect(result!.expiry).toBeInstanceOf(Date);
    expect(result!.expiry.getUTCHours()).toBe(3);
  });

  test("returns null for empty string", () => {
    expect(parseDescription("")).toBeNull();
  });

  test("returns null for non-priceBinary class", () => {
    const nonBinary = valid.replace("priceBinary", "somethingElse");
    expect(parseDescription(nonBinary)).toBeNull();
  });

  test("returns null when underlying is missing", () => {
    const noUnderlying =
      "class:priceBinary|expiry:20260310-0300|targetPrice:66200|period:15m";
    expect(parseDescription(noUnderlying)).toBeNull();
  });

  test("returns null when string has no pipes", () => {
    expect(parseDescription("class:priceBinary")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// markets.ts — discoverMarkets
// ---------------------------------------------------------------------------

describe("discoverMarkets", () => {
  const futureExpiry = new Date(Date.now() + 3_600_000);
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  const expiryStr =
    `${futureExpiry.getUTCFullYear()}` +
    `${pad(futureExpiry.getUTCMonth() + 1)}` +
    `${pad(futureExpiry.getUTCDate())}` +
    `-${pad(futureExpiry.getUTCHours())}${pad(futureExpiry.getUTCMinutes())}`;

  const meta = {
    outcomes: [
      {
        outcome: 152,
        name: "BTC-15m",
        description: `class:priceBinary|underlying:BTC|expiry:${expiryStr}|targetPrice:65000|period:15m`,
        sideSpecs: [{ name: "Yes" }, { name: "No" }],
      },
      {
        outcome: 153,
        name: "NoPrice",
        description: `class:priceBinary|underlying:XYZ|expiry:${expiryStr}|targetPrice:1|period:1m`,
        sideSpecs: [{ name: "Yes" }, { name: "No" }],
      },
    ],
    questions: [],
  };

  const mids: Record<string, string> = { BTC: "65500" };

  test("discovers markets with available mids", () => {
    const markets = discoverMarkets(meta, mids);
    expect(markets).toHaveLength(1);
    expect(markets[0].underlying).toBe("BTC");
  });

  test("excludes markets with no mid price", () => {
    const markets = discoverMarkets(meta, mids);
    const xyz = markets.find((m) => m.underlying === "XYZ");
    expect(xyz).toBeUndefined();
  });

  test("sets correct coin numbers and assets", () => {
    const markets = discoverMarkets(meta, mids);
    const m = markets[0];
    expect(m.outcomeId).toBe(152);
    expect(m.yesCoinNum).toBe(1520);
    expect(m.noCoinNum).toBe(1521);
    expect(m.yesCoin).toBe("#1520");
    expect(m.noCoin).toBe("#1521");
    expect(m.yesAsset).toBe(100_001_520);
    expect(m.noAsset).toBe(100_001_521);
  });

  test("excludes expired markets", () => {
    const pastExpiry = "20200101-0000";
    const expiredMeta = {
      outcomes: [
        {
          outcome: 1,
          name: "old",
          description: `class:priceBinary|underlying:BTC|expiry:${pastExpiry}|targetPrice:50000|period:1d`,
          sideSpecs: [],
        },
      ],
      questions: [],
    };
    expect(discoverMarkets(expiredMeta, { BTC: "65000" })).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// markets.ts — getMinShares
// ---------------------------------------------------------------------------

describe("getMinShares", () => {
  test("markPx = 0.5 → 20 shares (symmetric)", () => {
    // min(0.5, 0.5) = 0.5 → ceil(10 / 0.5) = 20
    expect(getMinShares(0.5)).toBe(20);
  });

  test("markPx = 0.9 → around 100-101 shares (low liquidity on no side)", () => {
    // min(0.9, 0.1) = 0.1, but 1 - 0.9 = 0.09999... in floating point
    // so ceil(10 / 0.09999...) = 101. Accept a small range.
    const result = getMinShares(0.9);
    expect(result).toBeGreaterThanOrEqual(100);
    expect(result).toBeLessThanOrEqual(101);
  });

  test("markPx = 0.1 → around 100-101 shares (symmetric with 0.9)", () => {
    // min(0.1, 0.9) = 0.1 → ceil(10 / 0.1) = 100
    const result = getMinShares(0.1);
    expect(result).toBeGreaterThanOrEqual(100);
    expect(result).toBeLessThanOrEqual(101);
  });

  test("markPx = 0.25 → 40 shares", () => {
    // min(0.25, 0.75) = 0.25 → ceil(10 / 0.25) = 40
    expect(getMinShares(0.25)).toBe(40);
  });

  test("markPx = 0.99 → 1000 shares (near limit, clamped)", () => {
    // min(0.99, 0.01) = 0.01 → ceil(10 / 0.01) = 1000
    expect(getMinShares(0.99)).toBe(1000);
  });

  test("markPx = 0 → 1000 shares (clamped to 0.01)", () => {
    // max(min(0, 1), 0.01) = 0.01 → ceil(10 / 0.01) = 1000
    expect(getMinShares(0)).toBe(1000);
  });

  test("markPx = 1 → 1000 shares (clamped to 0.01)", () => {
    // min(1, 0) = 0, clamped to 0.01 → 1000
    expect(getMinShares(1)).toBe(1000);
  });

  test("result is always a whole number", () => {
    for (const px of [0.33, 0.67, 0.12, 0.88]) {
      expect(Number.isInteger(getMinShares(px))).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// markets.ts — periodMinutes
// ---------------------------------------------------------------------------

describe("periodMinutes", () => {
  test.each([
    ["1m", 1],
    ["5m", 5],
    ["15m", 15],
    ["1h", 60],
    ["4h", 240],
    ["1d", 1440],
  ])("parses %s as %d minutes", (period, expected) => {
    expect(periodMinutes(period)).toBe(expected);
  });

  test("unknown format falls back to 15", () => {
    expect(periodMinutes("2w")).toBe(15);
    expect(periodMinutes("")).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// markets.ts — formatLabel
// ---------------------------------------------------------------------------

describe("formatLabel", () => {
  test("formats market label correctly", () => {
    const market = {
      outcomeId: 1,
      underlying: "BTC",
      targetPrice: 65000,
      expiry: new Date(),
      period: "15m",
      yesCoinNum: 10,
      noCoinNum: 11,
      yesCoin: "#10",
      noCoin: "#11",
      yesAsset: 100_000_010,
      noAsset: 100_000_011,
    };
    expect(formatLabel(market)).toBe("BTC-15m");
  });
});

// ---------------------------------------------------------------------------
// markets.ts — timeToExpiry
// ---------------------------------------------------------------------------

describe("timeToExpiry", () => {
  test("returns positive minutes for future expiry", () => {
    const market = {
      outcomeId: 1,
      underlying: "BTC",
      targetPrice: 65000,
      expiry: new Date(Date.now() + 60_000 * 30),
      period: "15m",
      yesCoinNum: 10,
      noCoinNum: 11,
      yesCoin: "#10",
      noCoin: "#11",
      yesAsset: 100_000_010,
      noAsset: 100_000_011,
    };
    const ttl = timeToExpiry(market);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(30);
  });

  test("returns negative minutes for past expiry", () => {
    const market = {
      outcomeId: 1,
      underlying: "BTC",
      targetPrice: 65000,
      expiry: new Date(Date.now() - 60_000 * 10),
      period: "15m",
      yesCoinNum: 10,
      noCoinNum: 11,
      yesCoin: "#10",
      noCoin: "#11",
      yesAsset: 100_000_010,
      noAsset: 100_000_011,
    };
    expect(timeToExpiry(market)).toBeLessThan(0);
  });
});

// ---------------------------------------------------------------------------
// pricing.ts — normalCDF
// ---------------------------------------------------------------------------

describe("normalCDF", () => {
  test("Phi(0) = 0.5", () => {
    expect(normalCDF(0)).toBeCloseTo(0.5, 5);
  });

  test("Phi(1.96) ≈ 0.975", () => {
    expect(normalCDF(1.96)).toBeCloseTo(0.975, 2);
  });

  test("Phi(-∞) ≈ 0", () => {
    expect(normalCDF(-10)).toBeCloseTo(0, 5);
  });

  test("Phi(+∞) ≈ 1", () => {
    expect(normalCDF(10)).toBeCloseTo(1, 5);
  });
});

// ---------------------------------------------------------------------------
// pricing.ts — fairPrice
// ---------------------------------------------------------------------------

describe("fairPrice", () => {
  test("above target with plenty of time → high probability", () => {
    const p = fairPrice(66000, 65000, 60, "BTC");
    expect(p).toBeGreaterThan(0.5);
    expect(p).toBeLessThanOrEqual(0.995);
  });

  test("below target with plenty of time → low probability", () => {
    const p = fairPrice(64000, 65000, 60, "BTC");
    expect(p).toBeLessThan(0.5);
    expect(p).toBeGreaterThanOrEqual(0.005);
  });

  test("at expiry, above target → 1.0", () => {
    expect(fairPrice(65001, 65000, 0, "BTC")).toBe(1.0);
  });

  test("at expiry, below target → 0.0", () => {
    expect(fairPrice(64999, 65000, 0, "BTC")).toBe(0.0);
  });

  test("result is always within [0.005, 0.995]", () => {
    const cases = [
      [100, 65000, 1],
      [65001, 65000, 0.1],
      [1_000_000, 65000, 120],
    ];
    for (const [s, k, t] of cases) {
      const p = fairPrice(s, k, t, "BTC");
      expect(p).toBeGreaterThanOrEqual(0.005);
      expect(p).toBeLessThanOrEqual(0.995);
    }
  });
});

// ---------------------------------------------------------------------------
// pricing.ts — tick size
// ---------------------------------------------------------------------------

describe("computeTickSize", () => {
  test.each([
    [0.55, 0.00001],
    [0.99, 0.00001],
    [1.0, 0.0001],
    [5.0, 0.0001],
    [10.0, 0.001],
    [65000, 1],
  ])("price %f → tick %f", (price, tick) => {
    expect(computeTickSize(price)).toBeCloseTo(tick, 10);
  });

  test("non-positive price falls back to 0.00001", () => {
    expect(computeTickSize(0)).toBe(0.00001);
    expect(computeTickSize(-1)).toBe(0.00001);
  });
});

describe("roundToTick", () => {
  test("rounds 0.55123 to a value close to 5 significant figures", () => {
    const result = roundToTick(0.55123);
    // Tick for price ~0.55 is 0.00001 (5 sig figs). Result should be within
    // one tick of the original. Floating point: just check it's close.
    expect(result).toBeCloseTo(0.55123, 4);
  });
});

// ---------------------------------------------------------------------------
// pricing.ts — formatPrice / stripZeros
// ---------------------------------------------------------------------------

describe("formatPrice", () => {
  test("strips trailing zeros", () => {
    // 0.5 with tick 0.00001 → "0.5"
    expect(formatPrice(0.5)).toBe("0.5");
  });

  test("price near 1.0 has no trailing zeros", () => {
    const result = formatPrice(1.0);
    expect(result.endsWith("0")).toBe(false);
  });
});

describe("stripZeros", () => {
  test.each([
    ["0.650", "0.65"],
    ["35.810", "35.81"],
    ["1.0", "1"],
    ["100", "100"],
    ["1.23456", "1.23456"],
  ])("stripZeros(%s) = %s", (input, expected) => {
    expect(stripZeros(input)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// wallet.ts — resolveToken
// ---------------------------------------------------------------------------

describe("resolveToken", () => {
  test("returns full format unchanged", () => {
    const full = "USDH:0x471fd4480bb9943a1fe080ab0d4ff36c";
    expect(resolveToken(full)).toBe(full);
  });

  test("resolves USDH bare name", () => {
    const result = resolveToken("USDH");
    expect(result).toBe("USDH:0x471fd4480bb9943a1fe080ab0d4ff36c");
  });

  test("resolves USDC bare name", () => {
    const result = resolveToken("USDC");
    expect(result).toBe("USDC:0xeb62eee3685fc4c43992febcd9e75443");
  });

  test("throws for unknown bare name", () => {
    expect(() => resolveToken("HYPE")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// client.ts — createClient config
// ---------------------------------------------------------------------------

describe("createClient config", () => {
  test("testnet: true sets isTestnet and testnet API URLs", () => {
    const client = createClient({ testnet: true, builderFee: 0 });
    expect(client.config.isTestnet).toBe(true);
    expect(client.config.apiUrl).toBe("https://api.hyperliquid-testnet.xyz");
    expect(client.config.wsUrl).toBe("wss://api.hyperliquid-testnet.xyz/ws");
    client.close();
  });

  test("testnet: false sets mainnet URLs", () => {
    const client = createClient({ testnet: false, builderFee: 0 });
    expect(client.config.isTestnet).toBe(false);
    expect(client.config.apiUrl).toBe("https://api.hyperliquid.xyz");
    expect(client.config.wsUrl).toBe("wss://api.hyperliquid.xyz/ws");
    client.close();
  });

  test("isTestnet: true (legacy alias) works", () => {
    const client = createClient({ isTestnet: true, builderFee: 0 });
    expect(client.config.isTestnet).toBe(true);
    expect(client.config.apiUrl).toContain("testnet");
    client.close();
  });

  test("testnet takes precedence over isTestnet", () => {
    const client = createClient({ testnet: true, isTestnet: false, builderFee: 0 });
    expect(client.config.isTestnet).toBe(true);
    client.close();
  });

  test("default is mainnet when no flag provided", () => {
    const client = createClient({ builderFee: 0 });
    expect(client.config.isTestnet).toBe(false);
    expect(client.config.apiUrl).toBe("https://api.hyperliquid.xyz");
    client.close();
  });

  test("builderAddress is lowercased automatically", () => {
    const client = createClient({
      builderAddress: "0xABCDEF1234567890ABCDEF1234567890ABCDEF12",
      builderFee: 100,
    });
    expect(client.config.builderAddress).toBe(
      "0xabcdef1234567890abcdef1234567890abcdef12",
    );
    client.close();
  });

  test("builderAddress defaults to empty string when omitted", () => {
    const client = createClient({ builderFee: 0 });
    expect(client.config.builderAddress).toBe("");
    client.close();
  });

  test("builderFee defaults to 0 when omitted", () => {
    const client = createClient({});
    expect(client.config.builderFee).toBe(0);
    client.close();
  });
});
