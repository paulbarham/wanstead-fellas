// Supabase browser client.
//
// If the env vars aren't set the app runs in "local-only" mode: auth is faked
// with a locally-stored guest identity and all shared state falls back to
// localStorage. This keeps every screen working offline-first (and lets the app
// be previewed before a Supabase project is provisioned). The moment real
// credentials are supplied, auth + realtime shared state light up automatically.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const hasSupabase = Boolean(url && anonKey)

export const supabase: SupabaseClient | null = hasSupabase
  ? createClient(url as string, anonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null

/** Base URL for edge functions (e.g. the pin-login function). */
export function functionsUrl(name: string): string {
  if (!url) return ''
  return `${url.replace(/\/$/, '')}/functions/v1/${name}`
}

export const supabaseAnonKey = anonKey ?? ''
