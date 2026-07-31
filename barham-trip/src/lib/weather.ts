// Open-Meteo weather (no API key). Best-effort only: forecasts reach ~16 days
// out, so early legs get a real forecast and later ones simply show nothing.
// Must never break the offline experience — all callers guard with try/catch.

interface Coord {
  lat: number
  lon: number
}

// Rough coordinates for each leg's base.
const LEG_COORDS: Record<string, Coord> = {
  'San Francisco': { lat: 37.8, lon: -122.42 },
  'Pacific Coast Highway': { lat: 36.27, lon: -121.81 }, // Big Sur
  'Santa Monica': { lat: 34.02, lon: -118.49 },
  'Los Angeles': { lat: 34.05, lon: -118.24 },
  'Las Vegas': { lat: 36.17, lon: -115.14 },
}

export interface DayWeather {
  tempMaxC: number
  tempMinC: number
  code: number
}

export function coordForLeg(legTitle: string): Coord | undefined {
  return LEG_COORDS[legTitle]
}

export async function fetchDayWeather(
  legTitle: string,
  isoDate: string,
  signal?: AbortSignal,
): Promise<DayWeather | null> {
  const coord = coordForLeg(legTitle)
  if (!coord) return null

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${coord.lat}&longitude=${coord.lon}` +
    `&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto` +
    `&start_date=${isoDate}&end_date=${isoDate}`

  const res = await fetch(url, { signal })
  if (!res.ok) return null
  const json = (await res.json()) as {
    daily?: {
      time?: string[]
      temperature_2m_max?: number[]
      temperature_2m_min?: number[]
      weather_code?: number[]
    }
  }
  const d = json.daily
  if (!d?.time?.length || d.temperature_2m_max?.[0] == null) return null
  return {
    tempMaxC: Math.round(d.temperature_2m_max[0]),
    tempMinC: Math.round(d.temperature_2m_min?.[0] ?? d.temperature_2m_max[0]),
    code: d.weather_code?.[0] ?? 0,
  }
}

/** Map a WMO weather code to a short label. */
export function weatherLabel(code: number): string {
  if (code === 0) return 'Clear'
  if (code <= 2) return 'Mostly sunny'
  if (code === 3) return 'Cloudy'
  if (code <= 48) return 'Fog'
  if (code <= 67) return 'Rain'
  if (code <= 77) return 'Snow'
  if (code <= 82) return 'Showers'
  if (code <= 99) return 'Storms'
  return 'Mixed'
}
