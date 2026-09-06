// Match report generator.
//
// Scheduled Friday 10:05 UK (mig 091). The timing IS the feature: reports
// have historically been hand-written around midnight on Thursday, before the
// voting window closes at 10:00 Friday, which is why MOTM and DOTD have never
// once appeared in one. Running after the ballot closes means the awards are
// on file and land in the report.
//
// Writes a DRAFT (results.status = 'draft'). Nothing reaches the group until
// an admin reviews it on the Report Review screen and hits Publish. Publishing
// makes it live immediately; the single group push is sent separately by
// dispatch_report_notifications() once the awards are also final (mig 093).
//
// Inputs, in order of authority:
//   1. get_match_hooks(date)  — the ranked, factual account of the night.
//      THE ONLY permitted source of pitch events.
//   2. weekly_context         — football + news for the week. FRAMING ONLY.
//   3. last 3 published rows  — few-shot for voice, structure and length.
//
// The predictions.rows table is built HERE in code from matches.predicted_order
// and the standings hooks, not by the model. The model writes only the prose
// note about how the balancer did. One less thing that can be invented.
//
// Body: { match_date?: 'YYYY-MM-DD', force?: boolean, skip_push?: boolean,
//         dry_run?: boolean }
//
// dry_run generates as normal and returns the finished JSON in the response
// WITHOUT touching results and without pushing anyone. Use it to check the
// output against a past night before it is ever allowed to write.
// Env:  ANTHROPIC_API_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT

// deno-lint-ignore-file no-explicit-any
/* eslint-disable @typescript-eslint/no-explicit-any -- Deno edge fn: Supabase
   client rows and Anthropic response blocks are untyped JSON at this boundary. */

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const ANTHROPIC_MODEL = 'claude-opus-5'

const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY')
  || 'BDO5g6HQhO0s3BAEXc86kqaHy3fPl6Mtd3uo3jF7p7W1UWcVpOVkPf6KGlEHnorJecl-Ao821QJDvzph8r0NuXo'
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') || ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:pabarham@gmail.com'

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
}

// ── section shape ─────────────────────────────────────────────────────────
// Mirrors the existing results columns exactly (see CLAUDE.md "Match reports
// — always use the structured JSON shape"). player/label are nullable rather
// than optional so the schema stays strict-friendly; nulls are stripped
// before the row is written.
const SECTION_ITEM = {
  type: 'object',
  properties: {
    player: { type: ['string', 'null'], description: 'Full name, exactly as it appears in the hooks. Null for a collective item.' },
    label: { type: ['string', 'null'], description: 'Short bold heading, optionally with one leading emoji. Null if the player name is heading enough.' },
    note: { type: 'string', description: '1-3 sentences.' },
  },
  required: ['player', 'label', 'note'],
  additionalProperties: false,
}

const REPORT_SCHEMA = {
  type: 'object',
  properties: {
    summary: {
      type: 'string',
      description: 'Tweet-length lede paragraph — the headline narrative of the night, 2-4 sentences.',
    },
    predictions_note: {
      type: 'string',
      description: 'One or two lines on how the balancer\'s predicted finishing order compared to the actual one. The table itself is added separately — do not restate it row by row.',
    },
    key_highlights: {
      type: 'array', items: SECTION_ITEM, minItems: 3, maxItems: 10,
      description: 'Standout players and team-by-team commentary. Do NOT re-package the MOTM/DOTD winners here — the ballot renders separately.',
    },
    banter: {
      type: 'array', items: SECTION_ITEM, minItems: 2, maxItems: 6,
      description: 'Funny moments, side-stories, in-jokes.',
    },
    app_watch: {
      type: 'array', items: SECTION_ITEM, minItems: 1, maxItems: 6,
      description: 'Fines, admin reminders, app and feature updates.',
    },
    conclusion: {
      type: 'string',
      description: '2-4 short lines separated by \\n — the closing punch.',
    },
    closer: {
      type: ['string', 'null'],
      description: 'One-line sign-off. Null if the conclusion already lands.',
    },
  },
  required: ['summary', 'predictions_note', 'key_highlights', 'banter', 'app_watch', 'conclusion', 'closer'],
  additionalProperties: false,
}

