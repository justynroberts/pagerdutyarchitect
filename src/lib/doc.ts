/**
 * The Dwell diagram as plain data, and the edits you can make to it. No React, no store, no browser:
 * the app, the tests and the MCP server all go through these same functions, so a diagram built by
 * an AI behaves exactly like one drawn by hand.
 */
import { flowTotals } from './check'
import type { CatalogItem, Direction, DwellEdge, DwellNode, Flow, Kind, Lever, LineStyle, Mode, NodeData, Presence, Zone } from '../types'
import { DIMS, handlesFor, layoutNodes } from './layout'
import { buildSample, SAMPLE_FLOWS, SAMPLE_TITLE, SEED_CATALOGUE, nodeFromItem } from './seed'
import { edgesForNodes } from './flows'
import { MARK_COLORS, nextColor } from './palette'
import { cleanOverrides, savedByLever, summarise, stepMins, stepSaved, type Overrides, type Summary } from './time'

export type DwellDoc = {
  app: 'dwell'
  version: 1
  title: string
  subtitle?: string
  direction: Direction
  mode?: Mode
  runsPerMonth: number
  ratePerHour: number
  /** Ledger figures typed over the calculated ones. */
  overrides?: Overrides
  flows: Flow[]
  zones: Zone[]
  nodes: DwellNode[]
  edges: DwellEdge[]
}

export const blankDoc = (title = 'Untitled process'): DwellDoc => ({
  app: 'dwell',
  version: 1,
  title,
  direction: 'LR',
  mode: 'current',
  runsPerMonth: 320,
  ratePerHour: 75,
  flows: [],
  zones: [],
  nodes: [],
  edges: [],
})

export function sampleDoc(): DwellDoc {
  const s = buildSample()
  return { ...blankDoc(SAMPLE_TITLE), flows: SAMPLE_FLOWS.map((f) => ({ ...f })), nodes: s.nodes, edges: s.edges }
}

export const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))

/** Strip render-only fields so files stay small and diff cleanly. */
export function tidy(doc: DwellDoc): DwellDoc {
  return {
    ...doc,
    nodes: doc.nodes.map((n) => ({ id: n.id, type: 'flow', position: n.position, data: stripUndefined(n.data) })),
    edges: doc.edges.map((e) => ({
      id: e.id,
      type: 'flow',
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      data: { presence: e.data?.presence ?? 'both', label: e.data?.label ?? '', flows: e.data?.flows ?? [], ...(e.data?.line ? { line: e.data.line } : {}) },
    })),
    zones: doc.zones.map(({ selected: _s, ...z }) => z),
  } as DwellDoc
}

function stripUndefined<T extends object>(o: T): T {
  const { dim: _d, ...rest } = o as T & { dim?: boolean }
  return Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)) as T
}

