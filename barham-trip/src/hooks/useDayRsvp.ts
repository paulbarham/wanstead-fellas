import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useLocalStore, rsvpKey } from '../store/local'
import { useAuth } from './useAuth'
import type { RsvpChoice } from '../lib/itinerary'

/**
 * Everyone's RSVP for one day, live.
 * - Reads from the local store (offline-safe).
 * - When Supabase is configured, hydrates all members' choices for the day,
 *   subscribes to realtime changes on `day_rsvp`, and writes the current user's
 *   choice optimistically.
 */
export function useDayRsvp(dayN: number) {
  const rsvp = useLocalStore((s) => s.rsvp)
  const setRsvpLocal = useLocalStore((s) => s.setRsvp)
  const hydrate = useLocalStore((s) => s.hydrateRsvp)
  const { member, members } = useAuth()

  useEffect(() => {
    if (!supabase) return
    let active = true

    supabase
      .from('day_rsvp')
      .select('member_id, day_n, choice')
      .eq('day_n', dayN)
      .then(({ data }) => {
        if (!active || !data) return
        const rows: Record<string, RsvpChoice> = {}
        for (const r of data) {
          rows[rsvpKey(r.member_id, r.day_n)] = r.choice as RsvpChoice
        }
        hydrate(rows)
      })

    const channel = supabase
      .channel(`day_rsvp_${dayN}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'day_rsvp', filter: `day_n=eq.${dayN}` },
        (payload) => {
          const row = payload.new as { member_id: string; day_n: number; choice: RsvpChoice }
          if (row?.member_id) {
            setRsvpLocal(row.member_id, row.day_n, row.choice)
          }
        },
      )
      .subscribe()

    return () => {
      active = false
      supabase?.removeChannel(channel)
    }
  }, [dayN, hydrate, setRsvpLocal])

  /** member_id -> their choice for this day (undefined if not yet chosen). */
  const choices: Record<string, RsvpChoice | undefined> = {}
  for (const m of members) {
    choices[m.id] = rsvp[rsvpKey(m.id, dayN)]
  }

  const myChoice: RsvpChoice | undefined = member ? rsvp[rsvpKey(member.id, dayN)] : undefined

  /** Set the RSVP for a specific member (self, or someone you manage). */
  async function setChoiceFor(memberId: string, choice: RsvpChoice) {
    setRsvpLocal(memberId, dayN, choice)
    if (supabase) {
      await supabase.from('day_rsvp').upsert(
        {
          member_id: memberId,
          day_n: dayN,
          choice,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'member_id,day_n' },
      )
    }
  }

  async function setChoice(choice: RsvpChoice) {
    if (!member) return
    await setChoiceFor(member.id, choice)
  }

  return { choices, myChoice, setChoice, setChoiceFor }
}
