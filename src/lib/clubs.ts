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

// Real crest URLs (TheSportsDB CDN). Partial set — clubs not listed fall back
// to the generated shield in ClubBadge. Complete as more are resolved.
const TSDB = 'https://r2.thesportsdb.com/images/media/team/badge/'
const LK = 'https://raw.githubusercontent.com/luukhopman/football-logos/master/logos/England%20-%20Premier%20League/'
const WM = 'https://upload.wikimedia.org/wikipedia/en/thumb/'
export const BADGE_URLS: Record<string, string> = {
  arsenal: TSDB + 'uyhbfe1612467038.png',
  aston_villa: TSDB + 'jykrpv1717309891.png',
  bournemouth: TSDB + 'y08nak1534071116.png',
  brentford: TSDB + 'grv1aw1546453779.png',
  brighton: TSDB + 'ywypts1448810904.png',
  burnley: TSDB + 'ql7nl31686893820.png',
  chelsea: TSDB + 'yvwvtu1448813215.png',
  crystal_palace: TSDB + 'ia6i3m1656014992.png',
  everton: TSDB + 'eqayrf1523184794.png',
  fulham: TSDB + 'xwwvyt1448811086.png',
  birmingham: TSDB + 'wufs551672950865.png',
  blackburn: TSDB + 'rvryut1448810814.png',
  bristol_city: TSDB + '0ejxwz1601721013.png',
  charlton: TSDB + 'o08wvi1635872307.png',
  coventry: TSDB + 'uxyqys1424033798.png',
  derby: TSDB + 'jioo4z1557155744.png',
  hull: TSDB + 'fbqqda1601726113.png',
  ipswich: TSDB + 'mdj1ey1634670785.png',
  leicester: TSDB + 'xtxwtu1448813356.png',
  middlesbrough: TSDB + '9xcx0p1770828600.png',
  // Current Premier League crests via luukhopman/football-logos raw CDN
  leeds: LK + 'Leeds%20United.png',
  liverpool: LK + 'Liverpool%20FC.png',
  man_city: LK + 'Manchester%20City.png',
  man_utd: LK + 'Manchester%20United.png',
  newcastle: LK + 'Newcastle%20United.png',
  nottingham_forest: LK + 'Nottingham%20Forest.png',
  sunderland: LK + 'Sunderland%20AFC.png',
  tottenham: LK + 'Tottenham%20Hotspur.png',
  west_ham: LK + 'West%20Ham%20United.png',
  wolves: LK + 'Wolverhampton%20Wanderers.png',
  // EFL crests via Wikipedia canonical lead-image (Wikimedia upload CDN)
  millwall: WM + '9/98/Millwall_FC_crest.svg/330px-Millwall_FC_crest.svg.png',
  norwich: WM + '1/17/Norwich_City_FC_logo.svg/250px-Norwich_City_FC_logo.svg.png',
  oxford: WM + '3/3e/Oxford_United_FC_logo.svg/330px-Oxford_United_FC_logo.svg.png',
  portsmouth: WM + '3/38/Portsmouth_FC_logo.svg/330px-Portsmouth_FC_logo.svg.png',
  preston: WM + '8/82/Preston_North_End_FC.svg/330px-Preston_North_End_FC.svg.png',
  qpr: WM + '3/31/Queens_Park_Rangers_crest.svg/330px-Queens_Park_Rangers_crest.svg.png',
  sheff_united: WM + '9/9c/Sheffield_United_FC_logo.svg/330px-Sheffield_United_FC_logo.svg.png',
  sheff_wed: WM + '8/88/Sheffield_Wednesday_badge.svg/330px-Sheffield_Wednesday_badge.svg.png',
  southampton: WM + 'c/c9/FC_Southampton.svg/330px-FC_Southampton.svg.png',
  stoke: WM + '5/5e/Stoke_City_FC_crest_2001.svg/330px-Stoke_City_FC_crest_2001.svg.png',
  swansea: WM + 'f/f9/Swansea_City_AFC_logo.svg/330px-Swansea_City_AFC_logo.svg.png',
  watford: WM + 'e/e2/Watford.svg/330px-Watford.svg.png',
  wba: WM + '8/8b/West_Bromwich_Albion.svg/330px-West_Bromwich_Albion.svg.png',
  wrexham: WM + '0/0d/Wrexham_A.F.C._Logo.svg/330px-Wrexham_A.F.C._Logo.svg.png',
}

export const CLUBS_BY_SLUG: Record<string, Club> = Object.fromEntries(CLUBS.map(c => [c.slug, c]))

export function getClub(slug: string | null | undefined): Club | null {
  if (!slug) return null
  return CLUBS_BY_SLUG[slug] ?? null
}
