-- Player self-service dropout with auto-replacement.
--
-- Before this, if a rostered player couldn't make Thursday they messaged
-- admin, who had to hand-swap them across team_players + team_formations +
-- team_drafts + availability + find a WTP replacement — 4-5 SQL updates per
-- swap. This week alone we did four (Ed→Beau, Martyn→Scott shuffle, Leo→
-- Pete, plus the WhatsApp back-and-forth). Ugly admin taxi.
--
-- The RPC does the whole flow atomically, called from the player's own
-- device via supabase.rpc('player_dropout', { p_match_id }). Callers can
-- only drop THEMSELVES (auth.uid() constraint) and only for a match that
-- hasn't completed yet.
--
-- Replacement heuristic: cheapest possible for v1 — first available WTP
-- (wtp_priority preferred over wtp) with an unmatched confirmed-availability
-- for the match_date who isn't already rostered. Position-aware balancing
-- is deferred to admin's judgement — this just fills the numbers.

CREATE OR REPLACE FUNCTION public.player_dropout(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id     uuid;   -- calling profile.id
  v_match_date    date;
  v_match_status  text;
  v_team_id       uuid;
  v_replacement   uuid;
  v_replacement_name text;
  v_slot_key      text;
BEGIN
  -- 1. Resolve the caller's profile.id from auth.uid()
  SELECT id INTO v_caller_id FROM profiles WHERE auth_user_id = auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not-authenticated');
  END IF;

  -- 2. Load the match + guard
  SELECT match_date, status INTO v_match_date, v_match_status
  FROM matches WHERE id = p_match_id;
  IF v_match_date IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'match-not-found');
  END IF;
  IF v_match_status = 'completed' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'match-already-completed');
  END IF;

  -- 3. Find the caller's team_players row for this match
  SELECT tp.team_id INTO v_team_id
  FROM team_players tp
  JOIN teams t ON t.id = tp.team_id
  WHERE t.match_id = p_match_id AND tp.player_id = v_caller_id;
  IF v_team_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not-rostered');
  END IF;

  -- 4. Find a WTP replacement: confirmed-available for match_date, not
  --    already rostered, wtp_priority preferred over wtp.
  SELECT p.id, p.name || ' ' || p.surname INTO v_replacement, v_replacement_name
  FROM profiles p
  JOIN availability a ON a.player_id = p.id
                     AND a.match_date = v_match_date
                     AND a.status = 'confirmed'
  WHERE p.player_type IN ('wtp', 'wtp_priority')
    AND p.id <> v_caller_id
    AND NOT EXISTS (
      SELECT 1 FROM team_players tp
      JOIN teams t ON t.id = tp.team_id
      WHERE t.match_id = p_match_id AND tp.player_id = p.id
    )
  ORDER BY CASE p.player_type WHEN 'wtp_priority' THEN 0 ELSE 1 END,
           a.created_at
  LIMIT 1;

  -- 5. Find the formation slot the caller currently occupies (if any)
  SELECT k INTO v_slot_key
  FROM team_formations tf,
       jsonb_each_text(tf.slots) AS s(k, v)
  WHERE tf.team_id = v_team_id AND s.v = v_caller_id::text
  LIMIT 1;

  -- 6. Atomic swap: remove caller, insert replacement (if found), update
  --    formation slot, sync availability, then rebuild team_drafts JSON.
  DELETE FROM team_players WHERE team_id = v_team_id AND player_id = v_caller_id;

  IF v_replacement IS NOT NULL THEN
    INSERT INTO team_players (team_id, player_id) VALUES (v_team_id, v_replacement);
    IF v_slot_key IS NOT NULL THEN
      UPDATE team_formations
         SET slots = slots || jsonb_build_object(v_slot_key, v_replacement::text),
             updated_at = now()
       WHERE team_id = v_team_id;
    END IF;
  ELSE
    -- No replacement: leave the slot empty (admin can fill manually).
    IF v_slot_key IS NOT NULL THEN
      UPDATE team_formations
         SET slots = slots - v_slot_key, updated_at = now()
       WHERE team_id = v_team_id;
    END IF;
  END IF;

  -- Caller declines this match; replacement confirms (safe upsert).
  INSERT INTO availability (player_id, match_date, status)
       VALUES (v_caller_id, v_match_date, 'declined')
  ON CONFLICT (player_id, match_date) DO UPDATE SET status = 'declined';

  IF v_replacement IS NOT NULL THEN
    INSERT INTO availability (player_id, match_date, status)
         VALUES (v_replacement, v_match_date, 'confirmed')
    ON CONFLICT (player_id, match_date) DO UPDATE SET status = 'confirmed';
  END IF;

  -- Rebuild team_drafts JSON so the Teams tab reflects the swap immediately.
  UPDATE team_drafts
     SET draft = (
       SELECT jsonb_agg(
         jsonb_set(
           team_obj - 'players',
           '{players}',
           COALESCE(
             (SELECT jsonb_agg(to_jsonb(pp.*) ORDER BY pp.surname, pp.name)
                FROM teams tt
                JOIN team_players tpx ON tpx.team_id = tt.id
                JOIN profiles pp ON pp.id = tpx.player_id
               WHERE tt.match_id = p_match_id
                 AND tt.name = team_obj->>'name'),
             '[]'::jsonb
           )
         )
       )
       FROM jsonb_array_elements(draft) AS team_obj
     ),
     updated_at = now()
   WHERE match_date = v_match_date;

  RETURN jsonb_build_object(
    'ok', true,
    'replaced', v_replacement IS NOT NULL,
    'replacement_name', v_replacement_name,
    'slot_filled', v_replacement IS NOT NULL AND v_slot_key IS NOT NULL,
    'match_date', v_match_date
  );
END;
$$;

REVOKE ALL ON FUNCTION public.player_dropout(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.player_dropout(uuid) TO authenticated;

COMMENT ON FUNCTION public.player_dropout(uuid) IS
  'Player-initiated dropout for an upcoming match. Removes caller from team_players + formation slot, marks caller declined, auto-swaps in a WTP replacement (wtp_priority preferred). Rebuilds team_drafts JSON. Called via supabase.rpc from the "I can''t play" button on TeamsPage.';
