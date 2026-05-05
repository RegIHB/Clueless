-- v2 wardrobe persistence: idempotent, versioned, soft-delete, per-user sync state.
-- Run in Supabase SQL Editor or `supabase db push`. Safe to run after the v1
-- init migration (`20260429120000_init_wardrobe.sql`). Backfills existing rows.

-- =============================================================================
-- Tables
-- =============================================================================

create table if not exists public.wardrobe_items_v2 (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  client_item_id text not null,
  type text not null,
  category text not null check (category in ('tops', 'bottoms', 'accessories')),
  image_url text,
  title text,
  source_url text,
  attribution text,
  sort_order int not null default 0,
  version int not null default 1,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wardrobe_items_v2_user_client unique (user_id, client_item_id)
);

create index if not exists wardrobe_items_v2_user_idx
  on public.wardrobe_items_v2 (user_id)
  where deleted_at is null;

create index if not exists wardrobe_items_v2_user_updated_idx
  on public.wardrobe_items_v2 (user_id, updated_at desc);

create table if not exists public.saved_outfits_v2 (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  client_outfit_id text not null,
  tops_client_item_id text,
  bottoms_client_item_id text,
  accessories_client_item_id text,
  -- Slim snapshot for resilient display when wardrobe items are missing.
  snapshot jsonb not null default '{}'::jsonb,
  version int not null default 1,
  deleted_at timestamptz,
  saved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint saved_outfits_v2_user_client unique (user_id, client_outfit_id),
  constraint saved_outfits_v2_at_least_one check (
    tops_client_item_id is not null
    or bottoms_client_item_id is not null
    or accessories_client_item_id is not null
  )
);

create index if not exists saved_outfits_v2_user_idx
  on public.saved_outfits_v2 (user_id)
  where deleted_at is null;

create index if not exists saved_outfits_v2_user_updated_idx
  on public.saved_outfits_v2 (user_id, updated_at desc);

create table if not exists public.user_sync_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  last_full_sync_at timestamptz,
  schema_version int not null default 2,
  updated_at timestamptz not null default now()
);

-- Idempotency log for client-issued mutations. Lets the client safely retry
-- without duplicating wardrobe rows or saved outfits when a request times out.
create table if not exists public.client_mutation_log (
  user_id uuid not null references auth.users (id) on delete cascade,
  mutation_id text not null,
  result_kind text not null,
  result_id text,
  recorded_at timestamptz not null default now(),
  primary key (user_id, mutation_id)
);

-- =============================================================================
-- Triggers: keep updated_at fresh + bump version on update
-- =============================================================================

create or replace function public.touch_updated_at_and_version ()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if (tg_op = 'UPDATE') then
    new.version := coalesce(old.version, 0) + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists wardrobe_items_v2_touch on public.wardrobe_items_v2;
create trigger wardrobe_items_v2_touch
before update on public.wardrobe_items_v2
for each row execute function public.touch_updated_at_and_version ();

drop trigger if exists saved_outfits_v2_touch on public.saved_outfits_v2;
create trigger saved_outfits_v2_touch
before update on public.saved_outfits_v2
for each row execute function public.touch_updated_at_and_version ();

create or replace function public.touch_user_sync_state ()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists user_sync_state_touch on public.user_sync_state;
create trigger user_sync_state_touch
before update on public.user_sync_state
for each row execute function public.touch_user_sync_state ();

-- =============================================================================
-- RLS: strict per-user ownership, explicit per-operation policies
-- =============================================================================

alter table public.wardrobe_items_v2 enable row level security;
alter table public.saved_outfits_v2 enable row level security;
alter table public.user_sync_state enable row level security;
alter table public.client_mutation_log enable row level security;

drop policy if exists "wardrobe_v2_select_own" on public.wardrobe_items_v2;
create policy "wardrobe_v2_select_own" on public.wardrobe_items_v2
  for select using (auth.uid () = user_id);

drop policy if exists "wardrobe_v2_insert_own" on public.wardrobe_items_v2;
create policy "wardrobe_v2_insert_own" on public.wardrobe_items_v2
  for insert with check (auth.uid () = user_id);

