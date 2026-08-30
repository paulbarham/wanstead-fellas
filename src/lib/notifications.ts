// Notification categories — the single client-side source of truth, mirroring
// the boolean columns on public.notification_preferences (mig 081).
//
// Five categories rather than one toggle per push. We send 8 distinct pushes
// today and have another ~9 queued on the roadmap; a wall of 17 switches is a
// screen nobody reads, and the failure mode of an unread settings screen is
// people killing notifications at the OS level instead.

export type NotificationCategory =
  | 'match_night'
  | 'results'
  | 'games'
  | 'money'
  | 'club_news'

export interface CategoryMeta {
  key: NotificationCategory
  emoji: string
  label: string
  /** What actually lands on your phone if this is on. Concrete, not abstract. */
  blurb: string
}

export const NOTIFICATION_CATEGORIES: CategoryMeta[] = [
  {
    key: 'match_night',
    emoji: '⚽',
    label: 'Match night',
    blurb: 'Teams are up, tonight’s theme, sign-up reminders.',
  },
  {
    key: 'results',
    emoji: '🏆',
    label: 'Results & awards',
    blurb: 'Voting opens after full time, then the match report and MOTM/DOTD.',
  },
  {
    key: 'games',
    emoji: '🎯',
    label: 'Predictor games',
    blurb: 'Match of the Week fixtures and results, Season Card updates.',
  },
  {
    key: 'money',
    emoji: '💷',
    label: 'Money',
    blurb: 'Pay-to-play charges, fines and subs.',
  },
  {
    key: 'club_news',
    emoji: '📣',
    label: 'Club news',
    blurb: 'New features, the monthly round-up, general announcements.',
  },
]

export type NotificationPrefs = Record<NotificationCategory, boolean>

/** No row in the table means everything is on. Keep this in step with mig 081. */
export const DEFAULT_PREFS: NotificationPrefs = {
  match_night: true,
  results: true,
  games: true,
  money: true,
  club_news: true,
}

/**
 * Pushes that are never filtered by preference, and so are never shown as a
 * toggle. These tell a fella he is playing in a few hours — if he could mute
 * them we'd be a man short on Thursday. Enforced server-side by calling
 * push_targets() with a null category; this list is only the UI copy.
 */
export const ALWAYS_ON_COPY =
  'You’ll always be told if you’re called up for a game — swapped in for a dropout, ' +
  'or moved up off the waiting list. Those can’t be switched off.'
