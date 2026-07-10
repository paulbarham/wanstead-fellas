export type PlayerType = 'subscribed' | 'wtp_priority' | 'wtp'

export type PlayerPosition = 'GK' | 'DF' | 'MF' | 'ST'

// Four-position taxonomy used for player-set preferred positions (vs the
// legacy admin-set `position` column which uses GK/DF/MF/ST). Kept separate
// so we can roll out without forcing a backfill of the legacy column.
export type PreferredPosition = 'GK' | 'DEF' | 'MID' | 'ATT'

export const PREFERRED_POSITIONS: { value: PreferredPosition; label: string; icon: string; full: string }[] = [
  { value: 'GK',  label: 'GK',  icon: '🧤', full: 'Goalkeeper' },
  { value: 'DEF', label: 'DEF', icon: '🛡️', full: 'Defender' },
  { value: 'MID', label: 'MID', icon: '⚙️', full: 'Midfielder' },
  { value: 'ATT', label: 'ATT', icon: '⚽', full: 'Attacker' },
]

// Preferred foot — player-set on Profile page. Balancer input long-term:
// spread lefties across teams so at least one side gets natural width.
export type PreferredFoot = 'left' | 'right' | 'both'

export const PREFERRED_FEET: { value: PreferredFoot; label: string; icon: string; full: string }[] = [
  { value: 'left',  label: 'L',    icon: '🦶', full: 'Left foot'  },
  { value: 'right', label: 'R',    icon: '🦶', full: 'Right foot' },
  { value: 'both',  label: 'BOTH', icon: '⚖️', full: 'Both feet'  },
]

export type CuntTier = 'saint' | 'gentleman' | 'scamp' | 'nuisance' | 'cunt'

export type League = 'premier_league' | 'championship' | 'league_one'

export interface Club {
  slug: string
  display_name: string
  league: League
  primary_color: string
  secondary_color: string
  glyph: string
}

export interface Profile {
  id: string
  auth_user_id?: string | null
  name: string
  surname: string
  age_group: string
  dob: string | null
  photo_url: string | null
  overall_rating: number
  sp: number
  sk: number
  st: number
  tk: number
  ps: number
  ag: number
  phy: number
  cp: number
  wr: number
  cunt: number
  badges: string[]
  is_admin: boolean
  // Delegate permission: enter full-time scores + goal scorers. Grants
  // write access to fixtures/goals/results/matches.status only. Does NOT
  // grant any other admin capability.
  can_enter_results?: boolean
  player_type: PlayerType
  created_at: string
  // Phase 2 card stats (nullable — older profiles may be blank)
  card_pace: number | null
  card_shooting: number | null
  card_passing: number | null
  card_dribbling: number | null
  card_defence: number | null
  card_physicality: number | null
  gk_pace: number | null
  gk_reflexes: number | null
  gk_handling: number | null
  gk_distribution: number | null
  gk_positioning: number | null
  gk_physicality: number | null
  favourite_club: string | null
  position: PlayerPosition | null
  // Player-set, owned by the player on their Profile page. May be null
  // while we wait for the squad to pick. See PreferredPosition type.
  preferred_position_primary: PreferredPosition | null
  preferred_position_secondary: PreferredPosition | null
  // Player-set. Nullable until the player picks one — the Next Game
  // nudge prompts unset players until they set it or dismiss for the
  // session. Balancer will eventually use it as a soft constraint.
  preferred_foot: PreferredFoot | null
  cunt_tier: CuntTier | null
  // Optional: not every profile object is loaded with this column. The Match
  // Fitness panel does NOT depend on it for visibility (only for a badge).
  fitness_source?: 'tracked' | 'manual' | null
}

export interface FitnessHrZones {
  min_hr?: number | null
  unit?: string | null
  bands?: Record<string, number> | null
}

export interface FitnessSession {
  id: string
  profile_id: string
  match_date: string | null
  source: string | null
  external_id: string | null
  recorded_start: string | null
  // numeric columns arrive from supabase-js as strings
  distance_m: number | string | null
  duration_s: number | null
  avg_hr: number | null
  max_hr: number | null
  hr_zones: FitnessHrZones | null
  avg_speed_kmh: number | string | null
  max_speed_kmh: number | string | null
  calories: number | null
  training_load: number | string | null
  raw: Record<string, unknown> | null
}

