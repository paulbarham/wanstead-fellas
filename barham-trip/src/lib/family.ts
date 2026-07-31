// The six family "seats". These placeholder names/colours drive the app in
// local-only mode and act as the fallback roster when the `members` table is
// empty. Paul's seed script (scripts/seed_family.ts) writes the real names,
// emails and avatars into Supabase, which then take precedence.
export type AgeGroup = 'adult' | 'teen' | 'child'

export interface Member {
  id: string
  display_name: string
  avatar_url: string | null
  age_group: AgeGroup
  color: string
}

/** Local-mode / fallback roster: two adults, two teens, twin 9-year-olds. */
export const DEFAULT_FAMILY: Member[] = [
  { id: 'seat-paul', display_name: 'Paul', avatar_url: null, age_group: 'adult', color: '#0e3a48' },
  { id: 'seat-sam', display_name: 'Sam', avatar_url: null, age_group: 'adult', color: '#4a8896' },
  { id: 'seat-jack', display_name: 'Jack (17)', avatar_url: null, age_group: 'teen', color: '#e08853' },
  { id: 'seat-ella', display_name: 'Ella (15)', avatar_url: null, age_group: 'teen', color: '#c86c3a' },
  { id: 'seat-leo', display_name: 'Leo (9)', avatar_url: null, age_group: 'child', color: '#7a9e5e' },
  { id: 'seat-mia', display_name: 'Mia (9)', avatar_url: null, age_group: 'child', color: '#b5657e' },
]

/** First initial(s) for the avatar dot. */
export function initials(name: string): string {
  const cleaned = name.replace(/\(.*?\)/g, '').trim()
  const parts = cleaned.split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
