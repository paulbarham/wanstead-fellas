// Fans out MoW push notifications. Two topics:
//   * 'mow_published' — new week's MoW fixture just went live. Broadcast to
//     every active push_subscription. Copy: "🎯 This week's MoW: Home v Away
//     · kicks off <time>. Get your pick in."
//   * 'mow_result'    — pool fixture score just landed → predictions
//     settled. Broadcast to every active push_subscription. Copy:
//     "🎯 Result in: Home <score> Away · Check your points."
//
// Broadcast (not per-player) keeps the fan-out cheap and the copy simple.
// Users open the app to see their individual points. Same pattern used by
// send-vote-notifications for the 'results' topic.
//
// Payload from the trigger: { mow_fixture_id: uuid, topic: text }

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

const CLUB_NAMES: Record<string, string> = {
  arsenal: 'Arsenal', aston_villa: 'Aston Villa', bournemouth: 'Bournemouth',
  brentford: 'Brentford', brighton: 'Brighton', burnley: 'Burnley',
  chelsea: 'Chelsea', crystal_palace: 'Crystal Palace', everton: 'Everton',
  fulham: 'Fulham', leeds: 'Leeds', liverpool: 'Liverpool',
  man_city: 'Man City', man_utd: 'Man Utd', newcastle: 'Newcastle',
  nottingham_forest: 'Nott. Forest', sunderland: 'Sunderland',
  tottenham: 'Tottenham', west_ham: 'West Ham', wolves: 'Wolves',
  coventry: 'Coventry', hull: 'Hull', ipswich: 'Ipswich',
  birmingham: 'Birmingham', blackburn: 'Blackburn', bristol_city: 'Bristol City',
  charlton: 'Charlton', derby: 'Derby', middlesbrough: 'Middlesbrough',
  millwall: 'Millwall', norwich: 'Norwich', oxford: 'Oxford',
  portsmouth: 'Portsmouth', preston: 'Preston', qpr: 'QPR',
  sheff_united: 'Sheff Utd', sheff_wed: 'Sheff Wed', southampton: 'Southampton',
  stoke: 'Stoke', swansea: 'Swansea', watford: 'Watford',
  wba: 'West Brom', wrexham: 'Wrexham', bolton: 'Bolton',
  lincoln: 'Lincoln', cardiff: 'Cardiff', leicester: 'Leicester',
}
const clubName = (slug: string) => CLUB_NAMES[slug] ?? slug.replace(/_/g, ' ')

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  try {
    if (!VAPID_PRIVATE) return json({ error: 'VAPID_PRIVATE_KEY not configured' }, 500)

    let body: any = {}
    try { body = await req.json() } catch { /* empty body */ }
    const mowFixtureId = body.mow_fixture_id
    const topic = body.topic
    if (!mowFixtureId || !topic) return json({ error: 'mow_fixture_id and topic required' }, 400)
    if (topic !== 'mow_published' && topic !== 'mow_result') {
      return json({ error: 'topic must be mow_published or mow_result' }, 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: mow } = await supabase
      .from('mow_fixtures')
      .select('id, week_start, mow_pool_fixtures!inner(competition, home_club, away_club, kickoff_at, home_score, away_score)')
      .eq('id', mowFixtureId)
      .maybeSingle()
    if (!mow) return json({ error: 'mow_fixture not found' }, 404)
    const rel = (mow as any).mow_pool_fixtures
    const fx = Array.isArray(rel) ? rel[0] : rel
    if (!fx) return json({ error: 'pool_fixture join failed' }, 500)

    const homeName = clubName(fx.home_club)
    const awayName = clubName(fx.away_club)
    const kickoff = new Date(fx.kickoff_at)
    const koLabel = kickoff.toLocaleString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/London',
    })

    let title: string
    let bodyText: string
    if (topic === 'mow_published') {
      title = '🎯 Match of the Week'
      bodyText = `${homeName} v ${awayName} · kicks off ${koLabel}. Get your pick in.`
    } else {
      if (fx.home_score == null || fx.away_score == null) {
        return json({ error: 'no result on pool fixture yet' }, 400)
      }
      title = '🎯 MoW Result'
      bodyText = `${homeName} ${fx.home_score}-${fx.away_score} ${awayName}. Check your points.`
    }

    // Club-wide, but gated on the 'games' preference (mig 081). MoW is the
    // most opt-out-able push we send — plenty of fellas play football without
    // caring about a Premier League score predictor.
    const { data: targets, error: targetErr } = await supabase.rpc('push_targets', {
      p_category: 'games',
      p_player_ids: null,
      p_include_admins: true,
    })
    if (targetErr) return json({ error: `push_targets failed: ${targetErr.message}` }, 500)
    const subList = (targets || []) as Array<{ id: string; endpoint: string; p256dh: string; auth: string }>
    if (subList.length === 0) return json({ sent: 0, total: 0 })

    const payload = JSON.stringify({
      title, body: bodyText,
      // Deep-link to the MoW sub-tab. CupPage reads ?game= on mount and
      // lands on the right game, so tapping the push doesn't dump the
      // user into the World Cup archive.
      url: '/cup?game=mow',
      tag: `mow-${mowFixtureId}-${topic}`,
    })

    let sent = 0
    const errors: unknown[] = []
    for (const s of subList) {
      try {
        await webpush.sendNotification({
          endpoint: s.endpoint,
          keys: { p256dh: s.p256dh, auth: s.auth },
        }, payload)
        sent++
      } catch (e: any) {
        errors.push({ id: s.id, error: e?.message ?? String(e), status: e?.statusCode })
        // 404 / 410 = subscription is dead — delete it to keep the table lean
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', s.id)
        }
      }
    }

    return json({ topic, sent, total: subList.length, errors: errors.slice(0, 5) })
  } catch (e: any) {
    return json({ error: `unhandled: ${e?.message ?? String(e)}` }, 500)
  }
})
