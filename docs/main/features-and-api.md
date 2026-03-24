# Features and HTTP API

## Home experience (`FitFind`)

**File:** `src/components/FitFind.tsx` (client component)

**Props**

- `user`: `null` or `{ id: string; email: string | null }` — supplied by `src/app/page.tsx` from `supabase.auth.getUser()`.

**Logged-out behavior**

- Nav shows **Sign in** / **Sign up** links.
- Main content is an **auth wall** (copy + buttons to `/login` and `/signup`).
- Upload and results UI are not rendered (`user && …` guards).

**Logged-in behavior**

- Nav shows daily scan counter (client-side `window.name` rate limiter), optional truncated email (wider viewports), **Sign out**, and **+ New** when a run completes.
- Image upload (file input + drag-and-drop), preview, Gemini analyze loop, then per-item SerpAPI search.
- Affiliate helper wraps outbound shop URLs (`src/lib/affiliate.ts` and duplicated `buildAffiliateUrl` in the component for client-side opens).
- `trackClick` is stubbed to `console.log` (placeholder for future `/api/analytics/click`).

**Rate limiting**

- `src/lib/rateLimiter.ts` implements a client-side daily/cooldown limiter using `window.name`. It is **not** enforced in API routes today.

---

## `POST /api/analyze`

**File:** `src/app/api/analyze/route.ts`

**Auth:** `requireUser()` — **401** if not signed in.

**Body (JSON)**

- `image`: base64 string (no data-URL prefix).
- `mediaType`: MIME type string (e.g. `image/jpeg`).

**Behavior**

1. Validates session and logs a JSON line: `event`, `userId`, `email`.
2. Calls Gemini `gemini-2.5-flash` with inline image + stylist prompt.
3. Parses model output as JSON array; returns `{ items: [...] }` on success.

**Errors**

- **502** — upstream Gemini failure.
- **500** — JSON parse failure after cleaning markdown fences.

---

## `POST /api/search`

**File:** `src/app/api/search/route.ts`

**Auth:** `requireUser()` — **401** if not signed in.

**Body (JSON)**

- `searchQuery`, `brandGuess` (required for the shopping query; `category` is accepted in client payload but not required by the route).
- Partner tier config and blocked hosts are defined at top of file.

**Behavior**

1. Validates session and logs a JSON line: `event`, `userId`, `email`, `query`.
2. Calls SerpAPI `google_shopping` with 8s timeout.
3. Scores results, picks best match above `MIN_SCORE`, or returns a Google Shopping fallback URL.

---

## Identifying users in logs and product

- **Canonical user id:** `user.id` from Supabase (`sub` in the JWT).
- **Email:** `user.email` when available (may be null depending on provider).
- API routes log structured **JSON to stdout** for server-side correlation (host logs, Vercel, etc.). Extend with a log drain or database tables if you need durable audit trails.
