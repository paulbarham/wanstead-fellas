#!/usr/bin/env node
// Autonomous WC26 result + red-card audit. Fires 3x/day from GitHub
// Actions. Verifies every recently-played cup match against live web
// sources, applies high-confidence deltas directly to the DB, and posts
// anything ambiguous to a GitHub issue for the admin to review.
//
// Uses Anthropic's web_search server-side tool so all the reasoning +
// source-cross-checking happens inside a single Claude call — no
// separate scraping infrastructure.
//
// Runs safely if the tournament is over (returns 0 findings, exits
// cleanly). Runs safely if secrets are missing (logs a clear error
// and exits non-zero).
//
// Environment:
//   ANTHROPIC_API_KEY           — Claude API key
//   SUPABASE_SERVICE_ROLE_KEY   — service role key for DB writes
//   SUPABASE_URL                — https://<ref>.supabase.co
//   GITHUB_REPOSITORY           — auto-provided by GH Actions (owner/repo)
//   GITHUB_TOKEN                — auto-provided by GH Actions
//
// Local test:  node scripts/cup-audit.mjs --dry-run

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { execSync } from 'node:child_process'

const DRY_RUN = process.argv.includes('--dry-run')
const WC_FINAL_ISO = '2026-07-19'
const LOOKBACK_HOURS = 72

// ── Guards ──────────────────────────────────────────────────────────────

const missing = ['ANTHROPIC_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL']
  .filter(k => !process.env[k])
if (missing.length) {
  console.error(`❌ Missing required env vars: ${missing.join(', ')}`)
  process.exit(1)
}

const today = new Date()
if (today > new Date(`${WC_FINAL_ISO}T23:59:59Z`)) {
  console.log(`✅ WC26 concluded ${WC_FINAL_ISO} — audit no-ops.`)
  process.exit(0)
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── 1. Pull matches to audit ────────────────────────────────────────────

const cutoff = new Date(Date.now() - LOOKBACK_HOURS * 3600 * 1000).toISOString()

const { data: matches, error: matchErr } = await supabase
  .from('cup_matches')
  .select('id, stage, team1, team2, kickoff, score1, score2, actual_outcome, is_knockout, reds1, reds2, outcome_locked_by_admin')
  .not('score1', 'is', null)
  .not('score2', 'is', null)
  .gte('kickoff', cutoff)
  .order('kickoff', { ascending: true })

if (matchErr) {
  console.error(`❌ DB query failed: ${matchErr.message}`)
  process.exit(1)
}

if (!matches || matches.length === 0) {
  console.log(`✅ No matches played in the last ${LOOKBACK_HOURS}h — audit no-ops.`)
  process.exit(0)
}

console.log(`🔍 Auditing ${matches.length} match(es) played since ${cutoff}`)

// ── 2. Ask Claude to verify each match ──────────────────────────────────

const auditPrompt = `You are auditing recently-played World Cup 2026 matches against live web sources.

For each match below, use web_search to find at least TWO independent reputable sources (ESPN, BBC, FIFA, Al Jazeera, Fox Sports, Sky Sports, Guardian, Sofascore) and verify:
  1. Final score (score1 vs score2 as stored — team1 first, team2 second)
  2. How it was decided: '90' (normal time), 'et' (extra time), 'pens' (penalties). Only for knockout matches.
  3. Red cards for each side (reds1 = team1 count, reds2 = team2 count)

Match data to audit:
${JSON.stringify(matches, null, 2)}

The DB uses these actual_outcome values for knockouts:
  team1_90 · team1_et · team1_pen · team2_90 · team2_et · team2_pen
For group games: team1 · team2 · draw

Return a strict JSON object with this shape (no markdown, no prose outside the JSON):
{
  "findings": [
    {
      "id": "<match uuid>",
      "fixture": "<team1> vs <team2>",
      "confidence": "high" | "low",
      "changes": {
        "score1"?: <number>,
        "score2"?: <number>,
        "actual_outcome"?: "<value>",
        "reds1"?: <number>,
        "reds2"?: <number>
      },
      "sources": ["<url>", "<url>"],
      "note": "<one-sentence explanation of what the source shows and why this is high or low confidence>"
    }
  ],
  "confirmed_correct": ["<match uuid>", ...]
}

Rules:
- Only include a match in "findings" if the sources say something DIFFERENT from the DB values shown. Otherwise put its id in confirmed_correct.
- confidence: "high" ONLY if two or more reputable sources agree AND there is no conflicting info. Otherwise "low".
- Never speculate. If you can't find clear evidence, put the match in findings with confidence: "low" and note the ambiguity — do NOT invent a value.
- Do not touch matches with outcome_locked_by_admin = true — skip them entirely (don't include in either list).
- Return ONLY the JSON — no preamble, no explanation, no code fences.`

console.log(`🤖 Calling Claude with ${matches.length} match(es) + web_search tool…`)

const claudeResp = await anthropic.messages.create({
  model: 'claude-opus-4-5-20250101', // conservative pin — reasoning-heavy task
  max_tokens: 8192,
  tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 40 }],
  messages: [{ role: 'user', content: auditPrompt }],
})

