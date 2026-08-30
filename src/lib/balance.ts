import type { Profile } from '../types'

/**
 * Post-draft balance constraints, applied after snakeDraft has produced
 * rating-balanced teams. Extracted from AdminTeamBuilder (30 Aug 2026) so
 * this is unit-testable — the two bugs fixed below both survived because the
 * logic lived inside a component and nothing exercised it.
 */

export const STAR_THRESHOLD = 9
export const AGE_SPREAD_TOLERANCE = 1

export function isStar(p: Profile): boolean {
  return (p.overall_rating ?? 0) >= STAR_THRESHOLD
}

export function isOver40(p: Profile): boolean {
  const g = p.age_group
  return g === '40–49' || g === '50+' || g === '40+'
}

export function posBucket(p: Profile): string {
  return p.preferred_position_primary ?? p.position ?? 'REST'
}

/**
 * How many stars a single team may hold.
 *
 * WAS a hardcoded 2, which broke in both directions:
 *
 *   Too loose at 4 teams — the format we actually play. 4 stars across 4
 *   teams should be one each; a cap of 2 happily allowed 2/2/0/0, which is
 *   precisely the star-stacking v2 set out to prevent.
 *
 *   Impossible at 2 teams. Total capacity was 2 x 2 = 4, so a squad with 5
 *   stars (6 Aug 2026) could never satisfy it — and because the old loop
 *   broke out on an unsatisfiable cap, the age-spread pass never ran at all.
 *
 * ceil(stars / teams) is the tightest cap that is always achievable: it's
 * an even spread, rounded up for the remainder.
 */
export function starCapFor(totalStars: number, numTeams: number): number {
  if (numTeams <= 0) return 0
  return Math.max(1, Math.ceil(totalStars / numTeams))
}

export function enforceBalanceConstraints(teams: Profile[][]): Profile[][] {
  const MAX_ITER = 200
  const working = teams.map(t => [...t])

  const totalStars = working.reduce((n, t) => n + t.filter(isStar).length, 0)
  const starCap = starCapFor(totalStars, working.length)

  const starCounts = () => working.map(t => t.filter(isStar).length)
  const oldCounts = () => working.map(t => t.filter(isOver40).length)

  // Try to swap `player` (currently on `fromIdx`) with any position-matching
  // player on any team from `candidates`. Returns true if a swap happened.
  function trySwapOutOf(
    fromIdx: number,
    player: Profile,
    candidateIdxs: number[],
    swapPartnerFilter: (p: Profile) => boolean,
  ): boolean {
    const bucket = posBucket(player)
    for (const toIdx of candidateIdxs) {
      if (toIdx === fromIdx) continue
      const partner = working[toIdx].find(
        p => posBucket(p) === bucket && swapPartnerFilter(p),
      )
      if (!partner) continue
      working[fromIdx] = working[fromIdx].filter(p => p.id !== player.id).concat(partner)
      working[toIdx] = working[toIdx].filter(p => p.id !== partner.id).concat(player)
      return true
    }
    return false
  }

  // `starsDone` / `ageDone` latch only when a pass can make no further
  // progress, letting a stuck pass fall through to the other one.
  //
  // THE BUG THIS FIXES: the old loop `break`ed out entirely when a star
  // violation couldn't be resolved, so an unsatisfiable (or merely stuck)
  // star cap silently disabled the age-spread pass that follows it. One
  // constraint failing must not cancel the other — they're independent.
  //
  // Any SUCCESSFUL swap clears both latches and restarts the scan, because
  // the two constraints interact: an over-40 player can also be a star, so
  // an age swap can create a star violation and vice versa. Restarting
  // mirrors the original's semantics; MAX_ITER bounds the ping-pong.
  let starsDone = false
  let ageDone = false

  for (let i = 0; i < MAX_ITER && !(starsDone && ageDone); i++) {
    if (!starsDone) {
      const stars = starCounts()
      const overStarIdx = stars.findIndex(n => n > starCap)
      if (overStarIdx === -1) {
        starsDone = true
      } else {
        const targets = stars
          .map((n, idx) => [n, idx] as [number, number])
          .filter(([n, idx]) => n < starCap && idx !== overStarIdx)
          .sort((a, b) => a[0] - b[0])
          .map(([, idx]) => idx)
        const surplusStar = working[overStarIdx].find(isStar)
        if (surplusStar && trySwapOutOf(overStarIdx, surplusStar, targets, p => !isStar(p))) {
          ageDone = false
          continue
        }
        // No position-matching non-star available. Stop trying stars, but
        // fall through to the age pass rather than abandoning both.
        starsDone = true
      }
    }

    if (!ageDone) {
      const olds = oldCounts()
      const maxOld = Math.max(...olds)
      const minOld = Math.min(...olds)
      if (maxOld - minOld <= AGE_SPREAD_TOLERANCE) {
        ageDone = true
      } else {
        const highIdx = olds.indexOf(maxOld)
        const lowIdx = olds.indexOf(minOld)
        const surplusOld = working[highIdx].find(isOver40)
        if (surplusOld && trySwapOutOf(highIdx, surplusOld, [lowIdx], p => !isOver40(p))) {
          starsDone = false
          continue
        }
        ageDone = true
      }
    }
  }

  return working
}
