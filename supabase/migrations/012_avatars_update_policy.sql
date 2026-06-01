-- Storage RLS on the avatars bucket was inconsistent: INSERT/DELETE policies
-- correctly used my_profile_id() to map auth.uid() → profile.id (which is the
-- folder segment in the path "{profile_id}/profile.jpg"), but the UPDATE
-- policy still used auth.uid() directly. For users whose profile.id differs
-- from their auth.uid (most of them), this meant re-uploading a photo via
-- upsert hit the UPDATE branch and was denied.
--
-- Add an UPDATE policy that mirrors the INSERT/DELETE shape: own profile or
-- linked child.

drop policy if exists "avatars: own update" on storage.objects;
create policy "avatars: own update" on storage.objects
  for update
  using (
    bucket_id = 'avatars'
    and (
      (storage.foldername(name))[1] = (my_profile_id())::text
      or exists (
        select 1 from linked_profiles
        where parent_id = my_profile_id()
          and (child_id)::text = (storage.foldername(objects.name))[1]
      )
    )
  )
  with check (
    bucket_id = 'avatars'
    and (
      (storage.foldername(name))[1] = (my_profile_id())::text
      or exists (
        select 1 from linked_profiles
        where parent_id = my_profile_id()
          and (child_id)::text = (storage.foldername(objects.name))[1]
      )
    )
  );
