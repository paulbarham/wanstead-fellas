import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import type { Profile, Team, TeamPlayer, Match } from '../types'
import { getNextThursdayDate } from '../lib/time'
import AdminTeamBuilder from '../components/AdminTeamBuilder'

interface TeamWithPlayers extends Team {
  players: Profile[]
  captain: Profile | null
}

const TEAM_COLORS = ['#0D6B52', '#1d4ed8', '#b45309', '#9f1239']

export default function TeamsPage() {
  const { profile } = useAuth()
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
    return <div className="px-4 py-5 text-sm" style={{ color: '#666' }}>Loading teams…</div>
  }

  if (profile?.is_admin) {
    return <AdminTeamBuilder nextThursday={nextThursday} match={match} publishedTeams={teams} onPublished={fetchTeams} />
  }

  return (
    <div className="px-4 pt-4 pb-4">
      <p className="text-xs font-medium uppercase tracking-widest mb-0.5" style={{ color: '#0D6B52' }}>Teams</p>
      <h1 className="font-display text-2xl text-white tracking-wide mb-4">THIS THURSDAY</h1>

      {teams.length === 0 ? (
        <div className="text-center py-16" style={{ color: '#444' }}>
          <p className="text-4xl mb-3">👥</p>
          <p className="font-semibold text-white mb-1">Teams not published yet</p>
          <p className="text-sm">Check back closer to Thursday</p>
        </div>
      ) : (
        <div className="space-y-3">
          {teams.map((team, idx) => {
            const color = TEAM_COLORS[idx % TEAM_COLORS.length]
            const isMyTeam = team.players.some(p => p.id === profile?.id)
            return (
              <div key={team.id} className="rounded-2xl overflow-hidden"
                style={{ border: `1px solid ${color}55` }}>

                {/* Coloured header */}
                <div className="px-4 py-3 flex items-center justify-between"
                  style={{ background: color }}>
                  <div>
                    <h2 className="font-display text-white tracking-wide" style={{ fontSize: '1.05rem', lineHeight: 1.1 }}>
                      {team.name}
                    </h2>
                    {team.captain && (
                      <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.75)' }}>
                        © {team.captain.name} {team.captain.surname}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isMyTeam && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                        style={{ background: 'rgba(255,255,255,0.2)', color: 'white' }}>
                        You
                      </span>
                    )}
                    <span className="text-xs px-2.5 py-1 rounded-full font-semibold"
                      style={{ background: 'rgba(0,0,0,0.35)', color: 'white', border: '1px solid rgba(255,255,255,0.2)' }}>
                      {team.bibs ? '🟡 BIBS' : '⬜ SKINS'}
                    </span>
                  </div>
                </div>

                {/* Player pills */}
                <div className="p-3 flex flex-wrap gap-1.5" style={{ background: '#111' }}>
                  {team.players.map(p => {
                    const isCap = p.id === team.captain_id
                    const isMe = p.id === profile?.id
                    return (
                      <div
                        key={p.id}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium"
                        style={{
                          background: isMe ? `${color}33` : isCap ? '#1e1e1e' : '#1a1a1a',
                          color: isMe ? 'white' : isCap ? '#ddd' : '#999',
                          border: `1px solid ${isMe ? color : isCap ? '#3e3e3e' : '#252525'}`,
                        }}
                      >
                        {p.surname}
                        {isCap && <span style={{ color, fontSize: '0.65rem', marginLeft: 2 }}>©</span>}
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
