import { describe, it, expect } from 'vitest'
import type { Profile, PlayerType } from '../types'
import {
  stripFC,
  pickConfig,
  formatLabelFor,
  splitPlayingAndReserves,
  type PlayerWithSignup,
} from './format'

function makePlayer(id: string, type: PlayerType): Profile {
  return { id, player_type: type } as Profile
}

function signup(id: string, type: PlayerType, createdAt: string): PlayerWithSignup {
  return { player: makePlayer(id, type), createdAt }
}

describe('stripFC', () => {
  it('strips a trailing FC suffix', () => {
    expect(stripFC('Wanstead FC')).toBe('Wanstead')
  })

  it('strips a trailing XI suffix', () => {
    expect(stripFC('Reds XI')).toBe('Reds')
  })

  it('leaves names without a suffix untouched', () => {
    expect(stripFC('Blues')).toBe('Blues')
  })

  it('only strips the suffix when separated by whitespace', () => {
    expect(stripFC('MFC')).toBe('MFC')
  })

  it('handles undefined', () => {
    expect(stripFC(undefined)).toBe('')
  })
})

describe('pickConfig', () => {
  it('picks the largest config that the count satisfies', () => {
    expect(pickConfig(32)).toEqual({ total: 32, numTeams: 4, teamSize: 8 })
    expect(pickConfig(30)).toEqual({ total: 28, numTeams: 4, teamSize: 7 })
    expect(pickConfig(23)).toEqual({ total: 22, numTeams: 2, teamSize: 11 })
  })

  it('falls to the smallest valid config at the boundary', () => {
    expect(pickConfig(10)).toEqual({ total: 10, numTeams: 2, teamSize: 5 })
  })

  it('returns null below the minimum playable count', () => {
    expect(pickConfig(9)).toBeNull()
    expect(pickConfig(0)).toBeNull()
  })
})

describe('formatLabelFor', () => {
  it('formats a config as NvN', () => {
    expect(formatLabelFor({ total: 16, numTeams: 2, teamSize: 8 })).toBe('8v8')
  })

  it('renders a dash for a null config', () => {
    expect(formatLabelFor(null)).toBe('—')
  })
})

describe('splitPlayingAndReserves', () => {
  it('keeps everyone playing when at or under target size', () => {
    const candidates = [
      signup('a', 'subscribed', '2026-01-01T10:00:00Z'),
      signup('b', 'wtp', '2026-01-01T11:00:00Z'),
    ]
    const { playing, reserves } = splitPlayingAndReserves(candidates, 2)
    expect(playing).toHaveLength(2)
    expect(reserves).toHaveLength(0)
  })

  it('defers wtp before wtp_priority before subscribed', () => {
    const candidates = [
      signup('sub', 'subscribed', '2026-01-01T09:00:00Z'),
      signup('prio', 'wtp_priority', '2026-01-01T09:00:00Z'),
      signup('wtp', 'wtp', '2026-01-01T09:00:00Z'),
    ]
    // target 2 → exactly one reserve, which should be the plain wtp player
    const { playing, reserves } = splitPlayingAndReserves(candidates, 2)
    expect(reserves.map(r => r.player.id)).toEqual(['wtp'])
    expect(playing.map(p => p.player.id).sort()).toEqual(['prio', 'sub'])
  })

  it('within a tier, defers the latest signups first', () => {
    const candidates = [
      signup('early', 'wtp', '2026-01-01T08:00:00Z'),
      signup('mid', 'wtp', '2026-01-01T09:00:00Z'),
      signup('late', 'wtp', '2026-01-01T10:00:00Z'),
    ]
    // target 1 → two reserves: the two latest signups
    const { playing, reserves } = splitPlayingAndReserves(candidates, 1)
    expect(playing.map(p => p.player.id)).toEqual(['early'])
    expect(reserves.map(r => r.player.id).sort()).toEqual(['late', 'mid'])
  })

  it('treats a missing player_type as plain wtp', () => {
    const noType = { player: { id: 'x' } as Profile, createdAt: '2026-01-01T09:00:00Z' }
    const candidates = [
      signup('sub', 'subscribed', '2026-01-01T09:00:00Z'),
      noType,
    ]
    const { playing, reserves } = splitPlayingAndReserves(candidates, 1)
    expect(playing.map(p => p.player.id)).toEqual(['sub'])
    expect(reserves.map(r => r.player.id)).toEqual(['x'])
  })

  it('preserves the original candidate order in the playing list', () => {
    const candidates = [
      signup('a', 'subscribed', '2026-01-01T09:00:00Z'),
      signup('b', 'wtp', '2026-01-01T08:00:00Z'),
      signup('c', 'subscribed', '2026-01-01T07:00:00Z'),
    ]
    const { playing } = splitPlayingAndReserves(candidates, 2)
    expect(playing.map(p => p.player.id)).toEqual(['a', 'c'])
  })
})
