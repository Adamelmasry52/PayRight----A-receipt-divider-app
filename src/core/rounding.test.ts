import { describe, it, expect } from "vitest";
import { ceilMoney, roundMoney, approxEqual } from "./rounding.ts";

describe("ceilMoney", () => {
  it("rounds up to 2dp", () => {
    expect(ceilMoney(33.331)).toBe(33.34);
    expect(ceilMoney(33.3333)).toBe(33.34);
    expect(ceilMoney(0.001)).toBe(0.01);
  });

  it("leaves an exact 2dp value untouched despite float representation", () => {
    expect(ceilMoney(12.34)).toBe(12.34);
    // 0.1 + 0.2 = 0.30000000000000004 — must NOT bump to 0.31.
    expect(ceilMoney(0.1 + 0.2)).toBe(0.3);
  });

  it("handles whole numbers and zero", () => {
    expect(ceilMoney(0)).toBe(0);
    expect(ceilMoney(200)).toBe(200);
  });

  it("throws on non-finite input", () => {
    expect(() => ceilMoney(Infinity)).toThrow(RangeError);
    expect(() => ceilMoney(NaN)).toThrow(RangeError);
  });
});

describe("roundMoney", () => {
  it("rounds half up to 2dp", () => {
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(1.004)).toBe(1.0);
    expect(roundMoney(2.345)).toBe(2.35);
  });
});

describe("approxEqual", () => {
  it("treats values within half a cent as equal", () => {
    expect(approxEqual(200, 200.004)).toBe(true);
    expect(approxEqual(200, 200.02)).toBe(false);
  });
});
