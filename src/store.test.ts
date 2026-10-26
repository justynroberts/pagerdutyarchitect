import { beforeEach, describe, expect, it } from 'vitest'
import { useDwell } from './store'
import { SEED_CATALOGUE } from './lib/seed'

const item = (id: string) => useDwell.getState().catalogue.find((c) => c.id === id)!

describe('store', () => {
  beforeEach(() => {
    useDwell.getState().newBlank()
    useDwell.setState({ past: [], redoStack: [] })
  })

  it('chains a new step from the selected one and connects them', () => {
    const s = useDwell.getState()
    s.addFromItem(item('in-alert'), { position: { x: 0, y: 0 }, chain: true })
    useDwell.getState().addFromItem(item('st-triage'), { position: { x: 0, y: 0 }, chain: true })
    const { nodes, edges } = useDwell.getState()
    expect(nodes).toHaveLength(2)
    expect(edges).toHaveLength(1)
    expect(edges[0].source).toBe(nodes[0].id)
    expect(edges[0].target).toBe(nodes[1].id)
    expect(nodes[1].position.x).toBeGreaterThan(nodes[0].position.x)
  })

  it('labels the first two branches out of a decision Yes and No', () => {
    const s = useDwell.getState()
    const d = s.addFromItem(item('de-quick'), { position: { x: 0, y: 0 } })
    useDwell.getState().select(d)
    useDwell.getState().addFromItem(item('st-fix'), { chain: true })
    useDwell.getState().select(d)
    useDwell.getState().addFromItem(item('st-triage'), { chain: true })
    const labels = useDwell.getState().edges.map((e) => e.data?.label)
    expect(labels).toEqual(['Yes', 'No'])
  })

  it('switches to Future when a future-only step is added, so it is not hidden', () => {
    useDwell.getState().setMode('current')
    useDwell.getState().addFromItem(item('au-paige'), { position: { x: 0, y: 0 } })
    expect(useDwell.getState().mode).toBe('future')
  })

  it('undoes and redoes an edit', () => {
    const id = useDwell.getState().addFromItem(item('st-fix'), { position: { x: 0, y: 0 } })
    useDwell.getState().checkpoint()
    useDwell.getState().updateNode(id, { future: 3 })
    expect(useDwell.getState().nodes[0].data.future).toBe(3)
    useDwell.getState().undo()
    expect(useDwell.getState().nodes[0].data.future).toBe(item('st-fix').future)
    useDwell.getState().redo()
    expect(useDwell.getState().nodes[0].data.future).toBe(3)
  })

  it('round-trips through JSON export and import', () => {
    useDwell.getState().addFromItem(item('st-fix'), { position: { x: 0, y: 0 } })
    const text = useDwell.getState().exportDoc()
    useDwell.getState().newBlank()
    expect(useDwell.getState().nodes).toHaveLength(0)
    expect(useDwell.getState().importDoc(text)).toBeNull()
    expect(useDwell.getState().nodes).toHaveLength(1)
    expect(useDwell.getState().importDoc('{"nope":1}')).toMatch(/not a Dwell diagram/)
  })
})

