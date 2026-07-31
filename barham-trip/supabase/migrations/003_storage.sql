-- Storage buckets: public avatars, and a shared day-photos bucket (nice-to-have).
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('day-photos', 'day-photos', true)
on conflict (id) do nothing;

-- Anyone signed in can read; a member may write only within their own folder
-- (path convention: `<member_id>/...`).
drop policy if exists "avatars read" on storage.objects;
create policy "avatars read" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatars self write" on storage.objects;
create policy "avatars self write" on storage.objects
  for insert with check (
    bucket_id = 'avatars'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars self update" on storage.objects;
create policy "avatars self update" on storage.objects
  for update using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "day-photos read" on storage.objects;
create policy "day-photos read" on storage.objects
  for select using (bucket_id = 'day-photos');

drop policy if exists "day-photos write" on storage.objects;
create policy "day-photos write" on storage.objects
  for insert with check (bucket_id = 'day-photos' and auth.uid() is not null);
