// Block-window helpers used by both MyFinances (player view) and
// AdminFinancePanel. Mirrors the v_blocked_players SQL view exactly so the
// UX matches the block gate — no drift possible.

/**
 * Returns the date at which a debt for the given match date will trip the
 * block, per `v_blocked_players`:
 *   last Thursday of the debt's month + 16 days.
 * Returns null for pre-Jun 2026 debts — the SQL view excludes them and so
 * do we, so admin can visually see them but they're not counted toward
 * blocks (legacy/pre-app amnesty).
 */
export function getBlockDueDate(matchDateStr: string): Date | null {
  if (matchDateStr < '2026-06-01') return null
  const [y, m] = matchDateStr.split('-').map(Number)
  const lastDayOfMonth = new Date(y, m, 0)  // m 1-indexed → last day of month m
  // Walk back to Thursday (Sun=0…Thu=4…Sat=6)
  const daysBack = (lastDayOfMonth.getDay() + 7 - 4) % 7
  const dueAt = new Date(y, m - 1, lastDayOfMonth.getDate() - daysBack)
  dueAt.setDate(dueAt.getDate() + 16)
  return dueAt
}

export type BlockStatus =
  | { kind: 'safe' }
  | { kind: 'due-soon'; amount: number; dueAt: Date; monthKey: string }
  | { kind: 'past-due'; amount: number; dueAt: Date; monthKey: string }

/**
 * Given a list of {match_date, amount} debts, computes the earliest
 * at-risk state. Uses a 7-day warning window before the block trips.
 *
 * Filters out immune (pre-Jun 2026) debts and credit-netted amounts.
 */
export function computeBlockStatus(
  debts: Array<{ match_date: string; amount: number }>,
  creditBalance: number,
  now: Date = new Date(),
): BlockStatus {
  const byMonth = new Map<string, { total: number; dueAt: Date }>()
  for (const d of debts) {
    const dueAt = getBlockDueDate(d.match_date)
    if (!dueAt) continue  // immune
    const k = d.match_date.slice(0, 7)
    const existing = byMonth.get(k)
    if (existing) existing.total += d.amount
    else byMonth.set(k, { total: d.amount, dueAt })
  }

  const months = Array.from(byMonth.entries())
    .map(([k, v]) => ({ monthKey: k, ...v }))
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())

  let remainingCredit = creditBalance
  for (const m of months) {
    const netForMonth = Math.max(0, m.total - remainingCredit)
    remainingCredit = Math.max(0, remainingCredit - m.total)
    if (netForMonth === 0) continue

    const daysUntil = Math.ceil((m.dueAt.getTime() - now.getTime()) / 86400000)
    if (daysUntil < 0) return { kind: 'past-due', amount: netForMonth, dueAt: m.dueAt, monthKey: m.monthKey }
    if (daysUntil <= 7) return { kind: 'due-soon', amount: netForMonth, dueAt: m.dueAt, monthKey: m.monthKey }
    return { kind: 'safe' }
  }
  return { kind: 'safe' }
}

export function monthLabelOf(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' }).toUpperCase()
}
