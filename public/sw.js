// Bump cache version when the shell needs a hard refresh across the group.
// Bumped to v50 — admin Decisions log tab (31 Aug 2026).
//
// NOTE: install no longer calls skipWaiting(). That was swapping the worker
// out from under a running page, which meant a new build activated silently
// and there was never a *waiting* worker for the app to notice — so people
// sat on a stale bundle until they happened to fully relaunch. Now the new
// worker parks in 'waiting', the app spots it and shows a Refresh prompt,
// and only then do we skipWaiting() via the SKIP_WAITING message below.
// The user chooses the moment, so we never reload mid-vote or mid-team-edit.
// Admin (top of Admin page) can post a "what's new" push — title, body,
// deep link — scheduled for the next 9am UK. 15-min pg_cron fires them,
// send-feature-announcement edge fn fans out to every push_subscription.
const CACHE = 'wf-v50'
const SHELL = ['/']

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)))
  // Deliberately NOT skipWaiting() — see the note at the top of this file.
})

// The app posts this when the player taps "Refresh" on the update prompt.
// Activating here fires 'controllerchange' in the page, which reloads.
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', event => {
  const { request } = event
  const url = new URL(request.url)

  if (request.method !== 'GET') return
  if (url.hostname.includes('supabase')) return
  // Always go to network for the weather API — the URL doesn't change but
  // the returned forecast does, so any cache hit goes stale within hours.
  if (url.hostname.includes('open-meteo.com')) return

  // Network-first for the app document so new builds are always picked up.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone()
          caches.open(CACHE).then(c => c.put('/', clone))
          return response
        })
        .catch(() => caches.match('/'))
    )
    return
  }

  // Hashed static assets are immutable — safe to serve cache-first.
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached
      return fetch(request).then(response => {
        if (response.ok) {
          const clone = response.clone()
          caches.open(CACHE).then(c => c.put(request, clone))
        }
        return response
      })
    })
  )
})

// ── Web push handling ──────────────────────────────────────────────────────
//
// Payload shape sent by the edge function:
//   { title: string, body: string, url?: string, tag?: string }
// tag groups multiple notifications for the same topic so a re-fire
// replaces rather than stacks — useful when a match's voting window opens
// and someone hasn't dismissed the previous one.
self.addEventListener('push', event => {
  let data = {}
  try {
    if (event.data) data = event.data.json()
  } catch (err) {
    data = { title: 'Wanstead Fellas', body: (event.data && event.data.text()) || '' }
  }
  const title = data.title || 'Wanstead Fellas'
  const options = {
    body: data.body || '',
    icon: '/icon-192.svg',
    badge: '/icon-192.svg',
    tag: data.tag || 'wf-generic',
    data: { url: data.url || '/' },
    renotify: true,
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil((async () => {
    // Focus an existing tab if one is already on the site; otherwise open new.
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of all) {
      const clientUrl = new URL(client.url)
      if (clientUrl.origin === self.location.origin) {
        client.focus()
        client.navigate(url).catch(() => { /* older browsers: focus is enough */ })
        return
      }
    }
    await self.clients.openWindow(url)
  })())
})
