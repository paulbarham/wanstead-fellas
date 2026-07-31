import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useLocalStore, type UserIdea } from '../store/local'
import { useAuth } from './useAuth'

/**
 * Family-added "things to do" ideas for a leg (place).
 * Reads from the local store (offline-safe); when Supabase is configured it
 * hydrates from `trip_ideas`, subscribes to realtime, and writes optimistically.
 */
export function useLegIdeas(legId: string) {
  const userIdeas = useLocalStore((s) => s.userIdeas[legId] ?? [])
  const addLocal = useLocalStore((s) => s.addUserIdea)
  const removeLocal = useLocalStore((s) => s.removeUserIdea)
  const merge = useLocalStore((s) => s.mergeUserIdeas)
  const { member } = useAuth()

  useEffect(() => {
    if (!supabase) return
    let active = true

    supabase
      .from('trip_ideas')
      .select('id, leg_id, title, note, added_by, created_at')
      .eq('leg_id', legId)
      .order('created_at')
      .then(({ data }) => {
        if (active && data) merge(legId, data as UserIdea[])
      })

    const channel = supabase
      .channel(`trip_ideas_${legId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trip_ideas', filter: `leg_id=eq.${legId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const old = payload.old as { id: string }
            if (old?.id) removeLocal(legId, old.id)
          } else {
            const row = payload.new as UserIdea
            if (row?.id) merge(legId, [row])
          }
        },
      )
      .subscribe()

    return () => {
      active = false
      supabase?.removeChannel(channel)
    }
  }, [legId, merge, removeLocal])

  async function addIdea(title: string, note: string) {
    if (!member) return
    const trimmed = title.trim()
    if (!trimmed) return
    const idea: UserIdea = {
      id: crypto.randomUUID(),
      leg_id: legId,
      title: trimmed,
      note: note.trim() || null,
      added_by: member.id,
      created_at: new Date().toISOString(),
    }
    addLocal(idea) // optimistic
    if (supabase) {
      await supabase.from('trip_ideas').insert({
        id: idea.id,
        leg_id: idea.leg_id,
        title: idea.title,
        note: idea.note,
        added_by: idea.added_by,
      })
    }
  }

  async function removeIdea(id: string) {
    removeLocal(legId, id)
    if (supabase) await supabase.from('trip_ideas').delete().eq('id', id)
  }

  return { userIdeas, addIdea, removeIdea }
}
