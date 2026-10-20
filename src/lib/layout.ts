import * as dagre from '@dagrejs/dagre'
import type { DwellEdge, DwellNode, Direction, Kind } from '../types'

export const DIMS: Record<Kind, { w: number; h: number }> = {
  input: { w: 232, h: 64 },
  step: { w: 232, h: 64 },
  automation: { w: 232, h: 64 },
  output: { w: 232, h: 64 },
  decision: { w: 188, h: 132 },
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
    nodesep: dir === 'LR' ? 40 : 48,
    ranksep: dir === 'LR' ? 104 : 60,
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
