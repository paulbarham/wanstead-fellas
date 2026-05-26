import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import {
  Cloud,
  CloudRain,
  CloudDrizzle,
  CloudSnow,
  CloudFog,
  Sun,
  Moon,
  CloudSun,
  CloudMoon,
} from 'lucide-react'
import { getNextThursdayDate } from '../lib/time'

interface WeatherData {
  temperatureC: number
  windSpeedMph: number
  precipitationProbability: number
  weatherCode: number
}

interface CachedEntry {
  date: string
  fetchedAt: number
  data: WeatherData
}

const CACHE_TTL_MS = 60 * 60 * 1000
const CACHE_PREFIX = 'wf-weather-'
const ACCENT_BLUE = '#7fb3d5'
const CARD_BG = '#0d1f17'
const CARD_BORDER = '#1f3a2c'
const TEXT_MUTED = '#9ca3af'
const TEXT_DIM = '#6b8a7a'

function cacheKey(date: string) {
  return `${CACHE_PREFIX}${date}`
}

function readCache(date: string): WeatherData | null {
  try {
    const raw = localStorage.getItem(cacheKey(date))
    if (!raw) return null
    const parsed: CachedEntry = JSON.parse(raw)
    if (parsed.date !== date) return null
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null
    return parsed.data
  } catch {
    return null
  }
}

function writeCache(date: string, data: WeatherData) {
  try {
    const entry: CachedEntry = { date, fetchedAt: Date.now(), data }
    localStorage.setItem(cacheKey(date), JSON.stringify(entry))
  } catch {
    // localStorage may be unavailable or full — fine to skip
  }
}

async function fetchWeather(date: string): Promise<WeatherData> {
  const url =
    'https://api.open-meteo.com/v1/forecast?latitude=51.5772&longitude=0.0288' +
    '&hourly=temperature_2m,precipitation_probability,weathercode,windspeed_10m' +
    '&timezone=Europe/London&forecast_days=8'
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  const times = json?.hourly?.time as string[] | undefined
  if (!times) throw new Error('No hourly data')
  const idx = times.indexOf(`${date}T21:00`)
  if (idx < 0) throw new Error('9pm slot missing')
  return {
    temperatureC: Math.round(json.hourly.temperature_2m[idx]),
    windSpeedMph: Math.round(json.hourly.windspeed_10m[idx] * 0.621371),
    precipitationProbability: Math.round(json.hourly.precipitation_probability[idx]),
    weatherCode: json.hourly.weathercode[idx],
  }
}

// 9pm is dark in winter, dusk/light in summer — switch icon family by month.
function isDarkSeason(date: string): boolean {
  const month = Number(date.slice(5, 7))
  return month <= 3 || month >= 10
}

function pickIcon(code: number, night: boolean) {
  if (code === 95 || code === 96 || code === 99) return CloudRain
  if (code === 0) return night ? Moon : Sun
  if (code === 1 || code === 2) return night ? CloudMoon : CloudSun
  if (code === 3) return Cloud
  if (code === 45 || code === 48) return CloudFog
  if (code >= 51 && code <= 57) return CloudDrizzle
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return CloudRain
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return CloudSnow
  return Cloud
}

function conditionLabel(code: number): string {
  switch (code) {
    case 0: return 'Clear'
    case 1: return 'Mostly Clear'
    case 2: return 'Partly Cloudy'
    case 3: return 'Overcast'
    case 45:
    case 48: return 'Fog'
    case 51:
    case 53:
    case 55: return 'Drizzle'
    case 56:
    case 57: return 'Freezing Drizzle'
    case 61:
    case 63: return 'Rain'
    case 65: return 'Heavy Rain'
    case 66:
    case 67: return 'Freezing Rain'
    case 71:
    case 73: return 'Snow'
    case 75: return 'Heavy Snow'
    case 77: return 'Snow Grains'
    case 80:
    case 81: return 'Rain Showers'
    case 82: return 'Heavy Showers'
    case 85:
    case 86: return 'Snow Showers'
    case 95: return 'Thunderstorm'
    case 96:
    case 99: return 'Thunderstorm + Hail'
    default: return 'Forecast'
  }
}

