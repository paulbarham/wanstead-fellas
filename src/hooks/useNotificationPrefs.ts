import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import {
  DEFAULT_PREFS,
  type NotificationCategory,
  type NotificationPrefs,
} from '../lib/notifications'

/**
 * Per-player notification preferences (mig 081).
 *
 * Absence of a row means everything is on, so we never seed rows — one only
 * appears the first time a player changes something. That's why every write is
 * an upsert of the FULL preference set rather than a patch of one column.
 *
 * Writes are optimistic: the toggle flips instantly and rolls back if the
 * round-trip fails. On a phone on a pub wifi, waiting on the network before
 * moving the switch feels broken.
 */
export function useNotificationPrefs() {
  const { profile } = useAuth()
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS)
  const [error, setError] = useState<string | null>(null)
  // Which profile we've finished loading for. Derived `loading` below rather
  // than a setState-in-effect, which trips react-hooks/set-state-in-effect and
  // causes a cascading render. Tracking the id (not a bare boolean) means
  // switching account correctly re-loads instead of showing the last player's
  // preferences.
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const loading = !!profile && loadedFor !== profile.id

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    ;(async () => {
      const { data, error: err } = await supabase
        .from('notification_preferences')
        .select('match_night, results, games, money, club_news')
        .eq('player_id', profile.id)
        .maybeSingle()
      if (cancelled) return
      if (err) setError(err.message)
      // No row → defaults. That's the normal case for almost everyone.
      else if (data) setPrefs({ ...DEFAULT_PREFS, ...data })
      setLoadedFor(profile.id)
    })()
    return () => { cancelled = true }
  }, [profile])

  const save = useCallback(async (next: NotificationPrefs) => {
    if (!profile) return
    const previous = prefs
    setPrefs(next)
    setError(null)
    const { error: err } = await supabase
      .from('notification_preferences')
      .upsert({ player_id: profile.id, ...next }, { onConflict: 'player_id' })
    if (err) {
      setPrefs(previous)
      setError(err.message)
    }
  }, [profile, prefs])

  const toggle = useCallback((key: NotificationCategory) => {
    void save({ ...prefs, [key]: !prefs[key] })
  }, [prefs, save])

  const setAll = useCallback((value: boolean) => {
    void save({
      match_night: value, results: value, games: value, money: value, club_news: value,
    })
  }, [save])

  const enabledCount = Object.values(prefs).filter(Boolean).length
  const allOff = enabledCount === 0

  return { prefs, loading, error, toggle, setAll, enabledCount, allOff }
}
