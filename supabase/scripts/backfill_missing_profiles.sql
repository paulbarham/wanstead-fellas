-- =============================================================
-- Backfill missing profiles
--
-- Use this when the handle_new_user trigger has failed silently
-- and you have auth.users rows with no matching public.profiles row.
-- Run in the Supabase SQL editor.
-- =============================================================

-- 1) Inspect: list auth users that have NO profile row.
--    Run this first to see who would be backfilled.
SELECT
  u.id              AS auth_user_id,
  u.email,
  u.created_at,
  u.raw_user_meta_data->>'name'      AS name,
  u.raw_user_meta_data->>'surname'   AS surname,
  u.raw_user_meta_data->>'age_group' AS age_group
FROM auth.users u
LEFT JOIN public.profiles p ON p.auth_user_id = u.id
WHERE p.id IS NULL
ORDER BY u.created_at DESC;


-- 2) Backfill: insert a profile row for every auth user that doesn't have one,
--    using whatever signup metadata is available. Safe to re-run.
INSERT INTO public.profiles (
  id,
  auth_user_id,
  name,
  surname,
  age_group,
  player_type,
  badges,
  is_admin
)
SELECT
  gen_random_uuid(),
  u.id,
  COALESCE(NULLIF(u.raw_user_meta_data->>'name', ''),    'Unknown'),
  COALESCE(NULLIF(u.raw_user_meta_data->>'surname', ''), ''),
  COALESCE(NULLIF(u.raw_user_meta_data->>'age_group', ''), 'adult'),
  'wtp',
  ARRAY[]::text[],
  (u.email = 'pabarham@gmail.com')
FROM auth.users u
LEFT JOIN public.profiles p ON p.auth_user_id = u.id
WHERE p.id IS NULL
ON CONFLICT (auth_user_id) DO NOTHING;


-- 3) Verify: this should return 0 rows.
SELECT COUNT(*) AS still_missing
FROM auth.users u
LEFT JOIN public.profiles p ON p.auth_user_id = u.id
WHERE p.id IS NULL;
