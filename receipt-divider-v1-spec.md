# PayRight — v1 Specification

A receipt/bill-splitting Progressive Web App. A user photographs a restaurant
receipt, on-device OCR extracts the line items, the user assigns items to people
(including shared and uneven splits), and the app computes each person's share —
including a proportional distribution of tax and service charge — then produces a
read-only shareable link. Fully client-side: no accounts, no backend, nothing stored.

---

## 1. Non-negotiable constraints (v1)

- **Fully client-side static PWA.** No backend, no database, no accounts, no server.
- **OCR runs in the browser** via PaddleOCR.js (PP-OCRv5), with OpenCV.js preprocessing.
- **EGP only.**
- **No persistence.** State lives in the in-memory session and in the shareable URL.
- **English receipts are the v1 target.** Arabic glyphs are displayed if the engine
  reads them, but field parsing is tuned for English layouts. Reliable Arabic *parsing*
  is a later version, not an engine change.
- **Mobile-first.** Primary use is on a phone at a restaurant table.

---

## 2. The split math (the core — implement and unit-test this first)

This is the heart of the app and the main correctness risk. Implement it as pure,
side-effect-free functions with unit tests *before* building UI.

**Definitions**

- Each item has: `name`, `unitPrice`, `qty`, and `lineTotal = unitPrice * qty`.
- `subtotal S = Σ lineTotal_i` over all items (pre-tax/service).
- `total T` = the printed grand total (includes tax + service charge).
- **Uplift factor** `f = T / S`. This is how tax + service are distributed: per item,
  proportionally, with no need to ever read or hardcode the VAT or service rates — the
  printed total encodes them. Handles "no service charge", "service is 12% here, 10%
  there", and any future rate change automatically.
  - If `T == S` (cash, no tax/service), `f = 1.0` — the formula correctly adds nothing.
  - If `S == 0` → **error** ("couldn't read a valid subtotal"); never divide by zero.
  - If `T < S` it represents an overall discount; still distributes proportionally and
    sums correctly. Per-item promotions are out of scope (see §8).

**Per-item fractions.** For each item, every assigned person `p` holds a fraction
`φ(i,p)` of that item. The invariant `Σ_p φ(i,p) = 1` must hold for every assigned item.
Supported split modes:

- **whole** — one person, `φ = 1`.
- **equal** among a selected set of size `m` — `φ = 1/m` each.
- **by quantity** — person takes `k` of the item's `qty` units → `φ = k / qty` (`Σ k = qty`).
- **custom percent** — `φ = pct/100`, and `Σ pct = 100` across that item's sharers (UI must enforce/show this).

**Person share (before rounding):**

```
share_p = Σ_i  φ(i,p) * lineTotal_i * f
```

Because `Σ_p share_p = f * Σ_i lineTotal_i = f * S = T`, raw shares always sum exactly
to the printed total.

**Rounding & validation**

- Final displayed share = `ceil(share_p, 2 decimal places)` (round **up**).
- `totalPaid = Σ ceil(share_p)`. Since ceil ≥ raw, `totalPaid ≥ T` always, by at most
  `0.01 * (number of people)`.
- Summary shows **"Paid X.XX / Bill Y.YY"** with a **green check** if `totalPaid ≥ T`,
  **red** if `totalPaid < T`. Under pure ceiling this is always green; **red only appears
  when a user manually overrides** a share below what's owed. Show the overage explicitly,
  e.g. `Paid 200.03 / Bill 200.00 (+0.03)`.

**Guards the UI must enforce**

- `Σ lineTotal_i` must equal the confirmed `subtotal` within rounding tolerance before
  proceeding; otherwise surface the discrepancy on the review screen and block.
- Every item must be fully assigned (`Σ_p φ = 1`) before the summary is computed.

---

## 3. OCR pipeline (all client-side)

