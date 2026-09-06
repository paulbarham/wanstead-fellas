// Weekly context cache — the "what was going on in the world this week" feed
// that the match report generator uses for FRAMING.
//
// Scheduled Friday 09:00 UTC (mig 091), ahead of generate-match-report so the
// cache is warm when the generator reads it.
//
// Two sources, deliberately different in kind:
//
//   1. Football results — football-data.org v4, the same structured feed the
//      Match-of-the-Week fetcher already uses (FOOTBALL_DATA_API_KEY). Free
//      tier covers PL and ELC. These are FACTS: scorelines we can safely put
//      in a report because they came from a results API, not from a model.
//
//   2. Colour — 2-3 notable non-football items from the past week, gathered
//      with Claude's server-side web_search tool. These are FRAMING ONLY.
//
// The distinction matters downstream. generate-match-report is allowed to
// reach for any of this as a lens but is forbidden from asserting anything
// about OUR pitch that did not arrive as a hook.
//
// Body: { week_start?: 'YYYY-MM-DD', force?: boolean }
// Env:  FOOTBALL_DATA_API_KEY, ANTHROPIC_API_KEY

// deno-lint-ignore-file no-explicit-any
/* eslint-disable @typescript-eslint/no-explicit-any -- Deno edge fn: Supabase
   client rows and Anthropic response blocks are untyped JSON at this boundary. */

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const ANTHROPIC_MODEL = 'claude-opus-5'
const COMPETITIONS = ['PL', 'ELC']

// How many football scorelines survive into the cache. The first run returned
// 54 — a full week of PL + ELC — which is a wall of numbers the report can't
// use and pure prompt bloat. The value of this feed is the COLOUR items; the
// scorelines are there so the report can nod at the weekend, not recite it.
// Ranked by "would anyone mention this in a pub" (see headlineScore) and
// trimmed to the top few.
const MAX_FOOTBALL_RESULTS = 6

interface ContextItem {
  kind: 'football_result' | 'football_story' | 'news'
  headline: string
  detail?: string
  source: string
}

/** Monday of the ISO week containing `d`. Running Friday, that's this week. */
function weekStartOf(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dow = (t.getUTCDay() + 6) % 7 // Mon=0 … Sun=6
  t.setUTCDate(t.getUTCDate() - dow)
  return t.toISOString().slice(0, 10)
}

