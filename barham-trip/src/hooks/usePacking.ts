import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useLocalStore, packingKey } from '../store/local'
import { useAuth } from './useAuth'

/**
 * Per-USER packing ticks (my packing ≠ yours).
 * Reads from the local store; syncs the signed-in user's rows with Supabase.
 */
export function usePacking() {
  const packing = useLocalStore((s) => s.packing)
  const setPackingLocal = useLocalStore((s) => s.setPacking)
  const hydrate = useLocalStore((s) => s.hydratePacking)
  const { member } = useAuth()

  useEffect(() => {
    if (!supabase || !member) return
    let active = true

    supabase
      .from('packing_status')
      .select('member_id, item_key, checked')
      .eq('member_id', member.id)
      .then(({ data }) => {
        if (!active || !data) return
        const rows: Record<string, boolean> = {}
        for (const r of data) {
          rows[packingKey(r.member_id, r.item_key)] = r.checked
        }
        hydrate(rows)
      })

    return () => {
      active = false
    }
  }, [member, hydrate])

  function isChecked(itemKey: string): boolean {
    if (!member) return false
    return packing[packingKey(member.id, itemKey)] ?? false
  }

  async function toggle(itemKey: string) {
    if (!member) return
    const next = !isChecked(itemKey)
    setPackingLocal(member.id, itemKey, next)
    if (supabase) {
      await supabase.from('packing_status').upsert(
        {
          member_id: member.id,
          item_key: itemKey,
          checked: next,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'member_id,item_key' },
      )
    }
  }

  return { isChecked, toggle }
}
