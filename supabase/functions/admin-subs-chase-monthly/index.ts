// Monthly admin push: "N unpaid subs for season · £X outstanding".
//
// Fires on the 1st of every month via pg_cron. Silent when the current
// season has zero unpaid rows — no point buzzing admins with "all paid,
// well done".
//
// Audience: admins only (empty p_player_ids + p_include_admins=true).
// Category: 'money' — admins who mute Money category won't get it,
// which is fine; the persistent card in Club Finances is always there.
//
// Body: { season?: string } (default = current Apr→Mar season)
// Env: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT

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

// April → March. currentSeasonKey(new Date('2026-07-11')) → '2026-27'.
function currentSeasonKey(now: Date = new Date()): string {
  const y = now.getUTCFullYear()
  const startYear = now.getUTCMonth() >= 3 ? y : y - 1
  const endShort = String((startYear + 1) % 100).padStart(2, '0')
  return `${startYear}-${endShort}`
}

Deno.serve(async (req) => {
  try {
    if (!VAPID_PRIVATE) return json({ error: 'VAPID_PRIVATE_KEY not configured' }, 500)

    let body: any = {}
    try { body = await req.json() } catch { /* GET / empty */ }
    const season: string = body.season || currentSeasonKey()

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: subs, error: subErr } = await supabase
      .from('club_subscriptions')
      .select('id, player_id, amount, created_at')
      .eq('season', season)
      .eq('paid', false)
    if (subErr) return json({ error: `subs fetch: ${subErr.message}` }, 500)

    const unpaid = subs ?? []
    if (unpaid.length === 0) {
      return json({ status: 'no_unpaid', season })
    }

    const totalOwed = unpaid.reduce((s, r) => s + Number(r.amount), 0)
    const oldestIso = unpaid
      .map(r => r.created_at)
      .sort()[0]
    const oldestMonth = oldestIso
      ? new Date(oldestIso).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'Europe/London' })
      : ''

    const title = '💷 Subs chase-up'
    const pushBody = `${unpaid.length} unpaid for ${season} · £${totalOwed.toFixed(0)} outstanding${oldestMonth ? ` (oldest since ${oldestMonth})` : ''}`

    // Admins only: empty p_player_ids fails the "any" check, admin flag catches them.
    const { data: targets, error: targetErr } = await supabase.rpc('push_targets', {
      p_category: 'money',
      p_player_ids: [],
      p_include_admins: true,
    })
    if (targetErr) return json({ error: `push_targets failed: ${targetErr.message}` }, 500)
    const subList = (targets || []) as Array<{ id: string; endpoint: string; p256dh: string; auth: string }>

    if (subList.length === 0) {
      return json({ status: 'no_admin_subscriptions', season, unpaid_count: unpaid.length })
    }

    const payloadStr = JSON.stringify({
      title,
      body: pushBody,
      url: '/admin',
      tag: `subs-chase-${season}`,
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
        return {
          id: s.id,
          ok: false,
          reason: err?.message || 'send-failed',
          statusCode: err?.statusCode ?? null,
        }
      }
    }))

    const sentCount = outcomes.filter(o => o.ok).length

    return json({
      status: 'sent',
      season,
      unpaid_count: unpaid.length,
      total_owed: totalOwed,
      oldest_since: oldestIso,
      sent: sentCount,
      total_admin_subs: subList.length,
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
