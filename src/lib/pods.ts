// Curated list of football pods + news. Add new entries here — the Pods tab
// renders them in array order. Keep links to the official destinations; the
// app deep-links out via the user's installed podcast app where possible.

export interface PodLink {
  label: string
  url: string
}

export interface PodEntry {
  id: string
  title: string
  host: string
  blurb: string
  icon: string
  accent: string
  links: PodLink[]
}

export const POD_ENTRIES: PodEntry[] = [
  {
    id: 'rest-is-football',
    title: 'The Rest Is Football',
    host: 'Gary Lineker, Alan Shearer & Micah Richards',
    blurb: 'Three of the most decorated voices in the English game on the biggest stories of the week. Currently #1 on the UK Apple Sports charts.',
    icon: '🎙️',
    accent: '#C8102E',
    links: [
      { label: 'Spotify', url: 'https://open.spotify.com/show/2fDn3EgvJZ5J1k5rrBwrlZ' },
      { label: 'Apple Podcasts', url: 'https://podcasts.apple.com/gb/podcast/the-rest-is-football/id1701022490' },
    ],
  },
  {
    id: 'stick-to-football',
    title: 'Stick to Football',
    host: 'Gary Neville, Roy Keane, Jamie Carragher, Ian Wright & Jill Scott',
    blurb: 'The Overlap\'s flagship round-table. Big names, bigger arguments, and a guest from inside the game most weeks.',
    icon: '🎙️',
    accent: '#0096D6',
    links: [
      { label: 'Spotify', url: 'https://open.spotify.com/show/29LjKwNI41bD09xNAMkQes' },
      { label: 'Apple Podcasts', url: 'https://podcasts.apple.com/gb/podcast/stick-to-football/id1709142395' },
    ],
  },
  {
    id: 'peter-crouch',
    title: 'That Peter Crouch Podcast',
    host: 'Peter Crouch, Chris Stark & Steve Sidwell',
    blurb: 'The original "what footballers actually talk about" pod. Dressing-room anecdotes, daft chat, the occasional serious take.',
    icon: '🎙️',
    accent: '#EC1C57',
    links: [
      { label: 'Spotify', url: 'https://open.spotify.com/show/2NqEBd6EJNfs6A3527xwVD' },
      { label: 'Apple Podcasts', url: 'https://podcasts.apple.com/gb/podcast/that-peter-crouch-podcast/id1616744464' },
    ],
  },
  {
    id: 'football-weekly',
    title: 'Football Weekly',
    host: 'Max Rushden, Barry Glendenning & guests',
    blurb: 'The Guardian\'s long-running pod. Sharp Premier League analysis on Mondays and Thursdays, plus deep dives into the European leagues.',
    icon: '🎙️',
    accent: '#052962',
    links: [
      { label: 'Spotify', url: 'https://open.spotify.com/show/6w8qWe0kjgHEHSWDSDGoLW' },
      { label: 'Apple Podcasts', url: 'https://podcasts.apple.com/gb/podcast/football-weekly/id188674007' },
    ],
  },
  {
    id: 'football-ramble',
    title: 'Football Ramble',
    host: 'Marcus Speller, Luke Moore, Pete Donaldson & Andy Brassell',
    blurb: 'A podcasting institution since 2007. Funny, opinionated and proudly independent — the best in the game on the global football week.',
    icon: '🎙️',
    accent: '#FF6B35',
    links: [
      { label: 'Spotify', url: 'https://open.spotify.com/show/5vK22FRxc1VghAYzyemMZP' },
      { label: 'Apple Podcasts', url: 'https://podcasts.apple.com/gb/podcast/football-ramble/id254078311' },
    ],
  },
  {
    id: 'dressing-room',
    title: 'The Dressing Room',
    host: 'Joe Cole, Carlton Cole & Wayne Bridge',
    blurb: 'Three ex-Chelsea & England lads on the biggest stories of the week, plus dressing-room stories from their playing days.',
    icon: '🎙️',
    accent: '#0057B8',
    links: [
      { label: 'Spotify', url: 'https://open.spotify.com/show/5SA1rkxiVWmrv8T9DQDyNv' },
      { label: 'Apple Podcasts', url: 'https://podcasts.apple.com/gb/podcast/the-dressing-room/id1792177284' },
    ],
  },
]
