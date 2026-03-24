# FitFind documentation

This folder documents the **fitfind** codebase for Git branch **`main`**.

When you work on another branch, add or update a sibling directory (for example `docs/feature-name/`) so docs stay aligned with what shipped on that branch.

## Contents

| Document | What it covers |
|----------|----------------|
| [architecture.md](./architecture.md) | Stack, folder layout, request flows |
| [configuration.md](./configuration.md) | Environment variables, Supabase dashboard settings |
| [authentication.md](./authentication.md) | Supabase Auth, middleware, sessions, routes |
| [features-and-api.md](./features-and-api.md) | Main UI, `/api/analyze`, `/api/search`, user identification |
| [database.md](./database.md) | Storage bucket, `analysis_runs`, `search_requests`, optional `profiles` |
| [roadmap.md](./roadmap.md) | Suggested next steps after the data layer |

## Quick start

1. Copy `.env.example` to `.env.local` and fill in keys (see [configuration.md](./configuration.md)), including **`SUPABASE_SERVICE_ROLE_KEY`** for persistence.
2. Run **`supabase/migrations/20250326120000_data_layer.sql`** in the Supabase SQL Editor (and optional `20250324120000_profiles.sql`).
3. Configure Supabase Auth URLs and (optionally) email confirmation.
4. `bun install` (or `npm install`) then `bun run dev`.

## Related files at repo root

- `.env.example` — template for local secrets (not committed with real values).
- `supabase/migrations/` — optional Postgres objects for Supabase.
