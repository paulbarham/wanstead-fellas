-- Extend player_type matching to fall back to surname-alone for globally
-- unique surnames (appear exactly once across both the subscribed and
-- priority lists combined).  Fixes cases like "Edward Ezra" where the
-- registered first name differs from the canonical list name ("Ed").
--
-- Surnames skipped (appear more than once across both lists, so ambiguous):
--   Baker, Barham, Davies, Edwards, Finch, Franklin, Hawkes, Pender, Samuels, Winter

-- ── Backfill: exact name first, then surname fallback ────────────────────────

-- Pass 1: exact full-name match (idempotent re-run of 005)
UPDATE profiles SET player_type = 'subscribed'
WHERE name || ' ' || surname IN (
  'Aaron Franklin','Adam Thorpe','Beau Samuels','Callum Finch','Chay Samuels',
  'Chris Butler','Corin Davies','Daniel Davies','Daren Low','David Edwards',
  'Ed Ezra','Gary Edwards','Geof Aiwerioba','George Phimister','Jacob Okunega',
  'James Wilson','Joseph Pender','Justin Franklin','Kaya Elkiner','Lawrie Pointer',
  'Mark Pearson','Martyn Hawkes','Martin Lightbody','Mike Farley','Mikel Winter',
  'Mo Iqtadar','Ollie Cotton','Paul Barham','Paul Finch','Pete Healey',
  'Peter May','Peter Schaefer','Richard Sharman','Ross Marks','Rowan Taylor',
  'Scott Duncan','Sheridan Winter','Stan Finch','Stephen Pender','Tim Hoad',
  'Tom Broughton'
);

UPDATE profiles SET player_type = 'wtp_priority'
WHERE name || ' ' || surname IN (
  'Josh Edwards','Marley Barham','Guy Baker','Felix Baker',
  'Daryll Petrie','Bill Cosma','Phil Mowat','Zac Hawkes'
);

-- Pass 2: surname-only fallback for profiles still on 'wtp'
UPDATE profiles SET player_type = 'subscribed'
WHERE player_type = 'wtp'
  AND surname IN (
    'Aiwerioba','Broughton','Butler','Cotton','Duncan','Elkiner','Ezra',
    'Farley','Healey','Hoad','Iqtadar','Lightbody','Low','Marks','May',
    'Okunega','Pearson','Phimister','Pointer','Schaefer','Sharman',
    'Taylor','Thorpe','Wilson'
  );

UPDATE profiles SET player_type = 'wtp_priority'
WHERE player_type = 'wtp'
  AND surname IN ('Cosma','Mowat','Petrie');

-- ── Updated trigger: exact name → unique surname fallback → wtp ──────────────

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_name    text;
  v_surname text;
  v_full    text;
  v_ptype   text;
BEGIN
  v_name    := COALESCE(new.raw_user_meta_data->>'name', '');
  v_surname := COALESCE(new.raw_user_meta_data->>'surname', '');
  v_full    := v_name || ' ' || v_surname;

  -- Exact full-name match
  IF v_full IN (
    'Aaron Franklin','Adam Thorpe','Beau Samuels','Callum Finch','Chay Samuels',
    'Chris Butler','Corin Davies','Daniel Davies','Daren Low','David Edwards',
    'Ed Ezra','Gary Edwards','Geof Aiwerioba','George Phimister','Jacob Okunega',
    'James Wilson','Joseph Pender','Justin Franklin','Kaya Elkiner','Lawrie Pointer',
    'Mark Pearson','Martyn Hawkes','Martin Lightbody','Mike Farley','Mikel Winter',
    'Mo Iqtadar','Ollie Cotton','Paul Barham','Paul Finch','Pete Healey',
    'Peter May','Peter Schaefer','Richard Sharman','Ross Marks','Rowan Taylor',
    'Scott Duncan','Sheridan Winter','Stan Finch','Stephen Pender','Tim Hoad',
    'Tom Broughton'
  ) THEN
    v_ptype := 'subscribed';
  ELSIF v_full IN (
    'Josh Edwards','Marley Barham','Guy Baker','Felix Baker',
    'Daryll Petrie','Bill Cosma','Phil Mowat','Zac Hawkes'
  ) THEN
    v_ptype := 'wtp_priority';

  -- Surname-only fallback for globally unique surnames
  ELSIF v_surname IN (
    'Aiwerioba','Broughton','Butler','Cotton','Duncan','Elkiner','Ezra',
    'Farley','Healey','Hoad','Iqtadar','Lightbody','Low','Marks','May',
    'Okunega','Pearson','Phimister','Pointer','Schaefer','Sharman',
    'Taylor','Thorpe','Wilson'
  ) THEN
    v_ptype := 'subscribed';
  ELSIF v_surname IN ('Cosma','Mowat','Petrie') THEN
    v_ptype := 'wtp_priority';

  ELSE
    v_ptype := 'wtp';
  END IF;

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
    v_name,
    v_surname,
    COALESCE(new.raw_user_meta_data->>'age_group', 'adult'),
    v_ptype,
    '{}',
    false
  )
  ON CONFLICT (auth_user_id) DO NOTHING;

  RETURN new;

EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'handle_new_user: profile insert failed for auth user % — % (%)',
    new.id, SQLERRM, SQLSTATE;
  RETURN new;
END;
$$;
