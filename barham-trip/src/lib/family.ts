// The Barham family "seats". These placeholder rows drive the app in local-only
// mode and act as the fallback roster when the `members` table is empty. Once
// Supabase is connected, real rows (auto-provisioned on first sign-in + the
// seeded managed members) take precedence.
export type AgeGroup = 'adult' | 'teen' | 'child'

export interface Member {
  id: string
  display_name: string
  avatar_url: string | null
  age_group: AgeGroup
  color: string
  /** If set, this member has no device of their own and is managed by the adult
   *  whose identity (email in Supabase mode, seat id in local mode) matches this
   *  value. That adult can set their day RSVPs from their own login. */
  manager_email?: string | null
}

// Real family: four sign in with their own email (magic link); Tobias & Niyah
// have no device and sit under Paul. In local preview mode the "identity" used
// for the managed check is the seat id, so Tobias/Niyah point at 'seat-paul'.
export const DEFAULT_FAMILY: Member[] = [
  { id: 'seat-paul', display_name: 'Paul', avatar_url: null, age_group: 'adult', color: '#0e3a48' },
  { id: 'seat-nichola', display_name: 'Nichola', avatar_url: null, age_group: 'adult', color: '#4a8896' },
  { id: 'seat-amelia', display_name: 'Amelia', avatar_url: null, age_group: 'teen', color: '#e08853' },
  { id: 'seat-marley', display_name: 'Marley', avatar_url: null, age_group: 'teen', color: '#c86c3a' },
  { id: 'seat-tobias', display_name: 'Tobias', avatar_url: null, age_group: 'child', color: '#7a9e5e', manager_email: 'seat-paul' },
  { id: 'seat-niyah', display_name: 'Niyah', avatar_url: null, age_group: 'child', color: '#b5657e', manager_email: 'seat-paul' },
]

/** The six travellers, for the "Who's coming" display (independent of who has
 *  signed in). Tobias & Niyah have no phone and share Dad's. */
export interface Traveller {
  name: string
  color: string
  note?: string
}

export const TRAVELLERS: Traveller[] = [
  { name: 'Dad', color: '#0e3a48' },
  { name: 'Mum', color: '#4a8896' },
  { name: 'Marley', color: '#e08853' },
  { name: 'Mimi', color: '#c86c3a' },
  { name: 'Tobias', color: '#7a9e5e', note: "on Dad's phone" },
  { name: 'Niyah', color: '#b5657e', note: "on Dad's phone" },
]

/** First initial(s) for the avatar dot. */
export function initials(name: string): string {
  const cleaned = name.replace(/\(.*?\)/g, '').trim()
  const parts = cleaned.split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
