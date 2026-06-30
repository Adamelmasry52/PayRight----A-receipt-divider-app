import { describe, it, expect } from "vitest";
import { parseReceiptLines } from "./receiptParse.ts";

describe("parseReceiptLines — English", () => {
  it("extracts items and classifies subtotal/total/service/vat as fields", () => {
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
    expect(r.service).toBe(18);
    expect(r.tax).toBe(21);
    expect(r.total).toBe(189);
  });

  it("never turns a labeled field into an item", () => {
    const lines = ["Burger 80.00", "Subtotal 80.00", "Service 9.60", "Total 100.80"];
    const r = parseReceiptLines(lines);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].name).toBe("Burger");
  });

  it("classifies a space-stripped 'MwSt' line as tax, not an item", () => {
    // OCR can drop spaces: "MwSt Nr 430234" → "MwStNr430234".
    const r = parseReceiptLines([
      "Schnitzel 22.00",
      "MwStNr430234",
      "MwSt 54.50 CHF: 3.85",
    ]);
    expect(r.items.map((i) => i.name)).toEqual(["Schnitzel"]);
    expect(r.tax).toBeGreaterThan(0); // the MwSt line classified, not an item
  });

  it("disambiguates subtotal from total (substring trap)", () => {
    const r = parseReceiptLines(["Subtotal 200.00", "Grand Total 230.00"]);
    expect(r.subtotal).toBe(200);
    expect(r.total).toBe(230);
    expect(r.items).toHaveLength(0);
  });

  it("skips payment, date/time and email rows", () => {
    const r = parseReceiptLines([
      "WELCOME",
      "12:30",
      "01/02/2026",
      "Cash 120.00",
      "Change 19.20",
      "info@spoon.example",
      "Tea 20.00",
    ]);
    expect(r.items.map((i) => i.name)).toEqual(["Tea"]);
  });

  it("reads a leading/trailing quantity and derives unit price", () => {
    const r = parseReceiptLines(["2 Coke 60.00", "Water x3 45.00"]);
    expect(r.items[0]).toMatchObject({ name: "Coke", qty: 2, unitPrice: 30 });
    expect(r.items[1]).toMatchObject({ name: "Water", qty: 3, unitPrice: 15 });
  });

  it("strips a trailing currency word and keeps the number", () => {
    const r = parseReceiptLines(["Koshary 75.00 EGP"]);
    expect(r.items[0]).toMatchObject({ name: "Koshary", unitPrice: 75, qty: 1 });
  });
});

describe("parseReceiptLines — Arabic", () => {
  it("classifies Arabic labels and reads Arabic-Indic prices", () => {
    const lines = [
      "كشري ٧٥٫٠٠",
      "فراخ ١٢٠٫٠٠",
      "المجموع الفرعي ١٩٥٫٠٠",
      "خدمة ١٢٪ ٢٣٫٤٠",
      "ضريبة القيمة المضافة ٣٠٫٥٠",
      "الإجمالي ٢٤٨٫٩٠",
    ];
    const r = parseReceiptLines(lines);

    expect(r.items).toHaveLength(2);
    expect(r.items.map((i) => i.unitPrice)).toEqual([75, 120]);
    expect(r.subtotal).toBe(195);
    expect(r.service).toBe(23.4);
    expect(r.tax).toBe(30.5);
    expect(r.total).toBe(248.9);
  });

  it("matches each Arabic label individually", () => {
    expect(parseReceiptLines(["خدمة ١٠٫٠٠"]).service).toBe(10);
    expect(parseReceiptLines(["ضريبة ٥٫٠٠"]).tax).toBe(5);
    expect(parseReceiptLines(["المجموع ١٠٠٫٠٠"]).total).toBe(100);
    expect(parseReceiptLines(["الإجمالي ٢٠٠٫٠٠"]).total).toBe(200);
  });
});

describe("parseReceiptLines — robustness", () => {
  it("returns empty/zero for unparseable input without throwing", () => {
    const r = parseReceiptLines(["", "   ", "!!!"]);
    expect(r.items).toEqual([]);
    expect(r.subtotal).toBe(0);
    expect(r.total).toBe(0);
    expect(r.service).toBe(0);
    expect(r.tax).toBe(0);
  });
});
