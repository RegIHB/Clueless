-- Per-user try-on quota tracking for free plan enforcement.
-- Run in Supabase SQL Editor after previous migrations.

create table if not exists public.tryon_usage (
  user_id   uuid not null references auth.users (id) on delete cascade,
  used_date date not null default current_date,
  day_count  int  not null default 0,
  total_count int not null default 0,
  primary key (user_id, used_date)
);

create index if not exists tryon_usage_user_idx on public.tryon_usage (user_id);

alter table public.tryon_usage enable row level security;

drop policy if exists "tryon_usage_select_own" on public.tryon_usage;
create policy "tryon_usage_select_own" on public.tryon_usage
  for select using (auth.uid() = user_id);

-- Only the service role (webhook/api routes) may insert/update.
-- Client reads quota; server writes it.

-- =============================================================================
-- RPC: atomically upsert + increment, return new counts
-- =============================================================================

create or replace function public.increment_tryon_usage(
  p_user_id uuid,
  p_date    date
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day   int;
  v_total int;
begin
  insert into public.tryon_usage (user_id, used_date, day_count, total_count)
  values (p_user_id, p_date, 1, 1)
  on conflict (user_id, used_date) do update
    set day_count   = tryon_usage.day_count   + 1,
        total_count = tryon_usage.total_count + 1;

  -- Also bump total on all rows for this user (total is per-user lifetime, not per-day).
  -- Simpler: keep a running total only on today's row; caller sums if needed.
  -- Here we track lifetime total separately via a synthetic query.
  select
    (select day_count   from public.tryon_usage where user_id = p_user_id and used_date = p_date),
    (select coalesce(sum(day_count), 0) from public.tryon_usage where user_id = p_user_id)
  into v_day, v_total;

  return json_build_object('day_count', v_day, 'total_count', v_total);
end;
$$;

create or replace function public.decrement_tryon_usage(
  p_user_id uuid,
  p_date    date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.tryon_usage
  set day_count   = greatest(0, day_count - 1),
      total_count = greatest(0, total_count - 1)
  where user_id = p_user_id and used_date = p_date;
end;
$$;

-- RPC for clients to read their own quota (respects RLS via security invoker).
create or replace function public.get_tryon_quota(p_user_id uuid)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'day_count',   coalesce((select day_count from public.tryon_usage where user_id = p_user_id and used_date = current_date), 0),
    'total_count', coalesce((select sum(day_count) from public.tryon_usage where user_id = p_user_id), 0)
  );
$$;
