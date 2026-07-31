import { useState } from 'react'

export type Theme = 'light' | 'dark'

const KEY = 'barham-theme'

export function storedTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'light' || saved === 'dark') return saved
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

/** Apply a theme globally (data-theme drives all the CSS token flips). */
export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    /* ignore */
  }
}

/** Toggle hook for the menu. Reads current theme, flips it globally. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => storedTheme())

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    setTheme(next)
  }

  return { theme, toggle }
}
