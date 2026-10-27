import type { Direction } from '../types'

export type Pt = { x: number; y: number }

/** A polyline as an SVG path with rounded corners. Points closer than half a pixel are merged. */
export function roundedPath(pts: Pt[], r = 10): string {
  const p = pts.filter((q, i) => i === 0 || Math.hypot(q.x - pts[i - 1].x, q.y - pts[i - 1].y) > 0.5)
  let d = `M${p[0].x},${p[0].y}`
  for (let i = 1; i < p.length - 1; i++) {
    const [a, c, b] = [p[i - 1], p[i], p[i + 1]]
    const rr = Math.min(r, Math.hypot(c.x - a.x, c.y - a.y) / 2, Math.hypot(b.x - c.x, b.y - c.y) / 2)
    const toward = (q: Pt) => ({ x: c.x + Math.sign(q.x - c.x) * rr, y: c.y + Math.sign(q.y - c.y) * rr })
    const p1 = toward(a)
    const p2 = toward(b)
    d += ` L${p1.x},${p1.y} Q${c.x},${c.y} ${p2.x},${p2.y}`
  }
  const z = p[p.length - 1]
  return `${d} L${z.x},${z.y}`
}

/**
 * A connector that spans several columns, routed through the lane the layout kept clear for it: out of the
 * source, across to the lane, along it past the steps in between, and back in to the target. At most four bends.
 * `lane` holds the layout's waypoints between the two steps.
 */
export function laneRoute(s: Pt, t: Pt, lane: [number, number][], dir: Direction): Pt[] {
  const avg = (i: 0 | 1) => lane.reduce((a, p) => a + p[i], 0) / lane.length
  if (dir === 'LR') {
    const y = avg(1)
    const x1 = (s.x + lane[0][0]) / 2
    const x2 = (lane[lane.length - 1][0] + t.x) / 2
    return [s, { x: x1, y: s.y }, { x: x1, y }, { x: x2, y }, { x: x2, y: t.y }, t]
  }
  const x = avg(0)
  const y1 = (s.y + lane[0][1]) / 2
  const y2 = (lane[lane.length - 1][1] + t.y) / 2
  return [s, { x: s.x, y: y1 }, { x, y: y1 }, { x, y: y2 }, { x: t.x, y: y2 }, t]
}

/** The middle of the longest stretch of a route, where its label sits. */
export function routeMiddle(pts: Pt[]): Pt {
  let best = 0
  let at = { x: (pts[0].x + pts[pts.length - 1].x) / 2, y: (pts[0].y + pts[pts.length - 1].y) / 2 }
  for (let i = 1; i < pts.length; i++) {
    const len = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
    if (len > best) {
      best = len
      at = { x: (pts[i].x + pts[i - 1].x) / 2, y: (pts[i].y + pts[i - 1].y) / 2 }
    }
  }
  return at
}
