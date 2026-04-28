-- Run in Supabase SQL Editor or via CLI: supabase db push
-- Requires: Auth → Providers → Anonymous sign-ins enabled (for seamless app login)
-- If CREATE TRIGGER fails on "procedure", replace `execute procedure` with `execute function` (Postgres 14+).

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Alex',
  onboarding_completed boolean not null default false,
  selfie_url text,
  updated_at timestamptz not null default now()
);

create table if not exists public.wardrobe_items (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  code text not null,
  type text not null,
  category text not null check (category in ('tops', 'bottoms', 'accessories')),
  image_url text,
  title text,
  source_url text,
  attribution text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint wardrobe_items_user_code unique (user_id, code)
);

create index if not exists wardrobe_items_user_id_idx on public.wardrobe_items (user_id);

create table if not exists public.saved_outfits (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists saved_outfits_user_id_idx on public.saved_outfits (user_id);

-- New auth users get a profile row
create or replace function public.handle_new_user ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users for each row
execute procedure public.handle_new_user ();

alter table public.profiles enable row level security;
alter table public.wardrobe_items enable row level security;
alter table public.saved_outfits enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select using (auth.uid () = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid () = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
for update
using (auth.uid () = id)
with check (auth.uid () = id);

drop policy if exists "wardrobe_all_own" on public.wardrobe_items;
create policy "wardrobe_all_own" on public.wardrobe_items for all using (auth.uid () = user_id)
with check (auth.uid () = user_id);

drop policy if exists "outfits_all_own" on public.saved_outfits;
create policy "outfits_all_own" on public.saved_outfits for all using (auth.uid () = user_id)
with check (auth.uid () = user_id);
