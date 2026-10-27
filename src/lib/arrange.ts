import * as dagre from '@dagrejs/dagre'
import type { Direction, DwellEdge, DwellNode, Lane, Mode, Zone } from '../types'
import { dimsOf } from './layout'

export type Which = Mode | 'both'

/** What each state shows: Current hides Future-only steps; Future shows everything, with removed steps ghosted. */
function visible(nodes: DwellNode[], edges: DwellEdge[], mode: Mode) {
  const ns = mode === 'current' ? nodes.filter((n) => n.data.presence !== 'future-only') : nodes
  const ids = new Set(ns.map((n) => n.id))
  const pres = new Map(nodes.map((n) => [n.id, n.data.presence]))
  const es = edges.filter((e) => {
    if (!ids.has(e.source) || !ids.has(e.target)) return false
    const p = e.data?.presence ?? 'both'
    if (mode === 'current') return p !== 'future-only'
    // In Future a removed route is hidden, but lines to a removed step stay, ghosted, so it keeps its place.
    return p !== 'current-only' || pres.get(e.source) === 'current-only' || pres.get(e.target) === 'current-only'
  })
  // Bridge across steps this state hides: A to a hidden step to B lays out as A to B, so B keeps its place in
  // the order instead of dropping to the first column. Bridges shape the layout; they are never drawn.
  const bridges: [string, string][] = []
  const hidden = new Set(nodes.filter((n) => !ids.has(n.id)).map((n) => n.id))
  if (hidden.size) {
    const out = new Map<string, string[]>()
    for (const e of edges) out.set(e.source, [...(out.get(e.source) ?? []), e.target])
    for (const u of ids) {
      const seen = new Set<string>()
      const queue = (out.get(u) ?? []).filter((w) => hidden.has(w))
      while (queue.length) {
        const w = queue.shift()!
        if (seen.has(w)) continue
        seen.add(w)
        for (const x of out.get(w) ?? []) {
          if (hidden.has(x)) queue.push(x)
          else if (ids.has(x) && x !== u) bridges.push([u, x])
        }
      }
    }
  }
  return { ns, es, bridges }
}

const snap8 = (n: number) => Math.round(n / 8) * 8

/** One layered layout of the given steps: their positions, and lanes for connectors that span columns. */
function layOut(ns: DwellNode[], es: DwellEdge[], dir: Direction, bridges: [string, string][] = []) {
  const g = new dagre.graphlib.Graph()
  g.setGraph({
    rankdir: dir,
    // Room between columns for elbows and lanes, between rows for lines to pass.
    nodesep: dir === 'LR' ? 28 : 40,
    ranksep: 64,
    edgesep: 16,
    ranker: 'network-simplex',
    acyclicer: 'greedy',
    marginx: 0,
    marginy: 0,
  })
  g.setDefaultEdgeLabel(() => ({}))
  for (const n of ns) {
    const { w, h } = dimsOf(n)
    g.setNode(n.id, { width: w, height: h })
  }
  for (const e of es) if (e.source !== e.target) g.setEdge(e.source, e.target)
  for (const [a, b] of bridges) if (!g.hasEdge(a, b)) g.setEdge(a, b)
  dagre.layout(g)

  const pos = new Map<string, { x: number; y: number }>()
  for (const n of ns) {
    const p = g.node(n.id)
    const { w, h } = dimsOf(n)
    pos.set(n.id, { x: snap8(p.x - w / 2), y: snap8(p.y - h / 2) })
  }
  const lanes = new Map<string, Lane>()
  for (const e of es) {
    const pts = (g.edge(e.source, e.target) as { points?: { x: number; y: number }[] } | undefined)?.points ?? []
    const s = pos.get(e.source)
    const t = pos.get(e.target)
    // Only connectors that skip a column have a lane worth following, and only running forwards.
    const forward = s && t && (dir === 'LR' ? t.x > s.x : t.y > s.y)
    if (!s || !t || !forward || pts.length <= 3) continue
    lanes.set(e.id, { at: [s.x, s.y, t.x, t.y], pts: pts.slice(1, -1).map((p) => [Math.round(p.x), Math.round(p.y)]) })
  }
  return { pos, lanes }
}

/**
 * Lay out a diagram, each state on its own so neither leaves gaps for, or routes round, the other's steps.
 * Current sets each step's position; Future sets its Future position. Connectors that span columns get lanes.
 */
