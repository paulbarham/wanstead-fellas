import { useEffect, useState, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import type { Profile, Team, TeamPlayer, Match } from '../types'
import { getNextThursdayDate } from '../lib/time'
import AdminTeamBuilder from '../components/AdminTeamBuilder'
import CeefaxHeader from '../components/CeefaxHeader'
import FormationPicker from '../components/FormationPicker'
import DropoutButton from '../components/DropoutButton'
import BestDuoCaption from '../components/BestDuoCaption'
import { stripFC } from '../lib/format'

interface TeamWithPlayers extends Team {
  players: Profile[]
  captain: Profile | null
}

// Player is a debutant when they've never been picked for a match earlier
// than the one we're displaying. Mirrors the logic in AdminTeamBuilder that
// drives the WhatsApp export's 🆕 DEBUT tag — same source view, same rule —
// so the in-app team list stays consistent with the exported one.
async function fetchDebutantIds(playerIds: string[], matchDate: string): Promise<Set<string>> {
  if (playerIds.length === 0) return new Set()
  const { data, error } = await supabase
    .from('v_player_match_history')
    .select('player_id, first_match_date')
    .in('player_id', playerIds)
  if (error) return new Set()
  const veterans = new Set<string>()
  for (const row of (data ?? []) as Array<{ player_id: string; first_match_date: string | null }>) {
    if (row.first_match_date && row.first_match_date < matchDate) veterans.add(row.player_id)
  }
  return new Set(playerIds.filter(id => !veterans.has(id)))
}

export default function TeamsPage() {
  const { profile } = useAuth()
  const [searchParams] = useSearchParams()
  // Admin normally redirects to AdminTeamBuilder on this route. ?view=formations
  // bypasses that so admin can preview every team's roster + FormationPicker
  // exactly as a player sees it, from a single scrollable page.
  const adminPreviewMode = profile?.is_admin && searchParams.get('view') === 'formations'
  const [match, setMatch] = useState<Match | null>(null)
  const [teams, setTeams] = useState<TeamWithPlayers[]>([])
  const [debutantIds, setDebutantIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const nextThursday = getNextThursdayDate()

  const fetchTeams = useCallback(async () => {
    const { data: matchData } = await supabase
      .from('matches').select('*').eq('match_date', nextThursday).maybeSingle()

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

    // Admin needs the full profile (attributes, card_*, player_type, cunt) so
    // AdminTeamBuilder's predictTable and talking-points logic has the data it
    // needs. Non-admin team-sheet view only renders avatar / name / badges /
    // age, so keep that projection minimal.
    let playersData: Profile[] = []
    if (allIds.length > 0) {
      const projection = profile?.is_admin
        ? '*'
        : 'id, name, surname, photo_url, overall_rating, badges, age_group'
      const { data } = await supabase
        .from('profiles').select(projection).in('id', allIds)
      playersData = (data as unknown as Profile[]) || []
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

    // DEBUT tags — same view + rule as the WhatsApp export in AdminTeamBuilder.
    const debutants = await fetchDebutantIds(playerIds, matchData.match_date as string)
    setDebutantIds(debutants)

    setLoading(false)
  }, [nextThursday, profile?.is_admin])

  useEffect(() => { fetchTeams() }, [fetchTeams])

  if (loading) {
    return <div className="px-4 py-5 text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading teams…</div>
  }

  if (profile?.is_admin && !adminPreviewMode) {
    return <AdminTeamBuilder nextThursday={nextThursday} match={match} publishedTeams={teams} onPublished={fetchTeams} />
  }

  return (
    <div className="px-4 pt-4 pb-4">
      {adminPreviewMode && (
        <Link
          to="/teams"
          className="inline-block mb-2 text-xs"
          style={{ color: 'var(--tt-cyan)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}
        >
          ← BACK TO TEAM BUILDER
        </Link>
      )}
      <CeefaxHeader
        pageId="P201 · TEAM SHEET"
        title="TEAMS"
        meta={teams.length > 0 ? `${teams.length} TEAMS · THIS THURSDAY` : 'AWAITING PUBLISH'}
      />

      {teams.length === 0 ? (
        <div className="text-center py-16" style={{ color: 'var(--color-text-muted)' }}>
          <p className="text-4xl mb-3">👥</p>
          <p className="font-semibold text-[var(--color-text)] mb-1">Teams not published yet</p>
          <p className="text-sm">Check back closer to Thursday</p>
        </div>
      ) : (
        <div className="space-y-3">
          {teams.map((team) => {
            const isMyTeam = team.players.some(p => p.id === profile?.id)
            const sortedPlayers = [...team.players].sort((a, b) =>
              `${a.name} ${a.surname}`.localeCompare(`${b.name} ${b.surname}`, undefined, { sensitivity: 'base' })
            )
            return (
              <div key={team.id} className="space-y-3">
              <div
                className="rounded-xl"
                style={{ border: '1px solid var(--color-border)', backgroundClip: 'padding-box' }}>

                {/* Header band */}
                <div
                  className="flex items-center justify-between gap-3 px-4 py-3"
                  style={{
                    background: 'var(--color-surface-2)',
                    borderBottom: '1px solid var(--color-border)',
                    borderTopLeftRadius: 11, borderTopRightRadius: 11,
                  }}
                >
                  <h2
                    style={{
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--tt-yellow)',
                      fontSize: 14,
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                    }}
                  >
                    © {team.captain ? `${team.captain.name} ${team.captain.surname}` : stripFC(team.name)}
                  </h2>
                  <div className="flex items-center gap-2">
                    {isMyTeam && (
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
                        padding: '2px 6px', borderRadius: 3, background: 'var(--tt-green)', color: '#fff',
                      }}>
                        YOU
                      </span>
                    )}
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
                      padding: '2px 6px', borderRadius: 3,
                      background: team.bibs ? 'var(--tt-yellow)' : 'var(--color-text)',
                      color: team.bibs ? '#000' : 'var(--color-surface)',
                    }}>
                      {team.bibs ? 'BIBS' : 'SKINS'}
                    </span>
                  </div>
                </div>

                {/* Mono roster */}
                <div>
                  {sortedPlayers.map((p, i) => {
                    const isCap = p.id === team.captain_id
                    const isDebut = debutantIds.has(p.id)
                    return (
                      <div
                        key={p.id}
                        className="flex items-center gap-2 px-4 py-2"
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 13,
                          borderTop: i === 0 ? 'none' : '1px solid var(--color-border)',
                        }}
                      >
                        <span style={{ color: 'var(--color-text-muted)', fontSize: 11, width: 22 }}>
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <span className="flex-1 truncate" style={{ color: isCap ? 'var(--tt-yellow)' : 'var(--color-text)' }}>
                          {p.name} {p.surname}
                        </span>
                        {isDebut && (
                          <span
                            title="Debutant — first Wanstead Fellas appearance"
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: 9,
                              fontWeight: 700,
                              letterSpacing: '0.1em',
                              padding: '1px 5px',
                              borderRadius: 3,
                              background: 'var(--tt-cyan)',
                              color: '#fff',
                            }}
                          >
                            🆕 DEBUT
                          </span>
                        )}
                        {isCap && (
                          <span style={{ color: 'var(--tt-yellow)', fontSize: 12, fontWeight: 700 }}>©</span>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Best duo caption — self-hides when no pair meets the min */}
                <BestDuoCaption playerIds={sortedPlayers.map(p => p.id)} />
              </div>
              {(isMyTeam || adminPreviewMode) && (
                <FormationPicker
                  teamId={team.id}
                  teamName={team.name}
                  bibs={team.bibs}
                  editable
                />
              )}
              {isMyTeam && match && (
                <DropoutButton
                  matchId={match.id}
                  matchDate={match.match_date}
                  onDropout={fetchTeams}
                />
              )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
