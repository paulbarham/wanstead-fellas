// Help centre article manifest. Content lives as .md files next to this
// file — imported via Vite's ?raw suffix so the strings ship in the
// bundle (no runtime fetch, works offline via the service worker).
//
// Add a new article: drop a .md file in this folder, import + register
// it below. Keep slugs URL-friendly and match the filename minus prefix
// for consistency.

import gettingStarted from './01-getting-started.md?raw'
import signingUp from './02-signing-up.md?raw'
import voting from './03-voting.md?raw'
import notifications from './04-notifications.md?raw'
import cupPredictor from './05-cup-predictor.md?raw'
import finances from './06-finances.md?raw'
import formations from './07-formations.md?raw'

export type HelpCategory = 'basics' | 'match' | 'cup' | 'money'

export interface HelpArticle {
  slug: string
  title: string
  category: HelpCategory
  blurb: string
  icon: string
  content: string
}

export const HELP_CATEGORIES: Array<{ id: HelpCategory; label: string; blurb: string }> = [
  { id: 'basics', label: 'Basics',       blurb: 'Getting started, signing up, the essentials' },
  { id: 'match',  label: 'Match night',  blurb: 'Voting, formations, notifications' },
  { id: 'cup',    label: 'World Cup',    blurb: 'Predictor scoring and sweepstake rules' },
  { id: 'money',  label: 'Money',        blurb: 'Fees, fines, credits, blocks' },
]

export const HELP_ARTICLES: HelpArticle[] = [
  {
    slug: 'getting-started',
    title: 'Getting started',
    category: 'basics',
    blurb: 'What the app does and the five main tabs',
    icon: '👋',
    content: gettingStarted,
  },
  {
    slug: 'signing-up',
    title: 'Signing up for a match',
    category: 'basics',
    blurb: 'I\'m In / Drop Out, deadlines, player tiers, kids',
    icon: '⚽',
    content: signingUp,
  },
  {
    slug: 'voting',
    title: 'Voting for MOTM & DOTD',
    category: 'match',
    blurb: 'How the ballot works, streaks, results',
    icon: '🏆',
    content: voting,
  },
  {
    slug: 'notifications',
    title: 'Setting up notifications',
    category: 'match',
    blurb: 'iPhone & Android setup, troubleshooting',
    icon: '🔔',
    content: notifications,
  },
  {
    slug: 'formations',
    title: 'Team formations & tactics',
    category: 'match',
    blurb: 'The pitch card on the Match tab',
    icon: '📋',
    content: formations,
  },
  {
    slug: 'cup-predictor',
    title: 'Cup Predictor scoring',
    category: 'cup',
    blurb: '1 point for right team, +1 for right method',
    icon: '🎯',
    content: cupPredictor,
  },
  {
    slug: 'finances',
    title: 'Fees, fines & credits',
    category: 'money',
    blurb: 'WTP charges, fines, credits, grace period',
    icon: '💷',
    content: finances,
  },
]

export function findArticle(slug: string): HelpArticle | null {
  return HELP_ARTICLES.find(a => a.slug === slug) ?? null
}
