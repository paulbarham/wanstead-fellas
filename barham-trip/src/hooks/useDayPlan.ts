import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useLocalStore, type DayPlanItem } from '../store/local'
import { useAuth } from './useAuth'

/** Add an activity to any day's plan (optimistic local write + Supabase insert).
 *  Standalone so it can be used outside a per-day hook, e.g. when adding an idea
 *  from the ideas board to a suggested day. */
export async function addToDay(dayN: number, title: string, note: string, memberId: string) {
  const trimmed = title.trim()
  if (!trimmed) return
  // New items land at the bottom of the day's list.
  const sort = (useLocalStore.getState().dayPlans[dayN] ?? []).length
  const item: DayPlanItem = {
    id: crypto.randomUUID(),
    day_n: dayN,
    title: trimmed,
    note: note.trim() || null,
    done: false,
    sort,
    added_by: memberId,
    created_at: new Date().toISOString(),
  }
  useLocalStore.getState().addDayPlanItem(item) // optimistic
  if (supabase) {
    await supabase.from('day_plans').insert({
      id: item.id,
      day_n: item.day_n,
      title: item.title,
      note: item.note,
      done: item.done,
      sort: item.sort,
      added_by: item.added_by,
    })
  }
}

/**
 * The family-curated plan for a single day (day number `n`).
 * Reads from the local store (offline-safe); when Supabase is configured it
 * hydrates from `day_plans`, subscribes to realtime, and writes optimistically.
 * The plan is collaborative — anyone can add, tick off, or remove an activity.
 */
export function useDayPlan(dayN: number) {
  const items = useLocalStore((s) => s.dayPlans[dayN] ?? [])
  const removeLocal = useLocalStore((s) => s.removeDayPlanItem)
  const setDoneLocal = useLocalStore((s) => s.setDayPlanDone)
  const setOrderLocal = useLocalStore((s) => s.setDayPlanOrder)
  const merge = useLocalStore((s) => s.mergeDayPlanItems)
  const { member } = useAuth()

  useEffect(() => {
    if (!supabase) return
    let active = true

    supabase
      .from('day_plans')
      .select('id, day_n, title, note, done, sort, added_by, created_at')
      .eq('day_n', dayN)
      .order('sort')
      .then(({ data }) => {
        if (active && data) merge(dayN, data as DayPlanItem[])
      })

    const channel = supabase
      .channel(`day_plans_${dayN}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'day_plans', filter: `day_n=eq.${dayN}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const old = payload.old as { id: string }
            if (old?.id) removeLocal(dayN, old.id)
          } else {
            const row = payload.new as DayPlanItem
            if (row?.id) merge(dayN, [row])
          }
        },
      )
      .subscribe()

    return () => {
      active = false
      supabase?.removeChannel(channel)
    }
  }, [dayN, merge, removeLocal])

  async function addItem(title: string, note: string) {
    if (!member) return
    await addToDay(dayN, title, note, member.id)
  }

  async function toggleDone(id: string, done: boolean) {
    setDoneLocal(dayN, id, done) // optimistic
    if (supabase) await supabase.from('day_plans').update({ done }).eq('id', id)
  }

  async function removeItem(id: string) {
    removeLocal(dayN, id)
    if (supabase) await supabase.from('day_plans').delete().eq('id', id)
  }

  /** Persist a new manual order (list of item ids, top → bottom). */
  async function reorder(orderedIds: string[]) {
    setOrderLocal(dayN, orderedIds) // optimistic
    if (supabase) {
      await Promise.all(
        orderedIds.map((id, idx) => supabase!.from('day_plans').update({ sort: idx }).eq('id', id)),
      )
    }
  }

  return { items, addItem, toggleDone, removeItem, reorder }
}
