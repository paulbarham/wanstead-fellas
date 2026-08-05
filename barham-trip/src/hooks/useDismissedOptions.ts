import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useLocalStore } from '../store/local'
import { useAuth } from './useAuth'

interface DismissedRow {
  day_n: number
  option_key: string
}

/**
 * Suggestions the admin has removed from a day's recommended plan.
 * Shared across the family and offline-safe: reads from the local store, and
 * when Supabase is configured hydrates from `dismissed_options`, subscribes to
 * realtime, and writes optimistically. Only admins may dismiss/restore.
 */
export function useDismissedOptions(dayN: number) {
  const dismissed = useLocalStore((s) => s.dismissedOptions[dayN] ?? [])
  const addLocal = useLocalStore((s) => s.addDismissedOption)
  const removeLocal = useLocalStore((s) => s.removeDismissedOption)
  const setLocal = useLocalStore((s) => s.setDismissedOptions)
  const { member, isAdmin } = useAuth()

  useEffect(() => {
    if (!supabase) return
    let active = true

    supabase
      .from('dismissed_options')
      .select('day_n, option_key')
      .eq('day_n', dayN)
      .then(({ data }) => {
        if (active && data) setLocal(dayN, (data as DismissedRow[]).map((r) => r.option_key))
      })

    const channel = supabase
      .channel(`dismissed_options_${dayN}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'dismissed_options', filter: `day_n=eq.${dayN}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const old = payload.old as DismissedRow
            if (old?.option_key) removeLocal(dayN, old.option_key)
          } else {
            const row = payload.new as DismissedRow
            if (row?.option_key) addLocal(dayN, row.option_key)
          }
        },
      )
      .subscribe()

    return () => {
      active = false
      supabase?.removeChannel(channel)
    }
  }, [dayN, setLocal, addLocal, removeLocal])

  async function dismiss(optionKey: string) {
    if (!isAdmin || !member) return
    addLocal(dayN, optionKey) // optimistic
    if (supabase) {
      await supabase
        .from('dismissed_options')
        .insert({ day_n: dayN, option_key: optionKey, dismissed_by: member.id })
    }
  }

  async function restore(optionKey: string) {
    if (!isAdmin) return
    removeLocal(dayN, optionKey) // optimistic
    if (supabase) {
      await supabase
        .from('dismissed_options')
        .delete()
        .eq('day_n', dayN)
        .eq('option_key', optionKey)
    }
  }

  return { dismissed, dismiss, restore }
}
