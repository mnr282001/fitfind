# Authentication

FitFind uses **Supabase Auth** with the **@supabase/ssr** pattern recommended for Next.js App Router.

## User-visible routes

| Path | Description |
|------|-------------|
| `/login` | Server page: redirects to `/` if already signed in. Client form: `signInWithPassword`. |
| `/signup` | Server page: redirects to `/` if already signed in. Client form: `signUp` with `emailRedirectTo` → `/auth/callback`. |
| `/auth/callback` | Route handler: `exchangeCodeForSession` for email confirmation links and OAuth codes. |
| `/` | Home: server loads `getUser()` and passes `{ id, email }` or `null` into `FitFind`. |

## Implementation files

| File | Role |
|------|------|
| `src/lib/supabase/client.ts` | `createBrowserClient` for client components (forms, sign-out). Throws if public env vars are missing. |
| `src/lib/supabase/server.ts` | `createServerClient` bound to `next/headers` `cookies()` for Server Components and route handlers. |
| `src/lib/supabase/middleware.ts` | Creates a server client from `NextRequest` cookies and calls `getUser()` to refresh the session. |
| `src/middleware.ts` | Applies the session refresh across matched routes. |
| `src/lib/auth/require-user.ts` | `requireUser()`: returns `{ user, unauthorized: null }` or `{ user: null, unauthorized: Response }` with status **401**. |

## Session lifecycle

1. **Sign in / sign up** — Supabase sets session cookies via the browser client.
2. **Middleware** — On each matched request, the server refreshes the session so cookies stay valid.
3. **Server render** — `src/app/page.tsx` uses `createClient()` from `server.ts` and `getUser()` to resolve the current user without trusting client-sent identity.
4. **API routes** — `requireUser()` uses the same server client so `POST /api/analyze` and `POST /api/search` only run for authenticated users.

## Sign out

`FitFind` calls `createClient()` from `client.ts`, then `auth.signOut()`, then `router.refresh()` so the server-rendered tree drops the user.

## Error handling

- Missing or invalid session on API routes → **401** JSON `{ "error": "Sign in required" }`.
- Client `identifyOutfit` / `searchProduct` map **401** to user-facing errors (“Sign in to analyze outfits”, etc.).

## Suspense

`src/app/login/page.tsx` wraps `LoginForm` in **React `Suspense`** because `LoginForm` uses `useSearchParams()` (e.g. `?error=auth` after a failed callback).
