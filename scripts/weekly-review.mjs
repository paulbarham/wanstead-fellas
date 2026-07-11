#!/usr/bin/env node
// Weekly review data-gathering script. Runs from GitHub Actions on a
// Monday morning cron, produces a plain-Markdown "review checklist"
// with static heuristics that don't need Claude — bundle size delta,
// churn, TODO count, new components, focus-area suggestions.
//
// The workflow either opens the checklist as a GitHub issue or writes
// it to `docs/weekly-reviews/YYYY-Www.md` (see monthly-report.mjs for
// the same pattern). Admin can then invoke a deep Claude review
// on-demand (this session or future sessions) using the checklist as
// the "where to look" input.
//
// No secrets required — reads only public git history + repo files.

import { execSync } from 'node:child_process'
import { writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')

// ── args ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const weeksBack = Number(args.find(a => a.startsWith('--weeks-back='))?.slice('--weeks-back='.length)) || 1
const outArg = args.find(a => a.startsWith('--out='))?.slice('--out='.length)

// ── helpers ───────────────────────────────────────────────────────────

function sh(cmd) {
  return execSync(cmd, { cwd: REPO_ROOT, encoding: 'utf8' }).trim()
}

function isoWeekLabel() {
  // Use ISO week: YYYY-Www — matches GH Actions naming conventions.
  const d = new Date()
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  target.setDate(target.getDate() + 4 - (target.getDay() || 7))
  const yearStart = new Date(target.getFullYear(), 0, 1)
  const weekNo = Math.ceil((((target.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${target.getFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

function humanBytes(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

// ── metrics ───────────────────────────────────────────────────────────

function countTodosInSrc() {
  // Ripgrep-like: `git grep` for TODO/FIXME/HACK/XXX markers, exclude
  // node_modules, exclude the auto-generated PDFs / HTML in docs/.
  try {
    const out = sh(`git grep -cE '\\b(TODO|FIXME|HACK|XXX)\\b' -- 'src/**/*.ts' 'src/**/*.tsx' 'supabase/**/*.sql' 'scripts/**/*.mjs' || true`)
    if (!out) return { total: 0, byFile: [] }
    const byFile = out.split('\n').map(line => {
      const m = line.match(/^(.+):(\d+)$/)
      return m ? { file: m[1], count: Number(m[2]) } : null
    }).filter(Boolean)
    const total = byFile.reduce((s, r) => s + r.count, 0)
    return { total, byFile: byFile.sort((a, b) => b.count - a.count).slice(0, 10) }
  } catch { return { total: 0, byFile: [] } }
}

function countTests() {
  // Vitest .test.ts / .spec.ts files
  try {
    const out = sh(`git ls-files 'src/**/*.test.ts' 'src/**/*.test.tsx' 'src/**/*.spec.ts' 'src/**/*.spec.tsx' 'lib/**/*.test.ts'`)
    if (!out) return 0
    return out.split('\n').filter(Boolean).length
  } catch { return 0 }
}

function commitsSince(since) {
  try {
    return sh(`git log --since='${since}' --pretty=format:'%H' | wc -l`).trim()
  } catch { return '0' }
}

function churnByFile(since) {
  // Files with most changed lines in the window (added + deleted).
  try {
    const raw = sh(`git log --since='${since}' --numstat --format='' -- src/ supabase/ scripts/ .github/ docs/`)
    const tally = new Map()
    for (const line of raw.split('\n').filter(Boolean)) {
      const [added, removed, file] = line.split('\t')
      if (!file || added === '-' || removed === '-') continue
      const cur = tally.get(file) ?? 0
      tally.set(file, cur + Number(added) + Number(removed))
    }
    return Array.from(tally.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([file, lines]) => ({ file, lines }))
  } catch { return [] }
}

function newFilesSince(since) {
  try {
    const raw = sh(`git log --since='${since}' --diff-filter=A --name-only --format=''`)
    return Array.from(new Set(raw.split('\n').filter(Boolean).filter(f => /^(src|supabase|scripts|\.github|docs)/.test(f)))).slice(0, 20)
  } catch { return [] }
}

function distSizes() {
  try {
    const distDir = resolve(REPO_ROOT, 'dist')
    if (!statSync(distDir).isDirectory()) return null
  } catch { return null }
  try {
    const bytes = sh(`du -sb dist`).split('\t')[0]
    const largestJs = sh(`ls -la dist/assets/index-*.js 2>/dev/null | head -1 | awk '{print $5}'`)
    return { total: Number(bytes), largestIndexJs: Number(largestJs) || null }
  } catch { return null }
}

function pagesWithoutRecentChurn(now) {
  // Pages that haven't been touched in >30 days — candidates for a
  // refresh / stale-content check.
  const pageDir = resolve(REPO_ROOT, 'src/pages')
  try {
    const pages = readdirSync(pageDir).filter(f => f.endsWith('.tsx'))
    const stale = []
    for (const p of pages) {
      try {
        const lastCommit = sh(`git log -1 --format='%at' -- 'src/pages/${p}' 2>/dev/null`)
        if (!lastCommit) continue
        const ageDays = Math.floor((now.getTime() / 1000 - Number(lastCommit)) / 86400)
        if (ageDays > 30) stale.push({ file: `src/pages/${p}`, daysStale: ageDays })
      } catch { /* skip */ }
    }
    return stale.sort((a, b) => b.daysStale - a.daysStale)
  } catch { return [] }
}

// ── render ────────────────────────────────────────────────────────────

const since = `${weeksBack} week${weeksBack === 1 ? '' : 's'} ago`
const now = new Date()
const nowIso = now.toISOString().slice(0, 10)
const weekLabel = isoWeekLabel()

const todos = countTodosInSrc()
const testCount = countTests()
const commits = commitsSince(since)
const churn = churnByFile(since)
const newFiles = newFilesSince(since)
const dist = distSizes()
const stale = pagesWithoutRecentChurn(now)

const md = `# Weekly review · ${weekLabel} · ${nowIso}

_Auto-generated by \`scripts/weekly-review.mjs\`. Data window: **last ${weeksBack} week${weeksBack === 1 ? '' : 's'}**._

## 📊 Metrics

| Metric | Value |
|---|---|
| Commits (window) | ${commits} |
| Test files | ${testCount} |
| TODO / FIXME / HACK count | ${todos.total} |
| Bundle size (dist/) | ${dist ? humanBytes(dist.total) : '_dist not built — run `npm run build` before this if you want the number_'} |
| Largest \`index-*.js\` chunk | ${dist?.largestIndexJs ? humanBytes(dist.largestIndexJs) : '—'} |

## 🔥 Hottest files (most-churned this window)

${churn.length === 0 ? '_No churn recorded._' : churn.map(({ file, lines }) => `- \`${file}\` — ${lines} lines changed`).join('\n')}

## ✨ New files added this window

${newFiles.length === 0 ? '_None._' : newFiles.map(f => `- \`${f}\``).join('\n')}

## 📌 TODO / FIXME markers

${todos.byFile.length === 0 ? '_Clean. Nothing tagged._' : todos.byFile.map(({ file, count }) => `- \`${file}\` — ${count}`).join('\n')}

## 🕰️ Pages untouched > 30 days

${stale.length === 0 ? '_Every page has been touched in the last month._' : stale.map(({ file, daysStale }) => `- \`${file}\` — ${daysStale} days`).join('\n')}

## 🧭 Suggested focus areas for this week's deep review

Look at the top-3 hottest files above. Those are the surfaces most likely to have:
- Fresh copy that hasn't been proofread
- New states without empty/error handling
- Small UI regressions introduced under time pressure

For a **deep AI-driven review** (UX, UI, accessibility, feature gaps), invoke a Claude Code session with the prompt:

> _"Do a full review of the files listed under 'Hottest files' in \`docs/weekly-reviews/${weekLabel}.md\`. Follow the same review contract used on 10 Jul 2026 (see commit history for \`docs/reviews/2026-07-10.md\`)."_

That prompt will spin up subagents, produce a categorised findings list, apply the safe inline fixes, and report the material ones for admin decision.

---

_Next weekly review: ${new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10)}_
`

const outPath = outArg ? resolve(REPO_ROOT, outArg) : resolve(REPO_ROOT, `docs/weekly-reviews/${weekLabel}.md`)
mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, md, 'utf8')
console.log(`✅ Wrote ${relative(REPO_ROOT, outPath)}`)
