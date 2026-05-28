// Shared weather helper — used by the Tonight WeatherCard and the Teams
// WhatsApp announcement. Hits Open-Meteo for the Wanstead Flats pitch and
// returns the conditions at the 9pm kick-off slot.

export interface WeatherData {
  temperatureC: number
  windSpeedMph: number
  precipitationProbability: number
  weatherCode: number
}

export async function fetchWeather(date: string): Promise<WeatherData> {
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

export function weatherEmoji(code: number): string {
  if (code === 0 || code === 1) return '☀️'
  if (code === 2) return '⛅'
  if (code === 3) return '☁️'
  if (code === 45 || code === 48) return '🌫️'
  if (code >= 51 && code <= 57) return '🌦️'
  if (code >= 61 && code <= 67) return '🌧️'
  if (code >= 71 && code <= 77) return '🌨️'
  if (code >= 80 && code <= 82) return '🌧️'
  if (code === 85 || code === 86) return '🌨️'
  if (code >= 95) return '⛈️'
  return '🌤️'
}

export function weatherLabel(code: number): string {
  if (code === 0) return 'Clear'
  if (code === 1 || code === 2) return 'Partly cloudy'
  if (code === 3) return 'Overcast'
  if (code === 45 || code === 48) return 'Foggy'
  if (code >= 51 && code <= 57) return 'Drizzle'
  if (code >= 61 && code <= 65) return 'Rain'
  if (code === 66 || code === 67) return 'Freezing rain'
  if (code >= 71 && code <= 77) return 'Snow'
  if (code >= 80 && code <= 82) return 'Showers'
  if (code === 85 || code === 86) return 'Snow showers'
  if (code >= 95) return 'Thunder'
  return 'Mixed'
}
