import { useEffect, useState } from 'react'
import { Sun } from 'lucide-react'
import { fetchDayWeather, weatherLabel, type DayWeather } from '../lib/weather'
import { useOnline } from '../hooks/useOnline'

interface Props {
  legTitle: string
  isoDate: string
}

/** Best-effort forecast pill. Renders nothing if unavailable (offline / out of range). */
export default function WeatherChip({ legTitle, isoDate }: Props) {
  const online = useOnline()
  const [weather, setWeather] = useState<DayWeather | null>(null)

  useEffect(() => {
    if (!online) return
    const ctrl = new AbortController()
    fetchDayWeather(legTitle, isoDate, ctrl.signal)
      .then(setWeather)
      .catch(() => setWeather(null))
    return () => ctrl.abort()
  }, [legTitle, isoDate, online])

  if (!weather) return null

  return (
    <div
      className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-medium"
      style={{ background: 'var(--sand-2)', color: 'var(--text)' }}
    >
      <Sun size={15} style={{ color: 'var(--coral)' }} />
      <span className="font-semibold">{weather.tempMaxC}°</span>
      <span className="text-navy/50">/ {weather.tempMinC}°</span>
      <span className="text-navy/60">· {weatherLabel(weather.code)}</span>
    </div>
  )
}
