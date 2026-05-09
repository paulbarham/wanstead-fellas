import React, { createContext, useContext, useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types'

interface AuthContextType {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signUp: (email: string, password: string, name: string, surname: string, age_group: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

const ADMIN_EMAIL = 'pabarham@gmail.com'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  async function fetchProfile(authUser: User): Promise<Profile | null> {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('auth_user_id', authUser.id)
      .maybeSingle()

    if (data) {
      // Promote to admin if email matches but flag not yet set
      if (authUser.email === ADMIN_EMAIL && !data.is_admin) {
        await supabase.from('profiles').update({ is_admin: true }).eq('auth_user_id', authUser.id)
        data.is_admin = true
      }
      return data as Profile
    }

    // Self-heal: no profile row. The DB trigger may have silently failed
    // (or the user signed up before the trigger existed). Recreate from the
    // auth user's signup metadata so the user isn't locked out.
    const meta = (authUser.user_metadata ?? {}) as { name?: string; surname?: string; age_group?: string }
    const { data: created, error: createErr } = await supabase
      .from('profiles')
      .insert({
        auth_user_id: authUser.id,
        name: meta.name ?? '',
        surname: meta.surname ?? '',
        age_group: meta.age_group ?? 'adult',
        player_type: 'wtp',
        badges: [],
        is_admin: authUser.email === ADMIN_EMAIL,
      })
      .select('*')
      .maybeSingle()

    if (createErr) {
      console.error('Profile self-heal failed:', createErr)
      return null
    }
    return (created as Profile) ?? null
  }

  async function refreshProfile() {
    if (user) {
      const data = await fetchProfile(user)
      setProfile(data)
    }
  }

  useEffect(() => {
    // onAuthStateChange fires immediately with the current session on mount,
    // so getSession is not needed and avoids a race condition.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        // Reset loading on sign-in so consumers wait for profile before rendering.
        // Skipped for TOKEN_REFRESHED to avoid a spinner flicker every hour.
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
          setLoading(true)
        }
        // Call setProfile and setLoading together so React batches them into one
        // render — prevents Layout from seeing loading=false with profile=null.
        fetchProfile(session.user)
          .then(data => {
            setProfile(data)
            setLoading(false)
          })
          .catch(() => setLoading(false))
      } else {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error as Error | null }
  }

  async function signUp(email: string, password: string, name: string, surname: string, age_group: string) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, surname, age_group },
      },
    })

    if (error) {
      // "Database error saving new user" comes from the handle_new_user
      // trigger crashing. Wrap it in something the user can act on.
      const friendly = /database error/i.test(error.message)
        ? 'Sign up failed. Please try again — if it keeps happening, contact the organiser.'
        : error.message
      return { error: new Error(friendly) }
    }

    // Fallback: if we already have a session, make sure the profile row exists
    // (trigger may have silently failed). Without a session (email-confirmation
    // flow) the profile gets created later via fetchProfile self-heal.
    if (data.user && data.session) {
      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('auth_user_id', data.user.id)
        .maybeSingle()

      if (!existing) {
        const { error: insertErr } = await supabase.from('profiles').insert({
          auth_user_id: data.user.id,
          name,
          surname,
          age_group,
          player_type: 'wtp',
          badges: [],
          is_admin: false,
        })
        if (insertErr) {
          return { error: new Error('Account created but profile setup failed. Please contact the organiser.') }
        }
      }
    }

    return { error: null }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setProfile(null)
  }

  return (
    <AuthContext.Provider value={{ session, user, profile, loading, signIn, signUp, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
