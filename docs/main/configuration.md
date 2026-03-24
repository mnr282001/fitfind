# Configuration

## Environment variables

Define these in **`.env.local`** (or your host’s secret store). See the repository **`.env.example`** for names.

| Variable | Required for | Purpose |
|----------|----------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Auth, SSR | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Auth, SSR | Supabase anonymous (public) key — safe to expose to the browser |
| `GEMINI_API_KEY` | Analyze | Google AI Studio / Gemini API key for `/api/analyze` |
| `SERPAPI_KEY` | Search | SerpAPI key for `/api/search` (empty string falls back to degraded behavior in code) |

**Security notes**

- Never commit real keys. `.env*` is gitignored by default.
- The **service role** key must not be placed in `NEXT_PUBLIC_*` variables or client code unless you fully understand the risk. This app uses the **anon** key with the user’s session for client and cookie-based server access.

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

## Local commands

| Command | Description |
|---------|-------------|
| `bun run dev` | Development server |
| `bun run build` | Production build (requires env vars present at build time for public Supabase vars) |
| `bun run start` | Run production server after `build` |

Package manager may be swapped for `npm` or `pnpm` if you align `lock` files accordingly.
