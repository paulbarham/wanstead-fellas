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

// TEMPLATE roster — replace with your travellers. In local preview mode the
// "identity" used for the managed check is the seat id, so a no-device member
// points their manager_email at the managing adult's seat id.
export const DEFAULT_FAMILY: Member[] = [
  { id: 'seat-1', display_name: 'You', avatar_url: null, age_group: 'adult', color: '#0e3a48' },
  { id: 'seat-2', display_name: 'Partner', avatar_url: null, age_group: 'adult', color: '#4a8896' },
  { id: 'seat-3', display_name: 'Child 1', avatar_url: null, age_group: 'teen', color: '#e08853' },
  { id: 'seat-4', display_name: 'Child 2', avatar_url: null, age_group: 'child', color: '#7a9e5e', manager_email: 'seat-1' },
]

/** The travellers, for the "Who's coming" display (independent of who has
 *  signed in). Give a `note` for anyone sharing a device. */
export interface Traveller {
  name: string
  color: string
  note?: string
}

export const TRAVELLERS: Traveller[] = [
  { name: 'You', color: '#0e3a48' },
  { name: 'Partner', color: '#4a8896' },
  { name: 'Child 1', color: '#e08853' },
  { name: 'Child 2', color: '#c86c3a', note: 'no phone' },
]

/** First initial(s) for the avatar dot. */
export function initials(name: string): string {
  const cleaned = name.replace(/\(.*?\)/g, '').trim()
  const parts = cleaned.split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
