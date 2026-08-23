// Fans out a "what's new" push to every push_subscription.
//
// Invoked by dispatch_pending_feature_announcements() (pg_cron every 15
// min) when a feature_announcements row's scheduled_for has passed and
// sent_at is still null. The cron function claims the row (sets sent_at)
// BEFORE calling this fn, so at-most-once delivery is guaranteed. We
// fill in sent_count + total_subs on success for admin diagnostics.
//
// Body: { announcement_id: uuid }
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

Deno.serve(async (req) => {
  try {
    if (!VAPID_PRIVATE) {
      return json({ error: 'VAPID_PRIVATE_KEY not configured' }, 500)
    }
    let body: any = {}
    try { body = await req.json() } catch { /* GET / empty */ }
    const announcementId = body.announcement_id
    if (!announcementId) return json({ error: 'announcement_id required' }, 400)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Look up the announcement
    const { data: row, error: rowErr } = await supabase
      .from('feature_announcements')
      .select('id, title, body, url')
      .eq('id', announcementId)
      .maybeSingle()
    if (rowErr || !row) {
      return json({ error: 'announcement not found', details: rowErr?.message ?? null }, 404)
    }

    const payloadStr = JSON.stringify({
      title: row.title,
      body: row.body,
      url: row.url || '/',
      tag: `feature-${row.id}`,
    })

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
    const subList = (subs || []) as Array<{ id: string; endpoint: string; p256dh: string; auth: string }>

    const outcomes = await Promise.all(subList.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payloadStr,
        )
        return { id: s.id, ok: true }
      } catch (err: any) {
        // 410 Gone / 404 → reap stale sub, same as the vote-notifications fn.
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

    // Record delivery stats on the announcement — admin uses sent_count vs
    // total_subs to spot misfires.
    await supabase
      .from('feature_announcements')
      .update({ sent_count: sentCount, total_subs: subList.length })
      .eq('id', row.id)

    return json({
      announcement_id: row.id,
      sent: sentCount,
      total: subList.length,
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
