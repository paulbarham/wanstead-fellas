const CACHE = 'wf-v4'
const SHELL = ['/']

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)))
  self.skipWaiting()
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