describe('auto connect', () => {
  it('joins a dropped step to the nearest neighbour and aligns it', () => {
    const s = useDwell.getState()
    s.newBlank()
    const first = s.addFromItem(SEED_CATALOGUE.find((c) => c.id === 'st-triage')!, { position: { x: 0, y: 0 } })
    const second = useDwell
      .getState()
      .addFromItem(SEED_CATALOGUE.find((c) => c.id === 'st-gather')!, { position: { x: 330, y: 20 }, autoConnect: true })
    const { nodes, edges } = useDwell.getState()
    expect(edges).toHaveLength(1)
    expect(edges[0].source).toBe(first)
    expect(edges[0].target).toBe(second)
    expect(nodes.find((n) => n.id === second)!.position.y).toBe(0)
  })

  it('leaves a far away drop unconnected', () => {
    const s = useDwell.getState()
    s.newBlank()
    s.addFromItem(SEED_CATALOGUE.find((c) => c.id === 'st-triage')!, { position: { x: 0, y: 0 } })
    useDwell.getState().addFromItem(SEED_CATALOGUE.find((c) => c.id === 'st-fix')!, { position: { x: 1200, y: 600 }, autoConnect: true })
    expect(useDwell.getState().edges).toHaveLength(0)
  })

  it('puts an input before a step even if dropped to its right', () => {
    const s = useDwell.getState()
    s.newBlank()
    const step = s.addFromItem(SEED_CATALOGUE.find((c) => c.id === 'st-triage')!, { position: { x: 0, y: 0 } })
    const input = useDwell.getState().addFromItem(SEED_CATALOGUE.find((c) => c.id === 'mo-datadog')!, { position: { x: 330, y: 0 }, autoConnect: true })
    expect(useDwell.getState().edges[0]).toMatchObject({ source: input, target: step })
  })

  it('never joins a signal to another signal, or an output to another output', () => {
    const s = useDwell.getState()
    s.newBlank()
    s.addFromItem(item('in-alert'), { position: { x: 0, y: 0 } })
    useDwell.getState().addFromItem(item('in-contact'), { position: { x: 0, y: 90 }, autoConnect: true })
    s.addFromItem(item('ou-resolved'), { position: { x: 900, y: 0 } })
    useDwell.getState().addFromItem(item('ci-live'), { position: { x: 900, y: 90 }, autoConnect: true })
    expect(useDwell.getState().edges).toHaveLength(0)
  })

  it('skips a closer signal to join a dropped signal to the step beyond it', () => {
    const s = useDwell.getState()
    s.newBlank()
    const step = s.addFromItem(item('st-triage'), { position: { x: 300, y: 0 } })
    s.addFromItem(item('in-alert'), { position: { x: 0, y: 0 } })
    const second = useDwell.getState().addFromItem(item('in-contact'), { position: { x: 0, y: 96 }, autoConnect: true })
    expect(useDwell.getState().edges).toEqual([expect.objectContaining({ source: second, target: step })])
  })
})

describe('flows and connectors', () => {
  it('traces a flow downstream from a step', () => {
    useDwell.getState().loadSample()
    const before = useDwell.getState().flows.length
    useDwell.getState().traceFlow('n-severity', 'down')
    const s = useDwell.getState()
    expect(s.flows).toHaveLength(before + 1)
    const edges = s.edges.filter((e) => e.data?.flows?.includes(s.activeFlow!))
    expect(edges.length).toBeGreaterThan(5)
    expect(edges.some((e) => e.source === 'n-quick')).toBe(false)
  })

  it('reverses and reconnects a connector', () => {
    useDwell.getState().loadSample()
    const e = useDwell.getState().edges.find((x) => x.id === 'e-triage-gather')!
    useDwell.getState().reverseEdge(e.id)
    const r = useDwell.getState().edges.find((x) => x.id === e.id)!
    expect(r.source).toBe('n-gather')
    expect(r.target).toBe('n-triage')
    useDwell.getState().onReconnect(r, { source: 'n-gather', target: 'n-quick', sourceHandle: 'r', targetHandle: 'l' })
    expect(useDwell.getState().edges.find((x) => x.id === e.id)!.target).toBe('n-quick')
  })

  it('splits saved time by where the benefit is made', async () => {
    const { savedByLever } = await import('./lib/time')
    useDwell.getState().loadSample()
    const split = savedByLever(useDwell.getState().nodes)
    expect(split.map((x) => x.lever)).toContain('ai')
    expect(split.map((x) => x.lever)).toContain('automation')
  })
})

