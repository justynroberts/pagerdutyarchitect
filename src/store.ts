import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react'
import type {
  CatalogItem,
  DwellEdge,
  DwellNode,
  Direction,
  EdgeData,
  Mode,
  NodeData,
  Presence,
  ThemePref,
} from './types'
import { DIMS, dimsOf, handlesFor, layoutNodes, nearestNode } from './lib/layout'
import { SAMPLE_TITLE, SEED_CATALOGUE, buildSample, nodeFromItem } from './lib/seed'
import { applyTheme, readTheme } from './lib/theme'

type Snapshot = { nodes: DwellNode[]; edges: DwellEdge[]; title: string }

type AddOptions = {
  /** Flow-space top-left of the new node, used when nothing is selected. */
  position?: { x: number; y: number }
  /** Chain from the selected node when exactly one is selected. */
  chain?: boolean
  /** Join the new node to the closest existing one. */
  autoConnect?: boolean
}

export type LogoCorner = 'bl' | 'br' | 'off'

export type DwellState = {
  title: string
  nodes: DwellNode[]
  edges: DwellEdge[]
  direction: Direction
  logoCorner: LogoCorner
  /** Node a drag in progress would connect to. Never persisted. */
  hint: string | null
  runsPerMonth: number
  ratePerHour: number
  mode: Mode
  theme: ThemePref
  catalogue: CatalogItem[]
  past: Snapshot[]
  redoStack: Snapshot[]
  fitTick: number

  onNodesChange: (changes: NodeChange<DwellNode>[]) => void
  onEdgesChange: (changes: EdgeChange<DwellEdge>[]) => void
  onConnect: (c: Connection) => void
  checkpoint: () => void
  undo: () => void
  redo: () => void

  addFromItem: (item: CatalogItem, opts?: AddOptions) => string
  updateNode: (id: string, patch: Partial<NodeData>) => void
  updateEdge: (id: string, patch: Partial<EdgeData>) => void
  select: (id: string) => void
  deleteSelected: () => void
  duplicateSelected: () => void
  tidy: (dir?: Direction) => void
  connectNear: (id: string) => boolean
  setHint: (id: string | null) => void
  setLogoCorner: (c: LogoCorner) => void
  refit: () => void

  setMode: (m: Mode) => void
  setTheme: (t: ThemePref) => void
  setTitle: (t: string) => void
  setRuns: (n: number) => void
  setRate: (n: number) => void

  saveItem: (item: CatalogItem) => void
  deleteItem: (id: string) => void

  loadSample: () => void
  newBlank: () => void
  exportDoc: () => string
  importDoc: (text: string) => string | null
}

