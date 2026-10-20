import { create } from 'zustand'
import { useDwell } from '../store'
import { blankDoc, parseDoc, tidy, type DwellDoc } from './doc'
import { SEED_CATALOGUE } from './seed'
import type { CatalogItem } from '../types'

/**
 * Keeps the open diagram in step with a file in the diagrams folder. An AI (through the MCP server)
 * or a text editor can change the file and the canvas follows; changes made on the canvas are written back.
 * Only works where the dev or preview server provides /api/diagrams, otherwise it quietly stays off.
 */
export type SyncState = 'off' | 'live' | 'unavailable'
export const useSync = create<{ state: SyncState; files: { name: string; updated: number }[]; refresh: () => Promise<void> }>((set) => ({
  state: 'off',
  files: [],
  refresh: async () => {
    try {
      const r = await fetch('/api/diagrams')
      if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) throw new Error()
      set({ files: await r.json() })
    } catch {
      set({ files: [], state: useDwell.getState().file ? 'unavailable' : 'off' })
    }
  },
}))

const API = '/api/diagrams'
let base: DwellDoc | null = null
let last = ''
let timer: ReturnType<typeof setTimeout> | undefined

const norm = (d: DwellDoc) => JSON.stringify(tidy(d))

function fromStore(): DwellDoc {
  const s = useDwell.getState()
  return {
    ...(base ?? blankDoc()),
    title: s.title,
    direction: s.direction,
    runsPerMonth: s.runsPerMonth,
    ratePerHour: s.ratePerHour,
    flows: s.flows,
    zones: s.zones,
    nodes: s.nodes,
    edges: s.edges,
  }
}

async function pull(name: string) {
  try {
    const r = await fetch(`${API}/${name}`)
    if (!r.ok) return false
    const { doc } = parseDoc(await r.text())
    if (!doc) return false
    base = doc
    const n = norm(doc)
    if (n === last) return true
    last = n
    useDwell.getState().applyDoc(doc, true)
    return true
  } catch {
    return false
  }
}

async function push(name: string) {
  const doc = fromStore()
  const n = norm(doc)
  if (n === last) return
  last = n
  base = doc
  try {
    await fetch(`${API}/${name}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(tidy(doc), null, 2) + '\n' })
  } catch {
    useSync.setState({ state: 'unavailable' })
  }
}

// ---- Catalogue: custom steps you add live in diagrams/catalogue.json so the MCP server can use them too ----
const seededIds = new Set(SEED_CATALOGUE.map((c) => c.id))
const customOf = (cat: CatalogItem[]) => cat.filter((c) => !seededIds.has(c.id))
let lastCatalogue = ''
let catalogueTimer: ReturnType<typeof setTimeout> | undefined
let catalogueReady = false

async function pullCatalogue(first = false) {
  try {
    const r = await fetch(`${API.replace('diagrams', 'catalogue')}`)
    if (!r.ok) return
    const remote = (await r.json()) as CatalogItem[]
    if (!Array.isArray(remote)) return
    const st = useDwell.getState()
    // First contact: keep what this browser already has and add what the file has. After that the file is the truth.
    const items = first ? [...customOf(st.catalogue).filter((l) => !remote.some((x) => x.id === l.id)), ...remote] : remote
    lastCatalogue = JSON.stringify(first ? remote : items)
    st.setCustomItems(items)
    catalogueReady = true
    if (first && JSON.stringify(items) !== JSON.stringify(remote)) await pushCatalogue()
  } catch {
    /* not served here, so the catalogue stays in this browser */
  }
}

async function pushCatalogue() {
  if (!catalogueReady) return
  const items = customOf(useDwell.getState().catalogue)
  const text = JSON.stringify(items)
  if (text === lastCatalogue) return
  lastCatalogue = text
  try {
    await fetch(API.replace('diagrams', 'catalogue'), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(items, null, 2) + '\n' })
  } catch {
    /* ignore */
  }
}

/** Start following whichever file the store points at. Returns a cleanup. */
export function startSync(): () => void {
  let name = useDwell.getState().file
  let events: EventSource | undefined

  const bind = async (next: string | null) => {
    name = next
    base = null
    last = ''
    if (!next) return useSync.setState({ state: 'off' })
    const ok = await pull(next)
    if (!ok) await push(next) // file does not exist yet: create it from what is on screen
    useSync.setState({ state: 'live' })
    void useSync.getState().refresh()
  }

  const unsubStore = useDwell.subscribe((s, prev) => {
    if (s.catalogue !== prev.catalogue) {
      clearTimeout(catalogueTimer)
      catalogueTimer = setTimeout(() => void pushCatalogue(), 500)
    }
    if (s.file !== prev.file) return void bind(s.file)
    if (!name) return
    if (s.nodes === prev.nodes && s.edges === prev.edges && s.title === prev.title && s.flows === prev.flows && s.zones === prev.zones && s.direction === prev.direction && s.runsPerMonth === prev.runsPerMonth && s.ratePerHour === prev.ratePerHour) return
    clearTimeout(timer)
    const target = name
    timer = setTimeout(() => void push(target), 700)
  })

  try {
    events = new EventSource(`${API}/events`)
    events.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as { name?: string; catalogue?: boolean }
        if (msg.catalogue) return void pullCatalogue()
        if (msg.name && msg.name === name) void pull(name)
        void useSync.getState().refresh()
      } catch {
        /* ignore malformed events */
      }
    }
    events.onerror = () => {
      /* EventSource retries on its own; the dev server may simply be restarting */
    }
  } catch {
    useSync.setState({ state: 'unavailable' })
  }

  void useSync.getState().refresh()
  void pullCatalogue(true)
  void bind(name)
  return () => {
    unsubStore()
    events?.close()
    clearTimeout(timer)
    clearTimeout(catalogueTimer)
  }
}
