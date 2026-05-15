import type { Club } from '../types'

// Static reference data (mirrors public.clubs). Reference table rarely changes;
// bundling avoids a network round-trip on every card render and feeds the
// profile/admin club dropdowns.
export const CLUBS: Club[] = [
  { slug: 'bournemouth', display_name: 'AFC Bournemouth', league: 'premier_league', primary_color: '#DA291C', secondary_color: '#000000', glyph: 'stripes' },
  { slug: 'arsenal', display_name: 'Arsenal', league: 'premier_league', primary_color: '#EF0107', secondary_color: '#FFFFFF', glyph: 'cannon' },
  { slug: 'aston_villa', display_name: 'Aston Villa', league: 'premier_league', primary_color: '#670E36', secondary_color: '#95BFE5', glyph: 'lion' },
  { slug: 'birmingham', display_name: 'Birmingham City', league: 'championship', primary_color: '#0000A8', secondary_color: '#FFFFFF', glyph: 'globe' },
  { slug: 'blackburn', display_name: 'Blackburn Rovers', league: 'championship', primary_color: '#009EE0', secondary_color: '#FFFFFF', glyph: 'rose_bb' },
  { slug: 'brentford', display_name: 'Brentford', league: 'premier_league', primary_color: '#E30613', secondary_color: '#FFFFFF', glyph: 'bee' },
  { slug: 'brighton', display_name: 'Brighton & Hove Albion', league: 'premier_league', primary_color: '#0057B8', secondary_color: '#FFCD00', glyph: 'seagull' },
  { slug: 'bristol_city', display_name: 'Bristol City', league: 'championship', primary_color: '#E21E26', secondary_color: '#FFFFFF', glyph: 'robin' },
  { slug: 'burnley', display_name: 'Burnley', league: 'premier_league', primary_color: '#6C1D45', secondary_color: '#99D6EA', glyph: 'hand' },
  { slug: 'charlton', display_name: 'Charlton Athletic', league: 'championship', primary_color: '#E31B23', secondary_color: '#FFFFFF', glyph: 'sword' },
  { slug: 'chelsea', display_name: 'Chelsea', league: 'premier_league', primary_color: '#034694', secondary_color: '#FFFFFF', glyph: 'lion_blue' },
  { slug: 'coventry', display_name: 'Coventry City', league: 'championship', primary_color: '#46AAE0', secondary_color: '#FFFFFF', glyph: 'elephant' },
  { slug: 'crystal_palace', display_name: 'Crystal Palace', league: 'premier_league', primary_color: '#1B458F', secondary_color: '#C4122E', glyph: 'eagle' },
  { slug: 'derby', display_name: 'Derby County', league: 'championship', primary_color: '#000000', secondary_color: '#FFFFFF', glyph: 'ram' },
  { slug: 'everton', display_name: 'Everton', league: 'premier_league', primary_color: '#003399', secondary_color: '#FFFFFF', glyph: 'tower' },
  { slug: 'fulham', display_name: 'Fulham', league: 'premier_league', primary_color: '#000000', secondary_color: '#FFFFFF', glyph: 'ff' },
  { slug: 'hull', display_name: 'Hull City', league: 'championship', primary_color: '#F18A01', secondary_color: '#000000', glyph: 'tiger' },
  { slug: 'ipswich', display_name: 'Ipswich Town', league: 'championship', primary_color: '#0044A9', secondary_color: '#FFFFFF', glyph: 'horse' },
  { slug: 'leeds', display_name: 'Leeds United', league: 'premier_league', primary_color: '#1D428A', secondary_color: '#FFCD00', glyph: 'rose' },
  { slug: 'leicester', display_name: 'Leicester City', league: 'championship', primary_color: '#003090', secondary_color: '#FDBE11', glyph: 'fox' },
  { slug: 'liverpool', display_name: 'Liverpool', league: 'premier_league', primary_color: '#C8102E', secondary_color: '#00B2A9', glyph: 'liverbird' },
  { slug: 'man_city', display_name: 'Manchester City', league: 'premier_league', primary_color: '#6CABDD', secondary_color: '#FFFFFF', glyph: 'waves' },
  { slug: 'man_utd', display_name: 'Manchester United', league: 'premier_league', primary_color: '#DA291C', secondary_color: '#FBE122', glyph: 'devil' },
  { slug: 'middlesbrough', display_name: 'Middlesbrough', league: 'championship', primary_color: '#E11B22', secondary_color: '#FFFFFF', glyph: 'lion_red' },
  { slug: 'millwall', display_name: 'Millwall', league: 'championship', primary_color: '#001F5B', secondary_color: '#FFFFFF', glyph: 'lion_blue' },
  { slug: 'newcastle', display_name: 'Newcastle United', league: 'premier_league', primary_color: '#241F20', secondary_color: '#FFFFFF', glyph: 'stripes_bw' },
  { slug: 'norwich', display_name: 'Norwich City', league: 'championship', primary_color: '#FFF200', secondary_color: '#00A650', glyph: 'canary' },
  { slug: 'nottingham_forest', display_name: 'Nottingham Forest', league: 'premier_league', primary_color: '#DD0000', secondary_color: '#FFFFFF', glyph: 'tree' },
  { slug: 'oxford', display_name: 'Oxford United', league: 'championship', primary_color: '#FFE600', secondary_color: '#231F20', glyph: 'ox' },
  { slug: 'portsmouth', display_name: 'Portsmouth', league: 'championship', primary_color: '#001489', secondary_color: '#FFFFFF', glyph: 'star_moon' },
  { slug: 'preston', display_name: 'Preston North End', league: 'championship', primary_color: '#FFFFFF', secondary_color: '#1A4FA0', glyph: 'pne' },
  { slug: 'qpr', display_name: 'Queens Park Rangers', league: 'championship', primary_color: '#005CAB', secondary_color: '#FFFFFF', glyph: 'hoops' },
  { slug: 'sheff_united', display_name: 'Sheffield United', league: 'championship', primary_color: '#EE2737', secondary_color: '#FFFFFF', glyph: 'stripes_rw' },
  { slug: 'sheff_wed', display_name: 'Sheffield Wednesday', league: 'championship', primary_color: '#0E4C92', secondary_color: '#FFFFFF', glyph: 'owl' },
  { slug: 'southampton', display_name: 'Southampton', league: 'championship', primary_color: '#D71920', secondary_color: '#FFFFFF', glyph: 'saint' },
  { slug: 'stoke', display_name: 'Stoke City', league: 'championship', primary_color: '#E03A3E', secondary_color: '#FFFFFF', glyph: 'potters' },
  { slug: 'sunderland', display_name: 'Sunderland', league: 'premier_league', primary_color: '#EB172B', secondary_color: '#FFFFFF', glyph: 'stripes_rw' },
  { slug: 'swansea', display_name: 'Swansea City', league: 'championship', primary_color: '#FFFFFF', secondary_color: '#000000', glyph: 'swan' },
  { slug: 'tottenham', display_name: 'Tottenham Hotspur', league: 'premier_league', primary_color: '#132257', secondary_color: '#FFFFFF', glyph: 'cockerel' },
  { slug: 'watford', display_name: 'Watford', league: 'championship', primary_color: '#FBEE23', secondary_color: '#ED2127', glyph: 'hart' },
  { slug: 'wba', display_name: 'West Bromwich Albion', league: 'championship', primary_color: '#122F67', secondary_color: '#FFFFFF', glyph: 'throstle' },
  { slug: 'west_ham', display_name: 'West Ham United', league: 'premier_league', primary_color: '#7A263A', secondary_color: '#1BB1E7', glyph: 'hammers' },
  { slug: 'wolves', display_name: 'Wolverhampton Wanderers', league: 'premier_league', primary_color: '#FDB913', secondary_color: '#231F20', glyph: 'wolf' },
  { slug: 'wrexham', display_name: 'Wrexham', league: 'championship', primary_color: '#E31B23', secondary_color: '#FFFFFF', glyph: 'wales' },
]

export const CLUBS_BY_SLUG: Record<string, Club> = Object.fromEntries(CLUBS.map(c => [c.slug, c]))

export function getClub(slug: string | null | undefined): Club | null {
  if (!slug) return null
  return CLUBS_BY_SLUG[slug] ?? null
}
