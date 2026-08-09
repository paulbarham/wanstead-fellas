import type { Leg, TripDay, Idea } from './itinerary'

/** A day scored as a candidate slot for an idea, with a human reason. */
export interface DayScore {
  day: TripDay
  count: number
  score: number
  reason: string
  anchor: boolean
  fits: boolean
  /** True when the idea's neighbourhood already has something planned that day. */
  nearby: boolean
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

/** Map an idea title to its area (for resolving what's planned where). */
function areaByTitle(leg: Leg): Map<string, string | undefined> {
  return new Map((leg.ideas ?? []).map((i) => [i.title, i.area]))
}

/** Score every day in a leg as a slot for `idea`, given what's already planned.
 *  Considers day load, all-day anchors, thematic fit, and neighbourhood
 *  proximity — a day already doing something in the idea's area scores higher. */
export function scoreDays(
  leg: Leg,
  idea: Idea,
  plansByDay: Record<number, { title: string }[]>,
): DayScore[] {
  const areaOf = areaByTitle(leg)
  return leg.days.map((day) => {
    const planned = plansByDay[day.n] ?? []
    const count = planned.length
    const anchor = isAnchorDay(day, planned.map((p) => p.title))
    const fits = thematicFit(day, idea)
    const plannedAreas = new Set(planned.map((p) => areaOf.get(p.title)).filter(Boolean))
    const nearby = !!idea.area && plannedAreas.has(idea.area)

    let score = 100 - count * 12
    if (anchor) score -= 40
    if (fits) score += 25
    if (nearby) score += 22

    let reason: string
    if (fits) reason = `Fits the “${day.title}” plan`
    else if (nearby) reason = `Close to your ${idea.area} plans`
    else if (anchor) reason = 'Big day already — best kept light'
    else if (count === 0) reason = 'Nothing planned yet'
    else reason = `${count} thing${count > 1 ? 's' : ''} planned so far`

    return { day, count, score, reason, anchor, fits, nearby }
  })
}

/** The highest-scoring day (ties broken by earliest day). */
export function bestDay(scores: DayScore[]): DayScore | undefined {
  return [...scores].sort((a, b) => b.score - a.score || a.day.n - b.day.n)[0]
}

/** Ideas from the same leg that pair well with `idea` — nearby things first
 *  (same neighbourhood), then same category, with must-dos and a food stop
 *  nudged up. Excludes the idea itself and anything already planned that day. */
export function complements(
  leg: Leg,
  idea: Idea,
  plannedTitles: Set<string>,
  limit = 3,
): Idea[] {
  const all = leg.ideas ?? []
  const others = all.filter((i) => i.title !== idea.title && !plannedTitles.has(i.title))
  const cat = idea.category ?? 'other'

  const weight = (i: Idea) => {
    let w = 0
    if (idea.area && i.area === idea.area) w += 4 // physically close
    if ((i.category ?? 'other') === cat) w += 2 // similar kind of thing
    if (i.recommended) w += 1 // a must-do
    if (i.category === 'food' && cat !== 'food') w += 0.5 // a meal pairs with anything
    return w
  }

  return [...others]
    .map((i, idx) => ({ i, idx, w: weight(i) }))
    .sort((a, b) => b.w - a.w || a.idx - b.idx)
    .slice(0, limit)
    .map((x) => x.i)
}
