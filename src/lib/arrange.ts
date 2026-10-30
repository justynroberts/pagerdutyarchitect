import * as dagre from '@dagrejs/dagre'
import type { Direction, DwellEdge, DwellNode, Lane, Mode, Zone } from '../types'
import { dimsOf } from './layout'
import { presenceState } from './time'

export type Which = Mode | 'both'

/** What each state shows: Current hides Future-only steps; Future shows everything, with removed steps ghosted. */
function visible(nodes: DwellNode[], edges: DwellEdge[], mode: Mode, hideRemoved = false) {
  const ns = nodes.filter((n) => presenceState(n.data.presence, mode, hideRemoved) !== 'hidden')
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
  // A step with a line of its own leading in keeps its place from that; a bridge alongside would be a phantom link
  // holding the layout to the other state's shape. Keep bridges only for steps that would otherwise have none.
  const fed = new Set(es.map((e) => e.target))
  return { ns, es, bridges: bridges.filter(([, b]) => !fed.has(b)) }
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
  const links: [string, string][] = []
  for (const e of es) if (e.source !== e.target) links.push([e.source, e.target])
  for (const b of bridges) links.push(b)
  for (const [a, b] of links) if (!g.hasEdge(a, b)) g.setEdge(a, b)
  // Signals all start in the first column: a heavy link from one hidden root holds each at its first rank,
  // instead of letting it drift towards whatever it feeds.
  const fed = new Set(links.map(([, b]) => b))
  const signals = ns.filter((n) => n.data.kind === 'input' && !fed.has(n.id))
  if (signals.length > 1) {
    g.setNode(ROOT, { width: 1, height: 1 })
    for (const n of signals) g.setEdge(ROOT, n.id, { weight: 1000, minlen: 1 })
  }
  dagre.layout(g)

  // Centres, snapped to the grid, so steps of different heights in a row stay level.
  const along = dir === 'LR' ? 'x' : 'y'
  const across = dir === 'LR' ? 'y' : 'x'
  const centre = new Map(ns.map((n) => [n.id, { x: snap8(g.node(n.id).x), y: snap8(g.node(n.id).y) }]))
  const size = (id: string) => {
    const { w, h } = dimsOf(ns.find((n) => n.id === id)!)
    return { along: dir === 'LR' ? w : h, across: dir === 'LR' ? h : w }
  }

  // Straighten chains: a step moves level with the step feeding it from the nearest column, when that one leads
  // only here and nothing else in the column is in the way. Taken in order, so a whole chain lines up.
  const outs = new Map<string, string[]>()
  const ins = new Map<string, string[]>()
  for (const [a, b] of links) {
    if (a === b) continue
    outs.set(a, [...new Set([...(outs.get(a) ?? []), b])])
    ins.set(b, [...new Set([...(ins.get(b) ?? []), a])])
  }
  const gap = dir === 'LR' ? 28 : 40
  // How much of the process leads to each step: the main line has the longest history behind it.
  const history = new Map<string, number>()
  const behind = (id: string, seen = new Set<string>()): number => {
    if (history.has(id)) return history.get(id)!
    if (seen.has(id)) return 0
    seen.add(id)
    const n = (ins.get(id) ?? []).reduce((m, w) => Math.max(m, behind(w, seen) + 1), 0)
    history.set(id, n)
    return n
  }
  const order = [...ns].sort((a, b) => centre.get(a.id)![along] - centre.get(b.id)![along])
  // Whether a step can sit at this cross position without crowding another in its column.
  const fits = (id: string, at: number, ignore: Set<string>) => {
    const c = centre.get(id)!
    const sv = size(id)
    return ns.every((o) => {
      if (o.id === id || ignore.has(o.id)) return true
      const co = centre.get(o.id)!
      const so = size(o.id)
      const sameColumn = Math.abs(co[along] - c[along]) < (so.along + sv.along) / 2
      return !sameColumn || Math.abs(co[across] - at) >= (so.across + sv.across) / 2 + gap
    })
  }
  for (const v of order) {
    // Feeding steps nearest first; in the same column, the one with the longest history (the main line) first.
    const rankOf = (id: string) => [centre.get(id)![along], behind(id)]
    const from = [...(ins.get(v.id) ?? [])].sort((a, b) => rankOf(b)[0] - rankOf(a)[0] || rankOf(b)[1] - rankOf(a)[1])
    const lone = from.length > 1 && rankOf(from[1])[0] === rankOf(from[0])[0] && rankOf(from[1])[1] === rankOf(from[0])[1]
    if (from.length && outs.get(from[0])?.length === 1 && !lone) {
      const u = centre.get(from[0])!
      const c = centre.get(v.id)!
      if (u[across] !== c[across] && u[along] < c[along] && fits(v.id, u[across], new Set())) centre.set(v.id, { ...c, [across]: u[across] })
    }
    // A branch: the steps only this one leads to, in the next column, stack tightly around it instead of
    // spreading wherever the layout left them. Their own chains then follow them.
    const kids = (outs.get(v.id) ?? []).filter((k) => ins.get(k)?.length === 1)
    if (kids.length < 2) continue
    const col = Math.min(...kids.map((k) => centre.get(k)![along]))
    const block = kids.filter((k) => centre.get(k)![along] === col).sort((a, b) => centre.get(a)![across] - centre.get(b)![across])
    if (block.length < 2 || col <= centre.get(v.id)![along]) continue
    const span = block.reduce((t, k) => t + size(k).across, 0) + gap * (block.length - 1)
    let at = centre.get(v.id)![across] - span / 2
    const want = block.map((k) => {
      const mid = snap8(at + size(k).across / 2)
      at += size(k).across + gap
      return mid
    })
    const mine = new Set(block)
    if (block.every((k, i) => fits(k, want[i], mine))) block.forEach((k, i) => centre.set(k, { ...centre.get(k)!, [across]: want[i] }))
  }

  const pos = new Map<string, { x: number; y: number }>()
  for (const n of ns) {
    const { w, h } = dimsOf(n)
    const c = centre.get(n.id)!
    pos.set(n.id, { x: c.x - w / 2, y: c.y - h / 2 })
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

const ROOT = '\u0000root'

/**
 * Lay out a diagram, each state on its own so neither leaves gaps for, or routes round, the other's steps.
 * Current sets each step's position; Future sets its Future position. Connectors that span columns get lanes.
 */
export function arrange(nodes: DwellNode[], edges: DwellEdge[], dir: Direction, which: Which = 'both', hideRemoved = false) {
  let outNodes = nodes
  let outEdges = edges
  const apply = (mode: Mode) => {
    const { ns, es, bridges } = visible(outNodes, outEdges, mode, hideRemoved)
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
export function fitZones(zones: Zone[], nodes: DwellNode[], which: Which = 'both', hideRemoved = false): Zone[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  return zones.map((z) => {
    const members = (z.around ?? []).map((id) => byId.get(id)).filter((n): n is DwellNode => !!n)
    if (!members.length) return z
    let out = z
    if (which !== 'future') {
      const inCurrent = members.filter((n) => n.data.presence !== 'future-only')
      if (inCurrent.length) out = { ...out, ...boundsAround(inCurrent.map((n) => ({ ...n.position, ...dimsOf(n) })), z.kind) }
    }
    const inFuture = members.filter((n) => presenceState(n.data.presence, 'future', hideRemoved) !== 'hidden')
    if (which !== 'current' && inFuture.length) out = { ...out, future: boundsAround(inFuture.map((n) => ({ ...(n.data.futurePos ?? n.position), ...dimsOf(n) })), z.kind) }
    return out
  })
}

/**
 * Whether an area shows in this state. One drawn round steps that this state hides altogether, such as an area
 * of Future-only steps in Current, would be an empty box over whatever sits there instead, so it is left out.
 */
export function zoneShown(z: Zone, nodes: DwellNode[], mode: Mode, hideRemoved = false) {
  if (z.kind !== 'area' || !z.around?.length) return true
  const members = nodes.filter((n) => z.around!.includes(n.id))
  return !members.length || members.some((n) => presenceState(n.data.presence, mode, hideRemoved) !== 'hidden')
}

/** The lane a connector should follow in this state, if both its steps are still where the layout put them. */
export function liveLane(e: DwellEdge, mode: Mode, s: { x: number; y: number }, t: { x: number; y: number }) {
  const lane = e.data?.pinned ? undefined : e.data?.lanes?.[mode]
  if (!lane) return undefined
  const [sx, sy, tx, ty] = lane.at
  const near = (a: number, b: number) => Math.abs(a - b) < 1
  return near(sx, s.x) && near(sy, s.y) && near(tx, t.x) && near(ty, t.y) ? lane.pts : undefined
}
