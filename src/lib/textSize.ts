// Player-controlled text-size preference. Persists to localStorage and is
// applied via a data-text-size attribute on <html> that scales the root
// font-size. Tailwind + rem-based components scale proportionally so
// layouts reflow rather than clip.
//
// Applied via applyTextSize() in main.tsx BEFORE React mounts so there's
// no flash of unscaled content. The Profile toggle rewrites the pref +
// re-applies live via setTextSize().
//
// Default is 'compact' == today's baseline (16px root font-size). Bumping
// bigger is opt-in — bytes on-disk don't change, and no player gets an
// unrequested UX shift.

export type TextSize = 'compact' | 'regular' | 'large'

const STORAGE_KEY = 'wf-text-size'
const ATTR = 'data-text-size'

export function getTextSize(): TextSize {
  if (typeof localStorage === 'undefined') return 'compact'
  const v = localStorage.getItem(STORAGE_KEY)
  return v === 'regular' || v === 'large' ? v : 'compact'
}

export function setTextSize(size: TextSize): void {
  localStorage.setItem(STORAGE_KEY, size)
  applyTextSize(size)
}

export function applyTextSize(size?: TextSize): void {
  if (typeof document === 'undefined') return
  const s = size ?? getTextSize()
  document.documentElement.setAttribute(ATTR, s)
}
