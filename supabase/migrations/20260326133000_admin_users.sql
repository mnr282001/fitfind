-- FitFind admin allowlist by profile.
-- Add a row to this table to grant admin access.

create table if not exists public.admin_users (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists admin_users_created_idx
  on public.admin_users (created_at desc);

alter table public.admin_users enable row level security;

-- Users can only check whether they themselves are admin.
drop policy if exists "admin_users_select_own" on public.admin_users;
create policy "admin_users_select_own"
  on public.admin_users for select
  using (auth.uid() = profile_id);
