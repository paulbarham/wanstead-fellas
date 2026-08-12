import { describe, it, expect } from 'vitest'
import { routes, routeForDay, mapsDirUrl, projectRoute } from './routes'

describe('routes', () => {
  it('has a route for the big transfer days', () => {
    expect(routeForDay(5)?.title).toContain('Cambria')
    expect(routeForDay(16)?.title).toContain('Las Vegas')
    expect(routeForDay(99)).toBeUndefined()
  })

  it('every route has at least two waypoints with valid coords', () => {
    for (const r of routes) {
      expect(r.waypoints.length).toBeGreaterThanOrEqual(2)
      for (const w of r.waypoints) {
        expect(w.lat).toBeGreaterThan(30)
        expect(w.lat).toBeLessThan(42)
        expect(w.lng).toBeLessThan(-114)
        expect(w.lng).toBeGreaterThan(-124)
      }
    }
  })

  it('builds a Google Maps directions url with origin, destination and vias', () => {
    const r = routeForDay(5)!
    const url = mapsDirUrl(r)
    expect(url).toContain('origin=37.788,-122.412')
    expect(url).toContain('destination=35.5641,-121.0807')
    expect(url).toContain('waypoints=')
    expect(url).toContain('travelmode=driving')
  })

  it('projects every waypoint inside the SVG box', () => {
    for (const r of routes) {
      const pts = projectRoute(r.waypoints, 320, 210, 26)
      expect(pts.length).toBe(r.waypoints.length)
      for (const p of pts) {
        expect(p.x).toBeGreaterThanOrEqual(0)
        expect(p.x).toBeLessThanOrEqual(320)
        expect(p.y).toBeGreaterThanOrEqual(0)
        expect(p.y).toBeLessThanOrEqual(210)
      }
    }
  })
})
