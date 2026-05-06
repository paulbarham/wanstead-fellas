import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import type { Profile, Match, Team } from '../types'
import PlayerAvatar from './PlayerAvatar'

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

const TEAM_COLORS = ['#0D6B52', '#1d4ed8', '#b45309', '#9f1239']

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
  const dateLabel = format(new Date(nextThursday + 'T12:00:00'), 'EEEE do MMMM')
  const formatLabel = teams.length >= 3 ? '4-Team Tournament' : '11v11'

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
  const [weights, setWeights] = useState<Record<string, number>>(() =>
    Object.fromEntries(ATTR_LABELS.map(a => [a.key, 1]))
  )
  const [draftTeams, setDraftTeams] = useState<TeamDraft[]>([])
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
        .select('player_id')
        .eq('match_date', nextThursday)
        .eq('status', 'confirmed')
      if (!avail || avail.length === 0) return
      const ids = avail.map((a: { player_id: string }) => a.player_id)
      const { data: profs } = await supabase.from('profiles').select('*').in('id', ids)
      setAvailablePlayers((profs as Profile[]) || [])
    }
    load()
  }, [nextThursday])

  function autoBalance() {
    const numTeams = availablePlayers.length >= 22 ? 2 : 4
    const groups = snakeDraft(availablePlayers, numTeams, weights)
    const bibsPattern = numTeams === 2 ? [true, false] : [true, false, true, false]
    const teams: TeamDraft[] = groups.map((players, i) => {
      const captain = pickCaptain(players)
      return { name: `${captain.surname} ${numTeams === 2 ? 'XI' : 'FC'}`, bibs: bibsPattern[i], captain, players }
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
      fromTeam.name = `${fromTeam.captain?.surname ?? ''} ${suffix}`
      toTeam.name = `${toTeam.captain?.surname ?? ''} ${suffix}`
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
        .insert({ match_date: nextThursday, format: draftTeams.length >= 3 ? 'tournament' : '11v11', status: 'published' })
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
    <div className="px-4 pt-4 pb-4">
      <p className="text-xs font-medium uppercase tracking-widest mb-0.5" style={{ color: '#0D6B52' }}>Teams</p>
      <div className="flex items-center justify-between mb-1">
        <h1 className="font-display text-2xl text-white tracking-wide">TEAM BUILDER</h1>
        <span className="text-xs px-2 py-1 rounded-full" style={{ background: '#141414', color: '#888', border: '1px solid #2e2e2e' }}>
          {availablePlayers.length} confirmed
        </span>
      </div>

      {published && draftTeams.length === 0 && (
        <div className="mb-3 px-3 py-2 rounded-xl text-xs font-medium"
          style={{ background: '#0a1a10', color: '#4ade80', border: '1px solid #4ade80' }}>
          ✓ Teams published and visible to players
        </div>
      )}

      {isOverCap && (
        <div className="mb-3 px-3 py-2 rounded-xl text-xs font-medium"
          style={{ background: '#1a0a0a', color: '#ff6b6b', border: '1px solid #ff6b6b' }}>
          ⚠ {totalPlayers} players — over the 32-player cap
        </div>
      )}

      {/* Auto-balance button */}
      <button
        onClick={autoBalance}
        disabled={availablePlayers.length < 2}
        className="w-full py-3.5 rounded-2xl font-semibold text-sm mb-3 disabled:opacity-40 transition-opacity"
        style={{ background: '#0D6B52', color: 'white' }}
      >
        ⚡ Auto-Balance Teams
      </button>

      {/* Balance settings */}
      <div className="mb-4">
        <button
          onClick={() => setShowWeights(w => !w)}
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm"
          style={{ background: '#141414', border: '1px solid #2e2e2e', color: '#888' }}
        >
          <span>⚙ Balance settings</span>
          <span style={{ fontSize: '0.6rem' }}>{showWeights ? '▲' : '▼'}</span>
        </button>

        {showWeights && (
          <div className="mt-2 p-4 rounded-2xl space-y-3" style={{ background: '#141414', border: '1px solid #2e2e2e' }}>
            {ATTR_LABELS.map(({ key, label }) => (
              <div key={key} className="flex items-center gap-3">
                <span className="text-xs w-20 flex-shrink-0" style={{ color: '#888' }}>{label}</span>
                <input
                  type="range" min={0} max={5} step={0.5}
                  value={weights[key] || 0}
                  onChange={e => setWeights(w => ({ ...w, [key]: parseFloat(e.target.value) }))}
                  className="flex-1"
                />
                <span className="text-xs w-5 text-right text-white">{weights[key] || 0}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Team cards */}
      {teamsToShow.length > 0 && (
        <>
          {draftTeams.length > 0 && (
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs uppercase tracking-widest font-semibold" style={{ color: '#555' }}>Draft Teams</p>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full"
                  style={{ background: score >= 80 ? '#4ade80' : score >= 60 ? '#C9A227' : '#ff6b6b' }} />
                <span className="text-xs" style={{ color: '#888' }}>Balance: {score}%</span>
              </div>
            </div>
          )}

          <div className="space-y-3 mb-4">
            {teamsToShow.map((team, teamIdx) => {
              const color = TEAM_COLORS[teamIdx % TEAM_COLORS.length]
              return (
                <div key={team.id ?? teamIdx} className="rounded-2xl overflow-hidden"
                  style={{ border: `1px solid ${color}55` }}>

                  <div className="px-4 py-3 flex items-center justify-between"
                    style={{ background: color }}>
                    <div>
                      <h3 className="font-display text-white tracking-wide" style={{ fontSize: '1.05rem', lineHeight: 1.1 }}>
                        {team.name}
                      </h3>
                      {team.captain && (
                        <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.75)' }}>
                          © {team.captain.name} {team.captain.surname}
                        </p>
                      )}
                    </div>
                    <span className="text-xs px-2.5 py-1 rounded-full font-semibold flex-shrink-0"
                      style={{ background: 'rgba(0,0,0,0.35)', color: 'white', border: '1px solid rgba(255,255,255,0.2)' }}>
                      {team.bibs ? '🟡 BIBS' : '⬜ SKINS'}
                    </span>
                  </div>

                  <div className="p-3 flex flex-wrap gap-1.5" style={{ background: '#111' }}>
                    {team.players.map(p => {
                      const isCap = p.id === team.captain?.id
                      return (
                        <button
                          key={p.id}
                          onClick={() => draftTeams.length > 0 && setSwapModal({ player: p, fromTeamIdx: teamIdx })}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-opacity"
                          style={{
                            background: isCap ? `${color}33` : '#1e1e1e',
                            color: isCap ? 'white' : '#bbb',
                            border: `1px solid ${isCap ? color : '#2e2e2e'}`,
                            cursor: draftTeams.length > 0 ? 'pointer' : 'default',
                          }}
                        >
                          {p.surname}
                          {isCap && <span style={{ color, opacity: 0.9 }}>©</span>}
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
              style={{ background: '#0D6B52', color: 'white' }}
            >
              {publishing ? 'Publishing…' : published ? '↺ Re-publish Teams' : 'Publish Teams'}
            </button>
          )}

          {/* Finalise & Export section */}
          {teamsToShow.length > 0 && (
            <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #2e2e2e' }}>
              <div className="px-4 py-3" style={{ background: '#141414', borderBottom: '1px solid #2e2e2e' }}>
                <p className="text-xs uppercase tracking-widest font-semibold" style={{ color: '#555' }}>
                  Finalise & Export
                </p>
              </div>
              <div className="p-4 space-y-2.5" style={{ background: '#0f0f0f' }}>
                <button
                  onClick={() => copyToClipboard(buildWhatsAppText(teamsToShow, nextThursday), 'whatsapp')}
                  className="w-full py-3 rounded-xl font-semibold text-sm"
                  style={{
                    background: copied === 'whatsapp' ? '#0a1a10' : '#1a2e1a',
                    color: copied === 'whatsapp' ? '#4ade80' : '#0D6B52',
                    border: '1px solid #0D6B52',
                  }}
                >
                  {copied === 'whatsapp' ? '✓ Copied!' : '📋 Copy Team Sheet for WhatsApp'}
                </button>
                <button
                  onClick={() => copyToClipboard(buildFlatList(teamsToShow), 'flat')}
                  className="w-full py-3 rounded-xl font-semibold text-sm"
                  style={{
                    background: copied === 'flat' ? '#0a1a10' : '#141414',
                    color: copied === 'flat' ? '#4ade80' : '#888',
                    border: '1px solid #2e2e2e',
                  }}
                >
                  {copied === 'flat' ? '✓ Copied!' : '📝 Copy Flat Player List'}
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
            style={{ background: '#141414', border: '1px solid #2e2e2e', maxWidth: 430 }}
            onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-white mb-0.5">
              Swap {swapModal.player.name} {swapModal.player.surname}
            </h3>
            <p className="text-xs mb-4" style={{ color: '#666' }}>Select a player to swap with</p>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {draftTeams.map((team, teamIdx) => {
                if (teamIdx === swapModal.fromTeamIdx) return null
                const color = TEAM_COLORS[teamIdx % TEAM_COLORS.length]
                return team.players.map(p => (
                  <button
                    key={p.id}
                    onClick={() => swapPlayers(swapModal.fromTeamIdx, swapModal.player, teamIdx, p)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl text-left"
                    style={{ background: '#1e1e1e', border: '1px solid #2e2e2e' }}
                  >
                    <PlayerAvatar profile={p} size={32} />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-white">{p.name} {p.surname}</p>
                      <p className="text-xs" style={{ color }}>{team.name}</p>
                    </div>
                  </button>
                ))
              })}
            </div>
            <button
              onClick={() => setSwapModal(null)}
              className="w-full mt-3 py-2.5 rounded-xl text-sm"
              style={{ background: '#1e1e1e', color: '#666', border: '1px solid #2e2e2e' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
