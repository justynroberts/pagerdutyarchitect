import { edgesForNodes } from './lib/flows'
import { parseDoc, type DwellDoc } from './lib/doc'
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
  Zone,
  Flow,
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
import { MARK_COLORS, nextColor } from './lib/palette'
import { DIMS, canJoin, dimsOf, handlesFor, layoutNodes, nearestNode } from './lib/layout'
import { SAMPLE_FLOWS, SAMPLE_TITLE, SEED_CATALOGUE, buildSample, nodeFromItem } from './lib/seed'
import { applyTheme, readTheme } from './lib/theme'
import type { Overrides } from './lib/time'
import { DEFAULT_COMMERCIAL, cleanCommercial, type Commercial } from './lib/commercial'

type Snapshot = { nodes: DwellNode[]; edges: DwellEdge[]; title: string; flows: Flow[]; zones: Zone[]; overrides: Overrides; commercial: Commercial }

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
  /** Times and time bars on the canvas. Off to present the shape of a process without the figures. */
  showTimes: boolean
  setShowTimes: (on: boolean) => void
  flows: Flow[]
  zones: Zone[]
  /** Flow currently highlighted on the canvas. */
  activeFlow: string | null
  /** Node a drag in progress would connect to. Never persisted. */
  hint: string | null
  runsPerMonth: number
  ratePerHour: number
  /** Ledger figures typed over the calculated ones. Saved with the diagram. */
  overrides: Overrides
  setOverride: (key: keyof Overrides, value: number | undefined) => void
  /** The commercial case for this diagram. Saved with it. */
  commercial: Commercial
  /** No checkpoint: callers take one when an edit starts, so typing is one undo step. */
  setCommercial: (patch: Partial<Commercial>) => void
  /** Diagram or the commercial sheet. */
  view: 'diagram' | 'commercial'
  setView: (v: 'diagram' | 'commercial') => void
  /** The assumptions panel on the Value Assessment tab. */
  assumptionsOpen: boolean
  setAssumptionsOpen: (open: boolean) => void
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
  onReconnect: (old: DwellEdge, c: Connection) => void
  reverseEdge: (id: string) => void
  setEdgeSides: (id: string, sourceHandle: string, targetHandle: string) => void
  createFlow: (name: string, edgeIds: string[], color?: string) => string
  createFlowFromNodes: (nodeIds: string[], name?: string, color?: string) => string | null
  setFlowColor: (id: string, color: string) => void
  onZonesChange: (changes: NodeChange[]) => void
  addZone: (kind: Zone['kind'], at: { x: number; y: number }) => string
  areaAround: (nodeIds: string[]) => string | null
  updateZone: (id: string, patch: Partial<Zone>) => void
  renameFlow: (id: string, name: string) => void
  deleteFlow: (id: string) => void
  setEdgesInFlow: (flowId: string, edgeIds: string[], on: boolean) => void
  setActiveFlow: (id: string | null) => void
  traceFlow: (nodeId: string, dir: 'down' | 'up' | 'through') => void
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
  /** Replace the custom (non built-in) catalogue items, keeping the built-in ones as they are. */
  setCustomItems: (items: CatalogItem[]) => void

  loadSample: () => void
  newBlank: () => void
  exportDoc: () => string
  /** Replace the diagram with a document. `live` keeps the view (mode, highlight, selection) when a file changes under you. */
  applyDoc: (doc: DwellDoc, live?: boolean) => void
  presenting: boolean
  setPresenting: (on: boolean) => void
  file: string | null
  setFile: (name: string | null) => void
  importDoc: (text: string) => string | null
}

/** A connector made while Future is showing belongs to Future only. */
const madeIn = (mode: Mode, p: Presence): Presence => (mode === 'future' && p === 'both' ? 'future-only' : p)
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

