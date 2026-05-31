import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useTheme } from '../hooks/useTheme'
import { supabase } from '../lib/supabase'
import type { Profile, Team, TeamPlayer, Match } from '../types'
import { getNextThursdayDate } from '../lib/time'
import AdminTeamBuilder from '../components/AdminTeamBuilder'
import CeefaxHeader from '../components/CeefaxHeader'

interface TeamWithPlayers extends Team {
  players: Profile[]
  captain: Profile | null
}

const TEAM_COLORS = ['#1E3A5F', '#14532D', '#7C2D12', '#4C1D95']

const stripFC = (s?: string) => (s ?? '').replace(/\s+(FC|XI)$/, '')

export default function TeamsPage() {
  const { profile } = useAuth()
  const { theme } = useTheme()
  const [match, setMatch] = useState<Match | null>(null)
  const [teams, setTeams] = useState<TeamWithPlayers[]>([])
  const [loading, setLoading] = useState(true)
  const nextThursday = getNextThursdayDate()

  const fetchTeams = useCallback(async () => {
    const { data: matchData } = await supabase
      .from('matches').select('*').eq('match_date', nextThursday).single()

    if (!matchData) { setLoading(false); return }
    setMatch(matchData as Match)

    if (matchData.status !== 'published' && !profile?.is_admin) { setLoading(false); return }

    const { data: teamsData } = await supabase
      .from('teams').select('*').eq('match_id', matchData.id)

    if (!teamsData || teamsData.length === 0) { setLoading(false); return }

    const { data: tpData } = await supabase
      .from('team_players').select('*').in('team_id', teamsData.map((t: Team) => t.id))

    const playerIds = [...new Set((tpData as TeamPlayer[] || []).map(tp => tp.player_id))]
    const captainIds = teamsData.map((t: Team) => t.captain_id).filter(Boolean)
    const allIds = [...new Set([...playerIds, ...captainIds])]

    let playersData: Profile[] = []
    if (allIds.length > 0) {
      const { data } = await supabase
        .from('profiles').select('id, name, surname, photo_url, overall_rating, badges, age_group').in('id', allIds)
      playersData = (data as Profile[]) || []
    }

    const enriched: TeamWithPlayers[] = teamsData.map((t: Team) => {
      const teamPlayerIds = (tpData as TeamPlayer[] || []).filter(tp => tp.team_id === t.id).map(tp => tp.player_id)
      return {
        ...t,
        players: playersData.filter(p => teamPlayerIds.includes(p.id)),
        captain: playersData.find(p => p.id === t.captain_id) ?? null,
      }
    })

    setTeams(enriched)
    setLoading(false)
  }, [nextThursday, profile?.is_admin])

  useEffect(() => { fetchTeams() }, [fetchTeams])

  if (loading) {
    return <div className="px-4 py-5 text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading teams…</div>
  }

  if (profile?.is_admin) {
    return <AdminTeamBuilder nextThursday={nextThursday} match={match} publishedTeams={teams} onPublished={fetchTeams} />
  }

  return (
    <div className="px-4 pt-4 pb-4">
      <CeefaxHeader
        pageId="P201 · TEAM SHEET"
        title="TEAMS"
        meta={teams.length > 0 ? `${teams.length} TEAMS · THIS THURSDAY` : 'AWAITING PUBLISH'}
      />

      {teams.length === 0 ? (
        <div className="text-center py-16" style={{ color: '#444' }}>
          <p className="text-4xl mb-3">👥</p>
          <p className="font-semibold text-[var(--color-text)] mb-1">Teams not published yet</p>
          <p className="text-sm">Check back closer to Thursday</p>
        </div>
      ) : (
        <div className="space-y-3">
          {teams.map((team, idx) => {
            const color = TEAM_COLORS[idx % TEAM_COLORS.length]
            const isMyTeam = team.players.some(p => p.id === profile?.id)
            return (
              <div key={team.id}
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
                    <h2 className="font-display"
                      style={{
                        fontSize: 24,
                        lineHeight: 1.05,
                        color: '#FFFFFF',
                        letterSpacing: '0.02em',
                        wordBreak: 'normal',
                        overflowWrap: 'break-word',
                      }}>
                      {stripFC(team.name)}
                    </h2>
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    {isMyTeam && (
                      <span style={{
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: '0.5px',
                        padding: '4px 8px',
                        borderRadius: 999,
                        background: 'rgba(255,255,255,0.22)',
                        color: '#FFFFFF',
                      }}>
                        YOU
                      </span>
                    )}
                    <span style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.6px',
                      padding: '4px 10px',
                      borderRadius: 999,
                      background: team.bibs ? '#F59E0B' : '#3B82F6',
                      color: '#FFFFFF',
                    }}>
                      {team.bibs ? 'BIBS' : 'SKINS'}
                    </span>
                  </div>
                </div>

                {/* Player pills */}
                <div className="flex flex-wrap gap-1.5"
                  style={{ background: 'var(--color-team-card-body)', padding: 16 }}>

                  {[...team.players].sort((a, b) =>
                    `${a.name} ${a.surname}`.localeCompare(`${b.name} ${b.surname}`, undefined, { sensitivity: 'base' })
                  ).map(p => {
                    const isCap = p.id === team.captain_id
                    const isDark = theme === 'dark'
                    // Dark: captain bg = white@20%, others = team@15%, text = white.
                    // Light: captain bg = team@20%, others = team@10%, text = team colour.
                    const pillBg = isDark
                      ? (isCap ? 'rgba(255,255,255,0.20)' : `${color}26`)
                      : (isCap ? `${color}33` : `${color}1A`)
                    const pillText = isDark ? '#FFFFFF' : color
                    return (
                      <div
                        key={p.id}
                        className="inline-flex items-center gap-1.5 rounded-lg"
                        style={{
                          background: pillBg,
                          color: pillText,
                          border: `1px solid ${color}80`,
                          padding: '6px 10px',
                          fontSize: 12,
                          fontWeight: isCap ? 600 : 500,
                          maxWidth: '100%',
                        }}
                      >
                        {isCap && (
                          <span
                            aria-hidden
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: 14,
                              height: 14,
                              borderRadius: '50%',
                              background: '#FFFFFF',
                              color,
                              fontSize: 9,
                              fontWeight: 700,
                              lineHeight: 1,
                              flexShrink: 0,
                            }}
                          >
                            ©
                          </span>
                        )}
                        <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{p.surname}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
