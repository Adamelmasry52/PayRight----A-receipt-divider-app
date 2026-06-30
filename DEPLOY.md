# Deploying PayRight

Static SPA + one serverless function (`/api/scan`, the **dev-stage** Groq vision
read path). Target: Cloudflare Pages (Netlify works with an `/api/*` redirect).

## Build

```
npm ci
npm run build      # outputs to dist/
```

- Build command: `npm run build`
- Output directory: `dist`
- SPA fallback: serve `index.html` for unknown routes (Cloudflare Pages does this
  for `dist/` automatically; on Netlify add `/* /index.html 200`).

## Environment variables (set in the host dashboard — server-side only)

| Var | Required | Purpose |
|-----|----------|---------|
| `GROQ_API_KEY` | yes (for vision mode) | Groq key. **Server-side only** — never `VITE_`-prefixed. |
| `GROQ_MODEL` | no | Pin a vision model id; otherwise auto-selected from Groq's live list. |
| `ALLOWED_ORIGIN` | recommended | Comma-separated origin allowlist for `/api/scan` (e.g. `https://payright.pages.dev`). Unset = not enforced. |
| `VITE_OCR_ENGINE` | no | `vision` (default) or `paddle` (on-device). Build-time, client-visible. |

> The vision path sends the receipt image to Groq (a third party) and introduces
> a backend. It is **temporary dev scaffolding**; production target is on-device
> PaddleOCR-VL (`VITE_OCR_ENGINE=paddle`) with no backend. The image is never
> stored.

## 🔴 Required: rate-limit `/api/scan` at the edge (the real backstop)

`/api/scan` is a public, money-spending endpoint. The in-function limiter is only
defense-in-depth (per-isolate). **You must add a Cloudflare WAF rate-limiting rule**
at deploy time:

1. Cloudflare dashboard → your zone → **Security → WAF → Rate limiting rules**.
2. New rule: when `http.request.uri.path eq "/api/scan"` and method `POST`.
3. Limit e.g. **10 requests / 1 minute per client IP**; action **Block** (or
   Managed Challenge) for ~1 minute.

### Optional but recommended: KV counter binding

For per-IP limits inside the function across isolates, bind a KV namespace named
`SCAN_RATE_LIMIT` (Pages → Settings → Functions → KV namespace bindings). When
bound, the function enforces ~5/min and ~100/day per IP. Without it, only the
in-memory limiter + the WAF rule apply.

## Verify after deploy

```
# Allowed POST with a real image succeeds (200).
# Wrong origin is rejected (403):
curl -i -X POST https://YOUR_HOST/api/scan -H 'Origin: https://evil.example' \
  -H 'Content-Type: application/json' --data '{"imageBase64":"x","mimeType":"image/jpeg"}'
# Non-image / oversized rejected (415 / 413). Rapid repeats → 429.
```
