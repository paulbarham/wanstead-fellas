import type { Leg, TripDay, Idea } from './itinerary'

/** A day scored as a candidate slot for an idea, with a human reason. */
export interface DayScore {
  day: TripDay
  count: number
  score: number
  reason: string
  anchor: boolean
  fits: boolean
}

// All-day anchors — days built around one of these are best left as they are.
const ANCHOR_RE =
  /disneyland|california adventure|universal|six flags|magic mountain|grand canyon|death valley|sea ?world|hearst castle/i

// Generic words to ignore when matching an idea to a day's theme.
const STOP = new Set([
  'the', 'and', 'for', 'with', 'your', 'day', 'last', 'first', 'full', 'this',
  'morning', 'afternoon', 'evening', 'night', 'more', 'other', 'ideas', 'from',
  'into', 'over', 'down', 'back', 'trip', 'here', 'these', 'that', 'them', 'lunch',
])

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !STOP.has(w))
}

function dayText(day: TripDay): string {
  return `${day.title} ${day.subtitle} ${day.options.map((o) => `${o.title} ${o.plan}`).join(' ')}`
}

/** Does the idea share meaningful keywords with the day's theme/plan? */
export function thematicFit(day: TripDay, idea: Idea): boolean {
  const hay = dayText(day).toLowerCase()
  return tokens(idea.title).some((w) => hay.includes(w))
}

function isAnchorDay(day: TripDay, plannedTitles: string[]): boolean {
  const hay = [day.title, day.subtitle, ...day.options.map((o) => o.title), ...plannedTitles].join(' ')
  return ANCHOR_RE.test(hay)
}

/** Score every day in a leg as a slot for `idea`, given what's already planned. */
export function scoreDays(
  leg: Leg,
  idea: Idea,
  plansByDay: Record<number, { title: string }[]>,
): DayScore[] {
  return leg.days.map((day) => {
    const planned = plansByDay[day.n] ?? []
    const count = planned.length
    const anchor = isAnchorDay(day, planned.map((p) => p.title))
    const fits = thematicFit(day, idea)

    let score = 100 - count * 12
    if (anchor) score -= 40
    if (fits) score += 25

    let reason: string
    if (fits) reason = `Fits the “${day.title}” plan`
    else if (anchor) reason = 'Big day already — best kept light'
    else if (count === 0) reason = 'Nothing planned yet'
    else reason = `${count} thing${count > 1 ? 's' : ''} planned so far`

    return { day, count, score, reason, anchor, fits }
  })
}

/** The highest-scoring day (ties broken by earliest day). */
export function bestDay(scores: DayScore[]): DayScore | undefined {
  return [...scores].sort((a, b) => b.score - a.score || a.day.n - b.day.n)[0]
}

/** Ideas from the same leg that pair well with `idea` — same category first
 *  (must-dos ahead), then a food stop, then anything else. Excludes the idea
 *  itself and anything already planned on the chosen day. */
export function complements(
  leg: Leg,
  idea: Idea,
  plannedTitles: Set<string>,
  limit = 3,
): Idea[] {
  const all = leg.ideas ?? []
  const others = all.filter((i) => i.title !== idea.title && !plannedTitles.has(i.title))
  const cat = idea.category ?? 'other'

  const rank = (arr: Idea[]) =>
    [...arr].sort((a, b) => (b.recommended ? 1 : 0) - (a.recommended ? 1 : 0))

  const sameCat = rank(others.filter((i) => (i.category ?? 'other') === cat))
  const food = cat === 'food' ? [] : rank(others.filter((i) => i.category === 'food'))
  const rest = rank(
    others.filter((i) => (i.category ?? 'other') !== cat && i.category !== 'food'),
  )

  const seen = new Set<string>()
  const out: Idea[] = []
  for (const i of [...sameCat, ...food, ...rest]) {
    if (seen.has(i.title)) continue
    seen.add(i.title)
    out.push(i)
    if (out.length >= limit) break
  }
  return out
}