export function parseDoc(text: string): { doc?: DwellDoc; error?: string } {
  try {
    const d = JSON.parse(text)
    if (d?.app !== 'dwell' || !Array.isArray(d.nodes) || !Array.isArray(d.edges)) return { error: 'Not a Dwell diagram.' }
    const base = blankDoc(String(d.title ?? 'Imported process'))
    return {
      doc: {
        ...base,
        ...d,
        direction: d.direction === 'TB' ? 'TB' : 'LR',
        flows: (Array.isArray(d.flows) ? d.flows : []).map((f: Flow, i: number) => ({ ...f, color: f.color ?? MARK_COLORS[i % MARK_COLORS.length].value })),
        zones: Array.isArray(d.zones) ? d.zones : [],
        overrides: cleanOverrides(d.overrides),
      },
    }
  } catch {
    return { error: 'Could not read the file as JSON.' }
  }
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'step'

function uniqueId(taken: Iterable<string>, base: string) {
  const set = new Set(taken)
  if (!set.has(base)) return base
  let i = 2
  while (set.has(`${base}-${i}`)) i++
  return `${base}-${i}`
}

const snap8 = (n: number) => Math.round(n / 8) * 8

export const DEFAULT_ICON: Record<Kind, NodeData['icon']> = {
  input: 'bell',
  step: 'gear',
  decision: 'question',
  automation: 'lightning',
  output: 'check',
}

export function findStep(doc: DwellDoc, ref: string): DwellNode {
  const byId = doc.nodes.find((n) => n.id === ref)
  if (byId) return byId
  const matches = doc.nodes.filter((n) => n.data.label.toLowerCase() === ref.toLowerCase())
  if (matches.length === 1) return matches[0]
  if (matches.length > 1) throw new Error(`"${ref}" matches ${matches.length} steps. Use one of the ids: ${matches.map((m) => m.id).join(', ')}`)
  throw new Error(`No step "${ref}". Steps are: ${doc.nodes.map((n) => `${n.id} (${n.data.label})`).join(', ') || 'none yet'}`)
}

export type StepSpec = {
  id?: string
  /** Start from a catalogue entry, then override anything below. */
  catalogue_id?: string
  kind?: Kind
  label?: string
  tool?: string
  icon?: NodeData['icon']
  brand?: NodeData['brand']
  current?: number
  future?: number
  share?: number
  presence?: Presence
  lever?: Lever
  note?: string
  /** Connect this new step after (from) another one. */
  after?: string
  before?: string
  edge_label?: string
}

export function catalogueEntry(id: string, catalogue: CatalogItem[] = SEED_CATALOGUE): CatalogItem {
  const c = catalogue.find((x) => x.id === id)
  if (!c) throw new Error(`No catalogue entry "${id}". Use list_catalogue to see what exists.`)
  return c
}

function freeSpot(doc: DwellDoc, pos: { x: number; y: number }) {
  const p = { ...pos }
  for (let i = 0; i < 80; i++) {
    const clash = doc.nodes.some((n) => Math.abs(n.position.x - p.x) < 196 && Math.abs(n.position.y - p.y) < 64)
    if (!clash) break
    if (doc.direction === 'LR') p.y += 80
    else p.x += 232
  }
  return { x: snap8(p.x), y: snap8(p.y) }
}

function derivePresence(a: Presence, b: Presence): Presence {
  if (a === 'current-only' || b === 'current-only') return a === 'future-only' || b === 'future-only' ? 'both' : 'current-only'
  if (a === 'future-only' || b === 'future-only') return 'future-only'
  return 'both'
}

export function addStep(doc: DwellDoc, spec: StepSpec, catalogue: CatalogItem[] = SEED_CATALOGUE): DwellNode {
  const base = spec.catalogue_id ? catalogueEntry(spec.catalogue_id, catalogue) : undefined
  const kind = spec.kind ?? base?.kind ?? 'step'
  const label = spec.label ?? base?.label
  if (!label) throw new Error('A step needs a label, or a catalogue_id to take one from.')
  const id = uniqueId(
    doc.nodes.map((n) => n.id),
    spec.id ?? slug(label),
  )
  const parent = spec.after ? findStep(doc, spec.after) : spec.before ? findStep(doc, spec.before) : undefined
  let pos = { x: 0, y: 0 }
  if (parent) {
    const d = DIMS[parent.data.kind]
    const fwd = !!spec.after
    pos =
      doc.direction === 'LR'
        ? { x: parent.position.x + (fwd ? d.w + 60 : -(DIMS[kind].w + 60)), y: parent.position.y }
        : { x: parent.position.x, y: parent.position.y + (fwd ? d.h + 56 : -(DIMS[kind].h + 56)) }
  } else if (doc.nodes.length) {
    const last = doc.nodes[doc.nodes.length - 1]
    pos = doc.direction === 'LR' ? { x: last.position.x + DIMS[last.data.kind].w + 60, y: last.position.y } : { x: last.position.x, y: last.position.y + DIMS[last.data.kind].h + 56 }
  }
  const item: CatalogItem = {
    id,
    kind,
    label,
    tool: spec.tool ?? base?.tool ?? '',
    icon: spec.icon ?? base?.icon ?? DEFAULT_ICON[kind],
    brand: spec.brand ?? base?.brand,
    current: spec.current ?? base?.current ?? 0,
    future: spec.future ?? base?.future ?? spec.current ?? base?.current ?? 0,
    presence: spec.presence ?? base?.presence ?? 'both',
    lever: spec.lever ?? base?.lever,
  }
  const node = nodeFromItem(item, id, freeSpot(doc, pos), spec.share ?? 100, spec.note ?? '')
  doc.nodes.push(node)
  if (spec.after) connect(doc, spec.after, id, spec.edge_label)
  else if (spec.before) connect(doc, id, spec.before, spec.edge_label)
  return node
}

export function updateStep(doc: DwellDoc, ref: string, patch: Partial<Omit<StepSpec, 'id' | 'catalogue_id' | 'after' | 'before' | 'edge_label'>>) {
  const n = findStep(doc, ref)
  n.data = stripUndefined({ ...n.data, ...patch }) as NodeData
  return n
}

export function removeStep(doc: DwellDoc, ref: string) {
  const n = findStep(doc, ref)
  doc.nodes = doc.nodes.filter((x) => x.id !== n.id)
  doc.edges = doc.edges.filter((e) => e.source !== n.id && e.target !== n.id)
  return n
}

export function connect(doc: DwellDoc, from: string, to: string, label?: string, line?: LineStyle): DwellEdge {
  const a = findStep(doc, from)
  const b = findStep(doc, to)
  if (a.id === b.id) throw new Error('A step cannot connect to itself.')
  const existing = doc.edges.find((e) => e.source === a.id && e.target === b.id)
  if (existing) {
    if (label !== undefined) existing.data = { ...existing.data!, label }
    if (line) existing.data = { ...existing.data!, line }
    return existing
  }
  const outgoing = doc.edges.filter((e) => e.source === a.id).length
  const auto = a.data.kind === 'decision' ? (outgoing === 0 ? 'Yes' : outgoing === 1 ? 'No' : '') : ''
  const { sourceHandle, targetHandle } = handlesFor(doc.direction)
  const edge: DwellEdge = {
    id: uniqueId(
      doc.edges.map((e) => e.id),
      `e-${a.id}-${b.id}`,
    ),
    type: 'flow',
    source: a.id,
    target: b.id,
    sourceHandle,
    targetHandle,
    data: { presence: derivePresence(a.data.presence, b.data.presence), label: label ?? auto, flows: [], ...(line ? { line } : {}) },
  }
  doc.edges.push(edge)
  return edge
}

export function disconnect(doc: DwellDoc, from: string, to: string) {
  const a = findStep(doc, from)
  const b = findStep(doc, to)
  const before = doc.edges.length
  doc.edges = doc.edges.filter((e) => !(e.source === a.id && e.target === b.id))
  if (doc.edges.length === before) throw new Error(`No connector from ${a.id} to ${b.id}.`)
}

export function updateConnector(doc: DwellDoc, from: string, to: string, patch: { label?: string; line?: LineStyle; presence?: Presence }) {
  const a = findStep(doc, from)
  const b = findStep(doc, to)
  const e = doc.edges.find((x) => x.source === a.id && x.target === b.id)
  if (!e) throw new Error(`No connector from ${a.id} to ${b.id}.`)
  e.data = { ...e.data!, ...patch }
  return e
}

/** A named, coloured path. Give it steps (the connectors between them are used, gaps are bridged) or a path in order. */
export function createFlow(doc: DwellDoc, name: string, opts: { steps?: string[]; path?: string[]; color?: string }): Flow {
  let edgeIds: string[] = []
  if (opts.path?.length) {
    const ids = opts.path.map((r) => findStep(doc, r).id)
    for (let i = 0; i < ids.length - 1; i++) {
      const e = doc.edges.find((x) => x.source === ids[i] && x.target === ids[i + 1])
      if (!e) throw new Error(`No connector from ${ids[i]} to ${ids[i + 1]}. Connect them first.`)
      edgeIds.push(e.id)
    }
  } else if (opts.steps?.length) {
    edgeIds = edgesForNodes(
      doc.edges,
      opts.steps.map((r) => findStep(doc, r).id),
    )
  }
  if (!edgeIds.length) throw new Error('Those steps have no connectors between them, so there is no path to highlight.')
  const color = opts.color ?? nextColor(doc.flows.map((f) => f.color))
  const flow: Flow = { id: uniqueId(doc.flows.map((f) => f.id), `f-${slug(name || 'flow')}`), name: name || `Flow ${doc.flows.length + 1}`, color }
  doc.flows.push(flow)
  const set = new Set(edgeIds)
  doc.edges = doc.edges.map((e) => (set.has(e.id) ? { ...e, data: { ...e.data!, flows: [...(e.data?.flows ?? []), flow.id] } } : e))
  return flow
}

export function deleteFlow(doc: DwellDoc, ref: string) {
  const f = doc.flows.find((x) => x.id === ref || x.name.toLowerCase() === ref.toLowerCase())
  if (!f) throw new Error(`No flow "${ref}". Flows are: ${doc.flows.map((x) => x.name).join(', ') || 'none'}`)
  doc.flows = doc.flows.filter((x) => x.id !== f.id)
  doc.edges = doc.edges.map((e) => ({ ...e, data: { ...e.data!, flows: (e.data?.flows ?? []).filter((x) => x !== f.id) } }))
}

export function updateFlow(doc: DwellDoc, ref: string, patch: { name?: string; color?: string }) {
  const f = doc.flows.find((x) => x.id === ref || x.name.toLowerCase() === ref.toLowerCase())
  if (!f) throw new Error(`No flow "${ref}".`)
  Object.assign(f, patch)
  return f
}

export function addZone(doc: DwellDoc, spec: { kind: 'area' | 'label'; label: string; color?: string; around?: string[]; x?: number; y?: number; w?: number; h?: number }): Zone {
  const color = spec.color ?? nextColor(doc.zones.map((z) => z.color))
  let x = spec.x ?? 0
  let y = spec.y ?? 0
  let w = spec.w ?? (spec.kind === 'area' ? 360 : 0)
  let h = spec.h ?? (spec.kind === 'area' ? 200 : 0)
  if (spec.around?.length) {
    const ns = spec.around.map((r) => findStep(doc, r))
    const pad = 28
    const minX = Math.min(...ns.map((n) => n.position.x))
    const minY = Math.min(...ns.map((n) => n.position.y))
    const maxX = Math.max(...ns.map((n) => n.position.x + DIMS[n.data.kind].w))
    const maxY = Math.max(...ns.map((n) => n.position.y + DIMS[n.data.kind].h))
    if (spec.kind === 'area') {
      x = snap8(minX - pad)
      y = snap8(minY - pad - 24)
      w = snap8(maxX - minX + pad * 2)
      h = snap8(maxY - minY + pad * 2 + 24)
    } else {
      x = snap8(minX)
      y = snap8(minY - 48)
    }
  }
  const zone: Zone = { id: uniqueId(doc.zones.map((z) => z.id), `z-${slug(spec.label)}`), kind: spec.kind, x, y, w, h, label: spec.label, color }
  doc.zones.push(zone)
  return zone
}

export function removeZone(doc: DwellDoc, ref: string) {
  const z = doc.zones.find((x) => x.id === ref || x.label.toLowerCase() === ref.toLowerCase())
  if (!z) throw new Error(`No area or label "${ref}".`)
  doc.zones = doc.zones.filter((x) => x.id !== z.id)
}

export function autoLayout(doc: DwellDoc, direction?: Direction) {
  if (direction && direction !== doc.direction) {
    doc.direction = direction
    const h = handlesFor(direction)
    doc.edges = doc.edges.map((e) => ({ ...e, ...h }))
  }
  doc.nodes = layoutNodes(doc.nodes, doc.edges, doc.direction)
}

export type DiagramSpec = {
  title?: string
  subtitle?: string
  direction?: Direction
  runs_per_month?: number
  rate_per_hour?: number
  steps: (StepSpec & { id: string })[]
  connections?: { from: string; to: string; label?: string; line?: LineStyle }[]
  flows?: { name: string; color?: string; steps?: string[]; path?: string[] }[]
  areas?: { label: string; color?: string; around: string[]; kind?: 'area' | 'label' }[]
}

/** Build a whole diagram in one go and lay it out. Later `after` links in steps are honoured too. */
export function buildDoc(spec: DiagramSpec, catalogue: CatalogItem[] = SEED_CATALOGUE): DwellDoc {
  const doc = blankDoc(spec.title)
  if (spec.subtitle) doc.subtitle = spec.subtitle
  if (spec.direction) doc.direction = spec.direction
  if (spec.runs_per_month !== undefined) doc.runsPerMonth = spec.runs_per_month
  if (spec.rate_per_hour !== undefined) doc.ratePerHour = spec.rate_per_hour
  const links: { from: string; to: string; label?: string }[] = []
  for (const s of spec.steps) {
    const { after, before, edge_label, ...rest } = s
    addStep(doc, rest, catalogue)
    if (after) links.push({ from: after, to: s.id, label: edge_label })
    if (before) links.push({ from: s.id, to: before, label: edge_label })
  }
  for (const c of [...links, ...(spec.connections ?? [])]) connect(doc, c.from, c.to, c.label, 'line' in c ? (c as { line?: LineStyle }).line : undefined)
  autoLayout(doc)
  for (const f of spec.flows ?? []) createFlow(doc, f.name, { steps: f.steps, path: f.path, color: f.color })
  for (const a of spec.areas ?? []) addZone(doc, { kind: a.kind ?? 'area', label: a.label, color: a.color, around: a.around })
  return doc
}

export type Overview = {
  title: string
  steps: { id: string; kind: Kind; label: string; tool: string; current: number; future: number; saved: number; share: number; presence: Presence; lever: Lever }[]
  connectors: { from: string; to: string; label: string; flows: string[] }[]
  flows: { id: string; name: string; color: string; connectors: number; steps: number; current: number; future: number; saved: number }[]
  areas: { id: string; kind: string; label: string }[]
  summary: Summary
  savedBy: { lever: string; minutes: number }[]
}

export function overview(doc: DwellDoc): Overview {
  const flowName = new Map(doc.flows.map((f) => [f.id, f.name]))
  return {
    title: doc.title,
    steps: doc.nodes.map((n) => ({
      id: n.id,
      kind: n.data.kind,
      label: n.data.label,
      tool: n.data.tool,
      current: n.data.current,
      future: n.data.future,
      saved: round(stepSaved(n.data)),
      share: n.data.share,
      presence: n.data.presence,
      lever: n.data.lever ?? 'none',
    })),
    connectors: doc.edges.map((e) => ({ from: e.source, to: e.target, label: e.data?.label ?? '', flows: (e.data?.flows ?? []).map((f) => flowName.get(f) ?? f) })),
    flows: doc.flows.map((f) => {
      const t = flowTotals(doc, f.id)
      return { ...f, connectors: doc.edges.filter((e) => e.data?.flows?.includes(f.id)).length, steps: t.steps, current: round(t.current), future: round(t.future), saved: round(t.saved) }
    }),
    areas: doc.zones.map((z) => ({ id: z.id, kind: z.kind, label: z.label })),
    summary: summarise(doc.nodes, doc.runsPerMonth, doc.ratePerHour, doc.overrides),
    savedBy: savedByLever(doc.nodes).map((l) => ({ lever: l.lever, minutes: round(l.saved) })),
  }
}

const round = (n: number) => Math.round(n * 100) / 100

export { stepMins }