const SYSTEM_PROMPT = `You write the weekly match report for Wanstead Fellas, a Thursday-night football group in east London. Grown men, long-standing group, sharp but affectionate banter. You are writing for the players themselves — they were all there.

## The one rule that cannot be broken

You may invent FRAMING freely. Reach for whatever the week's news gives you — a Keegan-esque collapse, a Little Britain bit, a Peter Drury cadence, a transfer-window gag, whatever lands. Framing is yours.

You must NEVER assert a pitch EVENT that did not arrive in the MATCH HOOKS. Every factual claim about what happened on the pitch must trace back to a specific hook.

Concretely, you may not:
- name a scorer, assist, save, tackle or miss that is not in the hooks
- attribute a goal to a player the hooks credit to someone else
- invent a scoreline, a comeback, a red card, an injury or an argument
- invent who played, who kept goal, or who was on which team
- invent a quote, a chant or a conversation
- infer a "moment" from statistics (a 6-1 in the hooks does not license "they capitulated after the third")

If a section has thin material, write less. A short honest report is correct; a padded invented one is a failure. If the hooks give you no banter at all, draw the banter section from the FRAMING sources instead and make it obviously about the wider world, not about our pitch.

Names must be spelled exactly as the hooks spell them.

## Voice

Match the EXAMPLE REPORTS. They are the house style and the length target: direct, dry, present-tense punch, no hype, no purple prose, no motivational filler. Occasional profanity is in-register when quoting. Emoji only as a leading glyph on a label, never mid-sentence.

Do not congratulate the group. Do not summarise what the app does. Do not repeat the MOTM/DOTD winners as highlights — they render separately from the ballot, and doubling up reads as self-congratulatory. You may reference the award result once, in passing, in the summary or conclusion.`

interface Hook { family: string; priority: number; headline: string; facts: any }

/** The Thursday on or before `d`. Run on Friday, that's last night's match. */
function lastThursday(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  // Day-of-week 4 = Thursday. Walk back to it (0 days if today is Thursday).
  const back = (t.getUTCDay() - 4 + 7) % 7
  t.setUTCDate(t.getUTCDate() - back)
  return t.toISOString().slice(0, 10)
}

function weekStartOf(iso: string): string {
  const t = new Date(`${iso}T00:00:00Z`)
  const dow = (t.getUTCDay() + 6) % 7
  t.setUTCDate(t.getUTCDate() - dow)
  return t.toISOString().slice(0, 10)
}

/**
 * Build the predicted-vs-actual table in code.
 *
 * actual comes from the standings hooks (position + team), predicted from
 * matches.predicted_order written at announcement time. If predicted_order is
 * missing — a match announced before that write shipped — we return the actual
 * order with predicted left null, and tell the model to say the model got a bye.
 */
function buildPredictionRows(hooks: Hook[], predictedOrder: any): {
  rows: Array<{ position: number; predicted: string | null; actual: string }>
  hasPrediction: boolean
} {
  const actual = hooks
    .filter(h => h.family === 'standings' && h.facts?.position && h.facts?.team)
    .map(h => ({ position: Number(h.facts.position), team: String(h.facts.team) }))
    .sort((a, b) => a.position - b.position)

  const predictedByPos = new Map<number, string>()
  if (Array.isArray(predictedOrder)) {
    for (const p of predictedOrder) {
      const pos = Number(p?.position)
      const name = p?.team_name
      if (pos && typeof name === 'string') predictedByPos.set(pos, name)
    }
  }

  return {
    rows: actual.map(a => ({
      position: a.position,
      predicted: predictedByPos.get(a.position) ?? null,
      actual: a.team,
    })),
    hasPrediction: predictedByPos.size > 0 && actual.length > 0,
  }
}

function stripNulls(items: any[]): any[] {
  return items.map(it => {
    const out: any = { note: it.note }
    if (it.player) out.player = it.player
    if (it.label) out.label = it.label
    return out
  })
}