export function arrange(nodes: DwellNode[], edges: DwellEdge[], dir: Direction, which: Which = 'both') {
  let outNodes = nodes
  let outEdges = edges
  const apply = (mode: Mode) => {
    const { ns, es, bridges } = visible(outNodes, outEdges, mode)
    const { pos, lanes } = layOut(ns, es, dir, bridges)
    outNodes = outNodes.map((n) => {
      const p = pos.get(n.id)
      if (!p) return n
      return mode === 'current' ? { ...n, position: p } : { ...n, data: { ...n.data, futurePos: p } }
    })
    outEdges = outEdges.map((e) => {
      const lane = lanes.get(e.id)
      const had = e.data?.lanes
      if (!lane && !had?.[mode]) return e
      const next = { ...had, [mode]: lane }
      if (!lane) delete next[mode]
      return { ...e, data: { ...e.data!, lanes: Object.keys(next).length ? next : undefined } }
    })
  }
  if (which !== 'future') apply('current')
  if (which !== 'current') apply('future')
  // A step only Future shows has no Current place of its own: keep it where Future puts it.
  if (which === 'both') outNodes = outNodes.map((n) => (n.data.presence === 'future-only' && n.data.futurePos ? { ...n, position: n.data.futurePos } : n))
  return { nodes: outNodes, edges: outEdges }
}

/** The box an area draws around steps: padding all round, and room for its label on top. */
export function boundsAround(boxes: { x: number; y: number; w: number; h: number }[], kind: Zone['kind']) {
  const pad = 28
  const x0 = Math.min(...boxes.map((b) => b.x))
  const y0 = Math.min(...boxes.map((b) => b.y))
  const x1 = Math.max(...boxes.map((b) => b.x + b.w))
  const y1 = Math.max(...boxes.map((b) => b.y + b.h))
  if (kind === 'label') return { x: snap8(x0), y: snap8(y0 - 48), w: 0, h: 0 }
  return { x: snap8(x0 - pad), y: snap8(y0 - pad - 24), w: snap8(x1 - x0 + pad * 2), h: snap8(y1 - y0 + pad * 2 + 24) }
}

/**
 * Areas from before they remembered their steps: take the steps lying inside each one, so it can follow them.
 * Run before arranging, while the steps still sit where the area was drawn.
 */
export function inferAround(zones: Zone[], nodes: DwellNode[]): Zone[] {
  return zones.map((z) => {
    if (z.around?.length || z.kind !== 'area' || !z.w || !z.h) return z
    const inside = nodes.filter((n) => {
      const { w, h } = dimsOf(n)
      return n.position.x >= z.x && n.position.y >= z.y && n.position.x + w <= z.x + z.w && n.position.y + h <= z.y + z.h
    })
    return inside.length ? { ...z, around: inside.map((n) => n.id) } : z
  })
}

/** Redraw areas around the steps they were drawn around, in each state that was laid out. */
export function fitZones(zones: Zone[], nodes: DwellNode[], which: Which = 'both'): Zone[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  return zones.map((z) => {
    const members = (z.around ?? []).map((id) => byId.get(id)).filter((n): n is DwellNode => !!n)
    if (!members.length) return z
    let out = z
    if (which !== 'future') {
      const inCurrent = members.filter((n) => n.data.presence !== 'future-only')
      if (inCurrent.length) out = { ...out, ...boundsAround(inCurrent.map((n) => ({ ...n.position, ...dimsOf(n) })), z.kind) }
    }
    if (which !== 'current') out = { ...out, future: boundsAround(members.map((n) => ({ ...(n.data.futurePos ?? n.position), ...dimsOf(n) })), z.kind) }
    return out
  })
}

/** The lane a connector should follow in this state, if both its steps are still where the layout put them. */
export function liveLane(e: DwellEdge, mode: Mode, s: { x: number; y: number }, t: { x: number; y: number }) {
  const lane = e.data?.pinned ? undefined : e.data?.lanes?.[mode]
  if (!lane) return undefined
  const [sx, sy, tx, ty] = lane.at
  const near = (a: number, b: number) => Math.abs(a - b) < 1
  return near(sx, s.x) && near(sy, s.y) && near(tx, t.x) && near(ty, t.y) ? lane.pts : undefined
}
