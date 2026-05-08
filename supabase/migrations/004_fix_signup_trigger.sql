-- Fix handle_new_user trigger: add conflict handling and error logging
--
-- Root cause of "Database error saving new user":
--   The trigger had no exception handling. A duplicate auth_user_id
--   (unique constraint violation on retry after a partial failure)
--   propagated up to GoTrue and blocked the entire signup.
--
-- Two failure modes now handled:
--   1. Duplicate auth_user_id → ON CONFLICT (auth_user_id) DO NOTHING
--   2. Any other error → caught, logged to postgres log, trigger returns new
--      so the auth.users row still commits and the user can sign in.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
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
  VALUES (
    gen_random_uuid(),
    new.id,
    COALESCE(new.raw_user_meta_data->>'name', ''),
    COALESCE(new.raw_user_meta_data->>'surname', ''),
    COALESCE(new.raw_user_meta_data->>'age_group', 'adult'),
    'wtp',
    '{}',
    false
  )
  ON CONFLICT (auth_user_id) DO NOTHING;

  RETURN new;

EXCEPTION WHEN OTHERS THEN
  -- Log the error so it appears in Supabase's Postgres logs, but don't
  -- re-raise: a failed profile insert must never block the auth signup.
  RAISE LOG 'handle_new_user: profile insert failed for auth user % — % (%)',
    new.id, SQLERRM, SQLSTATE;
  RETURN new;
END;
$$;