Deno.serve(async (req) => {
  try {
    let body: any = {}
    try { body = await req.json() } catch { /* cron sends {} */ }

    const matchDate: string = body.match_date || lastThursday(new Date())
    if (!/^\d{4}-\d{2}-\d{2}$/.test(matchDate)) {
      return json({ error: 'match_date must be YYYY-MM-DD' }, 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ── the match ─────────────────────────────────────────────────────────
    const { data: match, error: mErr } = await supabase
      .from('matches')
      .select('id, match_date, format, predicted_order')
      .eq('match_date', matchDate)
      .maybeSingle()
    if (mErr) return json({ error: `matches: ${mErr.message}` }, 500)
    if (!match) return json({ status: 'no_match', match_date: matchDate })

    // ── guard: voting must be closed ──────────────────────────────────────
    // The entire point of the 10:05 slot. Belt-and-braces against a cron that
    // drifts (BST/GMT) or a manual invocation that fires early — without this
    // we would regenerate the historical bug of a report with no awards in it.
    const { data: vw } = await supabase
      .from('voting_windows')
      .select('closes_at, results_published')
      .eq('match_id', match.id)
      .maybeSingle()
    if (vw?.closes_at && new Date(vw.closes_at) > new Date() && !body.force) {
      return json({
        status: 'voting_still_open',
        match_date: matchDate,
        closes_at: vw.closes_at,
        note: 'refusing to write a report before the ballot closes — pass force:true to override',
      })
    }

    // ── guard: don't clobber ──────────────────────────────────────────────
    const { data: existing } = await supabase
      .from('results')
      .select('id, status, summary, scorers')
      .eq('match_id', match.id)
      .maybeSingle()
    // A dry run writes nothing, so the anti-clobber guards don't apply to it —
    // and skipping them is the point: the whole use of dry_run is pointing it
    // at a past night that already HAS a published report, to compare.
    const dryRun = body.dry_run === true
    if (!dryRun && existing?.status === 'published' && existing?.summary && !body.force) {
      return json({
        status: 'already_published',
        match_date: matchDate,
        note: 'a published report already exists — pass force:true to overwrite',
      })
    }
    if (!dryRun && existing?.status === 'draft' && existing?.summary && !body.force) {
      return json({
        status: 'draft_exists',
        match_date: matchDate,
        note: 'an unreviewed draft already exists — pass force:true to regenerate',
      })
    }

    // ── inputs ────────────────────────────────────────────────────────────
    const { data: hookRows, error: hErr } = await supabase
      .rpc('get_match_hooks', { p_match_date: matchDate })
    if (hErr) return json({ error: `get_match_hooks: ${hErr.message}` }, 500)
    const hooks = (hookRows ?? []) as Hook[]
    if (hooks.length === 0) {
      return json({ status: 'no_hooks', match_date: matchDate, note: 'nothing to write about' })
    }

    const { data: ctx } = await supabase
      .from('weekly_context')
      .select('items')
      .eq('week_start', weekStartOf(matchDate))
      .maybeSingle()
    const contextItems = (ctx?.items as any[]) ?? []

    // Few-shot: the last 3 PUBLISHED reports, most recent first. Voice and
    // length come from here rather than from instructions. Strictly BEFORE the
    // target date, so a dry run of a past night never sees its own report.
    const { data: recentMatches } = await supabase
      .from('matches')
      .select('id, match_date')
      .lt('match_date', matchDate)
      .order('match_date', { ascending: false })
      .limit(6)
    const recentIds = (recentMatches ?? []).map((m: any) => m.id)
    const { data: examplesRaw } = recentIds.length
      ? await supabase
        .from('results')
        .select('match_id, summary, predictions, key_highlights, banter, app_watch, conclusion, closer')
        .in('match_id', recentIds)
        .eq('status', 'published')
        .not('summary', 'is', null)
      : { data: [] as any[] }
    const orderIdx = new Map(recentIds.map((id: string, i: number) => [id, i]))
    const examples = (examplesRaw ?? [])
      .sort((a: any, b: any) => (orderIdx.get(a.match_id) ?? 99) - (orderIdx.get(b.match_id) ?? 99))
      .slice(0, 3)
      .map(({ match_id: _drop, ...rest }: any) => rest)

    const { rows: predictionRows, hasPrediction } = buildPredictionRows(hooks, match.predicted_order)

    // Credential check sits here rather than at the top of the handler: the
    // cheap guards above (no match, voting open, already published) are the
    // ones that fire in normal operation, and seeing them in the response is
    // far more useful than a blanket config error masking them.
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY not configured' }, 500)

    // ── prompt ────────────────────────────────────────────────────────────
    const userPrompt = `# MATCH HOOKS — ${matchDate} (${match.format ?? 'format unrecorded'})

These are the ONLY permitted source of pitch events. Ranked by priority.

${JSON.stringify(hooks, null, 2)}

# PREDICTED vs ACTUAL

${hasPrediction
  ? `The balancer predicted this finishing order before kick-off; here is how it landed. The table renders separately — write only \`predictions_note\`, one or two lines on how the algorithm did.\n\n${JSON.stringify(predictionRows, null, 2)}`
  : `No pre-match prediction was recorded for this match${predictionRows.length ? ', so the balancer gets a bye this week' : ' and there is no round-robin table to grade'}. Say so briefly and matter-of-factly in \`predictions_note\`. Do not invent a prediction.`}

# FRAMING SOURCES — the week in the wider world

FRAMING ONLY. You may borrow a lens, a comparison or a joke from any of this.
You may NOT use it to assert anything about our pitch.

${contextItems.length ? JSON.stringify(contextItems, null, 2) : '(none available this week — write without it)'}

# EXAMPLE REPORTS — house voice and length, most recent first

${examples.length ? JSON.stringify(examples, null, 2) : '(none available)'}

# TASK

Write this week's report as a single structured object. Every pitch fact traces to a hook above.`

    // ── generate ──────────────────────────────────────────────────────────
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 8000,
        system: SYSTEM_PROMPT,
        thinking: { type: 'adaptive' },
        output_config: {
          effort: 'high',
          format: { type: 'json_schema', schema: REPORT_SCHEMA },
        },
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    if (!res.ok) {
      const detail = await res.text()
      console.error('anthropic error', res.status, detail)
      return json({ error: `anthropic ${res.status}`, detail: detail.slice(0, 800) }, 502)
    }

    const completion = await res.json()
    if (completion.stop_reason === 'refusal') {
      return json({ error: 'model declined the request', stop_details: completion.stop_details }, 502)
    }

    const text = (completion.content ?? [])
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('')
    let report: any
    try {
      report = JSON.parse(text)
    } catch {
      console.error('unparseable model output', text.slice(0, 1000))
      return json({ error: 'model output was not valid JSON against the schema' }, 502)
    }

    // ── dry run: hand it back, write nothing ────────────────────────────────
    if (dryRun) {
      return json({
        status: 'dry_run',
        match_date: matchDate,
        match_id: match.id,
        hooks_used: hooks.length,
        context_items: contextItems.length,
        examples_used: examples.length,
        usage: completion.usage ?? null,
        // Exactly the shape that WOULD have been written to results, so it can
        // be diffed against the real row for the same night.
        would_write: {
          summary: report.summary,
          predictions: { note: report.predictions_note, rows: predictionRows },
          key_highlights: stripNulls(report.key_highlights ?? []),
          banter: stripNulls(report.banter ?? []),
          app_watch: stripNulls(report.app_watch ?? []),
          conclusion: report.conclusion,
          closer: report.closer ?? null,
        },
      })
    }

    // ── write the draft ───────────────────────────────────────────────────
    // scorers is auto-generated by AdminMatchEntry from the goals table and is
    // never model-written — carry the existing value through untouched.
    // report_text stays NULL: it is the legacy free-prose field and would
    // double-render alongside the structured sections.
    const payload = {
      match_id: match.id,
      status: 'draft',
      summary: report.summary,
      predictions: { note: report.predictions_note, rows: predictionRows },
      key_highlights: stripNulls(report.key_highlights ?? []),
      banter: stripNulls(report.banter ?? []),
      app_watch: stripNulls(report.app_watch ?? []),
      conclusion: report.conclusion,
      closer: report.closer ?? null,
      report_text: null,
      scorers: existing?.scorers ?? null,
    }

    const { error: wErr } = existing?.id
      ? await supabase.from('results').update(payload).eq('id', existing.id)
      : await supabase.from('results').insert(payload)
    if (wErr) return json({ error: `couldn't write results: ${wErr.message}` }, 500)

    // ── nudge the admin, nobody else ──────────────────────────────────────
    let push: any = { status: 'skipped' }
    if (!body.skip_push && VAPID_PRIVATE) {
      push = await notifyAdmins(supabase, matchDate)
    }

    return json({
      status: 'draft_written',
      match_date: matchDate,
      match_id: match.id,
      hooks_used: hooks.length,
      context_items: contextItems.length,
      examples_used: examples.length,
      prediction_rows: predictionRows.length,
      usage: completion.usage ?? null,
      push,
    })
  } catch (err) {
    console.error('generate-match-report failed:', err)
    return json({ error: String(err) }, 500)
  }
})

/**
 * Admin-only push. Deliberately NOT the group: the draft is unreviewed, and
 * the group push is fired by the publish flip in mig 090.
 *
 * Category is null (always-on) — this is an operational nudge to the one
 * person who has to act on it, not a broadcast anyone should be able to mute.
 */
async function notifyAdmins(supabase: any, matchDate: string) {
  const { data: admins } = await supabase
    .from('profiles').select('id').eq('is_admin', true)
  const adminIds = (admins ?? []).map((a: any) => a.id)
  if (adminIds.length === 0) return { status: 'no_admins' }

  const { data: targets, error } = await supabase.rpc('push_targets', {
    p_category: null,
    p_player_ids: adminIds,
    p_include_admins: false,
  })
  if (error) return { status: 'push_targets_failed', error: error.message }

  const subs = (targets ?? []) as Array<{ id: string; endpoint: string; p256dh: string; auth: string }>
  if (subs.length === 0) return { status: 'no_eligible_subs' }

  const payloadStr = JSON.stringify({
    title: '📝 Match report draft ready',
    body: `${matchDate} is written and waiting for review. Nothing has gone out to the group yet.`,
    url: '/admin/report-review',
    tag: `report-draft-${matchDate}`,
  })

  const outcomes = await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payloadStr,
      )
      return { ok: true }
    } catch (err: any) {
      if (err?.statusCode === 410 || err?.statusCode === 404) {
        await supabase.from('push_subscriptions').delete().eq('id', s.id)
        return { ok: false, reason: 'stale-cleaned' }
      }
      return { ok: false, reason: err?.message ?? 'send-failed' }
    }
  }))

  return { status: 'sent', eligible: subs.length, sent: outcomes.filter(o => o.ok).length }
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
