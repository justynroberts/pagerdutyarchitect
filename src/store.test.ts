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
})
