// Fans out web push notifications for a given match. Four topics:
//   * 'teams_ready' — teams for the next match have just been published
//     (voting_windows INSERT where opens_at is > 15 min in the future).
//     Recipients: rostered players + admins. Category 'match_night'.
//   * 'vote_open'   — voting window has just opened, players still need to
//     cast their MOTM/DOTD picks (voting_windows INSERT where opens_at is
//     imminent OR the Stage 2 cron firing when opens_at is reached).
//     Recipients: rostered players + admins. Category 'results'.
//   * 'results'     — awards + match report have been published for the
//     round. If a match report has been written (results.summary NOT NULL)
//     the push is framed as "Match report is live". Otherwise falls back
//     to the awards-only copy for backwards compat.
//     Recipients: EVERY active push subscription — the report is club-wide
//     news, not just relevant to the players rostered that week.
//   * 'dropout'     — a rostered player has used the self-service dropout
//     flow (mig 057). Extra body: { leaver_id, replacement_id? }.
//     Fires TWO payloads:
//       - admin(s) get a "🔄 Roster change" ping (leaver + replacement or
//         "admin needs to fill" if no WTP was available)
//       - replacement (if any) gets a personal "⚽ You're in tonight" ping
//
// Called by a Postgres trigger on voting_windows INSERT (for teams_ready
// or vote_open, depending on timing), by the pg_cron scheduled job (for
// vote_open at the right time), and by the compute_award_results flow
// (for results).
//
// Env: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT — set as project
// secrets. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are auto-injected.

// deno-lint-ignore-file no-explicit-any

import { createClient } from 'jsr:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

// Public key is safe as a hardcoded fallback — it's the same value baked
// into the client bundle (browsers use it to sign the subscription request).
// The private key must come from a project secret; without it we can't
// sign the VAPID JWT and Apple returns 403 BadAuthorizationHeader.
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY')
  || 'BDO5g6HQhO0s3BAEXc86kqaHy3fPl6Mtd3uo3jF7p7W1UWcVpOVkPf6KGlEHnorJecl-Ao821QJDvzph8r0NuXo'
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') || ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:pabarham@gmail.com'

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
}

