import { useRegisterSW } from 'virtual:pwa-register/react'
import { RefreshCw } from 'lucide-react'

/**
 * Registers the service worker (auto-update) and surfaces a single, quiet
 * "Refresh" toast when a new version is waiting. No spinners, no noise.
 */
export default function UpdateToast() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      // Poll for updates hourly while the app is open.
      if (registration) {
        setInterval(() => registration.update(), 60 * 60 * 1000)
      }
    },
  })

  if (!needRefresh) return null

  return (
    <div className="safe-bottom pointer-events-none fixed inset-x-0 bottom-[72px] z-50 flex justify-center px-4">
      <div
        className="pointer-events-auto flex items-center gap-3 rounded-xl px-4 py-3 text-white shadow-card"
        style={{ background: 'var(--navy)' }}
      >
        <span className="text-[14px] font-medium">A new version is ready.</span>
        <button
          onClick={() => updateServiceWorker(true)}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-bold"
          style={{ background: 'var(--coral)' }}
        >
          <RefreshCw size={14} />
          Refresh
        </button>
        <button
          onClick={() => setNeedRefresh(false)}
          className="text-[13px] font-medium text-white/70"
          aria-label="Dismiss"
        >
          Later
        </button>
      </div>
    </div>
  )
}
