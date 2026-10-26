import { describe, expect, it } from 'vitest'
import { DIMS, bestSides } from './layout'
import { SEED_CATALOGUE } from './seed'
import { KIND_ORDER } from '../types'
import { DEFAULT_ICON, tidy, type DwellDoc } from './doc'
import { ICON_NAMES } from './iconKeys'
import { toMermaid } from './mermaid'

const box = (x: number, y: number) => ({ x, y, w: 200, h: 60 })

describe('closest sides', () => {
  it('runs right to left when the target is ahead, and left to right when it is behind', () => {
    expect(bestSides(box(0, 0), box(300, 20))).toEqual({ sourceHandle: 'r', targetHandle: 'l' })
    expect(bestSides(box(300, 0), box(0, 20))).toEqual({ sourceHandle: 'l', targetHandle: 'r' })
  })
  it('runs bottom to top when stacked, and top to bottom going up', () => {
    expect(bestSides(box(0, 0), box(20, 200))).toEqual({ sourceHandle: 'b', targetHandle: 't' })
    expect(bestSides(box(0, 200), box(20, 0))).toEqual({ sourceHandle: 't', targetHandle: 'b' })
  })
  it('crosses whichever gap is wider when the target is off to one side', () => {
    expect(bestSides(box(0, 0), box(260, 300))).toEqual({ sourceHandle: 'b', targetHandle: 't' })
    expect(bestSides(box(0, 0), box(600, 100))).toEqual({ sourceHandle: 'r', targetHandle: 'l' })
  })
})

describe('step kinds', () => {
  it('gives every kind a size, a default icon and ready-made catalogue items', () => {
    for (const k of KIND_ORDER) {
      expect(DIMS[k], k).toBeDefined()
      expect(ICON_NAMES).toContain(DEFAULT_ICON[k])
      expect(SEED_CATALOGUE.some((c) => c.kind === k), k).toBe(true)
    }
  })

  it('draws each kind with its own Mermaid shape', () => {
    const doc = {
      app: 'dwell',
      version: 1,
      title: 't',
      direction: 'LR',
      runsPerMonth: 1,
      ratePerHour: 1,
      flows: [],
      zones: [],
      edges: [],
      nodes: KIND_ORDER.map((kind, i) => ({ id: `n${i}`, type: 'flow', position: { x: 0, y: 0 }, data: { kind, label: kind, tool: '', icon: 'gear', current: 1, future: 1, presence: 'both', share: 100 } })),
    } as unknown as DwellDoc
    const m = toMermaid(doc, 'current')
    expect(m).toMatch(/>"handoff[^"]*"\]/)
    expect(m).toMatch(/\[\("system[^"]*"\)\]/)
    expect(m).toMatch(/[^[(]\("wait[^"]*"\)/)
    expect(m).toMatch(/\[\\"document[^"]*"\/\]/)
  })

  it('shows PagerDuty capabilities by their function, in the PagerDuty section', () => {
    const pd = SEED_CATALOGUE.filter((c) => c.category === 'PagerDuty')
    expect(pd.length).toBeGreaterThan(8)
    expect(pd.every((c) => c.brand === 'pagerduty')).toBe(true)
    expect(new Set(pd.map((c) => c.icon)).size).toBeGreaterThan(8)
  })

  it('keeps a connector pinned to hand-picked sides through a save', () => {
    const doc = { app: 'dwell', version: 1, title: 't', direction: 'LR', runsPerMonth: 1, ratePerHour: 1, flows: [], zones: [], nodes: [], edges: [{ id: 'e', type: 'flow', source: 'a', target: 'b', sourceHandle: 'b', targetHandle: 't', data: { presence: 'both', label: '', pinned: true } }] } as unknown as DwellDoc
    expect(tidy(doc).edges[0].data?.pinned).toBe(true)
  })
})