drop policy if exists "wardrobe_v2_update_own" on public.wardrobe_items_v2;
create policy "wardrobe_v2_update_own" on public.wardrobe_items_v2
  for update using (auth.uid () = user_id) with check (auth.uid () = user_id);

drop policy if exists "wardrobe_v2_delete_own" on public.wardrobe_items_v2;
create policy "wardrobe_v2_delete_own" on public.wardrobe_items_v2
  for delete using (auth.uid () = user_id);

drop policy if exists "outfits_v2_select_own" on public.saved_outfits_v2;
create policy "outfits_v2_select_own" on public.saved_outfits_v2
  for select using (auth.uid () = user_id);

drop policy if exists "outfits_v2_insert_own" on public.saved_outfits_v2;
create policy "outfits_v2_insert_own" on public.saved_outfits_v2
  for insert with check (auth.uid () = user_id);

drop policy if exists "outfits_v2_update_own" on public.saved_outfits_v2;
create policy "outfits_v2_update_own" on public.saved_outfits_v2
  for update using (auth.uid () = user_id) with check (auth.uid () = user_id);

drop policy if exists "outfits_v2_delete_own" on public.saved_outfits_v2;
create policy "outfits_v2_delete_own" on public.saved_outfits_v2
  for delete using (auth.uid () = user_id);

drop policy if exists "user_sync_state_select_own" on public.user_sync_state;
create policy "user_sync_state_select_own" on public.user_sync_state
  for select using (auth.uid () = user_id);

drop policy if exists "user_sync_state_upsert_own" on public.user_sync_state;
create policy "user_sync_state_upsert_own" on public.user_sync_state
  for insert with check (auth.uid () = user_id);

drop policy if exists "user_sync_state_update_own" on public.user_sync_state;
create policy "user_sync_state_update_own" on public.user_sync_state
  for update using (auth.uid () = user_id) with check (auth.uid () = user_id);

drop policy if exists "client_mutation_log_select_own" on public.client_mutation_log;
create policy "client_mutation_log_select_own" on public.client_mutation_log
  for select using (auth.uid () = user_id);

drop policy if exists "client_mutation_log_insert_own" on public.client_mutation_log;
create policy "client_mutation_log_insert_own" on public.client_mutation_log
  for insert with check (auth.uid () = user_id);

-- =============================================================================
-- Backfill from v1 tables (idempotent)
-- =============================================================================

insert into public.wardrobe_items_v2 (
  user_id, client_item_id, type, category, image_url, title, source_url, attribution, sort_order
)
select
  w.user_id,
  w.code,
  w.type,
  w.category,
  w.image_url,
  w.title,
  w.source_url,
  w.attribution,
  coalesce(w.sort_order, 0)
from public.wardrobe_items w
on conflict (user_id, client_item_id) do nothing;

-- Backfill saved outfits from JSON payload. Skip rows that fail validation.
insert into public.saved_outfits_v2 (
  user_id,
  client_outfit_id,
  tops_client_item_id,
  bottoms_client_item_id,
  accessories_client_item_id,
  snapshot,
  saved_at
)
select
  o.user_id,
  o.id::text,
  nullif(o.payload -> 'tops' ->> 'code', ''),
  nullif(o.payload -> 'bottoms' ->> 'code', ''),
  nullif(o.payload -> 'accessories' ->> 'code', ''),
  jsonb_build_object(
    'tops', o.payload -> 'tops',
    'bottoms', o.payload -> 'bottoms',
    'accessories', o.payload -> 'accessories'
  ),
  coalesce(
    (o.payload ->> 'savedAt')::timestamptz,
    o.created_at
  )
from public.saved_outfits o
where (o.payload -> 'tops' ->> 'code') is not null
   or (o.payload -> 'bottoms' ->> 'code') is not null
   or (o.payload -> 'accessories' ->> 'code') is not null
on conflict (user_id, client_outfit_id) do nothing;

-- Seed sync state for existing users so first refresh after deploy is fast.
insert into public.user_sync_state (user_id, last_full_sync_at, schema_version)
select id, now(), 2 from auth.users
on conflict (user_id) do nothing;
