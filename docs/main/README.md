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
| [database.md](./database.md) | SQL migrations under `supabase/migrations/` |

## Quick start

1. Copy `.env.example` to `.env.local` and fill in keys (see [configuration.md](./configuration.md)).
2. Configure Supabase Auth URLs and (optionally) email confirmation.
3. `bun install` (or `npm install`) then `bun run dev`.

## Related files at repo root

- `.env.example` — template for local secrets (not committed with real values).
- `supabase/migrations/` — optional Postgres objects for Supabase.
