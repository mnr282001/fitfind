-- FitFind monitoring: token usage spend and API error telemetry.

create table if not exists public.token_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  provider text not null,
  model text not null,
  analysis_run_id uuid references public.analysis_runs (id) on delete set null,
  prompt_tokens integer not null default 0 check (prompt_tokens >= 0),
  completion_tokens integer not null default 0 check (completion_tokens >= 0),
  total_tokens integer not null default 0 check (total_tokens >= 0),
  estimated_cost_usd numeric(12, 8) not null default 0 check (estimated_cost_usd >= 0),
  status text not null check (status in ('ok', 'error')),
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists token_usage_events_user_created_idx
  on public.token_usage_events (user_id, created_at desc);

create index if not exists token_usage_events_analysis_run_idx
  on public.token_usage_events (analysis_run_id);

create table if not exists public.api_error_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  provider text not null,
  model text,
  analysis_run_id uuid references public.analysis_runs (id) on delete set null,
  http_status integer,
  error_code text,
  message text not null,
  details text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists api_error_events_user_created_idx
  on public.api_error_events (user_id, created_at desc);

create index if not exists api_error_events_analysis_run_idx
  on public.api_error_events (analysis_run_id);

alter table public.token_usage_events enable row level security;
alter table public.api_error_events enable row level security;

drop policy if exists "token_usage_events_select_own" on public.token_usage_events;
create policy "token_usage_events_select_own"
  on public.token_usage_events for select
  using (auth.uid() = user_id);

drop policy if exists "api_error_events_select_own" on public.api_error_events;
create policy "api_error_events_select_own"
  on public.api_error_events for select
  using (auth.uid() = user_id);
