import { describe, it, expect } from "vitest";
import { normalizeDigits, parseMoney } from "./parse.ts";

describe("normalizeDigits", () => {
  it("maps Arabic-Indic numerals to Western", () => {
    expect(normalizeDigits("١٢٣٤٥٦٧٨٩٠")).toBe("1234567890");
  });

  it("maps Persian (extended Arabic-Indic) numerals", () => {
    expect(normalizeDigits("۲۰۰")).toBe("200");
  });

  it("maps Arabic decimal and thousands separators", () => {
    expect(normalizeDigits("١٢٣٫٤٥")).toBe("123.45");
    expect(normalizeDigits("١٬٢٣٤")).toBe("1,234");
  });

  it("leaves Western digits and other characters untouched", () => {
    expect(normalizeDigits("Total: 123.45 EGP")).toBe("Total: 123.45 EGP");
  });
});

describe("parseMoney", () => {
  it("parses Western and Arabic-Indic amounts", () => {
    expect(parseMoney("123.45")).toBe(123.45);
    expect(parseMoney("١٢٣٫٤٥")).toBe(123.45);
  });

  it("strips currency words, thousands separators, and noise", () => {
    expect(parseMoney("EGP 1,234.50")).toBe(1234.5);
    expect(parseMoney("  200 ")).toBe(200);
  });

  it("returns null when there is no number", () => {
    expect(parseMoney("Subtotal")).toBeNull();
    expect(parseMoney("")).toBeNull();
  });
});
