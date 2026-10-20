import { beforeEach, describe, expect, it } from 'vitest'
import { useDwell } from './store'

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
    expect(nodes[1].position.y).toBeGreaterThan(nodes[0].position.y)
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