describe('flows from steps and areas', () => {
  it('builds a coloured flow from the connectors between selected steps', () => {
    useDwell.getState().loadSample()
    const id = useDwell.getState().createFlowFromNodes(['n-triage', 'n-gather', 'n-quick'], 'Triage run', '#e5558d')
    const s = useDwell.getState()
    expect(id).toBeTruthy()
    expect(s.flows.find((f) => f.id === id)?.color).toBe('#e5558d')
    expect(s.edges.filter((e) => e.data?.flows?.includes(id!)).map((e) => e.id).sort()).toEqual(['e-gather-quick', 'e-triage-gather'])
  })

  it('bridges skipped steps into one flow', () => {
    useDwell.getState().loadSample()
    expect(useDwell.getState().createFlowFromNodes(['n-alert', 'n-done'])).toBeTruthy()
  })

  it('refuses a flow when a step has no route to the others', () => {
    useDwell.getState().loadSample()
    const loose = useDwell.getState().addFromItem(item('st-triage'), { position: { x: 4000, y: 4000 } })
    expect(useDwell.getState().createFlowFromNodes(['n-alert', loose])).toBeNull()
  })

  it('adds, moves, resizes and deletes an area', () => {
    useDwell.getState().newBlank()
    const id = useDwell.getState().addZone('area', { x: 400, y: 300 })
    useDwell.getState().onZonesChange([
      { type: 'position', id, position: { x: 8, y: 16 } },
      { type: 'dimensions', id, dimensions: { width: 500, height: 260 } },
    ] as never)
    expect(useDwell.getState().zones[0]).toMatchObject({ x: 8, y: 16, w: 500, h: 260 })
    useDwell.getState().deleteSelected()
    expect(useDwell.getState().zones).toHaveLength(0)
  })

  it('draws an area around selected steps', () => {
    useDwell.getState().loadSample()
    const id = useDwell.getState().areaAround(['n-triage', 'n-gather'])
    const z = useDwell.getState().zones.find((x) => x.id === id)!
    const t = useDwell.getState().nodes.find((n) => n.id === 'n-triage')!
    expect(z.x).toBeLessThan(t.position.x)
    expect(z.w).toBeGreaterThan(200)
  })
})

describe('Current and Future are not synced', () => {
  beforeEach(() => {
    useDwell.getState().newBlank()
    useDwell.setState({ past: [], redoStack: [] })
    const s = useDwell.getState()
    s.addFromItem(item('in-alert'), { position: { x: 0, y: 0 }, chain: true })
    useDwell.getState().addFromItem(item('st-triage'), { position: { x: 0, y: 0 }, chain: true })
  })

  it('a step added in Future exists only in Future', () => {
    useDwell.getState().setMode('future')
    useDwell.getState().addFromItem(item('st-triage'), { position: { x: 400, y: 0 }, chain: true })
    const { nodes, edges } = useDwell.getState()
    expect(nodes[2].data.presence).toBe('future-only')
    expect(edges[1].data?.presence).toBe('future-only')
    expect(edges[0].data?.presence).toBe('both')
  })

  it('deleting a shared step in Future keeps it in Current', () => {
    useDwell.getState().setMode('future')
    const id = useDwell.getState().nodes[1].id
    useDwell.getState().select(id)
    useDwell.getState().deleteSelected()
    const n = useDwell.getState().nodes.find((x) => x.id === id)!
    expect(n.data.presence).toBe('current-only')
  })

  it('deleting a Future-only step removes it', () => {
    useDwell.getState().setMode('future')
    useDwell.getState().addFromItem(item('st-triage'), { position: { x: 400, y: 0 }, chain: true })
    useDwell.getState().deleteSelected()
    expect(useDwell.getState().nodes).toHaveLength(2)
  })

  it('moving a step in Future leaves its Current position alone', () => {
    const before = useDwell.getState().nodes[1].position
    useDwell.getState().setMode('future')
    const id = useDwell.getState().nodes[1].id
    useDwell.getState().onNodesChange([{ type: 'position', id, position: { x: 900, y: 40 } }])
    const n = useDwell.getState().nodes[1]
    expect(n.position).toEqual(before)
    expect(n.data.futurePos).toEqual({ x: 900, y: 40 })
  })
})

