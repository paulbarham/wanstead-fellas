CREATE TABLE IF NOT EXISTS fines (
  id uuid default gen_random_uuid() primary key,
  player_id uuid references profiles(id),
  match_date date,
  type text not null check (type in ('late', 'lost_ball', 'cuntiness', 'dropout')),
  amount decimal(10,2) not null,
  notes text,
  paid bool default false,
  created_at timestamptz default now()
);

CREATE TABLE IF NOT EXISTS wtp_games (
  id uuid default gen_random_uuid() primary key,
  player_id uuid references profiles(id),
  match_date date not null,
  amount decimal(10,2) default 5.00,
  paid bool default false,
  created_at timestamptz default now(),
  CONSTRAINT wtp_games_player_match_unique UNIQUE (player_id, match_date)
);

ALTER TABLE fines ENABLE ROW LEVEL SECURITY;
ALTER TABLE wtp_games ENABLE ROW LEVEL SECURITY;

-- Players can read their own records; admin can read all
CREATE POLICY "Read own or admin fines" ON fines FOR SELECT
  USING (
    auth.uid() = player_id
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "Read own or admin wtp_games" ON wtp_games FOR SELECT
  USING (
    auth.uid() = player_id
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Only admin can write
CREATE POLICY "Admin insert fines" ON fines FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Admin update fines" ON fines FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Admin delete fines" ON fines FOR DELETE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Admin insert wtp_games" ON wtp_games FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Admin update wtp_games" ON wtp_games FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Admin delete wtp_games" ON wtp_games FOR DELETE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));
