import { test, expect, describe } from "bun:test";
import {
  computeTickSize,
  roundToTick,
  formatPrice,
  stripZeros,
} from "../src/pricing";

// ---------------------------------------------------------------------------
// computeTickSize
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

// ---------------------------------------------------------------------------
// roundToTick
// ---------------------------------------------------------------------------

describe("roundToTick", () => {
  test("rounds 0.55123 to a value close to 5 significant figures", () => {
    const result = roundToTick(0.55123);
    expect(result).toBeCloseTo(0.55123, 4);
  });
});

// ---------------------------------------------------------------------------
// formatPrice
// ---------------------------------------------------------------------------

describe("formatPrice", () => {
  test("strips trailing zeros", () => {
    expect(formatPrice(0.5)).toBe("0.5");
  });

  test("price near 1.0 has no trailing zeros", () => {
    const result = formatPrice(1.0);
    expect(result.endsWith("0")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// stripZeros
// ---------------------------------------------------------------------------

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
