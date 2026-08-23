import { toZonedTime, fromZonedTime } from 'date-fns-tz'

const LONDON = 'Europe/London'

// The next 09:00 in Europe/London, expressed as a UTC Date. If the current
// London wall-clock is BEFORE 09:00 today, returns today at 09:00; otherwise
// tomorrow at 09:00. Handles BST/GMT via date-fns-tz — no manual offsets.
//
// Used by the admin announcement composer (preview + scheduled_for value).
export function nextNineAmUk(from: Date = new Date()): Date {
  const london = toZonedTime(from, LONDON)
  const y = london.getFullYear()
  const m = london.getMonth()
  const d = london.getDate()

  // Build "today at 09:00" as a wall-clock Date in London tz…
  const todayNine = new Date(y, m, d, 9, 0, 0, 0)
  // …then convert to the equivalent UTC instant so we can compare against
  // the actual "now" London wall-clock.
  const todayNineUtc = fromZonedTime(todayNine, LONDON)

  if (todayNineUtc.getTime() > from.getTime()) {
    return todayNineUtc
  }
  const tomorrowNine = new Date(y, m, d + 1, 9, 0, 0, 0)
  return fromZonedTime(tomorrowNine, LONDON)
}

// Human-readable preview for the composer: "Wed 24 Sep, 9am UK".
export function formatNineAmUkLabel(d: Date): string {
  const london = toZonedTime(d, LONDON)
  const day = london.toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
  return `${day}, 9am UK`
}
