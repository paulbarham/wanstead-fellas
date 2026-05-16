import { toZonedTime, fromZonedTime } from 'date-fns-tz'
import { nextDay, setHours, setMinutes, setSeconds, setMilliseconds, isBefore } from 'date-fns'

const TZ = 'Europe/London'

export function nowLondon(): Date {
  return toZonedTime(new Date(), TZ)
}

export function getNextThursday(from?: Date): Date {
  const base = from ? toZonedTime(from, TZ) : nowLondon()
  const day = base.getDay() // 0=Sun, 4=Thu
  if (day === 4) {
    // If it's Thursday after 10pm, next Thursday
    const hour = base.getHours()
    if (hour >= 22) {
      return nextDay(base, 4)
    }
    return base
  }
  return nextDay(base, 4)
}

export function getNextThursdayDate(): string {
  const d = getNextThursday()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}


export type MatchPhase =
  | 'signup_open'       // after Thu 10pm through Wed 10pm
  | 'signup_locked'     // Wed 10pm to Thu 9pm
  | 'match_live'        // Thu 9pm to Thu 10pm
  | 'post_match'        // Thu 10pm (brief, then resets)

export function getMatchPhase(thursdayDateStr: string): MatchPhase {
  const now = new Date()

  // Wednesday 10pm London = day before Thursday at 22:00
  const [ty, tm, td] = thursdayDateStr.split('-').map(Number)
  const wednesdayDate = new Date(ty, tm - 1, td - 1)
  const wedDeadline = fromZonedTime(
    setMilliseconds(setSeconds(setMinutes(setHours(wednesdayDate, 22), 0), 0), 0),
    TZ
  )
  const thuOpen = fromZonedTime(
    setMilliseconds(setSeconds(setMinutes(setHours(new Date(ty, tm - 1, td), 9), 0), 0), 0),
    TZ
  )
  const thuClose = fromZonedTime(
    setMilliseconds(setSeconds(setMinutes(setHours(new Date(ty, tm - 1, td), 22), 0), 0), 0),
    TZ
  )

  if (isBefore(now, wedDeadline)) return 'signup_open'
  if (isBefore(now, thuOpen)) return 'signup_locked'
  if (isBefore(now, thuClose)) return 'match_live'
  return 'post_match'
}

// Voting opens 10pm on match night, closes 9am the next day (Europe/London).
export function getVotingWindow(matchDateStr: string): { opens_at: string; closes_at: string } {
  const [y, m, d] = matchDateStr.split('-').map(Number)
  const opens = fromZonedTime(new Date(y, m - 1, d, 22, 0, 0, 0), TZ)
  const closes = fromZonedTime(new Date(y, m - 1, d + 1, 9, 0, 0, 0), TZ)
  return { opens_at: opens.toISOString(), closes_at: closes.toISOString() }
}

export function formatCountdown(targetDate: string): string {
  const now = new Date()
  const [y, m, d] = targetDate.split('-').map(Number)
  const thuEvening = fromZonedTime(
    new Date(y, m - 1, d, 20, 0, 0, 0),
    TZ
  )
  const diff = thuEvening.getTime() - now.getTime()
  if (diff <= 0) return '00:00:00'

  const totalSeconds = Math.floor(diff / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (days > 0) {
    return `${days}d ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function getCountdownLabel(thursdayDateStr: string): { text: string; tonight: boolean } {
  const now = nowLondon()
  const [ty, tm, td] = thursdayDateStr.split('-').map(Number)

  // Same calendar day in London → TONIGHT
  if (now.getFullYear() === ty && now.getMonth() + 1 === tm && now.getDate() === td) {
    return { text: 'TONIGHT · Kick-off 9pm', tonight: true }
  }

  // Tomorrow in London
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (tomorrow.getFullYear() === ty && tomorrow.getMonth() + 1 === tm && tomorrow.getDate() === td) {
    return { text: 'Tomorrow · Kick-off 9pm', tonight: false }
  }

  // Days away (use calendar difference)
  const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const thuMidnight = new Date(ty, tm - 1, td)
  const days = Math.round((thuMidnight.getTime() - nowMidnight.getTime()) / 86400000)
  return { text: `Thursday · ${days} day${days !== 1 ? 's' : ''} away`, tonight: false }
}
