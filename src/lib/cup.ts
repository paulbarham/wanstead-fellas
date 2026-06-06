// Cup Predictor: types + helpers shared across the cup pages.
// One-point-per-correct-outcome predictor open to any profile. Group games
// take a three-way pick (team1 / draw / team2); knockouts take a six-way
// (team_N in 90 / extra-time / penalties for N in {1,2}). Locks five minutes
// before kickoff (admin can still post-edit on the admin page).

export type CupStage =
  | 'group_a' | 'group_b' | 'group_c' | 'group_d'
  | 'group_e' | 'group_f' | 'group_g' | 'group_h'
  | 'group_i' | 'group_j' | 'group_k' | 'group_l'
  | 'r32' | 'r16' | 'qf' | 'sf' | 'third_place' | 'final'

export interface CupMatch {
  id: string
  stage: CupStage
  group_letter: string | null
  team1: string
  team2: string
  kickoff: string
  venue: string | null
  is_knockout: boolean
  actual_outcome: string | null
  score1: number | null
  score2: number | null
  created_at: string
}

export interface CupPrediction {
  id: string
  match_id: string
  player_id: string
  pick: string
  points_awarded: number | null
  created_at: string
  updated_at: string
}

// 2026 tournament window — used by the layout to decide whether the bottom
// nav surfaces Cup or More in the fifth slot.
export const TOURNAMENT_START = new Date('2026-06-11T00:00:00Z')
export const TOURNAMENT_END = new Date('2026-07-20T00:00:00Z')

export function isTournamentActive(now: Date = new Date()): boolean {
  return now >= TOURNAMENT_START && now < TOURNAMENT_END
}

export const LOCK_MINUTES_BEFORE_KO = 5

export function isLocked(match: Pick<CupMatch, 'kickoff'>, now: Date = new Date()): boolean {
  const ko = new Date(match.kickoff).getTime()
  return now.getTime() >= ko - LOCK_MINUTES_BEFORE_KO * 60_000
}

const KO_LABELS: Record<string, string> = {
  r32: 'ROUND OF 32', r16: 'ROUND OF 16', qf: 'QUARTER FINAL',
  sf: 'SEMI FINAL', third_place: 'THIRD-PLACE PLAYOFF', final: 'FINAL',
}
const KO_PAGE_IDS: Record<string, string> = {
  r32: 'P914', r16: 'P915', qf: 'P916', sf: 'P917', third_place: 'P918', final: 'P919',
}

// Stage display labels — used in page headers and the predict UI.
export function stageLabel(stage: CupStage): string {
  if (stage.startsWith('group_')) return `GROUP ${stage.slice(-1).toUpperCase()}`
  return KO_LABELS[stage] ?? stage.toUpperCase()
}

// Stage → teletext page ID, so each round has its own discoverable page
// (P902-P913 = groups A-L, P914 = R32, P915 = R16, P916 = QF, P917 = SF,
// P918 = 3rd, P919 = FINAL).
export function stagePageId(stage: CupStage): string {
  if (stage.startsWith('group_')) {
    const letterIdx = stage.charCodeAt(6) - 'a'.charCodeAt(0)
    return `P${902 + letterIdx}`
  }
  return KO_PAGE_IDS[stage] ?? 'P900'
}

// Group-stage outcomes are simple.
export const GROUP_OUTCOMES = ['team1', 'draw', 'team2'] as const
export type GroupOutcome = (typeof GROUP_OUTCOMES)[number]

// Knockout outcomes: which side wins and how.
export const KO_OUTCOMES = [
  'team1_90', 'team1_et', 'team1_pen',
  'team2_90', 'team2_et', 'team2_pen',
] as const
export type KnockoutOutcome = (typeof KO_OUTCOMES)[number]

export function knockoutSide(outcome: KnockoutOutcome): 1 | 2 {
  return outcome.startsWith('team1') ? 1 : 2
}
export function knockoutMode(outcome: KnockoutOutcome): '90' | 'et' | 'pen' {
  return outcome.endsWith('_pen') ? 'pen' : outcome.endsWith('_et') ? 'et' : '90'
}
export function knockoutModeLabel(mode: '90' | 'et' | 'pen'): string {
  return mode === '90' ? 'NORMAL' : mode === 'et' ? 'EXTRA TIME' : 'PENALTIES'
}

// Renders a pick (which we store as a raw string) back into a human label.
export function pickLabel(pick: string, match: Pick<CupMatch, 'team1' | 'team2' | 'is_knockout'>): string {
  if (!match.is_knockout) {
    if (pick === 'draw') return 'Draw'
    if (pick === 'team1') return match.team1
    if (pick === 'team2') return match.team2
    return pick
  }
  const side = pick.startsWith('team1') ? match.team1 : match.team2
  const mode = pick.endsWith('_pen') ? 'pens' : pick.endsWith('_et') ? 'ET' : '90 min'
  return `${side} (${mode})`
}
