// Web Push helpers. VAPID keypair lives here — the PUBLIC key is safe in
// the client bundle by design (it's the one browsers use to sign the
// subscription request). The private key sits in Supabase project secrets
// as VAPID_PRIVATE_KEY, only visible to the send-vote-notifications edge
// function.

import { supabase } from './supabase'

export const VAPID_PUBLIC_KEY = 'BDO5g6HQhO0s3BAEXc86kqaHy3fPl6Mtd3uo3jF7p7W1UWcVpOVkPf6KGlEHnorJecl-Ao821QJDvzph8r0NuXo'

export type PushPermissionState = 'default' | 'granted' | 'denied' | 'unsupported'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

function bufferToBase64(buf: ArrayBuffer | null): string {
  if (!buf) return ''
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

export function isPushSupported(): boolean {
  return typeof window !== 'undefined'
    && 'Notification' in window
    && 'serviceWorker' in navigator
    && 'PushManager' in window
}

export function getPermissionState(): PushPermissionState {
  if (!isPushSupported()) return 'unsupported'
  return Notification.permission
}

// Ensures the SW is registered and returns the registration so we can attach
// a push subscription. The root SW file is /sw.js — served from public/.
export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration> {
  if (!('serviceWorker' in navigator)) throw new Error('service worker unsupported')
  const existing = await navigator.serviceWorker.getRegistration('/')
  if (existing) return existing
  return navigator.serviceWorker.register('/sw.js', { scope: '/' })
}

export async function subscribeToPush(playerId: string): Promise<{ ok: boolean; reason?: string }> {
  if (!isPushSupported()) return { ok: false, reason: 'unsupported' }
  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return { ok: false, reason: permission }

    const registration = await ensureServiceWorker()
    // Reuse existing subscription if there is one — otherwise browsers can
    // rotate the endpoint and we lose the previous row on the next visit.
    const existing = await registration.pushManager.getSubscription()
    const sub = existing ?? await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as BufferSource,
    })

    const endpoint = sub.endpoint
    const p256dh = bufferToBase64(sub.getKey('p256dh'))
    const auth = bufferToBase64(sub.getKey('auth'))
    if (!endpoint || !p256dh || !auth) return { ok: false, reason: 'incomplete-subscription' }

    // Upsert on endpoint uniqueness so a returning device just refreshes.
    const { error } = await supabase.from('push_subscriptions')
      .upsert(
        {
          player_id: playerId,
          endpoint,
          p256dh,
          auth,
          user_agent: navigator.userAgent.slice(0, 200),
        },
        { onConflict: 'endpoint' },
      )
    if (error) return { ok: false, reason: error.message }
    return { ok: true }
  } catch (err) {
    return { ok: false, reason: (err as Error).message }
  }
}

export async function unsubscribeFromPush(): Promise<{ ok: boolean; reason?: string }> {
  try {
    const registration = await navigator.serviceWorker.getRegistration('/')
    if (!registration) return { ok: true }
    const sub = await registration.pushManager.getSubscription()
    if (!sub) return { ok: true }
    // Best-effort — the DB row falls away when the endpoint mismatches;
    // we also nuke our copy so a re-subscribe is clean.
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
    await sub.unsubscribe()
    return { ok: true }
  } catch (err) {
    return { ok: false, reason: (err as Error).message }
  }
}

export async function hasActiveSubscription(): Promise<boolean> {
  if (!isPushSupported()) return false
  const registration = await navigator.serviceWorker.getRegistration('/')
  if (!registration) return false
  const sub = await registration.pushManager.getSubscription()
  return !!sub
}

// Called on app boot for authenticated users. Silently reconciles the
// browser's push subscription with what we have in the DB — never prompts.
//
// Common drift cases this repairs without support-ticket support:
//   * PWA reinstall → old endpoint went dead but Apple still 200s sends;
//     the browser sub is fresh but the DB has the stale one.
//   * Browser silently rotates the endpoint (Chrome, some FCM changes).
//   * User cleared site data → browser has no sub even though permission
//     is granted → re-subscribes to close the loop.
//   * Old device rows for a player who moved to a new phone → reaped.
//
// If Notification.permission !== 'granted' we do nothing (never prompt on
// boot — that's exclusively the opt-in card's job).
export async function syncPushSubscription(playerId: string): Promise<{
  action: 'noop' | 'created' | 'refreshed' | 'reaped-only' | 'no-permission' | 'unsupported' | 'error'
  staleReaped?: number
  reason?: string
}> {
  if (!isPushSupported()) return { action: 'unsupported' }
  if (Notification.permission !== 'granted') return { action: 'no-permission' }
  try {
    const registration = await ensureServiceWorker()
    const browserSub = await registration.pushManager.getSubscription()

    // Permission granted but no browser subscription (site-data clear,
    // reinstalled PWA that hasn't re-subscribed) → re-subscribe. This won't
    // prompt because permission is already granted.
    if (!browserSub) {
      const result = await subscribeToPush(playerId)
      return { action: result.ok ? 'created' : 'error', reason: result.reason }
    }

    const { data: rows } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint')
      .eq('player_id', playerId)
    const dbRows = (rows || []) as Array<{ id: string; endpoint: string }>
    const matched = dbRows.find(r => r.endpoint === browserSub.endpoint)
    const stale = dbRows.filter(r => r.endpoint !== browserSub.endpoint).map(r => r.id)

    if (stale.length > 0) {
      await supabase.from('push_subscriptions').delete().in('id', stale)
    }

    if (!matched) {
      // Browser has a live sub but the DB doesn't have this endpoint for
      // this player. Upsert it via the regular subscribe flow (which is
      // idempotent — reuses the existing browser sub, updates the DB row).
      const result = await subscribeToPush(playerId)
      return {
        action: result.ok ? 'refreshed' : 'error',
        staleReaped: stale.length,
        reason: result.reason,
      }
    }

    return stale.length > 0
      ? { action: 'reaped-only', staleReaped: stale.length }
      : { action: 'noop' }
  } catch (err) {
    return { action: 'error', reason: (err as Error).message }
  }
}
