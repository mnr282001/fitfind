# Database (Supabase Postgres)

FitFind does **not** require custom tables for core auth: users live in Supabase **`auth.users`**.

Optional SQL lives under **`supabase/migrations/`** in the repository. Apply manually in the Supabase **SQL Editor** or via the **Supabase CLI** linked to your project.

## `20250324120000_profiles.sql`

**Purpose:** mirror each new `auth.users` row into **`public.profiles`** (`id`, `email`, `created_at`) for convenient reporting in SQL or the Table Editor.

**Contents (summary)**

- `public.profiles` with FK to `auth.users` (`on delete cascade`).
- Row Level Security enabled with a policy allowing users to **select** only their own row (`auth.uid() = id`).
- Trigger **`on_auth_user_created`** on `auth.users` **`after insert`** calling **`public.handle_new_user`** (`security definer`) to insert the profile row.

**Notes**

- If your Postgres version rejects `execute function`, check Supabase docs for the equivalent `execute procedure` syntax for your instance.
- Inserts into `profiles` from the app server are not required for sign-up if the trigger is installed; the app currently does not read `profiles` in application code.

## Future data model (not implemented in app code yet)

If you add durable storage for uploads or model output, typical patterns are:

- **`analysis_runs`**: `user_id` → `auth.users.id`, storage path, `items` JSONB, timestamps.
- **`search_requests`**: FK to analysis run, query, response JSONB.
- Policies: `user_id = auth.uid()` for `select`/`insert` when using the anon key from authenticated clients, or service-role-only writes from Next.js API routes.

Document any new migrations in this folder when you add them on the same branch.