1. **Capture / upload.** Camera with an on-screen framing guide ("fit the receipt in the
   box, hold steady") OR file upload. Accept JPEG / PNG / WEBP / HEIC. Normalize by **file
   type, not device**: convert HEIC/HEIF → JPEG; downscale & compress large images (a
   12 MP receipt photo is a huge, slow input) before anything else.
2. **Preprocess (OpenCV.js).** Grayscale, perspective/deskew correction, contrast &
   threshold normalization. This is the layer that makes skew / poor lighting / odd fonts
   tractable — treat it as mandatory, not optional.
3. **OCR (PaddleOCR.js / PP-OCRv5).** Extract text + bounding boxes on-device.
4. **Parse (custom logic — your value-add).** Heuristics turn raw text into structured
   data: lines ending in a number → item + price; keyword detection for Total / Subtotal /
   Service / VAT (and equivalents). Normalize Arabic-Indic numerals (٠-٩) → Western before math.
5. **Review screen (mandatory).** Editable item list — add / edit / delete items, fix
   prices, confirm subtotal & total. OCR only *pre-fills* this screen; it is also the
   manual-entry path and the fallback when OCR fails or a receipt is unscannable.

---

## 4. User flow

1. **Start** — "Scan receipt" / "Enter manually" / (if the URL carries bill data) "View shared bill".
2. **Capture → preprocess → OCR** (with a clear loading state).
3. **Review & edit** items; confirm subtotal & total.
4. **Add people** — name + auto-assigned animal avatar + accent color. Mark the payer (crown).
5. **Assign items** — tap an item, tap people, pick a split mode (whole / equal / by quantity / custom %).
6. **Summary / settle-up** — each person's share; "Paid / Bill" with green/red check; optional
   "owes [payer]" framing when a payer is marked.
7. **Share** — generate a read-only snapshot link; recipient opens it to a read-only breakdown.

---

## 5. Data model (in-memory session state; also what gets URL-encoded)

```ts
type SplitMode = "whole" | "equal" | "quantity" | "percent";

interface Item { id: string; name: string; unitPrice: number; qty: number; }
interface Person { id: string; name: string; avatar: string; color: string; isPayer: boolean; }
interface Assignment { itemId: string; personId: string; mode: SplitMode; value: number; } // value: k for quantity, pct for percent

interface Bill {
  currency: "EGP";
  items: Item[];
  subtotal: number;   // confirmed
  total: number;      // confirmed printed total
  people: Person[];
  assignments: Assignment[];
  payerId: string | null;
}
```

`upliftFactor`, per-person shares, `totalPaid`, and validation status are **computed**, not stored.

---

## 6. Avatars

A **fixed, curated set** of ~24–30 animal SVGs (open-licensed — e.g. a Twemoji / OpenMoji
subset, with attribution where the license requires it; do **not** reuse Google's artwork).
Not runtime procedural generation. Assignment is deterministic with no duplicates within a
single bill; each animal pairs with an accent color from a fixed palette. The payer's animal
wears a crown overlay.

---

## 7. Sharing

Read-only snapshot. The entire `Bill` is compressed (LZ-string) into the URL fragment — the
link *is* the data, so no backend and no storage. The recipient decodes it to a read-only
breakdown. Note: very large bills (many items × many people) can produce long URLs;
compression handles the normal case. If a URL ever overflows practical limits, that single
case would require a short-link service — flagged as out of scope for v1.

---

## 8. Explicitly OUT of scope for v1

- Accounts, saved bill history, any persistence.
- Live collaborative shared link (each person tags their own items in real time) → **v2**.
- Instapay pay-link / QR integration → **v2** (the payer drops their link/QR; each person sees a "Pay via Instapay" action).
- Reliable Arabic receipt *parsing* (display-only in v1).
- Per-item discounts / cover charge / minimum charge handling.
- Multi-image capture / long-receipt stitching.
- Full multi-payer settle-up netting (v1 does per-person shares + optional single-payer framing).
- Tip (not used in the Egypt context).

---

## 9. Tech stack

- **React + Vite + TypeScript** (strict).
- **PWA** (installable, offline app shell).
- **PaddleOCR.js (PP-OCRv5)** — in-browser OCR.
- **OpenCV.js** — preprocessing.
- **heic2any** (or native decode) — HEIC→JPEG; **browser-image-compression** — downscaling.
- **lz-string** — URL state compression.
- **Tailwind CSS** — sensible defaults, fast iteration.
- State via React context + the URL. No backend, no database.
- **Deploy:** Cloudflare Pages or Netlify (static, git-connected).

---

## 10. Design direction (starting point; refine in Claude Design later if desired)

Mobile-first, clean, friendly, fast. Large tap targets (assignment is tap-driven). Strong
numeric hierarchy so prices and totals read instantly. The animal avatars + accent colors
carry the personality. The green/red validation check is a key visual signal. Keep the
scan → review → assign → summary flow to as few taps as possible.
