import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { format, parse } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import PlayerAvatar from '../components/PlayerAvatar'
import CeefaxHeader from '../components/CeefaxHeader'
import type { Profile } from '../types'

// /profile/monthly/:month  →  YYYY-MM
//
// Per-player review card. Backed by monthly_player_summary() RPC (mig 086).
// Positive-only: highlights, streaks, favourite teammate. No rank vs peers.
//
// Rendered for the signed-in user's own summary. Non-admin players cannot
// view other players' summaries.

interface SummaryRow {
  player_id: string
  month_start: string
  apps: number
  goals: number
  own_goals: number
  motm_wins: number
  dotd_nods: number
  wins: number
  draws: number
  losses: number
  best_game_match_id: string | null
  best_game_date: string | null
  best_game_goals: number
  best_game_motm: boolean
  best_game_dotd: boolean
  favourite_teammate_id: string | null
  favourite_teammate_fixtures: number
  streak_months: number
}

function parseMonth(raw: string | undefined): Date {
  if (!raw || !/^\d{4}-\d{2}$/.test(raw)) return firstOfCurrentMonth()
  const parsed = parse(`${raw}-01`, 'yyyy-MM-dd', new Date())
  if (isNaN(parsed.getTime())) return firstOfCurrentMonth()
  return parsed
}
function firstOfCurrentMonth(): Date {
  const d = new Date()
  d.setDate(1); d.setHours(0, 0, 0, 0)
  return d
}
function toMonthIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
function toMonthSlug(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function addMonths(d: Date, n: number): Date {
  const r = new Date(d); r.setMonth(r.getMonth() + n); return r
}
function firstName(name: string | null | undefined): string {
  return (name ?? '').split(' ')[0]
}

export default function ProfileMonthlyPage() {
  const { profile } = useAuth()
  const { month: monthParam } = useParams<{ month: string }>()
  const navigate = useNavigate()

  const monthDate = useMemo(() => parseMonth(monthParam), [monthParam])
  const monthIso  = toMonthIso(monthDate)
  const monthLabel = format(monthDate, 'MMMM yyyy')

  const [row, setRow] = useState<SummaryRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [fav, setFav] = useState<Pick<Profile, 'id' | 'name' | 'surname' | 'photo_url'> | null>(null)

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const { data, error } = await supabase.rpc('monthly_player_summary', {
        p_player_id: profile.id,
        p_month_start: monthIso,
      })
      if (cancelled) return
      if (error) { console.error('monthly_player_summary', error); setLoading(false); return }
      const r = ((data ?? []) as SummaryRow[])[0] ?? null
      setRow(r)

      if (r?.favourite_teammate_id) {
        const { data: pf } = await supabase.from('profiles')
          .select('id, name, surname, photo_url')
          .eq('id', r.favourite_teammate_id)
          .maybeSingle()
        if (!cancelled) setFav(pf as typeof fav)
      } else {
        setFav(null)
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [profile, monthIso])

  if (!profile) {
    return <div className="p-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading…</div>
  }

  const prevMonth = addMonths(monthDate, -1)
  const nextMonth = addMonths(monthDate, 1)
  const nextInFuture = nextMonth.getTime() > firstOfCurrentMonth().getTime()

  const winRate = row && (row.wins + row.draws + row.losses) > 0
    ? Math.round((row.wins / (row.wins + row.draws + row.losses)) * 100)
    : null

  return (
    <div className="px-4 pt-4 pb-6">
      <button
        onClick={() => navigate('/profile')}
        className="flex items-center gap-1.5 mb-4 text-sm font-medium"
        style={{ color: 'var(--color-text-muted)' }}>
        ← Back to Profile
      </button>

      <CeefaxHeader
        pageId="P110 · MONTHLY"
        title={monthLabel.toUpperCase()}
        meta={`${firstName(profile.name)}'S REVIEW`}
      />

      {/* Prev / Next month */}
      <div className="flex justify-between mb-4">
        <button
          onClick={() => navigate(`/profile/monthly/${toMonthSlug(prevMonth)}`)}
          className="text-xs px-2.5 py-1.5 rounded-lg font-semibold"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-muted)',
          }}>
          ← {format(prevMonth, 'MMM yyyy')}
        </button>
        {!nextInFuture && (
          <button
            onClick={() => navigate(`/profile/monthly/${toMonthSlug(nextMonth)}`)}
            className="text-xs px-2.5 py-1.5 rounded-lg font-semibold"
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-muted)',
            }}>
            {format(nextMonth, 'MMM yyyy')} →
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-center py-8 text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
      ) : !row || row.apps === 0 ? (
        <ZeroState monthLabel={monthLabel} />
      ) : (
        <div className="space-y-3">

          {/* Headline stat strip */}
          <div className="grid grid-cols-4 gap-2">
            <StatTile label="Apps"     value={row.apps}  accent="var(--tt-cyan)" />
            <StatTile label="Goals"    value={row.goals} accent="var(--tt-yellow)" />
            {row.motm_wins > 0
              ? <StatTile label="MOTM" value={row.motm_wins} accent="var(--tt-yellow)" icon="🏆" />
              : <StatTile label="Win rate" value={winRate != null ? `${winRate}%` : '—'} accent="var(--tt-green)" />}
            {row.dotd_nods > 0
              ? <StatTile label="DOTD" value={row.dotd_nods} accent="var(--tt-magenta)" icon="🥴" />
              : row.motm_wins > 0
                ? <StatTile label="Win rate" value={winRate != null ? `${winRate}%` : '—'} accent="var(--tt-green)" />
                : <StatTile label="W-D-L" value={`${row.wins}-${row.draws}-${row.losses}`} accent="var(--color-text)" size="small" />}
          </div>

          {/* Best game */}
          {row.best_game_date && (
            <Section title="⚡ Best game of the month">
              <p className="text-sm" style={{ color: 'var(--color-text)' }}>
                <strong style={{ color: 'var(--tt-yellow)' }}>{format(new Date(row.best_game_date), 'EEEE do MMMM')}</strong>
              </p>
              <p className="text-[13px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
                {[
                  row.best_game_goals > 0 && `${row.best_game_goals} goal${row.best_game_goals === 1 ? '' : 's'}`,
                  row.best_game_motm && '🏆 MOTM',
                  row.best_game_dotd && '🥴 DOTD',
                ].filter(Boolean).join(' · ') || 'An appearance to remember.'}
              </p>
            </Section>
          )}

          {/* Favourite teammate */}
          {fav && row.favourite_teammate_fixtures > 0 && (
            <Section title="🤝 Favourite teammate">
              <div className="flex items-center gap-3">
                <PlayerAvatar profile={fav as unknown as Profile} size={48} />
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                    {fav.name} {fav.surname}
                  </p>
                  <p className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
                    Shared {row.favourite_teammate_fixtures} fixture{row.favourite_teammate_fixtures === 1 ? '' : 's'} this month
                  </p>
                </div>
              </div>
            </Section>
          )}

          {/* Streak */}
          {row.streak_months >= 2 && (
            <Section title="🔥 Turn-out streak">
              <p className="text-2xl font-black" style={{ color: 'var(--tt-yellow)' }}>
                {row.streak_months} months
              </p>
              <p className="text-[12px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                Consecutive months with at least one appearance, counting back from {format(monthDate, 'MMMM yyyy')}.
              </p>
            </Section>
          )}

          {/* Own goals — only when >0, dry humour */}
          {row.own_goals > 0 && (
            <Section title="😅 Notable moment">
              <p className="text-[13px]" style={{ color: 'var(--color-text-muted)' }}>
                {row.own_goals} own goal{row.own_goals === 1 ? '' : 's'} this month.
                Best kept between us.
              </p>
            </Section>
          )}
        </div>
      )}
    </div>
  )
}

