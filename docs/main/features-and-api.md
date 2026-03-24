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

1. Validates session; logs a JSON line including `analysisRunId` and whether persistence is active (`persist`).
2. If `SUPABASE_SERVICE_ROLE_KEY` is set: decodes base64, enforces a max size (**12 MB**), uploads to Storage bucket **`uploads`** at `{user_id}/{runId}.{ext}` via **`createServiceClient()`** (`src/lib/supabase/service.ts`). Failed uploads still continue to Gemini; `storage_path` in the DB may be null.
3. Calls Gemini **`gemini-2.5-flash`** with inline image + stylist prompt.
4. On completion: if the service client exists, inserts one row into **`analysis_runs`** (`status` `ok` or `error`, `items` jsonb, `raw_error` when applicable).
5. Returns **`{ items, analysisRunId, imageStored }`** on success (`**imageStored**`: object landed in Storage; `false` if persistence is off or upload failed).

**Errors**

- **400** — invalid JSON or missing `image`.
- **413** — decoded image exceeds max size (**always** enforced before Gemini, independent of persistence).
- **502** — upstream Gemini failure (row still recorded when persistence is on).
- **500** — JSON parse failure after cleaning markdown fences (row recorded when persistence is on).

---

## `POST /api/search`

**File:** `src/app/api/search/route.ts`

**Auth:** `requireUser()` — **401** if not signed in.

**Body (JSON)**

- `searchQuery` (required), `brandGuess`, optional `category`.
- Optional **`analysisRunId`**: UUID returned from analyze. The server verifies the run exists and **`user_id` matches** the current user before setting `search_requests.analysis_run_id` (prevents cross-user linking).

**Behavior**

1. Validates session and logs a JSON line: `event`, `userId`, `email`, `query`.
2. Calls SerpAPI `google_shopping` with 8s timeout. Marks internal `serpStatus` `error` if fetch throws or HTTP is non-OK.
3. Scores results, picks best match above `MIN_SCORE`, or builds the Google Shopping fallback payload.
4. If the service client exists, inserts **`search_requests`** with the full **`response`** JSON returned to the client.
5. Returns the same product JSON shape as before (`product_name`, `brand`, `price`, `url`, `retailer`, `thumbnail`, `match_confidence`).

**Errors**

- **400** — invalid JSON or missing `searchQuery`.

---

## Identifying users in logs and product

- **Canonical user id:** `user.id` from Supabase (`sub` in the JWT).
- **Email:** `user.email` when available (may be null depending on provider).
- **Durable history:** `analysis_runs.user_id` and `search_requests.user_id` tie each row to a user; **`analysis_run_id`** groups searches from one outfit scan.
- API routes log structured **JSON to stdout** for server-side correlation (host logs, Vercel, etc.). See [roadmap.md](./roadmap.md) for log drains and error tracking.
