import { describe, expect, it } from 'vitest'
import { addStep, addZone, autoLayout, buildDoc, connect, createFlow, overview, parseDoc, removeStep, sampleDoc, tidy, updateStep } from './doc'


describe('diagram document', () => {
  it('builds a laid out diagram from a spec, with levers', () => {
    const d = buildDoc({
      title: 'Alerts',
      steps: [
        { id: 'a', catalogue_id: 'in-alert' },
        { id: 'b', catalogue_id: 'st-triage', after: 'a' },
        { id: 'c', catalogue_id: 'au-paige', after: 'b', lever: 'ai' },
        { id: 'd', kind: 'output', label: 'Done', after: 'c' },
      ],
      flows: [{ name: 'Happy path', steps: ['a', 'd'] }],
      areas: [{ label: 'Automated', around: ['c'] }],
    })
    expect(d.nodes).toHaveLength(4)
    expect(d.edges).toHaveLength(3)
    expect(d.flows[0].name).toBe('Happy path')
    expect(d.edges.every((e) => e.data?.flows?.length === 1)).toBe(true)
    expect(d.zones).toHaveLength(1)
    const xs = d.nodes.map((n) => n.position.x)
    expect(xs).toEqual([...xs].sort((p, q) => p - q))
    expect(overview(d).steps.find((s) => s.id === 'c')?.lever).toBe('ai')
  })

  it('lets a step be set to AI or Automation later', () => {
    const d = sampleDoc()
    updateStep(d, 'n-triage', { lever: 'automation' })
    expect(d.nodes.find((n) => n.id === 'n-triage')?.data.lever).toBe('automation')
  })

  it('finds steps by label and explains misses', () => {
    const d = sampleDoc()
    const extra = addStep(d, { label: 'Page the owner', current: 5, future: 1, after: 'Carry out fix' })
    expect(d.edges.some((e) => e.target === extra.id)).toBe(true)
    expect(() => connect(d, 'nope', 'Carry out fix')).toThrow(/No step "nope"/)
  })

  it('removes a step with its connectors', () => {
    const d = sampleDoc()
    const before = d.edges.length
    removeStep(d, 'n-log')
    expect(d.edges.length).toBeLessThan(before)
    expect(d.edges.some((e) => e.source === 'n-log' || e.target === 'n-log')).toBe(false)
  })

  it('creates a flow from a path and refuses a broken one', () => {
    const d = sampleDoc()
    const f = createFlow(d, 'Fix', { path: ['n-quick', 'n-fix', 'n-log'], color: '#e5558d' })
    expect(d.edges.filter((e) => e.data?.flows?.includes(f.id))).toHaveLength(2)
    expect(() => createFlow(d, 'Bad', { path: ['n-alert', 'n-log'] })).toThrow(/Connect them first/)
  })

  it('round trips through JSON and survives a layout flip', () => {
    const d = sampleDoc()
    autoLayout(d, 'TB')
    const back = parseDoc(JSON.stringify(tidy(d))).doc!
    expect(back.direction).toBe('TB')
    expect(back.edges[0].sourceHandle).toBe('b')
    expect(back.nodes).toHaveLength(d.nodes.length)
  })

  it('rejects files that are not diagrams', () => {
    expect(parseDoc('{"hello":1}').error).toBeTruthy()
    expect(parseDoc('nope').error).toBeTruthy()
  })

  it('areas wrap their steps', () => {
    const d = sampleDoc()
    const z = addZone(d, { kind: 'area', label: 'Triage', around: ['n-triage', 'n-gather'] })
    const t = d.nodes.find((n) => n.id === 'n-triage')!
    expect(z.x).toBeLessThan(t.position.x)
    expect(z.w).toBeGreaterThan(204)
  })
})
