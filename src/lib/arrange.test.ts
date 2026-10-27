import { describe, expect, it } from 'vitest'
import { buildDoc, addZone } from './doc'
import { arrange, fitZones, liveLane } from './arrange'
import { DIMS } from './layout'
import type { DwellDoc } from './doc'

const at = (d: DwellDoc, id: string, mode: 'current' | 'future') => {
  const n = d.nodes.find((x) => x.id === id)!
  return mode === 'future' && n.data.futurePos ? n.data.futurePos : n.position
}

describe('arrange', () => {
  it('lays out each state on its own: Current leaves no gap for a Future-only step', () => {
    const d = buildDoc({
      title: 't',
      steps: [
        { id: 'a', catalogue_id: 'in-alert' },
        { id: 'b', catalogue_id: 'st-triage', after: 'a' },
        { id: 'p', catalogue_id: 'au-paige', after: 'b' },
        { id: 'c', catalogue_id: 'st-fix', after: 'p' },
      ],
    })
    // In Current, c follows b directly: one column on, not two.
    const step = at(d, 'b', 'current').x - at(d, 'a', 'current').x
    // Positions snap to an 8px grid, so columns can differ by a grid step.
    expect(Math.abs(at(d, 'c', 'current').x - at(d, 'b', 'current').x - step)).toBeLessThanOrEqual(8)
    // In Future, Paige sits between them.
    expect(at(d, 'p', 'future').x).toBeGreaterThan(at(d, 'b', 'future').x)
    expect(at(d, 'c', 'future').x).toBeGreaterThan(at(d, 'p', 'future').x)
  })

  it('keeps a lane clear for a connector that skips columns, and drops it once a step moves', () => {
    const d = buildDoc({
      title: 't',
      steps: [
        { id: 'a', catalogue_id: 'in-alert' },
        { id: 'b', catalogue_id: 'st-triage', after: 'a' },
        { id: 'c', catalogue_id: 'st-gather', after: 'b' },
        { id: 'd', kind: 'output', label: 'Done', after: 'c' },
      ],
      connections: [{ from: 'a', to: 'd' }],
    })
    const e = d.edges.find((x) => x.source === 'a' && x.target === 'd')!
    const lane = liveLane(e, 'current', at(d, 'a', 'current'), at(d, 'd', 'current'))!
    expect(lane.length).toBeGreaterThanOrEqual(2)
    for (const id of ['b', 'c']) {
      const n = d.nodes.find((x) => x.id === id)!
      const y = lane[0][1]
      expect(y > n.position.y && y < n.position.y + DIMS[n.data.kind].h, `lane runs through ${id}`).toBe(false)
    }
    expect(liveLane(e, 'current', at(d, 'a', 'current'), { x: 0, y: 999 })).toBeUndefined()
  })

  it('redraws an area round its steps after arranging, in both states', () => {
    const d = buildDoc({
      title: 't',
      steps: [
        { id: 'a', catalogue_id: 'in-alert' },
        { id: 'b', catalogue_id: 'st-triage', after: 'a' },
        { id: 'c', catalogue_id: 'st-fix', after: 'b' },
      ],
    })
    const z = addZone(d, { kind: 'area', label: 'Fix', around: ['c'] })
    expect(z.around).toEqual(['c'])
    const laid = arrange(d.nodes, d.edges, 'TB')
    d.nodes = laid.nodes
    const [fit] = fitZones(d.zones, d.nodes)
    const c = at(d, 'c', 'current')
    expect(fit.x).toBeLessThan(c.x)
    expect(fit.y).toBeLessThan(c.y)
    expect(fit.x + fit.w).toBeGreaterThan(c.x + DIMS.step.w)
    expect(fit.future).toBeDefined()
  })
})

describe('areas from before they remembered their steps', () => {
  it('take the steps inside them, so they follow when arranged', async () => {
    const { inferAround } = await import('./arrange')
    const d = buildDoc({ title: 't', steps: [{ id: 'a', catalogue_id: 'in-alert' }, { id: 'b', catalogue_id: 'st-triage', after: 'a' }] })
    const b = d.nodes.find((n) => n.id === 'b')!
    const old = { id: 'z', kind: 'area' as const, x: b.position.x - 20, y: b.position.y - 40, w: 260, h: 120, label: 'Old', color: '#2fbf71' }
    expect(inferAround([old], d.nodes)[0].around).toEqual(['b'])
  })
})

describe('areas of steps a state hides', () => {
  it('are left out of that state', async () => {
    const { zoneShown } = await import('./arrange')
    const d = buildDoc({
      title: 't',
      steps: [
        { id: 'a', catalogue_id: 'in-alert' },
        { id: 'b', catalogue_id: 'st-triage', after: 'a' },
        { id: 'n', catalogue_id: 'pd-aiops', after: 'a', presence: 'future-only' },
      ],
    })
    const fresh = addZone(d, { kind: 'area', label: 'New', around: ['n'] })
    const today = addZone(d, { kind: 'area', label: 'Today', around: ['b'] })
    expect(zoneShown(fresh, d.nodes, 'current')).toBe(false)
    expect(zoneShown(fresh, d.nodes, 'future')).toBe(true)
    expect(zoneShown(today, d.nodes, 'current')).toBe(true)
    expect(zoneShown({ ...fresh, around: undefined }, d.nodes, 'current')).toBe(true)
  })
})
