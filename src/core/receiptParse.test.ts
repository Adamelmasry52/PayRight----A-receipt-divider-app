import { describe, it, expect } from "vitest";
import { parseReceiptLines } from "./receiptParse.ts";

describe("parseReceiptLines", () => {
  it("extracts items, subtotal and total from a typical English receipt", () => {
    const lines = [
      "THE TASTY SPOON",
      "Cairo, Egypt",
      "12/06/2026  13:45",
      "Margherita Pizza      90.00",
      "Greek Salad           45.00",
      "Fresh Orange Juice    15.00",
      "Subtotal             150.00",
      "Service 12%           18.00",
      "VAT 14%               21.00",
      "Total                189.00",
      "Thank you!",
    ];
    const r = parseReceiptLines(lines);

    expect(r.items.map((i) => i.name)).toEqual([
      "Margherita Pizza",
      "Greek Salad",
      "Fresh Orange Juice",
    ]);
    expect(r.items.map((i) => i.unitPrice)).toEqual([90, 45, 15]);
    expect(r.subtotal).toBe(150);
    expect(r.total).toBe(189);
  });

  it("skips service / VAT / tax / payment lines (not items)", () => {
    const lines = [
      "Burger 80.00",
      "Service Charge 9.60",
      "VAT 11.20",
      "Cash 120.00",
      "Change 19.20",
      "Total 100.80",
    ];
    const r = parseReceiptLines(lines);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].name).toBe("Burger");
    expect(r.total).toBe(100.8);
  });

  it("normalizes Arabic-Indic digits in prices", () => {
    const r = parseReceiptLines(["كشري ٧٥٫٠٠", "Total ٧٥٫٠٠"]);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].unitPrice).toBe(75);
    expect(r.total).toBe(75);
  });

  it("strips a trailing currency word and keeps the number", () => {
    const r = parseReceiptLines(["Koshary 75.00 EGP"]);
    expect(r.items[0]).toMatchObject({ name: "Koshary", unitPrice: 75, qty: 1 });
  });

  it("reads a leading quantity and derives unit price from the line total", () => {
    const r = parseReceiptLines(["2 Coke 60.00"]); // 60 is the line total
    expect(r.items[0]).toMatchObject({ name: "Coke", qty: 2, unitPrice: 30 });
  });

  it("reads a trailing quantity (Coke x2)", () => {
    const r = parseReceiptLines(["Water x3 45.00"]);
    expect(r.items[0]).toMatchObject({ name: "Water", qty: 3, unitPrice: 15 });
  });

  it("disambiguates subtotal from total", () => {
    const r = parseReceiptLines(["Subtotal 200.00", "Grand Total 230.00"]);
    expect(r.subtotal).toBe(200);
    expect(r.total).toBe(230);
    expect(r.items).toHaveLength(0);
  });

  it("ignores lines with no price and date/time rows", () => {
    const r = parseReceiptLines([
      "WELCOME", // no number → skipped
      "12:30", // time → skipped
      "01/02/2026", // date → skipped
      "Tea 20.00",
    ]);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].name).toBe("Tea");
  });

  it("returns empty/zero for unparseable input without throwing", () => {
    const r = parseReceiptLines(["", "   ", "!!!"]);
    expect(r.items).toEqual([]);
    expect(r.subtotal).toBe(0);
    expect(r.total).toBe(0);
  });
});
