import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, hasSupabase, functionsUrl, supabaseAnonKey } from '../lib/supabase'
import { DEFAULT_FAMILY, type Member } from '../lib/family'

const LOCAL_SEAT_KEY = 'barham-trip-seat'

interface AuthValue {
  loading: boolean
  /** True once we know who (if anyone) is signed in. */
  ready: boolean
  session: Session | null
  /** The current signed-in family member, or null if signed out. */
  member: Member | null
  /** Everyone in the family (for the family panel / avatars). */
  members: Member[]
  isLocalMode: boolean
  signInWithMagicLink: (email: string) => Promise<{ error?: string }>
  signInWithPin: (pin: string) => Promise<{ error?: string }>
  /** Local-mode only: pick which seat you are. */
  signInAsSeat: (memberId: string) => void
  signOut: () => Promise<void>
  refreshMembers: () => Promise<void>
}

const AuthContext = createContext<AuthValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [ready, setReady] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [members, setMembers] = useState<Member[]>(DEFAULT_FAMILY)
  const [localSeat, setLocalSeat] = useState<string | null>(
    () => localStorage.getItem(LOCAL_SEAT_KEY),
  )

  const isLocalMode = !hasSupabase

  async function loadMembers() {
    if (!supabase) {
      setMembers(DEFAULT_FAMILY)
      return
    }
    const { data, error } = await supabase
      .from('members')
      .select('id, display_name, avatar_url, age_group, color')
      .order('display_name')
    if (!error && data && data.length) {
      setMembers(data as Member[])
    } else {
      setMembers(DEFAULT_FAMILY)
    }
  }

  useEffect(() => {
    let active = true

    async function init() {
      if (supabase) {
        const { data } = await supabase.auth.getSession()
        if (!active) return
        setSession(data.session)
        await loadMembers()
      }
      if (active) {
        setLoading(false)
        setReady(true)
      }
    }
    init()

    let unsub: (() => void) | undefined
    if (supabase) {
      const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
        setSession(s)
        loadMembers()
      })
      unsub = () => sub.subscription.unsubscribe()
    }

    return () => {
      active = false
      unsub?.()
    }
  }, [])

  const member = useMemo<Member | null>(() => {
    if (isLocalMode) {
      return members.find((m) => m.id === localSeat) ?? null
    }
    if (!session) return null
    // Match the auth user to their members row; fall back to a minimal member.
    const found = members.find((m) => m.id === session.user.id)
    if (found) return found
    return {
      id: session.user.id,
      display_name: session.user.email?.split('@')[0] ?? 'Traveller',
      avatar_url: null,
      age_group: 'adult',
      color: '#0e3a48',
    }
  }, [isLocalMode, members, localSeat, session])

  async function signInWithMagicLink(email: string): Promise<{ error?: string }> {
    if (!supabase) return { error: 'No backend configured.' }
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    return error ? { error: error.message } : {}
  }

  async function signInWithPin(pin: string): Promise<{ error?: string }> {
    if (!supabase) return { error: 'No backend configured.' }
    try {
      const res = await fetch(functionsUrl('pin-login'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseAnonKey}`,
          apikey: supabaseAnonKey,
        },
        body: JSON.stringify({ pin }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) return { error: body?.error ?? 'Incorrect PIN.' }
      const { access_token, refresh_token } = body
      if (!access_token || !refresh_token) return { error: 'Login failed — try again.' }
      const { error } = await supabase.auth.setSession({ access_token, refresh_token })
      return error ? { error: error.message } : {}
    } catch {
      return { error: 'Could not reach the server. Check your connection.' }
    }
  }

  function signInAsSeat(memberId: string) {
    localStorage.setItem(LOCAL_SEAT_KEY, memberId)
    setLocalSeat(memberId)
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut()
    localStorage.removeItem(LOCAL_SEAT_KEY)
    setLocalSeat(null)
    setSession(null)
  }

  const value: AuthValue = {
    loading,
    ready,
    session,
    member,
    members,
    isLocalMode,
    signInWithMagicLink,
    signInWithPin,
    signInAsSeat,
    signOut,
    refreshMembers: loadMembers,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}

/** Are we signed in? Works in both modes. */
// eslint-disable-next-line react-refresh/only-export-components
export function useIsSignedIn(): boolean {
  const { member } = useAuth()
  return member !== null
}
