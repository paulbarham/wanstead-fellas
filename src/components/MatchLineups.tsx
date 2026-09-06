import { useState } from 'react'
import type { Team } from '../types'

// Historical team lineups block for the History tab.
//
// Sits inside a match's expanded view (below MatchResultView), collapsed
// by default. On expand, renders each team's roster with captain (©),
// formation shape (if set), and DEBUT badges for players making their
// first appearance.
//
// All data is passed in — no self-fetching, no extra queries per expand.

export interface TeamLineup {
  team: Team
  players: { id: string; name: string; surname: string | null; isCaptain: boolean; isDebut: boolean }[]
  shape: string | null  // e.g. '2-3-1'
}

function stripFC(name: string | undefined | null): string {
  if (!name) return ''
  return name.replace(/\s+FC$/i, '').trim()
}

export default function MatchLineups({ lineups }: { lineups: TeamLineup[] }) {
  const [open, setOpen] = useState(false)

  if (lineups.length === 0) return null

  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-semibold"
        style={{
          background: 'var(--color-surface-2, var(--color-bg))',
          border: '1px solid var(--color-border)',
          color: 'var(--color-text)',
        }}
      >
        <span>👥 {open ? 'Hide lineups' : 'Show lineups'}</span>
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
          {open ? '▲' : '▼'}
        </span>
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          {lineups.map(({ team, players, shape }) => (
            <div
              key={team.id}
              className="rounded-xl"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                backgroundClip: 'padding-box',
              }}
            >
              {/* Header band — captain + bibs + shape */}
              <div
                className="flex items-center justify-between gap-2 px-3 py-2"
                style={{
                  background: 'var(--color-surface-2, var(--color-bg))',
                  borderBottom: '1px solid var(--color-border)',
                  borderTopLeftRadius: 11, borderTopRightRadius: 11,
                }}>
                <h3
                  style={{
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--tt-yellow)',
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}>
                  © {stripFC(team.name)}
                </h3>
                <div className="flex items-center gap-2">
                  {shape && (
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 9,
                        color: 'var(--tt-cyan)',
                        padding: '2px 6px',
                        borderRadius: 3,
                        background: 'rgba(74,217,255,0.10)',
                        letterSpacing: '0.06em',
                      }}>
                      {shape}
                    </span>
                  )}
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: '0.1em',
                      padding: '2px 6px',
                      borderRadius: 3,
                      background: team.bibs ? 'var(--tt-yellow)' : 'var(--color-text)',
                      color: team.bibs ? '#000' : 'var(--color-surface)',
                    }}>
                    {team.bibs ? 'BIBS' : 'SKINS'}
                  </span>
                </div>
              </div>

              {/* Roster */}
              <div>
                {players.map((p, i) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 px-3 py-1.5"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 12,
                      borderTop: i === 0 ? 'none' : '1px solid var(--color-border)',
                    }}
                  >
                    <span style={{ color: 'var(--color-text-muted)', fontSize: 10, width: 20 }}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span
                      className="flex-1 truncate"
                      style={{ color: p.isCaptain ? 'var(--tt-yellow)' : 'var(--color-text)' }}>
                      {p.name} {p.surname ?? ''}
                    </span>
                    {p.isDebut && (
                      <span
                        title="Debutant on this night"
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 8,
                          fontWeight: 700,
                          letterSpacing: '0.1em',
                          padding: '1px 5px',
                          borderRadius: 3,
                          background: 'var(--tt-cyan)',
                          color: '#fff',
                        }}>
                        🆕 DEBUT
                      </span>
                    )}
                    {p.isCaptain && (
                      <span style={{ color: 'var(--tt-yellow)', fontSize: 11, fontWeight: 700 }}>©</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
