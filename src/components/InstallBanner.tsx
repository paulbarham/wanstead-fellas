import { useEffect, useState } from 'react'

const DISMISSED_KEY = 'wf-install-dismissed'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [show, setShow] = useState(false)
  const [isIOS, setIsIOS] = useState(false)

  useEffect(() => {
    if (localStorage.getItem(DISMISSED_KEY)) return
    if (window.matchMedia('(display-mode: standalone)').matches) return

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window.navigator as Navigator & { standalone?: boolean }).standalone
    if (ios) {
      setIsIOS(true)
      setShow(true)
      return
    }

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setShow(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, '1')
    setShow(false)
  }

  async function install() {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') setShow(false)
    setDeferredPrompt(null)
  }

  if (!show) return null

  return (
    <div className="mx-0 mb-3 px-3 py-2.5 rounded-xl flex items-center gap-2"
      style={{ background: 'var(--color-success-bg)', border: '1px solid var(--color-primary)' }}>
      <div className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center"
        style={{ background: 'var(--color-primary)' }}>
        <span className="font-display text-xs text-white">WF</span>
      </div>
      <p className="flex-1 text-xs" style={{ color: '#ccc' }}>
        {isIOS
          ? <>Tap <strong style={{ color: 'white' }}>Share</strong> then <strong style={{ color: 'white' }}>Add to Home Screen</strong></>
          : <><strong style={{ color: 'white' }}>Add to home screen</strong> for the best experience</>}
      </p>
      {!isIOS && deferredPrompt && (
        <button
          onClick={install}
          className="text-xs font-semibold px-2.5 py-1 rounded-lg flex-shrink-0"
          style={{ background: 'var(--color-primary)', color: 'white' }}
        >
          Install
        </button>
      )}
      <button onClick={dismiss} className="flex-shrink-0 text-lg leading-none" style={{ color: '#555' }} aria-label="Dismiss">
        ×
      </button>
    </div>
  )
}
