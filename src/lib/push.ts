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
