-- Backfill player_type for all existing profiles based on name lists,
-- and update handle_new_user trigger to auto-assign on signup.

-- ── Backfill existing players ────────────────────────────────────────────────

UPDATE profiles
SET player_type = 'subscribed'
WHERE name || ' ' || surname IN (
  'Aaron Franklin',
  'Adam Thorpe',
  'Beau Samuels',
  'Callum Finch',
  'Chay Samuels',
  'Chris Butler',
  'Corin Davies',
  'Daniel Davies',
  'Daren Low',
  'David Edwards',
  'Ed Ezra',
  'Gary Edwards',
  'Geof Aiwerioba',
  'George Phimister',
  'Jacob Okunega',
  'James Wilson',
  'Joseph Pender',
  'Justin Franklin',
  'Kaya Elkiner',
  'Lawrie Pointer',
  'Mark Pearson',
  'Martyn Hawkes',
  'Martin Lightbody',
  'Mike Farley',
  'Mikel Winter',
  'Mo Iqtadar',
  'Ollie Cotton',
  'Paul Barham',
  'Paul Finch',
  'Pete Healey',
  'Peter May',
  'Peter Schaefer',
  'Richard Sharman',
  'Ross Marks',
  'Rowan Taylor',
  'Scott Duncan',
  'Sheridan Winter',
  'Stan Finch',
  'Stephen Pender',
  'Tim Hoad',
  'Tom Broughton'
);

UPDATE profiles
SET player_type = 'wtp_priority'
WHERE name || ' ' || surname IN (
  'Josh Edwards',
  'Marley Barham',
  'Guy Baker',
  'Felix Baker',
  'Daryll Petrie',
  'Bill Cosma',
  'Phil Mowat',
  'Zac Hawkes'
);

-- ── Updated trigger: auto-assign player_type on signup ───────────────────────

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

  IF v_full IN (
    'Aaron Franklin', 'Adam Thorpe', 'Beau Samuels', 'Callum Finch',
    'Chay Samuels', 'Chris Butler', 'Corin Davies', 'Daniel Davies',
    'Daren Low', 'David Edwards', 'Ed Ezra', 'Gary Edwards',
    'Geof Aiwerioba', 'George Phimister', 'Jacob Okunega', 'James Wilson',
    'Joseph Pender', 'Justin Franklin', 'Kaya Elkiner', 'Lawrie Pointer',
    'Mark Pearson', 'Martyn Hawkes', 'Martin Lightbody', 'Mike Farley',
    'Mikel Winter', 'Mo Iqtadar', 'Ollie Cotton', 'Paul Barham',
    'Paul Finch', 'Pete Healey', 'Peter May', 'Peter Schaefer',
    'Richard Sharman', 'Ross Marks', 'Rowan Taylor', 'Scott Duncan',
    'Sheridan Winter', 'Stan Finch', 'Stephen Pender', 'Tim Hoad',
    'Tom Broughton'
  ) THEN
    v_ptype := 'subscribed';
  ELSIF v_full IN (
    'Josh Edwards', 'Marley Barham', 'Guy Baker', 'Felix Baker',
    'Daryll Petrie', 'Bill Cosma', 'Phil Mowat', 'Zac Hawkes'
  ) THEN
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
