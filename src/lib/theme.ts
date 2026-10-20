import type { ThemePref } from '../types'

const KEY = 'dwell-theme'

export function readTheme(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'light' || v === 'dark' || v === 'auto') return v
  } catch {
    /* storage can be blocked */
  }
  return 'dark'
}

export function resolveTheme(pref: ThemePref): 'light' | 'dark' {
  if (pref !== 'auto') return pref
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme(pref: ThemePref, persist = true) {
  const resolved = resolveTheme(pref)
  const root = document.documentElement
  root.dataset.theme = resolved
  root.classList.toggle('dark', resolved === 'dark')
  root.style.colorScheme = resolved
  if (persist) {
    try {
      localStorage.setItem(KEY, pref)
    } catch {
      /* ignore */
    }
  }
}
