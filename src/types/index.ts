export interface Profile {
  id: string
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
  created_at: string
}

export interface Availability {
  id: string
  player_id: string
  match_date: string
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
}

export interface Result {
  id: string
  match_id: string
  report_text: string | null
  scorers: string | null
  highlights: string | null
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
