# PayRight — Deployment runbook (Cloudflare Pages + Pages Functions)

PayRight is a static SPA plus one serverless function, `/api/scan` — the
**dev-stage** Groq vision read path (sends the receipt image to Groq; key stays
server-side). Production target is on-device PaddleOCR-VL with no backend; the
vision path is temporary scaffolding. The image is never stored.

This runbook is **click-by-click and ordered**. Nothing is pre-wired. The **KV
binding (§4)** and **WAF rule (§5)** are **REQUIRED** — without them the
rate-limiting is effectively off (only a weak per-isolate in-memory limiter
remains).

Repo config already provided (no action needed beyond pushing):
`.nvmrc` (Node 22) · `public/_redirects` (SPA fallback) · `public/_headers`
(SW/manifest no-cache + nosniff) · `functions/api/scan.ts` (the Function).

---

## 1. Push to GitHub & connect Cloudflare Pages

1. Push the repo to GitHub (`main` or your deploy branch).
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**.
3. Pick the repo; **Production branch** = your deploy branch.
4. **Build settings:**
   - **Framework preset:** `None` (Vite, configured manually below).
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Root directory:** `/` (repo root).
5. **Node version:** the repo's `.nvmrc` pins **22**. To be explicit, also add a
   build environment variable **`NODE_VERSION = 22`** (§3).
6. **Pages Functions deploy automatically:** the top-level `functions/` directory
   is detected by Pages — `functions/api/scan.ts` is served at **`/api/scan`**
   (it imports `server/*.ts`, which Pages bundles). No extra config. Only
   `onRequestPost` and `onRequestOptions` are exported, so **`GET /api/scan`
   returns 405** in production — the dev-only model-list route does NOT exist here.

---

## 2. Build-time vs runtime config — read this before §3

Pages exposes env vars to **two different stages**, and the distinction matters:

- **Build-time (client):** only `VITE_`-prefixed vars are inlined into the JS
  bundle **at build**. Changing one requires a **rebuild/redeploy** to take
  effect. → `VITE_OCR_ENGINE`.
- **Runtime (function):** read by `functions/api/scan.ts` on each request; no
  rebuild needed when you change them. → `GROQ_API_KEY`, `ALLOWED_ORIGIN`,
  `GROQ_MODEL`, and the `SCAN_RATE_LIMIT` KV binding.

⚠️ Never put `GROQ_API_KEY` (or any secret) in a `VITE_` var — `VITE_` values are
public in the client bundle.

---

## 3. Environment variables & secrets (set IN CLOUDFLARE, never in a file)

Pages → your project → **Settings → Environment variables → Production**
(repeat for **Preview** if you use preview deploys).

| Name | Type | Stage | Value / notes |
|------|------|-------|---------------|
| `GROQ_API_KEY` | **Secret** (Encrypt) | runtime | Your Groq key. Mark as encrypted. |
| `ALLOWED_ORIGIN` | plaintext | runtime | Comma-separated origin allowlist for `/api/scan`. Set **after first deploy** once the domain is known (§7), e.g. `https://payright.pages.dev,https://payright.app`. Unset = not enforced. |
| `VITE_OCR_ENGINE` | plaintext | **build-time** | `vision` (default). Must exist at build to be inlined. |
| `GROQ_MODEL` | plaintext | runtime | Optional. Pin a Groq vision model id; else auto-selected from Groq's live list. |
| `NODE_VERSION` | plaintext | build-time | `22` |

After changing any **build-time** var, trigger a new deploy (Deployments →
Retry/redeploy). Runtime var changes take effect immediately.

---

## 4. KV namespace for rate limiting — REQUIRED, binding name `SCAN_RATE_LIMIT`

Without this binding the KV limiter silently no-ops and only the per-isolate
in-memory limiter remains (does NOT bound global traffic).

1. Cloudflare dashboard → **Storage & Databases → KV → Create a namespace**.
   Name it e.g. `payright-scan-ratelimit`.
2. Pages → your project → **Settings → Functions → KV namespace bindings → Add
   binding**:
   - **Variable name:** `SCAN_RATE_LIMIT`  ← must match exactly (the code reads
     `env.SCAN_RATE_LIMIT`).
   - **KV namespace:** the one you just created.
   - Add it for **Production** (and **Preview** if used).
3. Redeploy so the binding takes effect.

When bound, the function enforces **~5 requests/minute and ~100/day per IP**
(`CF-Connecting-IP`), returning **429** with `Retry-After`.

---

## 5. WAF rate-limit rule on /api/scan — REQUIRED (the real backstop)

The in-function limiter is defense-in-depth; the WAF rule is the actual
edge-level guard against abuse of this money-spending endpoint.

1. Cloudflare dashboard → your **zone/domain** → **Security → WAF → Rate limiting
   rules → Create rule**.
2. **If** field (expression): `http.request.uri.path eq "/api/scan"` and
   `http.request.method eq "POST"`.
3. **Rate:** suggested **10 requests per 1 minute**, **counting characteristic =
   IP**.
4. **Action:** Block (or Managed Challenge) for **1 minute**.
5. Save & deploy the rule.

