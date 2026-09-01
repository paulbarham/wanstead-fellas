// Monthly personal review push.
//
// Fires 07:15 UTC on the 1st via pg_cron (mig 087). Pushes a generic
// "your <month> is in" prompt to every player who had ≥1 appearance
// in the just-closed month. Deep-links to /profile/monthly/YYYY-MM.
//
// Design: audience-filtered (only players who turned out) so we don't
// wake dormant players with a "you had no games" ping. Personal detail
// lives on the deep-linked card, not in the push body.
//
// Body: { month?: string }  YYYY-MM. Defaults to the month that just closed.
// Env:  VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT

// deno-lint-ignore-file no-explicit-any

import { createClient } from 'jsr:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY')
  || 'BDO5g6HQhO0s3BAEXc86kqaHy3fPl6Mtd3uo3jF7p7W1UWcVpOVkPf6KGlEHnorJecl-Ao821QJDvzph8r0NuXo'
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') || ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:pabarham@gmail.com'

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
}

// The month that JUST closed. If today is 2026-09-01, this returns '2026-08'.
function priorMonthSlug(now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  d.setUTCMonth(d.getUTCMonth() - 1)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function monthLabel(slug: string): string {
  const [y, m] = slug.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  })
}

Deno.serve(async (req) => {
  try {
    if (!VAPID_PRIVATE) return json({ error: 'VAPID_PRIVATE_KEY not configured' }, 500)

    let body: any = {}
    try { body = await req.json() } catch { /* GET / empty */ }
    const slug: string = body.month || priorMonthSlug()
    if (!/^\d{4}-\d{2}$/.test(slug)) return json({ error: 'month must be YYYY-MM' }, 400)

    const fromDate = `${slug}-01`
    const [y, m] = slug.split('-').map(Number)
    const toDate = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10)  // first of next month

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Who appeared this month? Any player on any team_players row where the
    // team belongs to a completed match in [fromDate, toDate).
    const { data: matches, error: mErr } = await supabase
      .from('matches')
      .select('id')
      .eq('status', 'completed')
      .gte('match_date', fromDate)
      .lt('match_date', toDate)
    if (mErr) return json({ error: `matches: ${mErr.message}` }, 500)
    const matchIds = (matches ?? []).map((r: any) => r.id)
    if (matchIds.length === 0) {
      return json({ status: 'no_matches_in_month', month: slug })
    }

    const { data: teamRows, error: tErr } = await supabase
      .from('teams').select('id').in('match_id', matchIds)
    if (tErr) return json({ error: `teams: ${tErr.message}` }, 500)
    const teamIds = (teamRows ?? []).map((r: any) => r.id)

    const { data: tp, error: tpErr } = await supabase
      .from('team_players').select('player_id').in('team_id', teamIds)
    if (tpErr) return json({ error: `team_players: ${tpErr.message}` }, 500)
    const playerIds = Array.from(new Set((tp ?? []).map((r: any) => r.player_id))) as string[]

    if (playerIds.length === 0) {
      return json({ status: 'no_players_in_month', month: slug })
    }

    // Ask push_targets for eligible subs among that set, gated on club_news.
    const { data: targets, error: targetErr } = await supabase.rpc('push_targets', {
      p_category: 'club_news',
      p_player_ids: playerIds,
      p_include_admins: false,
    })
    if (targetErr) return json({ error: `push_targets: ${targetErr.message}` }, 500)
    const subList = (targets || []) as Array<{ id: string; endpoint: string; p256dh: string; auth: string }>

    if (subList.length === 0) {
      return json({ status: 'no_eligible_subs', month: slug, player_count: playerIds.length })
    }

    const label = monthLabel(slug)
    const payloadStr = JSON.stringify({
      title: `📊 Your ${label} is in`,
      body: 'Apps, goals, MOTM wins, favourite teammate — take a look on your Profile.',
      url: `/profile/monthly/${slug}`,
      tag: `monthly-review-${slug}`,
    })

    const outcomes = await Promise.all(subList.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payloadStr,
        )
        return { id: s.id, ok: true }
      } catch (err: any) {
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          await supabase.from('push_subscriptions').delete().eq('id', s.id)
          return { id: s.id, ok: false, reason: 'stale-cleaned' }
        }
        return { id: s.id, ok: false, reason: err?.message || 'send-failed', statusCode: err?.statusCode ?? null }
      }
    }))

    return json({
      status: 'sent',
      month: slug,
      players_in_month: playerIds.length,
      eligible_subs: subList.length,
      sent: outcomes.filter(o => o.ok).length,
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