function StatTile({ label, value, accent, icon, size = 'normal' }: {
  label: string
  value: number | string
  accent: string
  icon?: string
  size?: 'normal' | 'small'
}) {
  const fontSize = size === 'small' ? 18 : 24
  return (
    <div className="rounded-2xl px-2.5 py-2 text-center"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
      }}>
      <p className="text-[9px] uppercase tracking-widest font-semibold"
        style={{ color: 'var(--color-text-muted)' }}>
        {label}
      </p>
      <p className="tabular-nums leading-none mt-1"
        style={{ color: accent, fontSize, fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
        {icon && <span className="mr-0.5" style={{ fontSize: fontSize - 4 }}>{icon}</span>}
        {value}
      </p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-3"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        backgroundClip: 'padding-box',
      }}>
      <p className="text-[10px] uppercase tracking-widest font-semibold mb-1.5"
        style={{ color: 'var(--tt-cyan, var(--color-primary))' }}>
        {title}
      </p>
      {children}
    </div>
  )
}

function ZeroState({ monthLabel }: { monthLabel: string }) {
  return (
    <div className="rounded-2xl p-6 text-center"
      style={{
        background: 'var(--color-surface)',
        border: '1px dashed var(--color-border)',
      }}>
      <p className="text-3xl mb-2">👀</p>
      <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
        You didn't turn out in {monthLabel}.
      </p>
      <p className="text-[12px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
        See you Thursday.
      </p>
    </div>
  )
}
