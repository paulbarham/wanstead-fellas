-- ================================================================
-- Wanstead Fellas — Match Seed Data
-- Run in Supabase SQL Editor
-- Uses fixed UUIDs — idempotent, safe to run multiple times
-- ================================================================


-- ── MATCH 1: Thu 29 May 2025 — 4-Team Tournament ─────────────

INSERT INTO matches (id, match_date, format, status)
VALUES ('a0000001-0000-0000-0000-000000000001', '2025-05-29', 'tournament', 'completed')
ON CONFLICT (id) DO NOTHING;

INSERT INTO teams (id, match_id, name, captain_id, bibs) VALUES
  ('b0000001-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000001', 'Paul F''s FC',   NULL, false),
  ('b0000001-0000-0000-0000-000000000002', 'a0000001-0000-0000-0000-000000000001', 'Ed Ezra''s FC',  NULL, true),
  ('b0000001-0000-0000-0000-000000000003', 'a0000001-0000-0000-0000-000000000001', 'James W''s FC',  NULL, false),
  ('b0000001-0000-0000-0000-000000000004', 'a0000001-0000-0000-0000-000000000001', 'Callum F''s FC', NULL, true)
ON CONFLICT (id) DO NOTHING;

-- Paul F's FC 5–0 Callum F's FC
-- Ed Ezra's FC 1–0 James W's FC
-- Callum F's FC 0–2 Ed Ezra's FC
-- Paul F's FC 1–0 Ed Ezra's FC
-- Callum F's FC 0–1 James W's FC
-- James W's FC 0–0 Paul F's FC
INSERT INTO fixtures (id, match_id, team1_id, team2_id, score1, score2) VALUES
  ('c0000001-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000001',
    'b0000001-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000004', 5, 0),
  ('c0000001-0000-0000-0000-000000000002', 'a0000001-0000-0000-0000-000000000001',
    'b0000001-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000003', 1, 0),
  ('c0000001-0000-0000-0000-000000000003', 'a0000001-0000-0000-0000-000000000001',
    'b0000001-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000002', 0, 2),
  ('c0000001-0000-0000-0000-000000000004', 'a0000001-0000-0000-0000-000000000001',
    'b0000001-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000002', 1, 0),
  ('c0000001-0000-0000-0000-000000000005', 'a0000001-0000-0000-0000-000000000001',
    'b0000001-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000003', 0, 1),
  ('c0000001-0000-0000-0000-000000000006', 'a0000001-0000-0000-0000-000000000001',
    'b0000001-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000001', 0, 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO results (id, match_id, report_text, scorers, highlights)
VALUES (
  'd0000001-0000-0000-0000-000000000001',
  'a0000001-0000-0000-0000-000000000001',
  'Another night where balance delivered exactly what was promised. Tight games, shared goals and fine margins across the board — the algorithm is clearly doing something right. Sheridan Winter pulled the strings all evening while Mikel Winter and Beau Samuels delivered the goals as expected. Tom Broughton''s decisive strike for James Wilson''s side was the moment of the night — quietly efficient, doing the basics properly. Callum Finch''s side were organised and disciplined but couldn''t find the net when it mattered.',
  'OG Ollie, Noah, Josh, Rowan, Sheridan (Paul F''s FC) · Mikel (Ed Ezra''s FC) · Scott, Beau (Ed Ezra''s FC) · Paul Finch (Paul F''s FC) · Tom Broughton (James W''s FC)',
  'Player of the Tournament: Sheridan Winter'
)
ON CONFLICT (id) DO NOTHING;


-- ── MATCH 2: Thu 22 May 2025 — 7v7 ──────────────────────────

INSERT INTO matches (id, match_date, format, status)
VALUES ('a0000001-0000-0000-0000-000000000002', '2025-05-22', '7v7', 'completed')
ON CONFLICT (id) DO NOTHING;

INSERT INTO teams (id, match_id, name, captain_id, bibs) VALUES
  ('b0000001-0000-0000-0000-000000000005', 'a0000001-0000-0000-0000-000000000002', 'Sheridan''s XI', NULL, false),
  ('b0000001-0000-0000-0000-000000000006', 'a0000001-0000-0000-0000-000000000002', 'Lawrie''s XI',   NULL, true)
ON CONFLICT (id) DO NOTHING;

-- Sheridan's XI 3–2 Lawrie's XI
INSERT INTO fixtures (id, match_id, team1_id, team2_id, score1, score2) VALUES
  ('c0000001-0000-0000-0000-000000000007', 'a0000001-0000-0000-0000-000000000002',
    'b0000001-0000-0000-0000-000000000005', 'b0000001-0000-0000-0000-000000000006', 3, 2)
ON CONFLICT (id) DO NOTHING;

INSERT INTO results (id, match_id, report_text, scorers, highlights)
VALUES (
  'd0000001-0000-0000-0000-000000000002',
  'a0000001-0000-0000-0000-000000000002',
  'Beau bagged a brace and Mikel added a third to see off a spirited Lawrie''s XI who kept fighting until the final whistle.',
  'Beau x2, Mikel (Sheridan''s XI) · Lawrie, Josh (Lawrie''s XI)',
  'Beau Samuels brace'
)
ON CONFLICT (id) DO NOTHING;


-- ── MATCH 3: Thu 15 May 2025 — 8v8 ──────────────────────────

INSERT INTO matches (id, match_date, format, status)
VALUES ('a0000001-0000-0000-0000-000000000003', '2025-05-15', '8v8', 'completed')
ON CONFLICT (id) DO NOTHING;

INSERT INTO teams (id, match_id, name, captain_id, bibs) VALUES
  ('b0000001-0000-0000-0000-000000000007', 'a0000001-0000-0000-0000-000000000003', 'Beau''s XI', NULL, false),
  ('b0000001-0000-0000-0000-000000000008', 'a0000001-0000-0000-0000-000000000003', 'Mike''s XI', NULL, true)
ON CONFLICT (id) DO NOTHING;

-- Beau's XI 4–1 Mike's XI
INSERT INTO fixtures (id, match_id, team1_id, team2_id, score1, score2) VALUES
  ('c0000001-0000-0000-0000-000000000008', 'a0000001-0000-0000-0000-000000000003',
    'b0000001-0000-0000-0000-000000000007', 'b0000001-0000-0000-0000-000000000008', 4, 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO results (id, match_id, report_text, scorers, highlights)
VALUES (
  'd0000001-0000-0000-0000-000000000003',
  'a0000001-0000-0000-0000-000000000003',
  'Dominant display from Beau''s XI with Sheridan running the show from start to finish.',
  'Sheridan x2, Rory, Aaron (Beau''s XI) · Mikel (Mike''s XI)',
  'Sheridan Winter man of the match'
)
ON CONFLICT (id) DO NOTHING;
