-- Player dropout v2: position-aware WTP replacement + admin/replacement
-- push notifications.
--
-- v1 (mig 057) filled the number-of-players gap and cleared the WhatsApp
-- taxi, but two follow-ups made the sting list at ship time:
--   * Silent to admin — a dropout at 18:00 Thu with no available WTP left
--     admin unaware until they opened the app (i.e. maybe not until after
--     kickoff).
--   * FIFO WTP pick took whoever confirmed availability first regardless
--     of position — a striker leaving got replaced by a keeper if the
--     keeper was earliest in the queue.
--
-- v2 changes:
--   1. Preferred-position match — the WTP whose preferred_position_primary
--      matches the leaver's gets picked first, then wtp_priority tier, then
--      FIFO. Falls back to any WTP if no positional match is available (i.e.
--      slot-filling still trumps leaving the team a body short).
--   2. Push fanout — calls the send-vote-notifications edge fn with
--      topic='dropout' + { leaver_id, replacement_id } payload after the
--      swap commits. Edge fn sends admin(s) a "🔄 Roster change" push +
--      the replacement a personal "⚽ You're in tonight" ping.

-- Extend the pg_net helper to pass through an optional extra payload.
CREATE OR REPLACE FUNCTION public.call_send_vote_notifications(
  p_match_id uuid,
  p_topic    text,
  p_extra    jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_url  text;
  v_body jsonb;
BEGIN
  SELECT decrypted_secret INTO v_url
  FROM vault.decrypted_secrets
  WHERE name = 'vote_notify_url'
  LIMIT 1;

  IF v_url IS NULL OR v_url = '' THEN
    RAISE NOTICE 'vault secret vote_notify_url not set — send-vote-notifications skipped';
    RETURN;
  END IF;

  v_body := jsonb_build_object('match_id', p_match_id, 'topic', p_topic);
  IF p_extra IS NOT NULL THEN
    v_body := v_body || p_extra;
  END IF;

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := v_body,
    timeout_milliseconds := 20000
  );
END;
$$;

-- Rewrite player_dropout to add position-aware ORDER BY + push fanout.
CREATE OR REPLACE FUNCTION public.player_dropout(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id     uuid;
  v_caller_pos    text;
  v_match_date    date;
  v_match_status  text;
  v_team_id       uuid;
  v_replacement   uuid;
  v_replacement_name text;
  v_slot_key      text;
BEGIN
  SELECT id, preferred_position_primary
    INTO v_caller_id, v_caller_pos
    FROM profiles WHERE auth_user_id = auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not-authenticated');
  END IF;

  SELECT match_date, status INTO v_match_date, v_match_status
  FROM matches WHERE id = p_match_id;
  IF v_match_date IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'match-not-found');
  END IF;
  IF v_match_status = 'completed' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'match-already-completed');
  END IF;

  SELECT tp.team_id INTO v_team_id
  FROM team_players tp
  JOIN teams t ON t.id = tp.team_id
  WHERE t.match_id = p_match_id AND tp.player_id = v_caller_id;
  IF v_team_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not-rostered');
  END IF;

  -- Position-aware replacement pick:
  --   1st: WTP whose preferred_position_primary matches the leaver's
  --   2nd: WTP whose preferred_position_secondary matches
  --   3rd: any WTP
  --   Within each bucket: wtp_priority tier first, then FIFO by availability
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
  ORDER BY
    -- position match: 0 = primary match, 1 = secondary match, 2 = no match
    CASE
      WHEN v_caller_pos IS NOT NULL AND p.preferred_position_primary   = v_caller_pos THEN 0
      WHEN v_caller_pos IS NOT NULL AND p.preferred_position_secondary = v_caller_pos THEN 1
      ELSE 2
    END,
    CASE p.player_type WHEN 'wtp_priority' THEN 0 ELSE 1 END,
    a.created_at
  LIMIT 1;

  SELECT k INTO v_slot_key
  FROM team_formations tf,
       jsonb_each_text(tf.slots) AS s(k, v)
  WHERE tf.team_id = v_team_id AND s.v = v_caller_id::text
  LIMIT 1;

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
    IF v_slot_key IS NOT NULL THEN
      UPDATE team_formations
         SET slots = slots - v_slot_key, updated_at = now()
       WHERE team_id = v_team_id;
    END IF;
  END IF;

  INSERT INTO availability (player_id, match_date, status)
       VALUES (v_caller_id, v_match_date, 'declined')
  ON CONFLICT (player_id, match_date) DO UPDATE SET status = 'declined';

  IF v_replacement IS NOT NULL THEN
    INSERT INTO availability (player_id, match_date, status)
         VALUES (v_replacement, v_match_date, 'confirmed')
    ON CONFLICT (player_id, match_date) DO UPDATE SET status = 'confirmed';
  END IF;

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

  -- Push fanout: admin(s) always get pinged; replacement (if any) gets a
  -- personal "you're in tonight" ping. Best-effort — a network wobble here
  -- doesn't roll back the swap; the audit tab still shows what happened.
  PERFORM public.call_send_vote_notifications(
    p_match_id,
    'dropout',
    jsonb_build_object(
      'leaver_id', v_caller_id,
      'replacement_id', v_replacement
    )
  );

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
