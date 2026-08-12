import { Navigation, Route as RouteIcon, WifiOff, Download } from 'lucide-react'
import type { DriveRoute } from '../lib/routes'
import { mapsDirUrl, projectRoute } from '../lib/routes'

interface Props {
  route: DriveRoute
}

const W = 320
const H = 210
const PAD = 26

/** Offline route overview for a driving day: a bundled schematic map (renders
 *  with no signal), the stops, one-tap directions, and how to save the area for
 *  real offline sat-nav. */
export default function RouteMap({ route }: Props) {
  const pts = projectRoute(route.waypoints, W, H, PAD)
  const line = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')

  return (
    <section
      className="rounded-card p-4 shadow-card"
      style={{
        background: 'var(--surface)',
        border: '1px solid rgba(14,58,72,0.1)',
        backgroundClip: 'padding-box',
      }}
    >
      <div className="flex items-center gap-2">
        <RouteIcon size={18} style={{ color: 'var(--coral-dark)' }} />
        <h3 className="font-display text-lg text-navy">Drive · {route.title}</h3>
      </div>
      <p className="mt-0.5 text-[13px] text-navy/60">
        {route.via} · {route.distance}
      </p>

      {/* Schematic route — bundled, works offline */}
      <div
        className="mt-3 overflow-hidden rounded-xl"
        style={{ background: 'var(--sand-2)', border: '1px solid rgba(14,58,72,0.08)' }}
      >
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Route from ${route.waypoints[0].name} to ${route.waypoints[route.waypoints.length - 1].name}`}>
          {/* route line */}
          <polyline
            points={line}
            fill="none"
            stroke="var(--coral)"
            strokeWidth={3}
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeDasharray="1 6"
          />
          {pts.map((p, i) => {
            const isStart = i === 0
            const isEnd = i === pts.length - 1
            const r = isStart || isEnd ? 8 : 6
            const fill = isEnd ? 'var(--coral)' : isStart ? 'var(--teal)' : 'var(--surface)'
            return (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r={r} fill={fill} stroke="var(--navy)" strokeWidth={isStart || isEnd ? 0 : 1.5} />
                <text
                  x={p.x}
                  y={p.y + (isStart || isEnd ? 4 : 3.5)}
                  textAnchor="middle"
                  fontSize={isStart || isEnd ? 10 : 9}
                  fontWeight="700"
                  fill={isStart || isEnd ? '#fff' : 'var(--navy)'}
                >
                  {i + 1}
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      {/* Numbered stops */}
      <ol className="mt-3 space-y-1">
        {route.waypoints.map((w, i) => (
          <li key={i} className="flex items-baseline gap-2 text-[13px]">
            <span
              className="grid h-5 w-5 flex-shrink-0 place-items-center rounded-full text-[11px] font-bold text-white"
              style={{ background: i === 0 ? 'var(--teal)' : i === route.waypoints.length - 1 ? 'var(--coral)' : 'rgba(14,58,72,0.45)' }}
            >
              {i + 1}
            </span>
            <span className="font-semibold text-navy">{w.name}</span>
            {w.note && <span className="text-navy/55">· {w.note}</span>}
          </li>
        ))}
      </ol>

      <a
        href={mapsDirUrl(route)}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-flex items-center gap-1.5 rounded-full px-4 text-[14px] font-semibold text-white active:opacity-90"
        style={{ background: 'var(--teal)', minHeight: 44 }}
      >
        <Navigation size={16} /> Directions in Google Maps
      </a>

      {/* Offline download guidance */}
      <div
        className="mt-3 flex items-start gap-2.5 rounded-xl p-3"
        style={{ background: 'var(--navy)', color: '#fff', backgroundClip: 'padding-box' }}
      >
        <WifiOff size={17} className="mt-0.5 flex-shrink-0" style={{ color: '#f6c9a0' }} />
        <div className="text-[13px] leading-snug text-white/90">
          <div className="font-bold text-white">Signal will drop — save the map first</div>
          <div className="mt-1">
            On wifi before you leave: open Google Maps, search <span className="font-semibold text-white">{route.offlineArea.split(' → ').slice(-1)[0]}</span>, tap your profile → <span className="font-semibold text-white">Offline maps</span> → <span className="font-semibold text-white">Select your own map</span>, and drag the box to cover <span className="font-semibold text-white">{route.offlineArea}</span>. Once it's downloaded, the directions above navigate with no signal.
          </div>
          <div className="mt-1.5 inline-flex items-center gap-1 text-[12px] text-white/70">
            <Download size={12} /> This trip plan already works offline.
          </div>
        </div>
      </div>
    </section>
  )
}