export default function WeatherCard() {
  const [targetDate, setTargetDate] = useState(() => getNextThursdayDate())
  const [data, setData] = useState<WeatherData | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [refreshTick, setRefreshTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    const cached = readCache(targetDate)
    if (cached) {
      setData(cached)
      setLoading(false)
      setFailed(false)
      return
    }
    setLoading(true)
    fetchWeather(targetDate)
      .then(fresh => {
        if (cancelled) return
        writeCache(targetDate, fresh)
        setData(fresh)
        setFailed(false)
        setLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        console.error('WeatherCard fetch failed:', err)
        setFailed(true)
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [targetDate, refreshTick])

  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState !== 'visible') return
      const fresh = getNextThursdayDate()
      if (fresh !== targetDate) {
        setTargetDate(fresh)
      } else {
        setRefreshTick(t => t + 1)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [targetDate])

  const [y, m, d] = targetDate.split('-').map(Number)
  const headerLabel =
    format(new Date(y, m - 1, d), 'EEE d MMM').toUpperCase() + ' · 9PM KICK-OFF'

  if (failed) {
    return (
      <div
        className="mb-3 px-4 py-3 rounded-2xl flex items-center justify-between gap-3"
        style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}` }}
      >
        <div>
          <p className="text-[10px] font-semibold uppercase mb-1"
            style={{ color: TEXT_DIM, letterSpacing: '0.8px' }}>
            {headerLabel}
          </p>
          <p className="text-xs" style={{ color: TEXT_MUTED }}>
            Forecast unavailable
          </p>
        </div>
        <button
          onClick={() => { setFailed(false); setRefreshTick(t => t + 1) }}
          className="text-xs font-medium px-3 py-1.5 rounded-lg"
          style={{ background: CARD_BORDER, color: '#FFFFFF', border: 'none' }}
        >
          Retry
        </button>
      </div>
    )
  }

  const accentRain = !!data && data.precipitationProbability >= 60
  const Icon = data ? pickIcon(data.weatherCode, isDarkSeason(targetDate)) : Cloud

  return (
    <div
      className="mb-3 px-4 py-3 rounded-2xl"
      style={{
        background: CARD_BG,
        border: `1px solid ${accentRain ? ACCENT_BLUE : CARD_BORDER}`,
      }}
    >
      <p
        className="text-[10px] font-semibold uppercase mb-2"
        style={{ color: TEXT_DIM, letterSpacing: '0.8px' }}
      >
        {headerLabel}
      </p>

      {loading || !data ? (
        <div className="flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full" style={{ background: CARD_BORDER }} />
            <div className="space-y-1.5">
              <div className="h-3 w-24 rounded" style={{ background: CARD_BORDER }} />
              <div className="h-2.5 w-32 rounded" style={{ background: CARD_BORDER }} />
            </div>
          </div>
          <div className="space-y-1.5 text-right">
            <div className="h-6 w-14 rounded ml-auto" style={{ background: CARD_BORDER }} />
            <div className="h-2 w-10 rounded ml-auto" style={{ background: CARD_BORDER }} />
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Icon
              size={36}
              strokeWidth={1.5}
              color={accentRain ? ACCENT_BLUE : 'white'}
            />
            <div>
              <p className="text-sm font-semibold text-white leading-tight">
                {conditionLabel(data.weatherCode)}
              </p>
              <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>
                {data.temperatureC}°C · {data.windSpeedMph} mph wind
              </p>
            </div>
          </div>
          <div className="text-right">
            <p
              className="font-display leading-none"
              style={{
                fontSize: '28px',
                color: accentRain ? ACCENT_BLUE : 'white',
              }}
            >
              {data.precipitationProbability}%
            </p>
            <p
              className="text-[10px] uppercase mt-1"
              style={{ color: TEXT_DIM, letterSpacing: '0.5px' }}
            >
              Rain
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