function withData(e: DwellEdge, patch: Partial<EdgeData>): DwellEdge {
  return { ...e, data: { ...e.data, presence: e.data?.presence ?? 'both', label: e.data?.label ?? '', ...patch } }
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
    data: { presence: e.data?.presence ?? 'both', label: e.data?.label ?? '', flows: e.data?.flows ?? [], line: e.data?.line },
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
      showTimes: true,
      setShowTimes: (showTimes) => set({ showTimes }),
      flows: SAMPLE_FLOWS,
      zones: [],
      activeFlow: null,
      hint: null,
      runsPerMonth: 320,
      ratePerHour: 75,
      commercial: cleanCommercial(DEFAULT_COMMERCIAL),
      setCommercial: (patch) => set({ commercial: { ...get().commercial, ...patch } }),
      view: 'diagram',
      setView: (view) => set({ view }),
      assumptionsOpen: true,
      setAssumptionsOpen: (assumptionsOpen) => set({ assumptionsOpen }),
      overrides: {},
      setOverride: (key, value) => {
        get().checkpoint()
        const next = { ...get().overrides }
        if (value === undefined || !Number.isFinite(value)) delete next[key]
        else next[key] = Math.max(0, value)
        set({ overrides: next })
      },
      mode: 'current',
      theme: readTheme(),
      catalogue: SEED_CATALOGUE,
      past: [],
      redoStack: [],
      fitTick: 0,
      presenting: false,
      setPresenting: (presenting) => {
        // the stage changes size once the chrome hides or returns, so refit after it settles
        setTimeout(() => set({ fitTick: get().fitTick + 1 }), 120)
        set({
          presenting,
          ...(presenting ? { nodes: get().nodes.map((n) => ({ ...n, selected: false })), edges: get().edges.map((e) => ({ ...e, selected: false })), zones: get().zones.map((z) => ({ ...z, selected: false })) } : { activeFlow: null }),
        })
      },
      file: null,
      setFile: (file) => set({ file }),

      // Current is the baseline and Future is its own version of it. In Future, moving a step moves it
      // only there, removing a shared step only removes it from Future, and removing a Future-only step deletes it.
      onNodesChange: (changes) => {
        if (get().mode !== 'future') return set({ nodes: applyNodeChanges(changes, get().nodes) })
        const nodes = get().nodes
        const pass: NodeChange<DwellNode>[] = []
        const patch = new Map<string, Partial<DwellNode['data']>>()
        for (const c of changes) {
          const n = 'id' in c ? nodes.find((x) => x.id === c.id) : undefined
          if (c.type === 'position' && n) {
            if (c.position) patch.set(c.id, { ...patch.get(c.id), futurePos: c.position })
          } else if (c.type === 'remove' && n) {
            if (n.data.presence === 'both') patch.set(c.id, { ...patch.get(c.id), presence: 'current-only', futurePos: undefined })
            else if (n.data.presence === 'future-only') pass.push(c)
          } else pass.push(c)
        }
        let next = applyNodeChanges(pass, nodes)
        if (patch.size) next = next.map((n) => (patch.has(n.id) ? { ...n, data: { ...n.data, ...patch.get(n.id)! } } : n))
        set({ nodes: next })
      },
      onEdgesChange: (changes) => {
        if (get().mode !== 'future') return set({ edges: applyEdgeChanges(changes, get().edges) })
        const edges = get().edges
        const pass: EdgeChange<DwellEdge>[] = []
        const retire = new Set<string>()
        for (const c of changes) {
          const e = c.type === 'remove' ? edges.find((x) => x.id === c.id) : undefined
          if (e && (e.data?.presence ?? 'both') === 'both') retire.add(e.id)
          else pass.push(c)
        }
        let next = applyEdgeChanges(pass, edges)
        if (retire.size) next = next.map((e) => (retire.has(e.id) ? { ...e, selected: false, data: { ...e.data!, presence: 'current-only' as const } } : e))
        set({ edges: next })
      },

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
          data: { presence: madeIn(get().mode, derivePresence(src.data.presence, tgt.data.presence)), label },
        }
        set({ edges: [...edges.map((e) => ({ ...e, selected: false })), { ...edge, selected: true }], nodes: nodes.map((n) => ({ ...n, selected: false })) })
      },

      checkpoint: () => {
        const { nodes, edges, title, flows, zones, overrides, commercial, past } = get()
        set({ past: [...past, { nodes, edges, title, flows, zones, overrides, commercial }].slice(-HISTORY), redoStack: [] })
      },
      undo: () => {
        const { past, nodes, edges, title, flows, zones, overrides, commercial, redoStack } = get()
        const prev = past[past.length - 1]
        if (!prev) return
        set({
          past: past.slice(0, -1),
          redoStack: [...redoStack, { nodes, edges, title, flows, zones, overrides, commercial }],
          overrides: prev.overrides ?? {},
          commercial: prev.commercial ?? commercial,
          nodes: prev.nodes,
          edges: prev.edges,
          title: prev.title,
          flows: prev.flows,
          zones: prev.zones ?? [],
        })
      },
      redo: () => {
        const { past, nodes, edges, title, flows, zones, overrides, commercial, redoStack } = get()
        const next = redoStack[redoStack.length - 1]
        if (!next) return
        set({
          redoStack: redoStack.slice(0, -1),
          past: [...past, { nodes, edges, title, flows, zones, overrides, commercial }],
          overrides: next.overrides ?? {},
          commercial: next.commercial ?? commercial,
          nodes: next.nodes,
          edges: next.edges,
          title: next.title,
          flows: next.flows,
          zones: next.zones ?? [],
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
          near = nearestNode(s.nodes, { x: pos.x, y: pos.y, w: d0.w, h: d0.h }, 150, undefined, (n) => canJoin(item.kind, n.data.kind))
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
        const made = nodeFromItem(item, id, pos)
        const node: DwellNode = { ...made, data: { ...made.data, presence: madeIn(s.mode, made.data.presence) }, selected: true }
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
              data: { presence: madeIn(s.mode, derivePresence(parent.data.presence, item.presence)), label },
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
        const raw = get()
        // Positions as they are on screen: Future can have its own layout.
        const s = { ...raw, nodes: raw.nodes.map((n) => (raw.mode === 'future' && n.data.futurePos ? { ...n, position: n.data.futurePos } : n)) }
        const me = s.nodes.find((n) => n.id === id)
        if (!me) return false
        const d = dimsOf(me)
        const near = nearestNode(s.nodes, { x: me.position.x, y: me.position.y, w: d.w, h: d.h }, 150, id, (n) => canJoin(me.data.kind, n.data.kind))
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
              data: { presence: madeIn(s.mode, derivePresence(from.data.presence, to.data.presence)), label },
            },
          ],
        })
        return true
      },
      onReconnect: (old, c) => {
        const s = get()
        if (!c.source || !c.target || c.source === c.target) return
        s.checkpoint()
        set({
          edges: s.edges.map((e) =>
            e.id === old.id
              ? { ...e, source: c.source!, target: c.target!, sourceHandle: c.sourceHandle ?? undefined, targetHandle: c.targetHandle ?? undefined }
              : e,
          ),
        })
      },
      reverseEdge: (id) => {
        const s = get()
        s.checkpoint()
        set({
          edges: s.edges.map((e) =>
            e.id === id ? { ...e, source: e.target, target: e.source, sourceHandle: e.targetHandle, targetHandle: e.sourceHandle } : e,
          ),
        })
      },
      setEdgeSides: (id, sourceHandle, targetHandle) =>
        set({ edges: get().edges.map((e) => (e.id === id ? { ...e, sourceHandle, targetHandle } : e)) }),

      createFlow: (name, edgeIds, color) => {
        const s = get()
        s.checkpoint()
        const id = uid('f')
        const ids = new Set(edgeIds)
        set({
          flows: [...s.flows, { id, name: name.trim() || `Flow ${s.flows.length + 1}`, color: color ?? nextColor(s.flows.map((f) => f.color)) }],
          edges: s.edges.map((e) => (ids.has(e.id) ? withData(e, { flows: [...(e.data?.flows ?? []), id] }) : e)),
          activeFlow: id,
        })
        return id
      },
      createFlowFromNodes: (nodeIds, name = '', color) => {
        const s = get()
        const ids = edgesForNodes(s.edges, nodeIds)
        if (!ids.length) return null
        return get().createFlow(name, ids, color)
      },
      setFlowColor: (id, color) => set({ flows: get().flows.map((f) => (f.id === id ? { ...f, color } : f)) }),
      onZonesChange: (changes) => {
        let zones = get().zones
        for (const c of changes as unknown as {
          type: string
          id: string
          position?: { x: number; y: number }
          dimensions?: { width: number; height: number }
          selected?: boolean
        }[]) {
          if (c.type === 'remove') zones = zones.filter((z) => z.id !== c.id)
          else
            zones = zones.map((z) => {
              if (z.id !== c.id) return z
              if (c.type === 'position' && c.position) return { ...z, x: c.position.x, y: c.position.y }
              if (c.type === 'dimensions' && c.dimensions) return { ...z, w: Math.round(c.dimensions.width), h: Math.round(c.dimensions.height) }
              if (c.type === 'select') return { ...z, selected: !!c.selected }
              return z
            })
        }
        set({ zones })
      },
      addZone: (kind, at) => {
        const s = get()
        s.checkpoint()
        const id = uid('z')
        const zone: Zone =
          kind === 'area'
            ? { id, kind, x: snap8(at.x - 160), y: snap8(at.y - 100), w: 320, h: 200, label: 'Area', color: nextColor(s.zones.map((z) => z.color)), selected: true }
            : { id, kind, x: snap8(at.x - 60), y: snap8(at.y - 14), w: 0, h: 0, label: 'Label', color: nextColor(s.zones.map((z) => z.color)), selected: true }
        set({
          zones: [...s.zones.map((z) => ({ ...z, selected: false })), zone],
          nodes: s.nodes.map((n) => ({ ...n, selected: false })),
          edges: s.edges.map((e) => ({ ...e, selected: false })),
        })
        return id
      },
      areaAround: (nodeIds) => {
        const s = get()
        const picked = s.nodes.filter((n) => nodeIds.includes(n.id))
        if (!picked.length) return null
        s.checkpoint()
        let x0 = Infinity,
          y0 = Infinity,
          x1 = -Infinity,
          y1 = -Infinity
        for (const n of picked) {
          const d = dimsOf(n)
          x0 = Math.min(x0, n.position.x)
          y0 = Math.min(y0, n.position.y)
          x1 = Math.max(x1, n.position.x + d.w)
          y1 = Math.max(y1, n.position.y + d.h)
        }
        const pad = 32
        const id = uid('z')
        set({
          zones: [
            ...s.zones.map((z) => ({ ...z, selected: false })),
            { id, kind: 'area', x: snap8(x0 - pad), y: snap8(y0 - pad - 20), w: snap8(x1 - x0 + pad * 2), h: snap8(y1 - y0 + pad * 2 + 20), label: 'Area', color: nextColor(s.zones.map((z) => z.color)), selected: true },
          ],
          nodes: s.nodes.map((n) => ({ ...n, selected: false })),
        })
        return id
      },
      updateZone: (id, patch) => set({ zones: get().zones.map((z) => (z.id === id ? { ...z, ...patch } : z)) }),
      renameFlow: (id, name) => set({ flows: get().flows.map((f) => (f.id === id ? { ...f, name } : f)) }),
      deleteFlow: (id) => {
        const s = get()
        s.checkpoint()
        set({
          flows: s.flows.filter((f) => f.id !== id),
          edges: s.edges.map((e) => (e.data?.flows?.includes(id) ? withData(e, { flows: e.data.flows.filter((f) => f !== id) }) : e)),
          activeFlow: s.activeFlow === id ? null : s.activeFlow,
        })
      },
      setEdgesInFlow: (flowId, edgeIds, on) => {
        const s = get()
        s.checkpoint()
        const ids = new Set(edgeIds)
        set({
          edges: s.edges.map((e) => {
            if (!ids.has(e.id)) return e
            const cur = (e.data?.flows ?? []).filter((f) => f !== flowId)
            return withData(e, { flows: on ? [...cur, flowId] : cur })
          }),
        })
      },
      setActiveFlow: (activeFlow) => set({ activeFlow }),
      traceFlow: (nodeId, dir) => {
        const s = get()
        const walk = (forward: boolean) => {
          const seen = new Set<string>()
          const out = new Set<string>()
          const stack = [nodeId]
          while (stack.length) {
            const cur = stack.pop()!
            if (seen.has(cur)) continue
            seen.add(cur)
            for (const e of s.edges) {
              const from = forward ? e.source : e.target
              const to = forward ? e.target : e.source
              if (from === cur) {
                out.add(e.id)
                stack.push(to)
              }
            }
          }
          return out
        }
        const ids = new Set<string>([...(dir !== 'up' ? walk(true) : []), ...(dir !== 'down' ? walk(false) : [])])
        if (!ids.size) return
        const label = s.nodes.find((n) => n.id === nodeId)?.data.label ?? 'step'
        const name = dir === 'down' ? `From ${label}` : dir === 'up' ? `To ${label}` : `Through ${label}`
        get().createFlow(name, [...ids])
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
        const { nodes, edges, zones } = get()
        const gone = new Set(nodes.filter((n) => n.selected).map((n) => n.id))
        const goneEdges = edges.filter((e) => e.selected || gone.has(e.source) || gone.has(e.target))
        const goneZones = zones.filter((z) => z.selected)
        if (!gone.size && !goneEdges.length && !goneZones.length) return
        get().checkpoint()
        if (get().mode === 'future') {
          // Shared steps and connectors are only retired from Future. Ones that exist only in Future are deleted.
          const retire = new Set(nodes.filter((n) => gone.has(n.id) && n.data.presence === 'both').map((n) => n.id))
          const drop = new Set(nodes.filter((n) => gone.has(n.id) && n.data.presence === 'future-only').map((n) => n.id))
          const deadE = new Set(goneEdges.filter((e) => (e.data?.presence ?? 'both') === 'future-only' || drop.has(e.source) || drop.has(e.target)).map((e) => e.id))
          const retireE = new Set(goneEdges.filter((e) => !deadE.has(e.id) && (e.data?.presence ?? 'both') === 'both').map((e) => e.id))
          set({
            nodes: nodes.filter((n) => !drop.has(n.id)).map((n) => (retire.has(n.id) ? { ...n, selected: false, data: { ...n.data, presence: 'current-only' as const, futurePos: undefined } } : n)),
            edges: edges.filter((e) => !deadE.has(e.id)).map((e) => (retireE.has(e.id) ? { ...e, selected: false, data: { ...e.data!, presence: 'current-only' as const } } : e)),
            zones: zones.filter((z) => !z.selected),
          })
          return
        }
        const dead = new Set(goneEdges.map((e) => e.id))
        set({
          nodes: nodes.filter((n) => !gone.has(n.id)),
          edges: edges.filter((e) => !dead.has(e.id)),
          zones: zones.filter((z) => !z.selected),
        })
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
          nodes:
            s.mode === 'future'
              ? (() => {
                  const laid = new Map(layoutNodes(s.nodes, s.edges, d).map((n) => [n.id, n.position]))
                  return s.nodes.map((n) => ({ ...n, data: { ...n.data, futurePos: laid.get(n.id) } }))
                })()
              : layoutNodes(s.nodes, s.edges, d),
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
      setCustomItems: (items) => {
        const seeded = new Set(SEED_CATALOGUE.map((c) => c.id))
        set({ catalogue: [...get().catalogue.filter((c) => seeded.has(c.id)), ...items.filter((c) => !seeded.has(c.id))] })
      },

      loadSample: () => {
        get().checkpoint()
        const fresh = buildSample()
        set({
          title: SAMPLE_TITLE,
          nodes: fresh.nodes,
          edges: fresh.edges,
          direction: 'LR',
          flows: SAMPLE_FLOWS,
          zones: [],
          activeFlow: null,
          mode: 'current',
          runsPerMonth: 320,
          ratePerHour: 75,
          overrides: {},
          commercial: cleanCommercial(DEFAULT_COMMERCIAL),
          fitTick: get().fitTick + 1,
        })
      },
      newBlank: () => {
        get().checkpoint()
        set({ title: 'Untitled process', nodes: [], edges: [], flows: [], zones: [], overrides: {}, commercial: cleanCommercial(DEFAULT_COMMERCIAL), activeFlow: null, mode: 'current', fitTick: get().fitTick + 1 })
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
            ...(Object.keys(s.overrides).length ? { overrides: s.overrides } : {}),
            commercial: s.commercial,
            flows: s.flows,
            zones: s.zones,
            nodes: clean(s.nodes),
            edges: cleanEdges(s.edges),
          },
          null,
          2,
        )
      },
      applyDoc: (doc, live = false) => {
        const s = get()
        s.checkpoint()
        const seenN = new Map(s.nodes.map((n) => [n.id, n]))
        const seenE = new Map(s.edges.map((e) => [e.id, e]))
        const seenZ = new Map(s.zones.map((z) => [z.id, z]))
        const nodes = doc.nodes.map((n) => {
          const old = seenN.get(n.id)
          return live && old ? { ...n, selected: old.selected, measured: old.measured } : n
        })
        const edges = doc.edges.map((e) => (live && seenE.get(e.id)?.selected ? { ...e, selected: true } : e))
        const zones = doc.zones.map((z) => (live && seenZ.get(z.id)?.selected ? { ...z, selected: true } : z))
        const sameShape = nodes.length === s.nodes.length && nodes.every((n) => seenN.has(n.id))
        set({
          title: doc.title,
          direction: doc.direction,
          runsPerMonth: doc.runsPerMonth,
          ratePerHour: doc.ratePerHour,
          overrides: doc.overrides ?? {},
          commercial: doc.commercial ?? cleanCommercial(DEFAULT_COMMERCIAL),
          nodes,
          edges,
          flows: doc.flows,
          zones,
          activeFlow: live && doc.flows.some((f) => f.id === s.activeFlow) ? s.activeFlow : null,
          mode: live ? s.mode : (doc.mode ?? 'current'),
          fitTick: live && sameShape ? s.fitTick : s.fitTick + 1,
        })
      },
      importDoc: (text) => {
        const { doc, error } = parseDoc(text)
        if (!doc) return error === 'Not a Dwell diagram.' ? 'That file is not a Dwell diagram.' : 'That file could not be read as JSON.'
        get().applyDoc(doc)
        return null
      },
    }),
    {
      name: 'dwell:v1',
      version: 4,
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
        if (from < 3) {
          // v3 adds levers (AI or Automation) and named flows to the sample.
          if (p.title === SAMPLE_TITLE) {
            const fresh = buildSample()
            p.nodes = fresh.nodes
            p.edges = fresh.edges
            p.flows = SAMPLE_FLOWS
          }
          const old = (p.catalogue as CatalogItem[]) ?? []
          const seeded = SEED_CATALOGUE.map((c) => {
            const mine = old.find((x) => x.id === c.id) ?? c
            return { ...mine, lever: mine.lever ?? c.lever } as CatalogItem
          })
          p.catalogue = [...seeded, ...old.filter((c) => !SEED_CATALOGUE.some((x) => x.id === c.id))]
        }
        if (from < 4) {
          p.zones = []
          p.flows = ((p.flows as Flow[]) ?? []).map((f, i) => ({ ...f, color: f.color ?? MARK_COLORS[i % MARK_COLORS.length].value }))
        }
        return p as never
      },
      partialize: (s) => ({
        title: s.title,
        nodes: clean(s.nodes),
        edges: cleanEdges(s.edges),
        direction: s.direction,
        logoCorner: s.logoCorner,
        showTimes: s.showTimes,
        flows: s.flows,
        zones: s.zones,
        runsPerMonth: s.runsPerMonth,
        ratePerHour: s.ratePerHour,
        overrides: s.overrides,
        commercial: s.commercial,
        view: s.view,
        assumptionsOpen: s.assumptionsOpen,
        mode: s.mode,
        catalogue: s.catalogue,
        file: s.file,
      }),
    },
  ),
)

export { DIMS }
