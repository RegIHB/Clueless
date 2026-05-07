-- Billing columns on profiles: tracks Lemon Squeezy subscription state.
-- Run in Supabase SQL Editor after previous migrations.

alter table public.profiles
  add column if not exists is_pro boolean not null default false,
  add column if not exists ls_customer_id text,
  add column if not exists ls_subscription_id text,
  add column if not exists ls_subscription_status text;

create index if not exists profiles_ls_customer_idx on public.profiles (ls_customer_id);
create index if not exists profiles_ls_subscription_idx on public.profiles (ls_subscription_id);