describe('ledger overrides', () => {
  it('saves typed-over figures with the diagram, and undo puts them back', () => {
    const s = useDwell.getState()
    s.loadSample()
    useDwell.getState().setOverride('future', 12)
    const json = useDwell.getState().exportDoc()
    expect(JSON.parse(json).overrides).toEqual({ future: 12 })
    useDwell.getState().newBlank()
    expect(useDwell.getState().overrides).toEqual({})
    expect(useDwell.getState().importDoc(json)).toBeFalsy()
    expect(useDwell.getState().overrides).toEqual({ future: 12 })
    useDwell.getState().setOverride('future', undefined)
    expect(useDwell.getState().overrides).toEqual({})
    useDwell.getState().undo()
    expect(useDwell.getState().overrides).toEqual({ future: 12 })
  })
})

describe('delete from one tab or both', () => {
  const setup = () => {
    const s = useDwell.getState()
    s.newBlank()
    const a = s.addFromItem(item('st-triage'), { position: { x: 0, y: 0 } })
    const b = useDwell.getState().addFromItem(item('st-gather'), { chain: true })
    useDwell.setState({ mode: 'current' })
    const select = (id: string) => useDwell.setState({ nodes: useDwell.getState().nodes.map((n) => ({ ...n, selected: n.id === id })) })
    const node = (id: string) => useDwell.getState().nodes.find((n) => n.id === id)
    return { a, b, select, node }
  }

  it('removes a shared step from Current only: it stays in Future, with its connector', () => {
    const { b, select, node } = setup()
    select(b)
    useDwell.getState().deleteSelected('here')
    expect(node(b)?.data.presence).toBe('future-only')
    expect(useDwell.getState().edges[0].data?.presence).toBe('future-only')
  })

  it('removes a shared step from Future only: it stays in Current', () => {
    const { b, select, node } = setup()
    useDwell.setState({ mode: 'future' })
    select(b)
    useDwell.getState().deleteSelected('here')
    expect(node(b)?.data.presence).toBe('current-only')
  })

  it('deletes from both tabs, from either tab', () => {
    for (const mode of ['current', 'future'] as const) {
      const { b, select, node } = setup()
      useDwell.setState({ mode })
      select(b)
      useDwell.getState().deleteSelected('both')
      expect(node(b)).toBeUndefined()
      expect(useDwell.getState().edges).toHaveLength(0)
    }
  })

  it('deletes outright a step that only exists on this tab', () => {
    const { b, select, node } = setup()
    select(b)
    useDwell.getState().deleteSelected('here')
    useDwell.setState({ mode: 'future' })
    select(b)
    useDwell.getState().deleteSelected('here')
    expect(node(b)).toBeUndefined()
  })
})

describe('state saved by an older version', () => {
  it('repairs Value assumptions saved without their lists, so every figure still works', async () => {
    const { computeCommercial } = await import('./lib/commercial')
    // As left by 0.3.0, then the direct cost switch ticked in 0.3.2: directOn with no list behind it.
    const old = { incidentsPerYear: 130000, discardedPct: 33, rateIn: 45, rateOut: 55, outOfHoursPct: 25, directOn: true }
    const saved = JSON.parse(localStorage.getItem('dwell:v1') ?? '{"state":{},"version":4}')
    saved.state.commercial = old
    saved.state.overrides = { future: 'x', current: 50 }
    localStorage.setItem('dwell:v1', JSON.stringify(saved))
    await useDwell.persist.rehydrate()
    const c = useDwell.getState().commercial
    expect(Array.isArray(c.direct)).toBe(true)
    expect(Array.isArray(c.types)).toBe(true)
    expect(useDwell.getState().overrides).toEqual({ current: 50 })
    expect(() => computeCommercial(c, 50)).not.toThrow()
  })

  it('never stores a switch without its list', () => {
    useDwell.setState({ commercial: { directOn: false } as never })
    useDwell.getState().setCommercial({ directOn: true })
    expect(Array.isArray(useDwell.getState().commercial.direct)).toBe(true)
  })
})
