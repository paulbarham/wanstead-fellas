/**
 * Service-worker update detection.
 *
 * The problem this solves: an installed PWA on iOS can stay resident for days.
 * Vercel ships a new build, the service worker picks it up, but the page the
 * player is looking at carries on running the JS it loaded last Tuesday. They
 * only get the new version if they happen to fully relaunch — so bug fixes and
 * new features reached people days late, or not at all.
 *
 * The flow:
 *   1. New build deployed → browser fetches /sw.js, sees different bytes
 *   2. New worker installs and parks in 'waiting' (sw.js no longer calls
 *      skipWaiting on install, precisely so it waits for us)
 *   3. We spot it and call onUpdateReady → the app shows a Refresh prompt
 *   4. Player taps Refresh → applyUpdate() posts SKIP_WAITING
 *   5. New worker activates → 'controllerchange' fires → we reload once
 *
 * The player picks the moment, so we never reload out from under someone
 * mid-vote or mid-team-edit.
 */

/** How often to ask the browser to re-check /sw.js while the app sits open. */
const POLL_MS = 30 * 60 * 1000

export function registerWithUpdates(onUpdateReady: () => void): void {
  if (!('serviceWorker' in navigator)) return

  navigator.serviceWorker.register('/sw.js').then((registration) => {
    // Already waiting when we loaded — e.g. the worker installed during a
    // previous session that was closed before the player hit Refresh.
    if (registration.waiting && navigator.serviceWorker.controller) {
      onUpdateReady()
    }

    registration.addEventListener('updatefound', () => {
      const installing = registration.installing
      if (!installing) return
      installing.addEventListener('statechange', () => {
        // A controller already exists → this is an UPDATE, not a first install.
        // Without that check we'd prompt every new player to "refresh" the app
        // they just opened for the first time.
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          onUpdateReady()
        }
      })
    })

    // A resident PWA may never reload, so nudge the browser to re-check.
    // On foreground is the high-value moment: someone opening the app on
    // Thursday evening should get Thursday's build, not Tuesday's.
    const check = () => { registration.update().catch(() => {}) }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check()
    })
    window.setInterval(check, POLL_MS)
  }).catch(() => { /* offline or unsupported — nothing to do */ })
}

/**
 * Tell the waiting worker to take over, then reload once it has.
 *
 * The reload is driven by 'controllerchange' rather than fired immediately,
 * because reloading before the new worker controls the page just serves the
 * old bundle again and the prompt reappears — an infinite refresh loop, which
 * is a far worse bug than the staleness we're fixing.
 */
export async function applyUpdate(): Promise<void> {
  if (!('serviceWorker' in navigator)) { window.location.reload(); return }
  const registration = await navigator.serviceWorker.getRegistration('/')
  const waiting = registration?.waiting

  if (!waiting) { window.location.reload(); return }

  let reloaded = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return
    reloaded = true
    window.location.reload()
  })

  waiting.postMessage({ type: 'SKIP_WAITING' })

  // Safety net: if controllerchange never arrives (some iOS versions are
  // flaky here), reload anyway rather than leaving a prompt that does nothing.
  window.setTimeout(() => {
    if (!reloaded) { reloaded = true; window.location.reload() }
  }, 3000)
}
