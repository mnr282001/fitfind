# Configuration

## Environment variables

Define these in **`.env.local`** (or your host’s secret store). See the repository **`.env.example`** for names.

| Variable | Required for | Purpose |
|----------|----------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Auth, SSR | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Auth, SSR | Supabase anonymous (public) key — safe to expose to the browser |
| `SUPABASE_SERVICE_ROLE_KEY` | Data layer | **Server-only.** Uploads to Storage and inserts into `analysis_runs` / `search_requests`. If omitted, APIs still work but **do not persist** images or rows. |
| `GEMINI_API_KEY` | Analyze | Google AI Studio / Gemini API key for `/api/analyze` |
| `SERPAPI_KEY` | Search | SerpAPI key for `/api/search` (empty string falls back to degraded behavior in code) |

**Security notes**

- Never commit real keys. `.env*` is gitignored by default.
- The **service role** key bypasses RLS and must **only** exist in server environment variables (e.g. Vercel project secrets). Never prefix it with `NEXT_PUBLIC_` or import it in client components.
- End-user reads of their own rows use the **anon** key + session and RLS (`select` policies on `analysis_runs` / `search_requests`).

## Supabase dashboard

### API keys

**Project Settings → API**: copy **Project URL** and **anon public** key into the `NEXT_PUBLIC_*` variables.

### Email provider

**Authentication → Providers → Email**: enable email/password.

- For faster local testing, you can disable **Confirm email** so new users receive a session immediately after sign-up.
- If confirmation is enabled, ensure redirect URLs (below) include `/auth/callback`.

### URL configuration

**Authentication → URL configuration**

| Setting | Example (local) |
|---------|------------------|
| Site URL | `http://localhost:3000` |
| Redirect URLs | `http://localhost:3000/auth/callback` |

Add your production origin and `https://your-domain/auth/callback` before going live.

## Verifying Storage uploads

Images are saved only when **all** of the following are true:

1. **`SUPABASE_SERVICE_ROLE_KEY`** is set in the same environment as the Next.js server (e.g. `.env.local`, Vercel project settings). Without it, analyze still runs but **nothing** is written to Storage or `analysis_runs`.
2. **`20250326120000_data_layer.sql`** has been applied so the private bucket **`uploads`** exists.
3. The server log does not show `[FitFind analyze] storage upload failed` (that usually means the bucket is missing, RLS on storage, or a bad key).

In the Supabase dashboard: **Storage** → bucket **`uploads`** → folders are named **`{auth user id}`** → files **`{analysisRunId}.{ext}`** (the same id returned as `analysisRunId` in the API). The bucket is **not public**, so you will not get a public URL unless you add signed URLs later.

A successful analyze response includes **`imageStored: true`** when the object was saved; **`false`** means persistence was off or the upload failed (Gemini may still have succeeded).

## Local commands

| Command | Description |
|---------|-------------|
| `bun run dev` | Development server |
| `bun run build` | Production build (requires env vars present at build time for public Supabase vars) |
| `bun run start` | Run production server after `build` |

Package manager may be swapped for `npm` or `pnpm` if you align `lock` files accordingly.
