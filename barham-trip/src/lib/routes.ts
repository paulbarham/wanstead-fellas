// Offline-safe driving routes for the transfer days. Coordinates are bundled,
// so the route map renders with zero signal. For real turn-by-turn offline,
// the card tells the family to download the Google Maps area before they go.

export interface Waypoint {
  name: string
  lat: number
  lng: number
  note?: string
}

export interface DriveRoute {
  dayN: number
  /** "San Francisco → Cambria" */
  title: string
  /** Roads/one-liner, e.g. "Hwy 17 · 17-Mile Drive · US-101 · Hwy 46". */
  via: string
  /** "~330 mi · 6–7 hrs driving" */
  distance: string
  /** What to download in Google Maps for offline sat-nav. */
  offlineArea: string
  waypoints: Waypoint[]
}

export const routes: DriveRoute[] = [
  {
    dayN: 5,
    title: 'San Francisco → Cambria',
    via: 'Hwy 17 · Santa Cruz · 17-Mile Drive · US-101 · Hwy 46',
    distance: '~330 mi · 7 hrs driving + stops',
    offlineArea: 'San Francisco → Monterey → Paso Robles → Cambria',
    waypoints: [
      { name: 'San Francisco', lat: 37.788, lng: -122.412 },
      { name: 'Santa Cruz Boardwalk', lat: 36.9644, lng: -122.0189, note: 'lunch & rides' },
      { name: '17-Mile Drive (Pacific Grove)', lat: 36.6177, lng: -121.9166 },
      { name: 'Carmel-by-the-Sea', lat: 36.5552, lng: -121.9233, note: 'leg-stretch' },
      { name: 'Salinas', lat: 36.6777, lng: -121.6555, note: 'onto US-101' },
      { name: 'Paso Robles', lat: 35.6266, lng: -120.6910, note: 'fuel & break' },
      { name: 'Cambria', lat: 35.5641, lng: -121.0807, note: 'overnight' },
    ],
  },
  {
    dayN: 6,
    title: 'Cambria → Santa Monica',
    via: 'Hearst Castle · Hwy 1 · US-101 · Santa Barbara',
    distance: '~230 mi · 5 hrs driving + stops',
    offlineArea: 'Cambria → Santa Barbara → Santa Monica',
    waypoints: [
      { name: 'Cambria', lat: 35.5641, lng: -121.0807 },
      { name: 'Hearst Castle', lat: 35.6852, lng: -121.1682, note: 'morning tour' },
      { name: 'Piedras Blancas', lat: 35.6663, lng: -121.2846, note: 'elephant seals' },
      { name: 'Santa Barbara', lat: 34.4208, lng: -119.6982, note: 'lunch' },
      { name: 'Santa Monica', lat: 34.0195, lng: -118.4912, note: 'overnight' },
    ],
  },
  {
    dayN: 16,
    title: 'Los Angeles → Las Vegas',
    via: 'I-15 north · Mojave Desert · Baker',
    distance: '~270 mi · 4.5 hrs driving',
    offlineArea: 'Los Angeles → Barstow → Baker → Las Vegas',
    waypoints: [
      { name: 'Burbank (SpringHill)', lat: 34.1808, lng: -118.3090 },
      { name: 'Barstow', lat: 34.8958, lng: -117.0173, note: 'last big services' },
      { name: 'Baker', lat: 35.2649, lng: -116.0764, note: "world's tallest thermometer" },
      { name: 'Las Vegas', lat: 36.1147, lng: -115.1728, note: 'the Strip' },
    ],
  },
]

export function routeForDay(n: number): DriveRoute | undefined {
  return routes.find((r) => r.dayN === n)
}

/** Google Maps multi-stop directions link (opens the app when installed).
 *  Built by hand so the lat,lng commas stay literal (Google accepts them). */
export function mapsDirUrl(r: DriveRoute): string {
  const wp = r.waypoints
  const origin = `${wp[0].lat},${wp[0].lng}`
  const destination = `${wp[wp.length - 1].lat},${wp[wp.length - 1].lng}`
  const mid = wp.slice(1, -1).map((w) => `${w.lat},${w.lng}`).join('|')
  const parts = [`api=1`, `origin=${origin}`, `destination=${destination}`, `travelmode=driving`]
  if (mid) parts.push(`waypoints=${mid}`)
  return `https://www.google.com/maps/dir/?${parts.join('&')}`
}

/** Project waypoints into SVG coordinates for a `w`×`h` box with `pad` inset.
 *  Equirectangular with a cos(lat) x-correction — accurate enough at this scale
 *  and keeps the route's real shape. */
export function projectRoute(
  wps: Waypoint[],
  w: number,
  h: number,
  pad: number,
): { x: number; y: number }[] {
  const meanLat = (wps.reduce((s, p) => s + p.lat, 0) / wps.length) * (Math.PI / 180)
  const k = Math.cos(meanLat)
  const pts = wps.map((p) => ({ x: p.lng * k, y: p.lat }))
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  const spanX = maxX - minX || 1
  const spanY = maxY - minY || 1
  const scale = Math.min((w - 2 * pad) / spanX, (h - 2 * pad) / spanY)
  // Centre within the box.
  const offX = (w - spanX * scale) / 2
  const offY = (h - spanY * scale) / 2
  return pts.map((p) => ({
    x: offX + (p.x - minX) * scale,
    y: h - (offY + (p.y - minY) * scale), // flip: north is up
  }))
}