function daysBefore(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

/**
 * How newsworthy is a scoreline, roughly? Big margins and high-scoring games
 * are what get talked about; a 1-0 between two mid-table sides is not. Top
 * flight outranks the Championship on a tie. Crude on purpose — this only has
 * to pick a decent six out of fifty, not be right about football.
 */
function headlineScore(hs: number, as: number, comp: string): number {
  const margin = Math.abs(hs - as)
  const goals = hs + as
  let score = margin * 2 + goals
  if (margin >= 4) score += 6              // a hiding
  if (goals >= 6) score += 4               // a thriller
  if (hs === as && goals >= 4) score += 3  // a high-scoring draw
  if (comp === 'PL') score += 3            // top flight gets the benefit
  return score
}

/**
 * Finished PL/ELC matches in the window, trimmed to the MAX_FOOTBALL_RESULTS
 * most talked-about. Scorelines only — no narrative.
 * A failure on one competition doesn't sink the others.
 */
async function fetchFootballResults(from: string, to: string): Promise<ContextItem[]> {
  const key = Deno.env.get('FOOTBALL_DATA_API_KEY')
  if (!key) {
    console.warn('FOOTBALL_DATA_API_KEY not set — skipping football results')
    return []
  }

  const scored: Array<{ item: ContextItem; score: number }> = []
  for (const comp of COMPETITIONS) {
    try {
      const url = `https://api.football-data.org/v4/competitions/${comp}/matches`
        + `?dateFrom=${from}&dateTo=${to}`
      const res = await fetch(url, { headers: { 'X-Auth-Token': key } })
      if (!res.ok) {
        console.warn(`football-data ${comp} returned ${res.status}`)
        continue
      }
      const body = await res.json()
      for (const m of (body.matches ?? [])) {
        if (m.status !== 'FINISHED') continue
        const home = m.homeTeam?.shortName || m.homeTeam?.name
        const away = m.awayTeam?.shortName || m.awayTeam?.name
        const hs = m.score?.fullTime?.home
        const as = m.score?.fullTime?.away
        if (!home || !away || hs == null || as == null) continue
        scored.push({
          item: {
            kind: 'football_result',
            headline: `${home} ${hs}-${as} ${away}`,
            detail: `${comp}, ${String(m.utcDate).slice(0, 10)}`,
            source: 'football-data.org',
          },
          score: headlineScore(Number(hs), Number(as), comp),
        })
      }
    } catch (err) {
      console.warn(`football-data ${comp} failed:`, err)
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_FOOTBALL_RESULTS)
    .map(s => s.item)
}

/**
 * Pull the JSON array out of a model response that may have wrapped it in
 * prose or a fenced block. Tolerant on purpose — this feed is decorative and
 * a parse failure must not take the report down with it.
 */
function extractJsonArray(text: string): any[] {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidates = [fenced?.[1], text].filter(Boolean) as string[]
  for (const c of candidates) {
    const start = c.indexOf('[')
    const end = c.lastIndexOf(']')
    if (start === -1 || end <= start) continue
    try {
      const parsed = JSON.parse(c.slice(start, end + 1))
      if (Array.isArray(parsed)) return parsed
    } catch { /* try the next candidate */ }
  }
  return []
}

/**
 * Colour for the week: a couple of football talking points plus 2-3 notable
 * non-football items, via Claude's server-side web_search. Returns [] on any
 * failure — the caller carries on with the football results alone.
 */
async function fetchColour(from: string, to: string): Promise<ContextItem[]> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) {
    console.warn('ANTHROPIC_API_KEY not set — skipping colour items')
    return []
  }

  const prompt = `Search the web for what happened between ${from} and ${to}.

Return a JSON array of 5-7 objects, nothing else. Each object:
  { "kind": "football_story" | "news", "headline": "...", "detail": "...", "source": "..." }

Include:
  - 2-4 "football_story" items: the week's big English football talking points
    (results everyone was arguing about, managerial news, refereeing rows,
    transfer stories). Not just scorelines.
  - 2-3 "news" items: notable NON-football stories from the same week. UK
    weighted. General news, culture, TV, weather, whatever people were
    actually talking about. Avoid anything grim — this feeds a Sunday-league
    football banter report, so no tragedies, disasters or crime.

"headline" is one line. "detail" is one or two sentences of context.
"source" is the publication or site name.`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 4000,
        output_config: { effort: 'low' },
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 6 }],
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!res.ok) {
      console.warn(`anthropic web_search returned ${res.status}: ${await res.text()}`)
      return []
    }

    const body = await res.json()
    if (body.stop_reason === 'refusal') {
      console.warn('anthropic declined the colour request:', body.stop_details)
      return []
    }

    const text = (body.content ?? [])
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('\n')

    return extractJsonArray(text)
      .filter((it: any) => it && typeof it.headline === 'string')
      .map((it: any): ContextItem => ({
        kind: it.kind === 'football_story' ? 'football_story' : 'news',
        headline: String(it.headline).slice(0, 300),
        detail: it.detail ? String(it.detail).slice(0, 600) : undefined,
        source: it.source ? String(it.source).slice(0, 120) : 'web',
      }))
      .slice(0, 8)
  } catch (err) {
    console.warn('colour fetch failed:', err)
    return []
  }
}

Deno.serve(async (req) => {
  try {
    let body: any = {}
    try { body = await req.json() } catch { /* cron sends {} or nothing */ }

    const weekStart: string = body.week_start || weekStartOf(new Date())
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      return json({ error: 'week_start must be YYYY-MM-DD' }, 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Idempotent by default: re-running on the same day is a no-op unless
    // forced. Keeps a retrying cron from burning search calls.
    if (!body.force) {
      const { data: existing } = await supabase
        .from('weekly_context')
        .select('week_start, fetched_at, items')
        .eq('week_start', weekStart)
        .maybeSingle()
      const fetchedToday = existing?.fetched_at
        && String(existing.fetched_at).slice(0, 10) === new Date().toISOString().slice(0, 10)
      if (fetchedToday) {
        return json({
          week_start: weekStart,
          skipped: 'already fetched today — pass force:true to refresh',
          item_count: (existing.items as any[])?.length ?? 0,
        })
      }
    }

    // Look back 8 days so a Friday run covers the whole week including the
    // weekend just gone.
    const to = new Date().toISOString().slice(0, 10)
    const from = daysBefore(to, 8)

    const [football, colour] = await Promise.all([
      fetchFootballResults(from, to),
      fetchColour(from, to),
    ])
    const items = [...football, ...colour]

    const { error } = await supabase
      .from('weekly_context')
      .upsert(
        { week_start: weekStart, items, fetched_at: new Date().toISOString() },
        { onConflict: 'week_start' },
      )
    if (error) return json({ error: `couldn't write weekly_context: ${error.message}` }, 500)

    return json({
      week_start: weekStart,
      window: { from, to },
      item_count: items.length,
      football_results: football.length,
      colour_items: colour.length,
    })
  } catch (err) {
    console.error('weekly-context failed:', err)
    return json({ error: String(err) }, 500)
  }
})

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