Deno.serve(async (req) => {
  try {
    if (!VAPID_PRIVATE) {
      return json({ error: 'VAPID_PRIVATE_KEY not configured on the project' }, 500)
    }
    let body: any = {}
    try { body = await req.json() } catch { /* GET / empty body */ }
    const matchId = body.match_id
    const topic = body.topic
    if (!matchId || !topic) {
      return json({ error: 'match_id and topic required' }, 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 'dropout' is a special case — two payloads, two audiences — handled
    // separately below. The rest share the roster-vs-club recipient split.
    if (topic === 'dropout') {
      return await handleDropout(supabase, matchId, body)
    }

    // Recipients now resolve through public.push_targets (mig 081) so the
    // audience rules live in ONE place instead of being smeared across three
    // edge functions. Two gates inside it: a roster gate and a per-player
    // preference gate (absence of a preferences row = everything on).
    //
    //  * 'teams_ready' → rostered players, category 'match_night'.
    //    NOT club-wide. The 13 Aug widening was reverted 30 Aug: with only
    //    18 subscriptions across 86 profiles, buzzing non-players about a
    //    line-up they aren't in is the fastest way to make them turn push
    //    off altogether. Revisit once adoption is materially higher.
    //  * 'vote_open'   → rostered players, category 'results'. Only they can
    //    cast MOTM/DOTD picks.
    //  * 'results'     → club-wide, category 'results'. The report and the
    //    awards are news for everyone, players or not.
    //
    // Both roster-scoped topics pass p_include_admins => true, so an admin
    // who isn't playing this week still gets the confirmation that the
    // line-up (or the voting window) actually went out. That was the gap:
    // publish on an off-week and you'd hear nothing back.
    const CATEGORY: Record<string, string> = {
      teams_ready: 'match_night',
      vote_open: 'results',
      results: 'results',
    }

    let rosterIds: string[] | null = null
    if (topic === 'teams_ready' || topic === 'vote_open') {
      const { data: teams } = await supabase.from('teams').select('id').eq('match_id', matchId)
      const teamIds = (teams || []).map((t: any) => t.id)
      const { data: tp } = teamIds.length
        ? await supabase.from('team_players').select('player_id').in('team_id', teamIds)
        : { data: [] as { player_id: string }[] }
      rosterIds = [...new Set(((tp || []) as { player_id: string }[]).map(r => r.player_id))]
    }

    const { data: targets, error: targetErr } = await supabase.rpc('push_targets', {
      p_category: CATEGORY[topic] ?? null,
      p_player_ids: rosterIds,
      p_include_admins: true,
    })
    if (targetErr) return json({ error: `push_targets failed: ${targetErr.message}` }, 500)

    const subList = (targets || []) as Array<{
      id: string; endpoint: string; p256dh: string; auth: string; player_id: string
    }>
    if (subList.length === 0) {
      return json({ sent: 0, total: 0, reason: 'no eligible subscriptions after roster + preference filter' })
    }

    // Build payload
    const { data: matchRow } = await supabase
      .from('matches').select('match_date, theme_prompt').eq('id', matchId).maybeSingle()
    const matchDate = matchRow?.match_date || ''
    const themePrompt = (matchRow?.theme_prompt as string | null | undefined)?.trim() || null
    const readable = matchDate
      ? new Date(matchDate + 'T12:00:00').toLocaleString('en-GB', { day: 'numeric', month: 'short' })
      : 'tonight'

    // For the 'results' topic, prefer the "match report is live" framing IF
    // a structured report has actually been written for this match — the
    // report + awards land at the same moment (voting closes 10am → awards
    // publish → trigger fires), so the report is the bigger news. Fall back
    // to the awards-only copy if no report exists (edge case: admin
    // published awards without writing anything).
    let hasReport = false
    if (topic === 'results') {
      const { data: resultsRow } = await supabase
        .from('results').select('summary').eq('match_id', matchId).maybeSingle()
      hasReport = !!(resultsRow?.summary && resultsRow.summary.length > 0)
    }

    const payload = topic === 'teams_ready'
      ? {
        title: '🟢 Teams are ready',
        body: themePrompt
          ? `Line-ups for ${readable} are up. Tonight's theme: ${themePrompt} 🎭`
          : `Line-ups for ${readable} are up — tap to see your team.`,
        url: '/teams',
        tag: `teams-${matchId}`,
      }
      : topic === 'vote_open'
        ? {
          title: '🏆 Vote for tonight\'s awards',
          body: themePrompt
            ? `${readable} result is in — MOTM, DOTD & Theme (${themePrompt}) picks now open.`
            : `${readable} result is in — cast your MOTM & DOTD picks.`,
          url: '/match',
          tag: `vote-${matchId}`,
        }
        : topic === 'results'
          ? hasReport
            ? {
              title: '📝 Match report is live',
              body: `Full ${readable} write-up + MOTM & DOTD awards are up. Tap to read.`,
              url: '/match',
              tag: `report-${matchId}`,
            }
            : {
              title: '📊 MOTM & DOTD results published',
              body: `${readable} awards are up — see who won.`,
              url: '/match',
              tag: `results-${matchId}`,
            }
          : null
    if (!payload) return json({ error: 'unknown topic' }, 400)

    const payloadStr = JSON.stringify(payload)

    const outcomes = await Promise.all(subList.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payloadStr,
        )
        return { id: s.id, ok: true }
      } catch (err: any) {
        // 410 Gone or 404 Not Found → the subscription is dead. Reap it so
        // the next fan-out doesn't waste cycles on it.
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          await supabase.from('push_subscriptions').delete().eq('id', s.id)
          return { id: s.id, ok: false, reason: 'stale-cleaned' }
        }
        // Expose the actual push-service response so the SQL smoke-test can
        // see what Apple / FCM / Mozilla actually returned — the plain
        // web-push .message string is a generic "Received unexpected response
        // code" that hides the real status.
        return {
          id: s.id,
          ok: false,
          reason: err?.message || 'send-failed',
          statusCode: err?.statusCode ?? null,
          body: typeof err?.body === 'string' ? err.body.slice(0, 300) : null,
          endpoint_host: (() => {
            try { return new URL(s.endpoint).host } catch { return null }
          })(),
        }
      }
    }))

    return json({
      match_id: matchId,
      topic,
      sent: outcomes.filter(o => o.ok).length,
      total: outcomes.length,
      results: outcomes,
    })
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// 'dropout' handler — fires two payloads:
//   1. admin(s): "🔄 Roster change · Leaver out, Replacement in" (or "…admin
//      needs to fill" when no WTP was available)
//   2. replacement (if any): "⚽ You're in tonight · <matchDate>"
async function handleDropout(supabase: any, matchId: string, body: any): Promise<Response> {
  const leaverId = body.leaver_id as string | undefined
  const replacementId = (body.replacement_id as string | null | undefined) ?? null
  if (!leaverId) return json({ error: 'dropout: leaver_id required' }, 400)

  const { data: matchRow } = await supabase
    .from('matches').select('match_date').eq('id', matchId).maybeSingle()
  const matchDate = matchRow?.match_date || ''
  const readable = matchDate
    ? new Date(matchDate + 'T12:00:00').toLocaleString('en-GB', { day: 'numeric', month: 'short' })
    : 'the upcoming match'

  // Names
  const ids = [leaverId, ...(replacementId ? [replacementId] : [])]
  const { data: profs } = await supabase.from('profiles').select('id, name, surname').in('id', ids)
  const nameOf = (id: string) => {
    const p = (profs || []).find((r: any) => r.id === id)
    return p ? `${p.name} ${p.surname}` : 'A player'
  }
  const leaverName = nameOf(leaverId)
  const replacementName = replacementId ? nameOf(replacementId) : null

  // Admin recipient list
  const { data: adminProfiles } = await supabase.from('profiles').select('id').eq('is_admin', true)
  const adminIds = (adminProfiles || []).map((p: any) => p.id as string)

  // Fetch all target subscriptions in one hit
  const allIds = [...new Set([...adminIds, ...(replacementId ? [replacementId] : [])])]
  if (allIds.length === 0) return json({ sent: 0, total: 0, reason: 'no admin or replacement subs' })

  // ALWAYS-ON TIER: p_category => null, so preferences are ignored entirely.
  // "You're in tonight" tells a fella he is playing in a few hours. If he
  // could mute that we'd be a man short. The admin roster-change ping rides
  // the same tier — it's operational, not news. Explicit id list already
  // contains the admins, so p_include_admins is false to avoid double logic.
  const { data: dropoutTargets, error: dropoutErr } = await supabase.rpc('push_targets', {
    p_category: null,
    p_player_ids: allIds,
    p_include_admins: false,
  })
  if (dropoutErr) return json({ error: `push_targets failed: ${dropoutErr.message}` }, 500)
  const subs = (dropoutTargets || []) as Array<{ id: string; endpoint: string; p256dh: string; auth: string; player_id: string }>

  const adminPayload = JSON.stringify({
    title: '🔄 Roster change',
    body: replacementName
      ? `${leaverName} dropped out. ${replacementName} swapped in for ${readable}.`
      : `${leaverName} dropped out for ${readable}. No WTP available — needs a manual fill.`,
    url: '/teams',
    tag: `dropout-${matchId}-${leaverId}`,
  })
  const replacementPayload = replacementName ? JSON.stringify({
    title: '⚽ You\'re in tonight',
    body: `${leaverName} dropped out — you're swapped in for ${readable}. Tap to see your team.`,
    url: '/teams',
    tag: `roster-in-${matchId}-${replacementId}`,
  }) : null

  const outcomes = await Promise.all(subs.map(async (s) => {
    const isReplacementSub = replacementId && s.player_id === replacementId
    const payloadStr = isReplacementSub && replacementPayload ? replacementPayload : adminPayload
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payloadStr,
      )
      return { id: s.id, ok: true, audience: isReplacementSub ? 'replacement' : 'admin' }
    } catch (err: any) {
      if (err?.statusCode === 410 || err?.statusCode === 404) {
        await supabase.from('push_subscriptions').delete().eq('id', s.id)
        return { id: s.id, ok: false, reason: 'stale-cleaned' }
      }
      return { id: s.id, ok: false, reason: err?.message || 'send-failed', statusCode: err?.statusCode ?? null }
    }
  }))

  return json({
    match_id: matchId,
    topic: 'dropout',
    leaver: leaverName,
    replacement: replacementName,
    sent: outcomes.filter(o => o.ok).length,
    total: outcomes.length,
    results: outcomes,
  })
}
