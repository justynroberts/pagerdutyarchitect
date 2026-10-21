import * as dagre from '@dagrejs/dagre'
import type { DwellEdge, DwellNode, Direction, Kind } from '../types'

export const DIMS: Record<Kind, { w: number; h: number }> = {
  input: { w: 204, h: 56 },
  step: { w: 204, h: 56 },
  automation: { w: 204, h: 56 },
  output: { w: 204, h: 56 },
  decision: { w: 156, h: 108 },
}

export function dimsOf(n: DwellNode) {
  return {
    w: n.measured?.width ?? DIMS[n.data.kind].w,
    h: n.measured?.height ?? DIMS[n.data.kind].h,
  }
}

/** Left-to-right or top-to-bottom layered layout. Returns new nodes, leaves edges alone. */
export function layoutNodes(nodes: DwellNode[], edges: DwellEdge[], dir: Direction): DwellNode[] {
  const g = new dagre.graphlib.Graph()
  g.setGraph({
    rankdir: dir,
    nodesep: dir === 'LR' ? 22 : 36,
    ranksep: dir === 'LR' ? 44 : 44,
    marginx: 0,
    marginy: 0,
  })
  g.setDefaultEdgeLabel(() => ({}))
  for (const n of nodes) {
    const { w, h } = dimsOf(n)
    g.setNode(n.id, { width: w, height: h })
  }
  for (const e of edges) {
    if (g.hasNode(e.source) && g.hasNode(e.target)) g.setEdge(e.source, e.target)
  }
  dagre.layout(g)
  return nodes.map((n) => {
    const p = g.node(n.id)
    const { w, h } = dimsOf(n)
    return { ...n, position: { x: Math.round((p.x - w / 2) / 8) * 8, y: Math.round((p.y - h / 2) / 8) * 8 } }
  })
}

export function handlesFor(dir: Direction) {
  return dir === 'LR' ? { sourceHandle: 'r', targetHandle: 'l' } : { sourceHandle: 'b', targetHandle: 't' }
}

/**
 * Whether a step of kind `a` dropped beside one of kind `b` should be joined to it. Signals start
 * flows and outputs end them, so two of either never join each other.
 */
export function canJoin(a: Kind, b: Kind) {
  return !((a === 'input' && b === 'input') || (a === 'output' && b === 'output'))
}

/**
 * The closest node to a point, within `reach` pixels of its edge. Used to join a
 * dropped or released step to its neighbour without drawing the line by hand.
 */
export function nearestNode(
  nodes: DwellNode[],
  box: { x: number; y: number; w: number; h: number },
  reach = 150,
  skip?: string,
  accept: (n: DwellNode) => boolean = () => true,
): DwellNode | undefined {
  let best: DwellNode | undefined
  let bestGap = reach
  for (const n of nodes) {
    if (n.id === skip || n.hidden || !accept(n)) continue
    const d = dimsOf(n)
    const dx = Math.max(n.position.x - (box.x + box.w), box.x - (n.position.x + d.w), 0)
    const dy = Math.max(n.position.y - (box.y + box.h), box.y - (n.position.y + d.h), 0)
    const gap = Math.hypot(dx, dy)
    if (gap < bestGap) {
      best = n
      bestGap = gap
    }
  }
  return best
}
