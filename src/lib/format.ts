import type { Profile, PlayerType } from '../types'

// Team names are stored with an "FC"/"XI" suffix; strip it for compact display.
export const stripFC = (s?: string) => (s ?? '').replace(/\s+(FC|XI)$/, '')

export interface MatchConfig {
  total: number
  numTeams: number
  teamSize: number
}

export const VALID_CONFIGS: MatchConfig[] = [
  { total: 36, numTeams: 4, teamSize: 9 },
  { total: 32, numTeams: 4, teamSize: 8 },
  { total: 28, numTeams: 4, teamSize: 7 },
  { total: 24, numTeams: 4, teamSize: 6 },
  { total: 22, numTeams: 2, teamSize: 11 },
  { total: 20, numTeams: 4, teamSize: 5 },
  { total: 18, numTeams: 2, teamSize: 9 },
  { total: 16, numTeams: 2, teamSize: 8 },
  { total: 14, numTeams: 2, teamSize: 7 },
  { total: 12, numTeams: 2, teamSize: 6 },
  { total: 10, numTeams: 2, teamSize: 5 },
]

export function pickConfig(count: number): MatchConfig | null {
  return VALID_CONFIGS.find(c => count >= c.total) ?? null
}

export function formatLabelFor(config: MatchConfig | null): string {
  if (!config) return '—'
  return `${config.teamSize}v${config.teamSize}`
}

const DEFER_ORDER: PlayerType[] = ['wtp', 'wtp_priority', 'subscribed']

export interface PlayerWithSignup {
  player: Profile
  createdAt: string
}

export function splitPlayingAndReserves(
  candidates: PlayerWithSignup[],
  targetSize: number,
): { playing: PlayerWithSignup[]; reserves: PlayerWithSignup[] } {
  if (candidates.length <= targetSize) {
    return { playing: candidates, reserves: [] }
  }
  const surplus = candidates.length - targetSize
  const ranked: PlayerWithSignup[] = []
  for (const type of DEFER_ORDER) {
    const group = candidates
      .filter(c => (c.player.player_type ?? 'wtp') === type)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    ranked.push(...group)
  }
  const reserves = ranked.slice(0, surplus)
  const reserveIds = new Set(reserves.map(r => r.player.id))
  const playing = candidates.filter(c => !reserveIds.has(c.player.id))
  return { playing, reserves }
}
