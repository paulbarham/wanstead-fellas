import { parseISO, format } from 'date-fns'

interface Props {
  /** ISO date (yyyy-MM-dd) for the day this badge represents. */
  iso: string
  size?: 'sm' | 'lg'
}

/** Solid navy calendar tile — month abbreviation above a big serif day-of-month. */
export default function DayBadge({ iso, size = 'lg' }: Props) {
  const d = parseISO(iso)
  const month = format(d, 'MMM').toUpperCase()
  const dayOfMonth = format(d, 'd')
  const dim = size === 'lg' ? 64 : 44
  const num = size === 'lg' ? 'text-3xl' : 'text-xl'
  const label = size === 'lg' ? 'text-[10px]' : 'text-[8px]'
  return (
    <div
      style={{ width: dim, height: dim, background: 'var(--navy)', borderRadius: 12 }}
      className="flex flex-shrink-0 flex-col items-center justify-center text-white"
    >
      <span className={`${label} font-semibold uppercase tracking-[0.15em] opacity-70`}>{month}</span>
      <span className={`font-display ${num} leading-none`}>{dayOfMonth}</span>
    </div>
  )
}
