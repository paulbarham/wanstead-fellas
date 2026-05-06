-- Add player_type to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS player_type text NOT NULL DEFAULT 'wtp';

-- Add status to availability (confirmed = in squad, waiting = waitlisted)
ALTER TABLE availability ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'confirmed';

-- Subscribed players
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

-- WTP Priority players
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
