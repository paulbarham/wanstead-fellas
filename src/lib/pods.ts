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
