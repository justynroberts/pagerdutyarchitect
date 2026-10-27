import { create } from 'zustand'

/**
 * Whether a newer version of the Mac app is out. dwell reads the update feed (the browser cannot) and, inside
 * the Mac app, brings the app's update window forward, since the app sits behind the browser.
 * Where there is no dwell server (the dev or preview server), it quietly stays empty.
 */
export type UpdateInfo = { version: string; latest?: string; available: boolean; inApp: boolean; page: string }

export const useUpdate = create<{ info: UpdateInfo | null; check: (force?: boolean) => Promise<UpdateInfo | null> }>((set) => ({
  info: null,
  check: async (force = false) => {
    try {
      const r = await fetch(`/api/update${force ? '?check=1' : ''}`, { cache: 'no-store' })
      if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) return null
      const info = (await r.json()) as UpdateInfo
      set({ info })
      return info
    } catch {
      return null
    }
  },
}))

/** Install: the Mac app shows its update window; anywhere else, open the download page. */
export async function installUpdate(info: UpdateInfo): Promise<'app' | 'page'> {
  if (info.inApp) {
    try {
      const r = await fetch('/api/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      if (r.ok) return 'app'
    } catch {
      // Fall through to the download page.
    }
  }
  window.open(info.page, '_blank', 'noopener')
  return 'page'
}

let started = false
/** Check now and hourly after, like the app itself. */
export function watchUpdates() {
  if (started) return
  started = true
  void useUpdate.getState().check()
  setInterval(() => void useUpdate.getState().check(), 60 * 60 * 1000)
}
