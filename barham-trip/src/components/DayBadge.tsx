interface Props {
  n: number
  size?: 'sm' | 'lg'
}

/** Solid navy square with a tiny "DAY" label above a big serif number. */
export default function DayBadge({ n, size = 'lg' }: Props) {
  const dim = size === 'lg' ? 64 : 44
  const num = size === 'lg' ? 'text-3xl' : 'text-xl'
  const label = size === 'lg' ? 'text-[10px]' : 'text-[8px]'
  return (
    <div
      style={{ width: dim, height: dim, background: 'var(--navy)', borderRadius: 12 }}
      className="flex flex-shrink-0 flex-col items-center justify-center text-white"
    >
      <span className={`${label} font-semibold uppercase tracking-[0.15em] opacity-70`}>Day</span>
      <span className={`font-display ${num} leading-none`}>{n}</span>
    </div>
  )
}
