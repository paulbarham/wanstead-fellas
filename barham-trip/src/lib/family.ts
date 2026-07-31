// The Barham family "seats". These placeholder rows drive the app in local-only
// mode and act as the fallback roster when the `members` table is empty. Paul's
// seed script (scripts/seed_family.ts) writes the real names, emails and avatars
// into Supabase, which then take precedence.
export type AgeGroup = 'adult' | 'teen' | 'child'

export interface Member {
  id: string
  display_name: string
  avatar_url: string | null
  age_group: AgeGroup
  color: string
  /** If set, this member has no device of their own and is managed by the
   *  member with this id (e.g. Tobias & Niyah sit under Paul). That managing
   *  adult can set their day RSVPs from their own login. */
  managed_by?: string | null
}

// Real family: four with their own email (magic-link sign-in) + two phone-less
// members managed under Paul. IDs here are local-preview stand-ins; the seed
// script replaces them with real auth user ids.
export const DEFAULT_FAMILY: Member[] = [
  { id: 'seat-paul', display_name: 'Paul', avatar_url: null, age_group: 'adult', color: '#0e3a48' },
  { id: 'seat-nichola', display_name: 'Nichola', avatar_url: null, age_group: 'adult', color: '#4a8896' },
  { id: 'seat-amelia', display_name: 'Amelia', avatar_url: null, age_group: 'teen', color: '#e08853' },
  { id: 'seat-marley', display_name: 'Marley', avatar_url: null, age_group: 'teen', color: '#c86c3a' },
  { id: 'seat-tobias', display_name: 'Tobias', avatar_url: null, age_group: 'child', color: '#7a9e5e', managed_by: 'seat-paul' },
  { id: 'seat-niyah', display_name: 'Niyah', avatar_url: null, age_group: 'child', color: '#b5657e', managed_by: 'seat-paul' },
]

/** First initial(s) for the avatar dot. */
export function initials(name: string): string {
  const cleaned = name.replace(/\(.*?\)/g, '').trim()
  const parts = cleaned.split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
