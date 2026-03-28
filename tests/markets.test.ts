import { test, expect, describe } from "bun:test";
import {
  parseDescription,
  discoverMarkets,
  getMinShares,
  formatLabel,
  periodMinutes,
  timeToExpiry,
} from "../src/markets";
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
// parseDescription
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
// discoverMarkets
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
// getMinShares
// ---------------------------------------------------------------------------

describe("getMinShares", () => {
  test("markPx = 0.5 → 20 shares (symmetric)", () => {
    expect(getMinShares(0.5)).toBe(20);
  });

  test("markPx = 0.9 → around 100-101 shares", () => {
    const result = getMinShares(0.9);
    expect(result).toBeGreaterThanOrEqual(100);
    expect(result).toBeLessThanOrEqual(101);
  });

  test("markPx = 0.1 → around 100-101 shares (symmetric with 0.9)", () => {
    const result = getMinShares(0.1);
    expect(result).toBeGreaterThanOrEqual(100);
    expect(result).toBeLessThanOrEqual(101);
  });

  test("markPx = 0.25 → 40 shares", () => {
    expect(getMinShares(0.25)).toBe(40);
  });

  test("markPx = 0.99 → 1000 shares (clamped)", () => {
    expect(getMinShares(0.99)).toBe(1000);
  });

  test("markPx = 0 → 1000 shares (clamped to 0.01)", () => {
    expect(getMinShares(0)).toBe(1000);
  });

  test("markPx = 1 → 1000 shares (clamped to 0.01)", () => {
    expect(getMinShares(1)).toBe(1000);
  });

  test("result is always a whole number", () => {
    for (const px of [0.33, 0.67, 0.12, 0.88]) {
      expect(Number.isInteger(getMinShares(px))).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// periodMinutes
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
// formatLabel
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
// timeToExpiry
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
