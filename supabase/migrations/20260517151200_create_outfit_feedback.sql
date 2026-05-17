-- Track per-user feedback signals on suggested outfits for personalization.

create table if not exists public.outfit_feedback (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  client_outfit_id text,
  outfit_snapshot jsonb not null default '{}'::jsonb,
  signal text not null check (signal in ('worn', 'liked', 'dismissed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists outfit_feedback_user_created_idx
  on public.outfit_feedback (user_id, created_at desc);

create index if not exists outfit_feedback_user_signal_idx
  on public.outfit_feedback (user_id, signal, created_at desc);

alter table public.outfit_feedback enable row level security;

drop policy if exists "outfit_feedback_select_own" on public.outfit_feedback;
create policy "outfit_feedback_select_own" on public.outfit_feedback
  for select using (auth.uid() = user_id);

drop policy if exists "outfit_feedback_insert_own" on public.outfit_feedback;
create policy "outfit_feedback_insert_own" on public.outfit_feedback
  for insert with check (auth.uid() = user_id);

drop policy if exists "outfit_feedback_delete_own" on public.outfit_feedback;
create policy "outfit_feedback_delete_own" on public.outfit_feedback
  for delete using (auth.uid() = user_id);
