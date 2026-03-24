# Roadmap / what’s next

The **data layer** (Storage + `analysis_runs` + `search_requests` + service-role writes) is in place. Suggested follow-ups:

## Near term

1. **`/api/analytics/click`** — Persist affiliate / outbound clicks (user id, URL, item metadata). Wire `trackClick` in `FitFind.tsx` instead of `console.log`.
2. **“My scans” UI** — Server or client page that lists `analysis_runs` for the logged-in user via the **anon** Supabase client (RLS already allows `select` on own rows). Optionally show thumbnails using **signed URLs** from Storage.
3. **Server-side rate limits** — Back the client `rateLimiter` with Redis or daily counters in Postgres per `user_id`.
4. **Retention / GDPR** — Document image retention; add a job or endpoint to delete Storage objects + rows for a user on account deletion.

## Observability

5. **Error tracking** — Sentry (or similar) on API routes and the client.
6. **Log drain** — Ship structured stdout logs to Axiom / Datadog / etc., on Vercel or your host.
7. **Synthetic checks** — Ping `/` and optionally authenticated health after you add one.

## Platform

8. **Next.js middleware → proxy** — When you adopt Next’s new convention, migrate `src/middleware.ts` per framework docs.
9. **Supabase CLI** — Wire `supabase link` + migration deploy so SQL doesn’t rely on manual paste.

## Product

10. **OAuth providers** — Google / Apple sign-in via Supabase Auth.
11. **Email templates** — Customize Supabase auth emails to match FitFind branding.

Update this file as items ship so the branch doc stays honest about what is done vs planned.
