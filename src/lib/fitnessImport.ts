// ── Client-side parser for watch workout exports (TCX / GPX) ──────────────────
// Polar Flow, Garmin Connect, Apple Health and Strava can all export one of
// these. We parse in the browser with DOMParser — the file never leaves the
// device; only the extracted numbers are saved. Anything we can't find is left
// null for the player to fill in by hand before saving.

export interface ParsedFitness {
  source: string
  sport: string | null
  recordedStart: string | null // ISO timestamp
  durationS: number | null
  distanceM: number | null
  avgHr: number | null
  maxHr: number | null
  calories: number | null
  avgSpeedKmh: number | null
  maxSpeedKmh: number | null
}

const EMPTY: Omit<ParsedFitness, 'source'> = {
  sport: null, recordedStart: null, durationS: null, distanceM: null,
  avgHr: null, maxHr: null, calories: null, avgSpeedKmh: null, maxSpeedKmh: null,
}

function num(v: string | null | undefined): number | null {
  if (v == null) return null
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : null
}

function round(n: number | null, dp = 1): number | null {
  if (n == null) return null
  const f = 10 ** dp
  return Math.round(n * f) / f
}

// Tag lookup that ignores XML namespaces (TCX/GPX use prefixes inconsistently).
function localName(el: Element): string {
  return el.localName || el.tagName.replace(/^.*:/, '')
}
function findAll(root: Element | Document, name: string): Element[] {
  const out: Element[] = []
  const walk = (el: Element) => {
    if (localName(el) === name) out.push(el)
    for (const c of Array.from(el.children)) walk(c)
  }
  if (root instanceof Document) {
    if (root.documentElement) walk(root.documentElement)
  } else {
    walk(root)
  }
  return out
}
function firstText(root: Element | Document, name: string): string | null {
  const el = findAll(root, name)[0]
  return el?.textContent?.trim() ?? null
}

// Haversine distance between two lat/lon points, in metres.
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

function parseTcx(doc: Document): Omit<ParsedFitness, 'source'> {
  const out = { ...EMPTY }
  const activity = findAll(doc, 'Activity')[0]
  out.sport = activity?.getAttribute('Sport')?.toLowerCase() ?? null

  const laps = findAll(doc, 'Lap')
  let dur = 0, dist = 0, cals = 0
  let maxSpeedMs = 0, maxHr = 0
  let hrSum = 0, hrCount = 0
  for (const lap of laps) {
    dur += num(firstText(lap, 'TotalTimeSeconds')) ?? 0
    dist += num(firstText(lap, 'DistanceMeters')) ?? 0
    cals += num(firstText(lap, 'Calories')) ?? 0
    const lapMaxSpeed = num(firstText(lap, 'MaximumSpeed'))
    if (lapMaxSpeed != null) maxSpeedMs = Math.max(maxSpeedMs, lapMaxSpeed)
    const lapMaxHr = num(firstText(lap, 'MaximumHeartRateBpm'))
    if (lapMaxHr != null) maxHr = Math.max(maxHr, lapMaxHr)
    const lapAvgHr = num(firstText(lap, 'AverageHeartRateBpm'))
    if (lapAvgHr != null) { hrSum += lapAvgHr; hrCount += 1 }
  }

  // Trackpoint pass — fills gaps the lap summaries miss (per-point HR/speed).
  const trkpts = findAll(doc, 'Trackpoint')
  let tpHrSum = 0, tpHrCount = 0, tpMaxHr = 0, tpMaxSpeedMs = 0
  for (const tp of trkpts) {
    const hr = num(firstText(tp, 'HeartRateBpm'))
    if (hr != null) { tpHrSum += hr; tpHrCount += 1; tpMaxHr = Math.max(tpMaxHr, hr) }
    const sp = num(firstText(tp, 'Speed')) // ns:Speed in TPX extension, m/s
    if (sp != null) tpMaxSpeedMs = Math.max(tpMaxSpeedMs, sp)
  }

  out.durationS = dur > 0 ? Math.round(dur) : null
  out.distanceM = dist > 0 ? Math.round(dist) : null
  out.calories = cals > 0 ? Math.round(cals) : null
  out.maxHr = Math.max(maxHr, tpMaxHr) || null
  out.avgHr = hrCount > 0 ? Math.round(hrSum / hrCount) : (tpHrCount > 0 ? Math.round(tpHrSum / tpHrCount) : null)

  const maxMs = Math.max(maxSpeedMs, tpMaxSpeedMs)
  out.maxSpeedKmh = maxMs > 0 ? round(maxMs * 3.6) : null
  if (out.distanceM && out.durationS) out.avgSpeedKmh = round((out.distanceM / out.durationS) * 3.6)

  out.recordedStart = firstText(doc, 'Id') || firstText(doc, 'Time') || null
  return out
}