const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`
const snap8 = (n: number) => Math.round(n / 8) * 8
const HISTORY = 100

function derivePresence(a: Presence, b: Presence): Presence {
  if (a === 'current-only' || b === 'current-only') return a === 'future-only' || b === 'future-only' ? 'both' : 'current-only'
  if (a === 'future-only' || b === 'future-only') return 'future-only'
  return 'both'
}

function freeSpot(pos: { x: number; y: number }, nodes: DwellNode[], dir: Direction) {
  const p = { ...pos }
  for (let i = 0; i < 60; i++) {
    const clash = nodes.some((n) => {
      const d = dimsOf(n)
      return Math.abs(n.position.x - p.x) < d.w - 8 && Math.abs(n.position.y - p.y) < d.h + 8
    })
    if (!clash) break
    if (dir === 'LR') p.y += 80
    else p.x += 232
  }
  return { x: snap8(p.x), y: snap8(p.y) }
}

function clean(nodes: DwellNode[]): DwellNode[] {
  return nodes.map((n) => ({ id: n.id, type: 'flow', position: n.position, data: n.data }))
}

function cleanEdges(edges: DwellEdge[]): DwellEdge[] {
  return edges.map((e) => ({
    id: e.id,
    type: 'flow',
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
    targetHandle: e.targetHandle,
    data: { presence: e.data?.presence ?? 'both', label: e.data?.label ?? '' },
  }))
}

const sample = buildSample()

export const useDwell = create<DwellState>()(
  persist(
    (set, get) => ({
      title: SAMPLE_TITLE,
      nodes: sample.nodes,
      edges: sample.edges,
      direction: 'LR',
      logoCorner: 'bl',
      hint: null,
      runsPerMonth: 320,
      ratePerHour: 75,
      mode: 'current',
      theme: readTheme(),
      catalogue: SEED_CATALOGUE,
      past: [],
      redoStack: [],
      fitTick: 0,

      onNodesChange: (changes) => set({ nodes: applyNodeChanges(changes, get().nodes) }),
      onEdgesChange: (changes) => set({ edges: applyEdgeChanges(changes, get().edges) }),

      onConnect: (c) => {
        const { nodes, edges } = get()
        if (!c.source || !c.target || c.source === c.target) return
        if (edges.some((e) => e.source === c.source && e.target === c.target)) return
        const src = nodes.find((n) => n.id === c.source)
        const tgt = nodes.find((n) => n.id === c.target)
        if (!src || !tgt) return
        get().checkpoint()
        const outgoing = edges.filter((e) => e.source === c.source).length
        const label = src.data.kind === 'decision' ? (outgoing === 0 ? 'Yes' : outgoing === 1 ? 'No' : '') : ''
        const edge: DwellEdge = {
          id: uid('e'),
          type: 'flow',
          source: c.source,
          target: c.target,
          sourceHandle: c.sourceHandle ?? undefined,
          targetHandle: c.targetHandle ?? undefined,
          data: { presence: derivePresence(src.data.presence, tgt.data.presence), label },
        }
        set({ edges: [...edges.map((e) => ({ ...e, selected: false })), { ...edge, selected: true }], nodes: nodes.map((n) => ({ ...n, selected: false })) })
      },

      checkpoint: () => {
        const { nodes, edges, title, past } = get()
        set({ past: [...past, { nodes, edges, title }].slice(-HISTORY), redoStack: [] })
      },
      undo: () => {
        const { past, nodes, edges, title, redoStack } = get()
        const prev = past[past.length - 1]
        if (!prev) return
        set({
          past: past.slice(0, -1),
          redoStack: [...redoStack, { nodes, edges, title }],
          nodes: prev.nodes,
          edges: prev.edges,
          title: prev.title,
        })
      },
      redo: () => {
        const { past, nodes, edges, title, redoStack } = get()
        const next = redoStack[redoStack.length - 1]
        if (!next) return
        set({
          redoStack: redoStack.slice(0, -1),
          past: [...past, { nodes, edges, title }],
          nodes: next.nodes,
          edges: next.edges,
          title: next.title,
        })
      },

      addFromItem: (item, opts = {}) => {
        const s = get()
        s.checkpoint()
        const selected = s.nodes.filter((n) => n.selected)
        const parent = opts.chain && selected.length === 1 ? selected[0] : undefined
        let pos = opts.position ?? { x: 0, y: 0 }
        if (parent) {
          const d = dimsOf(parent)
          pos =
            s.direction === 'LR'
              ? { x: parent.position.x + d.w + 60, y: parent.position.y }
              : { x: parent.position.x, y: parent.position.y + d.h + 56 }
        }
        // Dropped beside a step: line up with it so the connector runs straight.
        let near: DwellNode | undefined
        if (!parent && opts.autoConnect) {
          const d0 = DIMS[item.kind]
          near = nearestNode(s.nodes, { x: pos.x, y: pos.y, w: d0.w, h: d0.h })
          if (near) {
            const nd = dimsOf(near)
            const cross = s.direction === 'LR' ? 'y' : 'x'
            const size = s.direction === 'LR' ? [nd.h, d0.h] : [nd.w, d0.w]
            const centred = near.position[cross] + size[0] / 2 - size[1] / 2
            if (Math.abs(centred - pos[cross]) < 72) pos = { ...pos, [cross]: centred }
          }
        }
        pos = freeSpot(pos, s.nodes, s.direction)
        const id = uid('n')
        const node: DwellNode = { ...nodeFromItem(item, id, pos), selected: true }
        const nodes = [...s.nodes.map((n) => ({ ...n, selected: false })), node]
        let edges: DwellEdge[] = s.edges.map((e) => ({ ...e, selected: false }))
        if (parent) {
          const outgoing = s.edges.filter((e) => e.source === parent.id).length
          const label = parent.data.kind === 'decision' ? (outgoing === 0 ? 'Yes' : outgoing === 1 ? 'No' : '') : ''
          edges = [
            ...edges,
            {
              id: uid('e'),
              type: 'flow',
              source: parent.id,
              target: id,
              ...handlesFor(s.direction),
              data: { presence: derivePresence(parent.data.presence, item.presence), label },
            },
          ]
        }
        // An item that only exists in one state would vanish if the other state is showing.
        let mode = s.mode
        if (item.presence === 'future-only') mode = 'future'
        else if (item.presence === 'current-only') mode = 'current'
        set({ nodes, edges, mode })
        if (near) get().connectNear(id)
        return id
      },

      connectNear: (id) => {
        const s = get()
        const me = s.nodes.find((n) => n.id === id)
        if (!me) return false
        const d = dimsOf(me)
        const near = nearestNode(s.nodes, { x: me.position.x, y: me.position.y, w: d.w, h: d.h }, 150, id)
        if (!near || s.edges.some((e) => (e.source === id && e.target === near.id) || (e.source === near.id && e.target === id))) {
          return false
        }
        const nd = dimsOf(near)
        const axis = s.direction === 'LR' ? 'x' : 'y'
        const mine = me.position[axis] + (axis === 'x' ? d.w : d.h) / 2
        const theirs = near.position[axis] + (axis === 'x' ? nd.w : nd.h) / 2
        // Inputs always start a flow, outputs always end one, otherwise follow position.
        let forward = mine >= theirs
        if (me.data.kind === 'input' || near.data.kind === 'output') forward = false
        if (me.data.kind === 'output' || near.data.kind === 'input') forward = true
        const from = forward ? near : me
        const to = forward ? me : near
        const outgoing = s.edges.filter((e) => e.source === from.id).length
        const label = from.data.kind === 'decision' ? (outgoing === 0 ? 'Yes' : outgoing === 1 ? 'No' : '') : ''
        set({
          edges: [
            ...s.edges,
            {
              id: uid('e'),
              type: 'flow',
              source: from.id,
              target: to.id,
              ...handlesFor(s.direction),
              data: { presence: derivePresence(from.data.presence, to.data.presence), label },
            },
          ],
        })
        return true
      },
      setHint: (hint) => {
        if (get().hint !== hint) set({ hint })
      },
      setLogoCorner: (logoCorner) => set({ logoCorner }),
      refit: () => set({ fitTick: get().fitTick + 1 }),

      updateNode: (id, patch) =>
        set({ nodes: get().nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)) }),
      updateEdge: (id, patch) =>
        set({
          edges: get().edges.map((e) =>
            e.id === id ? { ...e, data: { presence: 'both', label: '', ...e.data, ...patch } } : e,
          ),
        }),
      select: (id) =>
        set({
          nodes: get().nodes.map((n) => ({ ...n, selected: n.id === id })),
          edges: get().edges.map((e) => ({ ...e, selected: false })),
        }),

      deleteSelected: () => {
        const { nodes, edges } = get()
        const gone = new Set(nodes.filter((n) => n.selected).map((n) => n.id))
        const goneEdges = edges.filter((e) => e.selected || gone.has(e.source) || gone.has(e.target))
        if (!gone.size && !goneEdges.length) return
        get().checkpoint()
        const dead = new Set(goneEdges.map((e) => e.id))
        set({ nodes: nodes.filter((n) => !gone.has(n.id)), edges: edges.filter((e) => !dead.has(e.id)) })
      },

      duplicateSelected: () => {
        const { nodes, edges } = get()
        const picked = nodes.filter((n) => n.selected)
        if (!picked.length) return
        get().checkpoint()
        const map = new Map<string, string>()
        const copies = picked.map((n) => {
          const id = uid('n')
          map.set(n.id, id)
          return { ...n, id, selected: true, position: { x: snap8(n.position.x + 32), y: snap8(n.position.y + 32) } }
        })
        const edgeCopies: DwellEdge[] = edges
          .filter((e) => map.has(e.source) && map.has(e.target))
          .map((e) => ({ ...e, id: uid('e'), source: map.get(e.source)!, target: map.get(e.target)!, selected: false }))
        set({
          nodes: [...nodes.map((n) => ({ ...n, selected: false })), ...copies],
          edges: [...edges, ...edgeCopies],
        })
      },

      tidy: (dir) => {
        const s = get()
        const d = dir ?? s.direction
        s.checkpoint()
        const h = handlesFor(d)
        set({
          direction: d,
          nodes: layoutNodes(s.nodes, s.edges, d),
          edges: s.edges.map((e) => ({ ...e, ...h })),
          fitTick: s.fitTick + 1,
        })
      },

      setMode: (mode) => set({ mode }),
      setTheme: (theme) => {
        applyTheme(theme)
        set({ theme })
      },
      setTitle: (title) => set({ title }),
      setRuns: (n) => set({ runsPerMonth: Math.max(0, n) }),
      setRate: (n) => set({ ratePerHour: Math.max(0, n) }),

      saveItem: (item) => {
        const { catalogue } = get()
        const exists = catalogue.some((c) => c.id === item.id)
        set({ catalogue: exists ? catalogue.map((c) => (c.id === item.id ? item : c)) : [...catalogue, item] })
      },
      deleteItem: (id) => set({ catalogue: get().catalogue.filter((c) => c.id !== id) }),

      loadSample: () => {
        get().checkpoint()
        const fresh = buildSample()
        set({
          title: SAMPLE_TITLE,
          nodes: fresh.nodes,
          edges: fresh.edges,
          direction: 'LR',
          mode: 'current',
          runsPerMonth: 320,
          ratePerHour: 75,
          fitTick: get().fitTick + 1,
        })
      },
      newBlank: () => {
        get().checkpoint()
        set({ title: 'Untitled process', nodes: [], edges: [], mode: 'current', fitTick: get().fitTick + 1 })
      },

      exportDoc: () => {
        const s = get()
        return JSON.stringify(
          {
            app: 'dwell',
            version: 1,
            title: s.title,
            direction: s.direction,
            runsPerMonth: s.runsPerMonth,
            ratePerHour: s.ratePerHour,
            nodes: clean(s.nodes),
            edges: cleanEdges(s.edges),
          },
          null,
          2,
        )
      },
      importDoc: (text) => {
        try {
          const doc = JSON.parse(text)
          if (doc?.app !== 'dwell' || !Array.isArray(doc.nodes) || !Array.isArray(doc.edges)) {
            return 'That file is not a Dwell diagram.'
          }
          get().checkpoint()
          set({
            title: String(doc.title ?? 'Imported process'),
            direction: doc.direction === 'TB' ? 'TB' : 'LR',
            runsPerMonth: Number(doc.runsPerMonth) || 0,
            ratePerHour: Number(doc.ratePerHour) || 0,
            nodes: doc.nodes,
            edges: doc.edges,
            mode: 'current',
            fitTick: get().fitTick + 1,
          })
          return null
        } catch {
          return 'That file could not be read as JSON.'
        }
      },
    }),
    {
      name: 'dwell:v1',
      version: 2,
      migrate: (persisted, from) => {
        const p = (persisted ?? {}) as Record<string, unknown>
        if (from < 2) {
          // v2 adds monitoring and CI/CD items, brand marks and a horizontal sample.
          const have = new Map(((p.catalogue as CatalogItem[]) ?? []).map((c) => [c.id, c]))
          const merged = SEED_CATALOGUE.map((c) => have.get(c.id) ?? c)
          const custom = ((p.catalogue as CatalogItem[]) ?? []).filter((c) => !SEED_CATALOGUE.some((x) => x.id === c.id))
          p.catalogue = [...merged, ...custom]
          if (p.title === SAMPLE_TITLE) {
            const fresh = buildSample()
            p.nodes = fresh.nodes
            p.edges = fresh.edges
            p.direction = 'LR'
          }
        }
        return p as never
      },
      partialize: (s) => ({
        title: s.title,
        nodes: clean(s.nodes),
        edges: cleanEdges(s.edges),
        direction: s.direction,
        logoCorner: s.logoCorner,
        runsPerMonth: s.runsPerMonth,
        ratePerHour: s.ratePerHour,
        mode: s.mode,
        catalogue: s.catalogue,
      }),
    },
  ),
)

export { DIMS }
