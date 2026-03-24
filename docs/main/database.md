# Database (Supabase Postgres & Storage)

Auth users live in **`auth.users`**. Application data uses **`public.analysis_runs`**, **`public.search_requests`**, and the private Storage bucket **`uploads`**.

Apply migrations from **`supabase/migrations/`** in the Supabase **SQL Editor** (or via **Supabase CLI** linked to your project). Order matters: run **`20250324120000_profiles.sql`** only if you want the optional profiles mirror; run **`20250326120000_data_layer.sql`** for the core data layer.

---

## `20250326120000_data_layer.sql` (required for persistence)

### Storage

- Bucket **`uploads`**, **not public**.
- The Next.js API uploads objects with the **service role** (`SUPABASE_SERVICE_ROLE_KEY`). The browser does not receive upload permissions.
- Object path pattern: `{user_id}/{analysis_run_id}.{ext}` (see `/api/analyze`).

### Tables

**`analysis_runs`**

| Column | Purpose |
|--------|---------|
| `id` | UUID primary key; same id as returned to the client as `analysisRunId` |
| `user_id` | Owner (`auth.users.id`) |
| `storage_path` | Path inside bucket `uploads`, or null if upload failed / skipped |
| `media_type` | MIME type sent to Gemini |
| `model` | e.g. `gemini-2.5-flash` |
| `status` | `ok` \| `error` |
| `latency_ms` | End-to-end server time for the analyze request |
| `items` | Parsed Gemini JSON array (jsonb); null on failure |
| `raw_error` | Truncated error text when `status = error` |
| `created_at` | Timestamp |

**`search_requests`**

| Column | Purpose |
|--------|---------|
| `id` | UUID (default `gen_random_uuid()`) |
| `user_id` | Caller |
| `analysis_run_id` | Optional FK to `analysis_runs`; set only when the client passes a valid `analysisRunId` that belongs to the same user |
| `search_query`, `brand_guess`, `category` | Request fields |
| `response` | JSON returned to the client (product card or fallback) |
| `latency_ms` | SerpAPI round-trip (including timeout handling) |
| `status` | `ok` if HTTP fetch succeeded; `error` if fetch failed or non-OK HTTP |
| `raw_error` | Optional diagnostic string |
| `created_at` | Timestamp |

### Row Level Security

- RLS is **enabled** on both tables.
- **Select:** authenticated users may read **only** rows where `user_id = auth.uid()` (for a future “My scans” UI using the anon key + session).
- **Insert / update / delete:** not granted to end users; API routes use the **service role**, which **bypasses RLS**.

---

## `20250324120000_profiles.sql` (optional)

Mirrors new `auth.users` rows into **`public.profiles`** for reporting. See the migration file for trigger details.

---

## When persistence is disabled

If **`SUPABASE_SERVICE_ROLE_KEY`** is unset, `createServiceClient()` returns `null`: Gemini and SerpAPI still run, but **no Storage upload** and **no DB rows** are written. The analyze response still includes `analysisRunId` for client correlation, but that id will not exist in the database until persistence is enabled.
