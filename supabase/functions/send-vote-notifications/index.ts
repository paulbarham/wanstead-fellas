// Fans out web push notifications for a given match. Two topics:
//   * 'vote_open' — voting window has just opened, players still need to
//     cast their MOTM/DOTD picks
//   * 'results'   — award results have been published for the round
//
// Called by a Postgres trigger on voting_windows INSERT (for vote_open) and
// by the compute_award_results flow when results_published flips true.
//
// Env: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT — set as project
// secrets. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are auto-injected.

// deno-lint-ignore-file no-explicit-any

import { createClient } from 'jsr:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') || ''
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') || ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@wanstead-fellas.local'

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

    // Eligible players = anyone rostered on any team for the match.
    const { data: teams } = await supabase.from('teams').select('id').eq('match_id', matchId)
    const teamIds = (teams || []).map((t: any) => t.id)
    if (teamIds.length === 0) return json({ sent: 0, total: 0, reason: 'no teams' })

    const { data: tp } = await supabase.from('team_players').select('player_id').in('team_id', teamIds)
    const playerIds = [...new Set((tp || []).map((r: any) => r.player_id as string))]
    if (playerIds.length === 0) return json({ sent: 0, total: 0, reason: 'no players' })

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .in('player_id', playerIds)
    const subList = (subs || []) as Array<{ id: string; endpoint: string; p256dh: string; auth: string }>

    // Build payload
    const { data: matchRow } = await supabase
      .from('matches').select('match_date').eq('id', matchId).maybeSingle()
    const matchDate = matchRow?.match_date || ''
    const readable = matchDate
      ? new Date(matchDate + 'T12:00:00').toLocaleString('en-GB', { day: 'numeric', month: 'short' })
      : 'tonight'

    const payload = topic === 'vote_open'
      ? {
        title: '🏆 Vote for tonight\'s awards',
        body: `${readable} result is in — cast your MOTM & DOTD picks.`,
        url: '/match',
        tag: `vote-${matchId}`,
      }
      : topic === 'results'
        ? {
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
        return { id: s.id, ok: false, reason: err?.message || 'send-failed' }
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
