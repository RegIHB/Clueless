-- Storage bucket for persisted try-on result images.
-- Files live at: {userId}/{jobId}.jpg
-- Run in Supabase SQL Editor after the previous migrations.

insert into storage.buckets (id, name, public)
values ('try-on-results', 'try-on-results', true)
on conflict (id) do nothing;

-- Authenticated users may upload only inside their own folder.
drop policy if exists "try_on_insert_own" on storage.objects;
create policy "try_on_insert_own" on storage.objects
for insert with check (
  bucket_id = 'try-on-results'
  and auth.uid() is not null
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Public bucket — anyone with the URL can read (URL contains a UUID so not guessable).
drop policy if exists "try_on_select_public" on storage.objects;
create policy "try_on_select_public" on storage.objects
for select using (bucket_id = 'try-on-results');

-- Users may delete their own images only.
drop policy if exists "try_on_delete_own" on storage.objects;
create policy "try_on_delete_own" on storage.objects
for delete using (
  bucket_id = 'try-on-results'
  and auth.uid() is not null
  and (storage.foldername(name))[1] = auth.uid()::text
);