// Read-only suggestions derived from fitness_sessions (player_fitness_suggestions view).
// Suggests PHYSICAL base attrs only: Pace (sp), Stamina (st), Work rate (wr).
export interface FitnessSuggestion {
  profile_id: string
  sessions_count: number
  last_session: string | null
  top_speed_kmh: number | string | null
  dist_per_hr_m: number | string | null
  sprint_per_min: number | string | null
  avg_hr: number | string | null
  tracked_n: number
  method: 'relative' | 'absolute'
  sp_suggested: number | null
  st_suggested: number | null
  wr_suggested: number | null
  confidence: 'low' | 'medium' | 'high'
}

export interface Availability {
  id: string
  player_id: string
  match_date: string
  status: 'confirmed' | 'waiting'
  created_at: string
}

export interface Match {
  id: string
  match_date: string
  format: string
  status: string
  created_at: string
}

export interface Team {
  id: string
  match_id: string
  name: string
  captain_id: string | null
  bibs: boolean
}

export interface TeamPlayer {
  id: string
  team_id: string
  player_id: string
}

export interface Fixture {
  id: string
  match_id: string
  team1_id: string
  team2_id: string
  score1: number | null
  score2: number | null
  // Penalty-shootout winner for a drawn fixture: 1 = team1, 2 = team2,
  // null = no shootout (not a draw, or not yet recorded). See migration 035.
  shootout_winner: number | null
}

export interface PredictionRow {
  position: string
  predicted: string
  actual: string
}

export interface ReportPredictions {
  rows: PredictionRow[]
  note?: string | null
}

export interface ReportNoteItem {
  label?: string | null
  player?: string | null
  note?: string | null
}

export interface ReportFinesAdmin {
  headline?: string | null
  items?: string[] | null
  redemption?: string | null
  footer?: string | null
}

export interface Result {
  id: string
  match_id: string
  report_text: string | null
  scorers: string | null
  highlights: string | null
  summary: string | null
  predictions: ReportPredictions | null
  key_highlights: ReportNoteItem[] | null
  fines_admin: ReportFinesAdmin | null
  banter: ReportNoteItem[] | null
  app_watch: ReportNoteItem[] | null
  conclusion: string | null
  closer: string | null
  created_at: string
}

export interface Feedback {
  id: string
  player_id: string
  category: string
  subject: string
  message: string
  reviewed: boolean
  created_at: string
}

export type FineType = 'late' | 'lost_ball' | 'cuntiness' | 'dropout'

export const FINE_TYPES: { value: FineType; label: string; amount: number }[] = [
  { value: 'late', label: 'Late', amount: 2 },
  { value: 'lost_ball', label: 'Lost Ball', amount: 3 },
  { value: 'cuntiness', label: 'Cuntiness', amount: 5 },
  { value: 'dropout', label: 'Drop Out', amount: 2 },
]

export interface Fine {
  id: string
  player_id: string
  match_date: string | null
  type: FineType
  amount: number
  notes: string | null
  paid: boolean
  created_at: string
}

export interface WtpGame {
  id: string
  player_id: string
  match_date: string
  amount: number
  paid: boolean
  created_at: string
}

// Player credit balance — overpayments and goodwill. Subtracts from
// outstanding to give the net balance shown in finance views.
export interface Credit {
  id: string
  player_id: string
  amount: number
  notes: string | null
  created_at: string
}

export interface LinkedProfile {
  id: string
  parent_id: string
  child_id: string
  created_at: string
}

export type AwardType = 'motm' | 'dotd'

export interface Vote {
  id: string
  match_id: string
  award_type: AwardType
  voter_id: string
  nominee_id: string
  created_at: string
  updated_at: string
}

export interface AwardResult {
  id: string
  match_id: string
  award_type: AwardType
  player_id: string
  vote_count: number
  total_votes: number
  is_shared: boolean
  is_admin_override: boolean
  published_at: string
}

export interface VotingWindow {
  match_id: string
  opens_at: string
  closes_at: string
  results_published: boolean
  created_at: string
}

export interface TopScorerRow {
  player_id: string
  total_goals: number
  goals_this_season: number | null
}

export interface AppearanceRow {
  player_id: string
  appearances: number
  appearances_this_season: number | null
}

export type BadgeType = 'Super Sharp Shooter' | 'Legend' | 'Captain'

export type TierType = 'gold' | 'silver' | 'bronze' | 'standard'

export function getTier(overall: number): TierType {
  if (overall >= 9) return 'gold'
  if (overall >= 8) return 'silver'
  if (overall >= 7) return 'bronze'
  return 'standard'
}

export function calcStrength(p: Profile): number {
  return Math.round((p.phy + p.ag) / 2)
}

export function calcTeamPlayer(p: Profile): number {
  return Math.round((p.ps + p.wr + p.cp) / 3)
}

export function calcTechnical(p: Profile): number {
  return Math.round((p.sk + p.ps + p.cp) / 3)
}
