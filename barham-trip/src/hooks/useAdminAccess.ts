import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

export interface AccessRow {
  display_name: string
  email: string | null
  age_group: string
  is_admin: boolean
  /** True if this person can sign in (has a seeded email). */
  can_login: boolean
  /** True if an auth account actually exists for them. */
  has_account: boolean
  last_sign_in_at: string | null
  signed_up_at: string | null
  /** For managed members (no device): the managing adult's name. */
  managed_by: string | null
}

/**
 * Admin-only: who can access the app and who has actually signed in.
 * Calls the `admin_access_overview` RPC (SECURITY DEFINER, self-gated to admins).
 * Returns `supported: false` in local/preview mode where there's no backend.
 */
export function useAdminAccess() {
  const { isAdmin } = useAuth()
  const [rows, setRows] = useState<AccessRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!supabase || !isAdmin) return
    setLoading(true)
    setError(null)
    const { data, error } = await supabase.rpc('admin_access_overview')
    if (error) setError(error.message)
    else setRows((data ?? []) as AccessRow[])
    setLoading(false)
  }, [isAdmin])

  useEffect(() => {
    load()
  }, [load])

  return { rows, error, loading, reload: load, supported: !!supabase }
}
