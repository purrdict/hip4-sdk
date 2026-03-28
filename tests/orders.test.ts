import { test, expect, describe } from "bun:test";
import { buildOrderAction } from "../src/orders";
import { PREDICTION_ASSET_OFFSET } from "../src/types";

const YES_ASSET = PREDICTION_ASSET_OFFSET + 1520; // coin #1520

// ---------------------------------------------------------------------------
// buildOrderAction — happy path
// ---------------------------------------------------------------------------

describe("buildOrderAction — valid inputs", () => {
  test("returns ok with correct field structure", () => {
    const result = buildOrderAction({
      asset: YES_ASSET,
      isBuy: true,
      price: 0.55,
      size: 25,
    });

    expect("ok" in result).toBe(true);
    if (!("ok" in result)) return;

    const action = result.ok;
    expect(action.grouping).toBe("na");
    expect(action.orders).toHaveLength(1);

    const order = action.orders[0];
    expect(order.a).toBe(YES_ASSET);
    expect(order.b).toBe(true);
    expect(order.r).toBe(false);
    expect(order.t).toEqual({ limit: { tif: "Gtc" } });
  });

  test("price is formatted with tick size and no trailing zeros", () => {
    const result = buildOrderAction({
      asset: YES_ASSET,
      isBuy: true,
      price: 0.5,
      size: 25,
    });

    expect("ok" in result).toBe(true);
    if (!("ok" in result)) return;
    expect(result.ok.orders[0].p).toBe("0.5");
  });

  test("price 0.65000 is stripped to '0.65'", () => {
    const result = buildOrderAction({
      asset: YES_ASSET,
      isBuy: false,
      price: 0.65,
      size: 25,
    });

    expect("ok" in result).toBe(true);
    if (!("ok" in result)) return;
    expect(result.ok.orders[0].p).toBe("0.65");
  });

  test("size is converted to string", () => {
    const result = buildOrderAction({
      asset: YES_ASSET,
      isBuy: true,
      price: 0.55,
      size: 42,
    });

    expect("ok" in result).toBe(true);
    if (!("ok" in result)) return;
    expect(result.ok.orders[0].s).toBe("42");
  });

  test("tif defaults to Gtc", () => {
    const result = buildOrderAction({
      asset: YES_ASSET,
      isBuy: true,
      price: 0.5,
      size: 20,
    });

    expect("ok" in result).toBe(true);
    if (!("ok" in result)) return;
    expect(result.ok.orders[0].t).toEqual({ limit: { tif: "Gtc" } });
  });

  test("custom tif is passed through", () => {
    const result = buildOrderAction({
      asset: YES_ASSET,
      isBuy: true,
      price: 0.5,
      size: 20,
      tif: "Ioc",
    });

    expect("ok" in result).toBe(true);
    if (!("ok" in result)) return;
    expect(result.ok.orders[0].t).toEqual({ limit: { tif: "Ioc" } });
  });

  test("reduceOnly is passed through", () => {
    const result = buildOrderAction({
      asset: YES_ASSET,
      isBuy: false,
      price: 0.5,
      size: 20,
      reduceOnly: true,
    });

    expect("ok" in result).toBe(true);
    if (!("ok" in result)) return;
    expect(result.ok.orders[0].r).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildOrderAction — builder fee
// ---------------------------------------------------------------------------

describe("buildOrderAction — builder fee", () => {
  test("attaches builder when builderFee > 0 and address provided", () => {
    const result = buildOrderAction({
      asset: YES_ASSET,
      isBuy: false,
      price: 0.55,
      size: 25,
      builderAddress: "0xABCDEF1234567890ABCDEF1234567890ABCDEF12",
      builderFee: 100,
    });

    expect("ok" in result).toBe(true);
    if (!("ok" in result)) return;
    expect(result.ok.builder).toBeDefined();
    expect(result.ok.builder!.f).toBe(100);
    // Builder address must be lowercased
    expect(result.ok.builder!.b).toBe("0xabcdef1234567890abcdef1234567890abcdef12");
  });

  test("no builder when builderFee is 0", () => {
    const result = buildOrderAction({
      asset: YES_ASSET,
      isBuy: false,
      price: 0.55,
      size: 25,
      builderAddress: "0xabc",
      builderFee: 0,
    });

    expect("ok" in result).toBe(true);
    if (!("ok" in result)) return;
    expect(result.ok.builder).toBeUndefined();
  });

  test("no builder when builderAddress is empty", () => {
    const result = buildOrderAction({
      asset: YES_ASSET,
      isBuy: false,
      price: 0.55,
      size: 25,
      builderAddress: "",
      builderFee: 100,
    });

    expect("ok" in result).toBe(true);
    if (!("ok" in result)) return;
    expect(result.ok.builder).toBeUndefined();
  });

  test("no builder when builderAddress is omitted", () => {
    const result = buildOrderAction({
      asset: YES_ASSET,
      isBuy: false,
      price: 0.55,
      size: 25,
      builderFee: 100,
    });

    expect("ok" in result).toBe(true);
    if (!("ok" in result)) return;
    expect(result.ok.builder).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// buildOrderAction — validation errors
// ---------------------------------------------------------------------------

describe("buildOrderAction — validation", () => {
  test("returns err when size < 1", () => {
    const result = buildOrderAction({
      asset: YES_ASSET,
      isBuy: true,
      price: 0.5,
      size: 0,
    });
    expect("err" in result).toBe(true);
  });

  test("returns err when notional < MIN_NOTIONAL", () => {
    // price × size = 0.5 × 5 = 2.5 < 10
    const result = buildOrderAction({
      asset: YES_ASSET,
      isBuy: true,
      price: 0.5,
      size: 5,
    });
    expect("err" in result).toBe(true);
  });

  test("returns err when size below getMinShares(markPx)", () => {
    // markPx = 0.5 → minShares = 20. size=10 < 20
    const result = buildOrderAction({
      asset: YES_ASSET,
      isBuy: true,
      price: 0.5,
      size: 10,
      markPx: 0.5,
    });
    expect("err" in result).toBe(true);
    if (!("err" in result)) return;
    expect(result.err).toContain("minimum");
  });

  test("passes when size exactly meets getMinShares(markPx)", () => {
    // markPx = 0.5 → minShares = 20. size=20 is exactly valid.
    const result = buildOrderAction({
      asset: YES_ASSET,
      isBuy: true,
      price: 0.5,
      size: 20,
      markPx: 0.5,
    });
    expect("ok" in result).toBe(true);
  });
});
