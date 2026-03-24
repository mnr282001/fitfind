-- FitFind: private image bucket + analysis/search audit tables.
-- Apply in Supabase SQL Editor or via supabase db push.

-- Private bucket for outfit uploads (server uploads with service role only).
insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', false)
on conflict (id) do nothing;

create table if not exists public.analysis_runs (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  storage_path text,
  media_type text not null,
  model text not null default 'gemini-2.5-flash',
  status text not null check (status in ('pending', 'ok', 'error')),
  latency_ms integer,
  items jsonb,
  raw_error text,
  created_at timestamptz not null default now()
);

create index if not exists analysis_runs_user_created_idx
  on public.analysis_runs (user_id, created_at desc);

create table if not exists public.search_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  analysis_run_id uuid references public.analysis_runs (id) on delete set null,
  search_query text not null,
  brand_guess text,
  category text,
  response jsonb not null,
  latency_ms integer not null,
  status text not null check (status in ('ok', 'error')),
  raw_error text,
  created_at timestamptz not null default now()
);

create index if not exists search_requests_user_created_idx
  on public.search_requests (user_id, created_at desc);

create index if not exists search_requests_analysis_run_idx
  on public.search_requests (analysis_run_id);

alter table public.analysis_runs enable row level security;
alter table public.search_requests enable row level security;

-- Authenticated users can read only their own rows (e.g. future “My scans” UI).
-- API writes use the service role and bypass RLS.
drop policy if exists "analysis_runs_select_own" on public.analysis_runs;
create policy "analysis_runs_select_own"
  on public.analysis_runs for select
  using (auth.uid() = user_id);

drop policy if exists "search_requests_select_own" on public.search_requests;
create policy "search_requests_select_own"
  on public.search_requests for select
  using (auth.uid() = user_id);