> Note: a `*.pages.dev` subdomain may not expose zone-level WAF. Use a **custom
> domain** on your Cloudflare zone to attach the WAF rule (recommended for
> production). Until then, the KV limiter (§4) is your only real limit.

---

## 6. First deploy

1. Save build settings (§1) → **Save and Deploy**.
2. Watch the build log: `npm run build` runs `tsc -b && vite build`; output in
   `dist/`. Functions compile from `functions/`.
3. Note the assigned URL, e.g. `https://payright.pages.dev`.

---

## 7. Lock the origin allowlist, then redeploy

1. Set `ALLOWED_ORIGIN` (§3) to the now-known origin(s): the `*.pages.dev` URL
   and any custom domain, comma-separated, **scheme + host, no trailing slash**:
   `https://payright.pages.dev,https://payright.app`.
2. Redeploy (or it applies on next request, since it's runtime — but redeploy to
   be safe).
3. Re-run the smoke test (§9), especially the **bad-Origin → 403** check.

---

## 8. Config files in this repo (already present)

- **`public/_redirects`** — `/* /index.html 200`. SPA fallback so refreshing on
  `/review`, `/summary`, etc. resolves. Functions and static assets take
  precedence, so `/api/scan` and `/assets/*` are unaffected.
- **`public/_headers`** — `no-cache` on `sw.js` / `registerSW.js` /
  `manifest.webmanifest` (so PWA updates propagate); `nosniff` +
  `Referrer-Policy` globally. (No CSP — out of scope.)
- **PWA** — `vite-plugin-pwa` emits `manifest.webmanifest`, `sw.js`,
  `registerSW.js` at the **root**; `index.html` injects `<link rel="manifest">`
  and the SW registration. `start_url`/`scope` are `/`. Verified to serve from
  the deployed root.
  - **iOS install polish (optional):** the manifest icon is `icon.svg`. Android
    installs fine; for a crisp iOS "Add to Home Screen" icon, add a 180×180 PNG
    and `<link rel="apple-touch-icon" href="/apple-touch-icon.png">` to
    `index.html`. Not required for function.

---

## 9. LIVE smoke-test checklist (run against the DEPLOYED URL, not localhost)

Replace `HOST` with your deployed origin.

### Endpoint guards (`/api/scan`)
- [ ] **Bad Origin → 403** (after §7 sets `ALLOWED_ORIGIN`):
  ```
  curl -i -X POST https://HOST/api/scan \
    -H 'Origin: https://evil.example' -H 'Content-Type: application/json' \
    --data '{"imageBase64":"/9j/abcd","mimeType":"image/jpeg"}'
  ```
- [ ] **Bad mime → 415:** same call with `"mimeType":"application/pdf"`.
- [ ] **Oversized → 413:** body with an `imageBase64` string > ~6,000,000 chars.
- [ ] **Rate limit → 429:** fire 7 valid-shaped POSTs from one IP within a minute;
  the 6th+ returns 429 (KV). Confirm the WAF rule also blocks under heavier load.
- [ ] **GET → 405:** `curl -i https://HOST/api/scan` (no model list leaked).

### App flow (in a browser on `https://HOST`)
- [ ] Real **scan succeeds end-to-end** into the review screen (privacy line
  visible on the capture screen naming Groq).
- [ ] Review → People → Assign → **Summary** computes; green/red check correct.
- [ ] **Generate a share link**, open it in a **fresh/incognito browser** → the
  read-only breakdown loads (shared indicator, no edit controls); "Start your own
  bill" returns to the Start screen.
- [ ] **Deep-link refresh:** hard-refresh on `/summary` → app still loads (SPA
  fallback), no 404.
- [ ] **Malformed share link** (`https://HOST/#d=garbage`) → "This link is
  invalid", no crash.

### PWA
- [ ] **Install / Add to Home Screen** works (Android: install prompt; iOS:
  Share → Add to Home Screen).
- [ ] **Offline app shell:** load once, go offline (DevTools → Network → Offline
  or airplane mode), reload → the app shell still loads. (OCR model fetch / Groq
  call won't work offline by design.)

### On-PHONE pass (real device, mobile connection)
- [ ] **Real camera capture** opens the rear camera and scans.
- [ ] **HEIC from an iPhone** photo is accepted (converted client-side) and reads.
- [ ] **Privacy line** is visible on the capture screen.
- [ ] **Dark theme legible** outdoors; tap targets comfortable; layout fits a
  phone with no horizontal scroll.
- [ ] Works on a **cellular** connection (not just Wi-Fi).

---

## 10. Secret hygiene (verify before/after deploy)

- `.env` is gitignored; `.env.example` (no real key) is the only tracked env file.
- No `VITE_`-prefixed var holds `GROQ_API_KEY` (grep the repo) — `VITE_` values
  are public in the bundle.
- `GROQ_API_KEY` exists only in Cloudflare's encrypted env, read at runtime by the
  Function — never shipped to the client.
- Production `GET /api/scan` → 405 (dev-only model-list route is not deployed).

## 11. Rollback

Pages → **Deployments** → pick a previous successful deployment →
**Rollback to this deployment**. Env vars and bindings persist across rollbacks.
