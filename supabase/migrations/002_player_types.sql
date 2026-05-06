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
  'Chris-B Butler',
  'Corin Davies',
  'Daniel-D Davies',
  'Daren-L Low',
  'David-E Edwards',
  'Ed Ezra',
  'Gary Edwards',
  'Geof Aiwerioba',
  'George-P Phimister',
  'Jacob Okunega',
  'James-W Wilson',
  'Joseph Pender',
  'Justin Franklin',
  'Kaya Elkiner',
  'Lawrie Pointer',
  'Mark-P Pearson',
  'Martyn-H Hawkes',
  'Martin-L Lightbody',
  'Mike-F Farley',
  'Mikel Winter',
  'Mo Iqtadar',
  'Ollie-C Cotton',
  'Paul-B Barham',
  'Paul-F Finch',
  'Pete-H Healey',
  'Peter-M May',
  'Peter-S Schaefer',
  'Richard Sharman',
  'Ross Marks',
  'Rowan Taylor',
  'Scott Duncan',
  'Sheridan Winter',
  'Stan-F Finch',
  'Stephen Pender',
  'Tim Hoad',
  'Tom-Bro Broughton'
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
