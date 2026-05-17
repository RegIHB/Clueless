-- Temporary public URLs for Google Lens visual search (camera / upload scans).
-- Path: {user_id}/{scan_id}.{ext}

insert into storage.buckets (id, name, public)
values ('product-scans', 'product-scans', true)
on conflict (id) do nothing;

drop policy if exists "product_scans_insert_own" on storage.objects;
create policy "product_scans_insert_own" on storage.objects
for insert with check (
  bucket_id = 'product-scans'
  and auth.uid() is not null
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "product_scans_update_own" on storage.objects;
create policy "product_scans_update_own" on storage.objects
for update using (
  bucket_id = 'product-scans'
  and auth.uid() is not null
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "product_scans_select_public" on storage.objects;
create policy "product_scans_select_public" on storage.objects
for select using (bucket_id = 'product-scans');

drop policy if exists "product_scans_delete_own" on storage.objects;
create policy "product_scans_delete_own" on storage.objects
for delete using (
  bucket_id = 'product-scans'
  and auth.uid() is not null
  and (storage.foldername(name))[1] = auth.uid()::text
);