function parseGpx(doc: Document): Omit<ParsedFitness, 'source'> {
  const out = { ...EMPTY }
  out.sport = firstText(doc, 'type')?.toLowerCase() ?? null

  const pts = findAll(doc, 'trkpt')
  if (pts.length === 0) return out

  let dist = 0
  let prevLat: number | null = null, prevLon: number | null = null
  let firstTime: string | null = null, lastTime: string | null = null
  let hrSum = 0, hrCount = 0, maxHr = 0
  let maxSpeedMs = 0
  let prevTimeMs: number | null = null

  for (const pt of pts) {
    const lat = num(pt.getAttribute('lat'))
    const lon = num(pt.getAttribute('lon'))
    const t = firstText(pt, 'time')
    if (t) { if (!firstTime) firstTime = t; lastTime = t }

    if (lat != null && lon != null) {
      if (prevLat != null && prevLon != null) {
        const seg = haversine(prevLat, prevLon, lat, lon)
        dist += seg
        if (t && prevTimeMs != null) {
          const dt = (new Date(t).getTime() - prevTimeMs) / 1000
          if (dt > 0) maxSpeedMs = Math.max(maxSpeedMs, seg / dt)
        }
      }
      prevLat = lat; prevLon = lon
    }
    if (t) prevTimeMs = new Date(t).getTime()

    // Garmin TrackPointExtension HR (gpxtpx:hr) or a bare <hr>.
    const hr = num(firstText(pt, 'hr'))
    if (hr != null) { hrSum += hr; hrCount += 1; maxHr = Math.max(maxHr, hr) }
  }

  out.distanceM = dist > 0 ? Math.round(dist) : null
  if (firstTime && lastTime) {
    const d = (new Date(lastTime).getTime() - new Date(firstTime).getTime()) / 1000
    out.durationS = d > 0 ? Math.round(d) : null
  }
  out.recordedStart = firstTime
  out.avgHr = hrCount > 0 ? Math.round(hrSum / hrCount) : null
  out.maxHr = maxHr || null
  // GPS-derived top speed is noisy; only surface if plausible (< 45 km/h).
  const maxKmh = round(maxSpeedMs * 3.6)
  out.maxSpeedKmh = maxKmh != null && maxKmh < 45 ? maxKmh : null
  if (out.distanceM && out.durationS) out.avgSpeedKmh = round((out.distanceM / out.durationS) * 3.6)
  return out
}

export async function parseFitnessFile(file: File): Promise<ParsedFitness> {
  const text = await file.text()
  const lower = file.name.toLowerCase()
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.querySelector('parsererror')) {
    throw new Error('Could not read that file — is it a valid .tcx or .gpx export?')
  }

  const isTcx = lower.endsWith('.tcx') || findAll(doc, 'TrainingCenterDatabase').length > 0
  const isGpx = lower.endsWith('.gpx') || findAll(doc, 'gpx').length > 0 || localName(doc.documentElement) === 'gpx'

  if (isTcx) return { source: 'tcx_upload', ...parseTcx(doc) }
  if (isGpx) return { source: 'gpx_upload', ...parseGpx(doc) }
  throw new Error('Unsupported file. Export a .tcx or .gpx from your watch app.')
}