// Extract the final text block
const finalText = claudeResp.content
  .filter(b => b.type === 'text')
  .map(b => b.text)
  .join('')
  .trim()

let audit
try {
  // Strip any code fences if Claude added them despite instructions
  const cleaned = finalText.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '')
  audit = JSON.parse(cleaned)
} catch (err) {
  console.error(`❌ Failed to parse Claude response as JSON:\n${finalText}\n\n${err.message}`)
  process.exit(1)
}

const findings = audit.findings || []
const confirmed = audit.confirmed_correct || []
console.log(`   Confirmed correct: ${confirmed.length}`)
console.log(`   Findings: ${findings.length} (${findings.filter(f => f.confidence === 'high').length} high-conf, ${findings.filter(f => f.confidence === 'low').length} low-conf)`)

// ── 3. Apply high-confidence deltas ─────────────────────────────────────

const applied = []
const skipped = []

for (const f of findings) {
  if (f.confidence !== 'high') continue
  if (Object.keys(f.changes || {}).length === 0) continue

  if (DRY_RUN) {
    console.log(`   [dry-run] would apply ${f.fixture}: ${JSON.stringify(f.changes)}`)
    applied.push(f)
    continue
  }

  const patch = { ...f.changes, cards_synced_at: new Date().toISOString() }
  const { error } = await supabase.from('cup_matches').update(patch).eq('id', f.id)
  if (error) {
    console.error(`   ⚠️ Update failed for ${f.fixture}: ${error.message}`)
    skipped.push({ ...f, error: error.message })
  } else {
    console.log(`   ✅ Applied ${f.fixture}: ${JSON.stringify(f.changes)}`)
    applied.push(f)
  }
}

const lowConf = findings.filter(f => f.confidence !== 'high')

// ── 4. Post summary to GitHub issue (only if anything to say) ───────────

const hasNews = applied.length > 0 || lowConf.length > 0 || skipped.length > 0

if (!hasNews) {
  console.log(`✅ Nothing to report — everything matches the sources.`)
  process.exit(0)
}

if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_REPOSITORY) {
  console.log(`⚠️ Not running under GitHub Actions — skipping issue post.`)
  console.log(JSON.stringify({ applied, lowConf, skipped }, null, 2))
  process.exit(0)
}

const slot = today.toISOString().slice(0, 16).replace('T', ' ')
const title = `🏆 WC26 audit · ${slot} UTC · ${applied.length} applied · ${lowConf.length} to review`

const body = [
  `_Auto-generated by \`scripts/cup-audit.mjs\` running on the ${slot} cron slot._`,
  `Audited **${matches.length}** match(es) played in the last ${LOOKBACK_HOURS}h. **${confirmed.length}** confirmed correct against live sources.`,
  '',
  applied.length > 0 ? `## ✅ Applied ${applied.length} high-confidence delta(s)` : '',
  ...applied.map(f =>
    `- **${f.fixture}** — ${Object.entries(f.changes).map(([k, v]) => `\`${k}\` → \`${v}\``).join(', ')}\n  - ${f.note}\n  - Sources: ${f.sources.map(s => `[link](${s})`).join(', ')}`
  ),
  '',
  lowConf.length > 0 ? `## ⚠️ ${lowConf.length} low-confidence — review before applying` : '',
  ...lowConf.map(f =>
    `- **${f.fixture}** — proposed: ${Object.entries(f.changes || {}).map(([k, v]) => `\`${k}\` → \`${v}\``).join(', ') || '_no change proposed_'}\n  - ${f.note}\n  - Sources: ${(f.sources || []).map(s => `[link](${s})`).join(', ')}`
  ),
  '',
  skipped.length > 0 ? `## 🚨 ${skipped.length} skipped (DB error)` : '',
  ...skipped.map(f => `- **${f.fixture}** — ${f.error}`),
].filter(Boolean).join('\n')

try {
  execSync(
    `gh issue create --title "${title.replace(/"/g, '\\"')}" --body-file - --label "cup-audit"`,
    { input: body, stdio: ['pipe', 'inherit', 'inherit'], env: process.env },
  )
  console.log(`✅ Posted GH issue.`)
} catch (err) {
  console.error(`⚠️ Failed to post GH issue: ${err.message}`)
  console.log(`\n--- Would have posted ---\n${title}\n\n${body}`)
  process.exit(1)
}
