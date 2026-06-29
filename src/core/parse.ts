/*
  Text normalization for the OCR/parse pipeline (spec §3.4). Step 2 owns the
  one piece the math depends on: turning Arabic-Indic numerals into Western
  digits BEFORE any numeric parsing. Layout heuristics land in Step 6.
*/

// Arabic-Indic (U+0660–U+0669) and Extended/Persian Arabic-Indic (U+06F0–U+06F9).
const DIGIT_OFFSETS = [0x0660, 0x06f0] as const;

/**
 * Normalize Arabic-Indic and Persian numerals to Western 0–9, and the Arabic
 * decimal separator (U+066B ٫) and thousands separator (U+066C ٬) to "." and ",".
 * Leaves all other characters untouched.
 */
export function normalizeDigits(input: string): string {
  let out = "";
  for (const ch of input) {
    const code = ch.codePointAt(0)!;
    let mapped = ch;
    for (const base of DIGIT_OFFSETS) {
      if (code >= base && code <= base + 9) {
        mapped = String.fromCharCode(48 + (code - base)); // 48 = "0"
        break;
      }
    }
    if (mapped === ch) {
      if (ch === "٫") mapped = "."; // Arabic decimal separator
      else if (ch === "٬") mapped = ","; // Arabic thousands separator
    }
    out += mapped;
  }
  return out;
}

/**
 * Parse a money-ish string to a number after digit normalization.
 * Strips thousands separators and any non-numeric noise (currency words,
 * stray glyphs). Returns null when no sensible number is present.
 */
export function parseMoney(input: string): number | null {
  const normalized = normalizeDigits(input).trim();
  // Keep digits, separators and sign; drop everything else (e.g. "EGP", spaces).
  const cleaned = normalized.replace(/[^\d.,-]/g, "");
  if (cleaned === "") return null;

  // Treat "," as a thousands separator, "." as the decimal point.
  const withoutThousands = cleaned.replace(/,/g, "");
  const value = Number(withoutThousands);
  return Number.isFinite(value) ? value : null;
}
