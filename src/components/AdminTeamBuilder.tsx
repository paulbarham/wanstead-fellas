import React, { useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { getVotingWindow, canGenerateTeams } from '../lib/time'
import type { Profile, Match, Team } from '../types'
import PlayerAvatar from './PlayerAvatar'
import { pickConfig, formatLabelFor, splitPlayingAndReserves } from '../lib/format'

const stripFC = (s?: string) => (s ?? '').replace(/\s+(FC|XI)$/, '')

interface TeamDraft {
  id?: string
  name: string
  bibs: boolean
  captain?: Profile
  players: Profile[]
}

interface Props {
  nextThursday: string
  match: Match | null
  publishedTeams: (Team & { players: Profile[]; captain: Profile | null })[]
  onPublished: () => void
}

const ATTR_LABELS: { key: keyof Profile; label: string }[] = [
  { key: 'sp', label: 'Pace' },
  { key: 'sk', label: 'Skill' },
  { key: 'st', label: 'Stamina' },
  { key: 'tk', label: 'Tackling' },
  { key: 'ps', label: 'Passing' },
  { key: 'ag', label: 'Aggression' },
  { key: 'phy', label: 'Physicality' },
  { key: 'cp', label: 'Composure' },
  { key: 'wr', label: 'Work Rate' },
]

const TEAM_COLORS = ['#1E3A5F', '#14532D', '#7C2D12', '#4C1D95']

function calcWeightedScore(player: Profile, weights: Record<string, number>): number {
  return ATTR_LABELS.reduce((sum, { key }) => sum + (player[key] as number) * (weights[key] || 0), 0)
}

function snakeDraft(players: Profile[], numTeams: number, weights: Record<string, number>): Profile[][] {
  const sorted = [...players].sort((a, b) => calcWeightedScore(b, weights) - calcWeightedScore(a, weights))
  const teams: Profile[][] = Array.from({ length: numTeams }, () => [])
  sorted.forEach((player, i) => {
    const round = Math.floor(i / numTeams)
    const pos = i % numTeams
    const teamIdx = round % 2 === 0 ? pos : numTeams - 1 - pos
    teams[teamIdx].push(player)
  })
  return teams
}

function pickCaptain(players: Profile[]): Profile {
  const sorted = [...players].sort((a, b) => b.overall_rating - a.overall_rating)
  const top3 = sorted.slice(0, 3)
  return top3[Math.floor(Math.random() * top3.length)]
}

function buildWhatsAppText(teams: TeamDraft[], nextThursday: string): string {
  const dateLabel = format(new Date(nextThursday + 'T12:00:00'), 'do MMMM')
  const totalPlayers = teams.reduce((sum, t) => sum + t.players.length, 0)
  const cfg = pickConfig(totalPlayers)
  const formatLabel = `${formatLabelFor(cfg)}${cfg ? ` · ${cfg.numTeams} teams` : ''}`

  let text = `🏆 WANSTEAD FELLAS — THURSDAY NIGHT FOOTBALL\n`
  text += `📅 ${dateLabel} | ${formatLabel} | 9–10pm\n`

  for (const team of teams) {
    text += `\n*${team.name}* ${team.bibs ? '🟡 BIBS' : '⬜ NO BIBS'}\n`
    for (const p of team.players) {
      text += `${p.name} ${p.surname}\n`
    }
  }

  const total = teams.reduce((sum, t) => sum + t.players.length, 0)
  text += `\nTotal players: ${total}\nSee you Thursday! ⚽`
  return text
}

function buildFlatList(teams: TeamDraft[]): string {
  const all = teams.flatMap(t => t.players)
  const sorted = [...all].sort((a, b) => `${a.surname}${a.name}`.localeCompare(`${b.surname}${b.name}`))
  return sorted.map(p => `${p.name} ${p.surname}`).join('\n')
}

export default function AdminTeamBuilder({ nextThursday, match, publishedTeams, onPublished }: Props) {
  const [availablePlayers, setAvailablePlayers] = useState<Profile[]>([])
  const [signupTimes, setSignupTimes] = useState<Record<string, string>>({})
  const [weights, setWeights] = useState<Record<string, number>>(() =>
    Object.fromEntries(ATTR_LABELS.map(a => [a.key, 1]))
  )
  const [draftTeams, setDraftTeamsState] = useState<TeamDraft[]>([])
  const setDraftTeams: React.Dispatch<React.SetStateAction<TeamDraft[]>> = useCallback(updater => {
    setDraftTeamsState(prev => {
      const next = typeof updater === 'function'
        ? (updater as (p: TeamDraft[]) => TeamDraft[])(prev)
        : updater
      void (async () => {
        if (next.length === 0) {
          await supabase.from('team_drafts').delete().eq('match_date', nextThursday)
        } else {
          await supabase
            .from('team_drafts')
            .upsert({ match_date: nextThursday, draft: next }, { onConflict: 'match_date' })
        }
      })()
      return next
    })
  }, [nextThursday])

  useEffect(() => {
    let cancelled = false
    async function hydrate() {
      const { data } = await supabase
        .from('team_drafts')
        .select('draft')
        .eq('match_date', nextThursday)
        .maybeSingle()
      if (cancelled) return
      setDraftTeamsState(data && Array.isArray(data.draft) ? (data.draft as TeamDraft[]) : [])
    }
    hydrate()
    return () => { cancelled = true }
  }, [nextThursday])

  const [canGenerate, setCanGenerate] = useState(() => canGenerateTeams(nextThursday))
  useEffect(() => {
    setCanGenerate(canGenerateTeams(nextThursday))
    const id = setInterval(() => setCanGenerate(canGenerateTeams(nextThursday)), 60000)
    return () => clearInterval(id)
  }, [nextThursday])
  const [swapModal, setSwapModal] = useState<{ player: Profile; fromTeamIdx: number } | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [published, setPublished] = useState(publishedTeams.length > 0)
  const [showWeights, setShowWeights] = useState(false)
  const [copied, setCopied] = useState<'whatsapp' | 'flat' | null>(null)

  useEffect(() => { setPublished(publishedTeams.length > 0) }, [publishedTeams])

  useEffect(() => {
    async function load() {
      const { data: avail } = await supabase
        .from('availability')
        .select('player_id, created_at')
        .eq('match_date', nextThursday)
        .eq('status', 'confirmed')
      if (!avail || avail.length === 0) return
      const rows = avail as { player_id: string; created_at: string }[]
      const ids = rows.map(a => a.player_id)
      const times: Record<string, string> = {}
      for (const r of rows) times[r.player_id] = r.created_at
      const { data: profs } = await supabase.from('profiles').select('*').in('id', ids)
      setAvailablePlayers((profs as Profile[]) || [])
      setSignupTimes(times)
    }
    load()
  }, [nextThursday])

  function autoBalance() {
    const cfg = pickConfig(availablePlayers.length)
    if (!cfg) {
      alert(`Need at least 10 confirmed players to generate teams (currently ${availablePlayers.length}).`)
      return
    }
    const candidates = availablePlayers.map(p => ({ player: p, createdAt: signupTimes[p.id] ?? '' }))
    const { playing } = splitPlayingAndReserves(candidates, cfg.total)
    const playingProfiles = playing.map(c => c.player)
    const groups = snakeDraft(playingProfiles, cfg.numTeams, weights)
    const bibsPattern = cfg.numTeams === 2 ? [true, false] : [true, false, true, false]
    const teams: TeamDraft[] = groups.map((players, i) => {
      const captain = pickCaptain(players)
      return { name: `${captain.name} ${captain.surname} ${cfg.numTeams === 2 ? 'XI' : 'FC'}`, bibs: bibsPattern[i], captain, players }
    })
    setDraftTeams(teams)
    setPublished(false)
  }

  function swapPlayers(fromTeamIdx: number, fromPlayer: Profile, toTeamIdx: number, toPlayer: Profile) {
    setDraftTeams(prev => {
      const next = prev.map(t => ({ ...t, players: [...t.players] }))
      const fromTeam = next[fromTeamIdx]
      const toTeam = next[toTeamIdx]
      fromTeam.players = fromTeam.players.filter(p => p.id !== fromPlayer.id)
      toTeam.players = toTeam.players.filter(p => p.id !== toPlayer.id)
      fromTeam.players.push(toPlayer)
      toTeam.players.push(fromPlayer)
      if (fromTeam.captain?.id === fromPlayer.id) fromTeam.captain = pickCaptain(fromTeam.players)
      if (toTeam.captain?.id === toPlayer.id) toTeam.captain = pickCaptain(toTeam.players)
      const suffix = next.length === 2 ? 'XI' : 'FC'
      fromTeam.name = `${fromTeam.captain?.name ?? ''} ${fromTeam.captain?.surname ?? ''} ${suffix}`
      toTeam.name = `${toTeam.captain?.name ?? ''} ${toTeam.captain?.surname ?? ''} ${suffix}`
      return next
    })
    setSwapModal(null)
  }

  function balanceScore(): number {
    if (draftTeams.length < 2) return 0
    const scores = draftTeams.map(t =>
      t.players.reduce((s, p) => s + calcWeightedScore(p, weights), 0)
    )
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length
    const variance = scores.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / scores.length
    return Math.max(0, Math.round(100 - variance / 10))
  }

  async function publish() {
    if (draftTeams.length === 0) return
    setPublishing(true)
    let matchId = match?.id
    if (!matchId) {
      const { data: newMatch } = await supabase
        .from('matches')
        .insert({ match_date: nextThursday, format: formatLabelFor(pickConfig(draftTeams.reduce((s, t) => s + t.players.length, 0))), status: 'published' })
        .select().single()
      matchId = newMatch?.id
    } else {
      await supabase.from('matches').update({ status: 'published' }).eq('id', matchId)
    }
    if (!matchId) { setPublishing(false); return }

    const { data: oldTeams } = await supabase.from('teams').select('id').eq('match_id', matchId)
    if (oldTeams && oldTeams.length > 0) {
      const oldIds = oldTeams.map((t: { id: string }) => t.id)
      await supabase.from('team_players').delete().in('team_id', oldIds)
      await supabase.from('teams').delete().eq('match_id', matchId)
    }

    for (const team of draftTeams) {
      const { data: teamRow } = await supabase
        .from('teams')
        .insert({ match_id: matchId, name: team.name, captain_id: team.captain?.id ?? null, bibs: team.bibs })
        .select().single()
      if (teamRow) {
        await supabase.from('team_players').insert(
          team.players.map(p => ({ team_id: teamRow.id, player_id: p.id }))
        )
      }
    }
    // Open the MOTM/DOTD voting window for this match (10pm match night →
    // 9am next day). Preserves results_published if the row already exists.
    const { opens_at, closes_at } = getVotingWindow(nextThursday)
    await supabase.from('voting_windows').upsert(
      { match_id: matchId, opens_at, closes_at },
      { onConflict: 'match_id' },
    )

    // Auto-create WTP game entries for all WTP players in the published teams
    const allPlayers = draftTeams.flatMap(t => t.players)
    const wtpPlayers = allPlayers.filter(p => (p.player_type ?? 'wtp') === 'wtp')
    if (wtpPlayers.length > 0) {
      await supabase.from('wtp_games').upsert(
        wtpPlayers.map(p => ({ player_id: p.id, match_date: nextThursday, amount: 5.00 })),
        { onConflict: 'player_id,match_date' }
      )
    }

    setPublished(true)
    setPublishing(false)
    onPublished()
  }

  async function copyToClipboard(text: string, type: 'whatsapp' | 'flat') {
    await navigator.clipboard.writeText(text)
    setCopied(type)
    setTimeout(() => setCopied(null), 2000)
  }

  const score = balanceScore()
  const teamsToShow = draftTeams.length > 0 ? draftTeams : publishedTeams.map(t => ({
    id: t.id,
    name: t.name,
    bibs: t.bibs,
    captain: t.captain ?? undefined,
    players: t.players,
  }))

  const totalPlayers = teamsToShow.reduce((sum, t) => sum + t.players.length, 0)
  const isOverCap = totalPlayers > 32

  return (
    <div className="px-4 pt-4" style={{ paddingBottom: 0 }}>
      <p className="text-xs font-medium uppercase tracking-widest mb-0.5" style={{ color: 'var(--color-primary)' }}>Teams</p>
      <div className="flex items-center justify-between mb-1">
        <h1 className="font-display text-2xl text-[var(--color-text)] tracking-wide">TEAM BUILDER</h1>
        <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'var(--color-surface)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
          {availablePlayers.length} confirmed
        </span>
      </div>

      {published && draftTeams.length === 0 && (
        <div className="mb-3 px-3 py-2 rounded-xl text-xs font-medium"
          style={{ background: 'var(--color-success-bg)', color: 'var(--color-primary)', border: '1px solid var(--color-primary)' }}>
          ✓ Teams published and visible to players
        </div>
      )}

      {isOverCap && (
        <div className="mb-3 px-3 py-2 rounded-xl text-xs font-medium"
          style={{ background: 'var(--color-error-bg)', color: 'var(--color-error-text)', border: '1px solid #FECACA' }}>
          ⚠ {totalPlayers} players — over the 32-player cap
        </div>
      )}

      {/* Auto-balance button */}
      <button
        onClick={autoBalance}
        disabled={availablePlayers.length < 2 || !canGenerate}
        className="w-full py-3.5 rounded-2xl font-semibold text-sm mb-1 disabled:opacity-40 transition-opacity"
        style={{ background: 'var(--color-primary)', color: 'var(--color-surface)' }}
      >
        ⚡ Auto-Balance Teams
      </button>
      {!canGenerate && (
        <p className="text-xs mb-3 text-center" style={{ color: 'var(--color-text-muted)' }}>
          Team generation opens Wed 10pm (signup close) and locks 30 min before kick-off.
        </p>
      )}
      {canGenerate && <div className="mb-2" />}

      {/* Balance settings */}
      <div className="mb-4">
        <button
          onClick={() => setShowWeights(w => !w)}
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}
        >
          <span>⚙ Balance settings</span>
          <span style={{ fontSize: '0.6rem' }}>{showWeights ? '▲' : '▼'}</span>
        </button>

        {showWeights && (
          <div className="mt-2 p-4 rounded-2xl space-y-3" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            {ATTR_LABELS.map(({ key, label }) => (
              <div key={key} className="flex items-center gap-3">
                <span className="text-xs w-20 flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>{label}</span>
                <input
                  type="range" min={0} max={5} step={0.5}
                  value={weights[key] || 0}
                  onChange={e => setWeights(w => ({ ...w, [key]: parseFloat(e.target.value) }))}
                  className="flex-1"
                  style={{ '--val': weights[key] || 0, '--min': 0, '--max': 5 } as React.CSSProperties}
                />
                <span className="text-xs flex-shrink-0 text-right text-[var(--color-text)]" style={{ minWidth: 28, paddingRight: 4 }}>{weights[key] || 0}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Empty state */}
      {teamsToShow.length === 0 && (
        <div className="p-6 rounded-2xl text-center" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <p className="text-2xl mb-2">👥</p>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Tap Auto-Balance to generate teams based on signed-up players
          </p>
        </div>
      )}

      {/* Team cards */}
      {teamsToShow.length > 0 && (
        <>
          {draftTeams.length > 0 && (
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs uppercase tracking-widest font-semibold" style={{ color: '#9CA897' }}>Draft Teams</p>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full"
                  style={{ background: score >= 80 ? '#4ade80' : score >= 60 ? '#C9A227' : '#DC2626' }} />
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Balance: {score}%</span>
                {availablePlayers.length < 8 && (
                  <span className="text-xs" style={{ color: '#9CA897' }}>· improves with more players</span>
                )}
              </div>
            </div>
          )}

          <div className="space-y-3 mb-4">
            {teamsToShow.map((team, teamIdx) => {
              const color = TEAM_COLORS[teamIdx % TEAM_COLORS.length]
              return (
                <div key={team.id ?? teamIdx}
                  style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${color}55` }}>

                  {/* Coloured header — full-width band, 16px padding all sides */}
                  <div
                    style={{
                      background: color,
                      padding: 16,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                    }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 className="font-display"
                        style={{
                          fontSize: 24,
                          lineHeight: 1.05,
                          color: '#FFFFFF',
                          letterSpacing: '0.02em',
                          wordBreak: 'normal',
                          overflowWrap: 'break-word',
                        }}>
                        {stripFC(team.name)}
                      </h3>
                      {team.captain && (
                        <p style={{
                          fontSize: 12,
                          color: 'rgba(255,255,255,0.7)',
                          marginTop: 4,
                          lineHeight: 1.2,
                        }}>
                          © {team.captain.name} {team.captain.surname}
                        </p>
                      )}
                    </div>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.6px',
                      padding: '4px 10px',
                      borderRadius: 999,
                      background: team.bibs ? '#F59E0B' : '#3B82F6',
                      color: '#FFFFFF',
                      flexShrink: 0,
                    }}>
                      {team.bibs ? 'BIBS' : 'SKINS'}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5"
                    style={{ background: 'var(--color-surface-2)', padding: 16 }}>

                    {team.players.map(p => {
                      const isCap = p.id === team.captain?.id
                      return (
                        <button
                          key={p.id}
                          onClick={() => draftTeams.length > 0 && setSwapModal({ player: p, fromTeamIdx: teamIdx })}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-opacity"
                          style={{
                            background: isCap ? `${color}20` : 'var(--color-surface)',
                            color: isCap ? color : 'var(--color-text)',
                            border: `1px solid ${isCap ? `${color}66` : 'var(--color-border)'}`,
                            cursor: draftTeams.length > 0 ? 'pointer' : 'default',
                          }}
                        >
                          {p.surname}
                          {isCap && <span style={{ color, opacity: 0.8, marginLeft: 2 }}>©</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          {draftTeams.length > 0 && (
            <button
              onClick={publish}
              disabled={publishing}
              className="w-full py-3 rounded-xl font-semibold text-sm disabled:opacity-50 mb-4"
              style={{ background: 'var(--color-primary)', color: 'var(--color-surface)' }}
            >
              {publishing ? 'Publishing…' : published ? '↺ Re-publish Teams' : 'Publish Teams'}
            </button>
          )}

          {/* Finalise & Export section */}
          {teamsToShow.length > 0 && (
            <div style={{ marginTop: 8, paddingBottom: 16 }}>
              {/* Subtle divider */}
              <div style={{ height: 1, background: 'var(--color-border)', marginBottom: 16 }} />

              <p
                className="font-semibold"
                style={{
                  fontSize: 11,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: 'var(--color-text-muted)',
                  marginBottom: 12,
                }}
              >
                Finalise & Export
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Primary: WhatsApp */}
                <button
                  onClick={() => copyToClipboard(buildWhatsAppText(teamsToShow, nextThursday), 'whatsapp')}
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    borderRadius: 12,
                    fontSize: 14,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    background: copied === 'whatsapp' ? 'var(--color-success-bg)' : 'var(--color-primary)',
                    color: copied === 'whatsapp' ? 'var(--color-success-text)' : '#FFFFFF',
                    border: 'none',
                  }}
                >
                  <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1 }}>
                    {copied === 'whatsapp' ? '✓' : '📋'}
                  </span>
                  {copied === 'whatsapp' ? 'Copied!' : 'Copy team sheet for WhatsApp'}
                </button>

                {/* Secondary: Flat list */}
                <button
                  onClick={() => copyToClipboard(buildFlatList(teamsToShow), 'flat')}
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    borderRadius: 12,
                    fontSize: 14,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    background: copied === 'flat' ? 'var(--color-success-bg)' : 'var(--color-surface)',
                    color: copied === 'flat' ? 'var(--color-success-text)' : 'var(--color-text)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1 }}>
                    {copied === 'flat' ? '✓' : '📝'}
                  </span>
                  {copied === 'flat' ? 'Copied!' : 'Copy flat player list'}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Swap modal */}
      {swapModal && (
        <div className="fixed inset-0 flex items-end justify-center z-50 px-4 pb-4"
          style={{ background: 'rgba(0,0,0,0.85)' }}
          onClick={() => setSwapModal(null)}>
          <div className="w-full rounded-2xl p-5"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', maxWidth: 430 }}
            onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-[var(--color-text)] mb-0.5">
              Swap {swapModal.player.name} {swapModal.player.surname}
            </h3>
            <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>Select a player to swap with</p>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {draftTeams.map((team, teamIdx) => {
                if (teamIdx === swapModal.fromTeamIdx) return null
                const color = TEAM_COLORS[teamIdx % TEAM_COLORS.length]
                return team.players.map(p => (
                  <button
                    key={p.id}
                    onClick={() => swapPlayers(swapModal.fromTeamIdx, swapModal.player, teamIdx, p)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl text-left"
                    style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                  >
                    <PlayerAvatar profile={p} size={32} />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-[var(--color-text)]">{p.name} {p.surname}</p>
                      <p className="text-xs" style={{ color }}>{team.name}</p>
                    </div>
                  </button>
                ))
              })}
            </div>
            <button
              onClick={() => setSwapModal(null)}
              className="w-full mt-3 py-2.5 rounded-xl text-sm"
              style={{ background: 'var(--color-surface)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
