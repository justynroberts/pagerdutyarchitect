import { describe, expect, it } from 'vitest'
import { checkDiagram, flowTotals } from './check'
import { toMermaid } from './mermaid'
import { addStep, blankDoc, buildDoc, createFlow, sampleDoc } from './doc'

describe('checks', () => {
  it('finds nothing alarming in the sample', () => {
    expect(checkDiagram(sampleDoc()).filter((i) => i.severity === 'warn')).toEqual([])
  })
  it('flags loose ends, one-exit decisions and empty flows', () => {
    const d = blankDoc()
    addStep(d, { id: 'a', kind: 'input', label: 'Alert', current: 1, future: 1 })
    addStep(d, { id: 'q', kind: 'decision', label: 'Fixed?', current: 1, future: 1, after: 'a' })
    addStep(d, { id: 'x', label: 'Loose', current: 5, future: 1 })
    addStep(d, { id: 'y', label: 'End', current: 1, future: 1, after: 'q' })
    d.flows.push({ id: 'f', name: 'Empty', color: '#fff' })
    const msgs = checkDiagram(d).map((i) => i.message).join('\n')
    expect(msgs).toMatch(/"Loose" is not connected/)
    expect(msgs).toMatch(/Decision "Fixed\?" has one exit/)
    expect(msgs).toMatch(/Flow "Empty" has no connectors/)
    expect(msgs).toMatch(/"End" leads nowhere/)
    expect(msgs).toMatch(/No output ends/)
  })
  it('totals a flow once per step', () => {
    const d = sampleDoc()
    const f = createFlow(d, 'Fix', { path: ['n-quick', 'n-fix', 'n-log'] })
    const t = flowTotals(d, f.id)
    expect(t.steps).toBe(3)
    expect(t.current).toBe(1 + 18 + 10)
    expect(t.future).toBe(0.5 + 11 + 1)
  })
})

describe('mermaid', () => {
  it('draws shapes, labels, levers and flow colours', () => {
    const d = buildDoc({
      steps: [
        { id: 'a', catalogue_id: 'in-alert' },
        { id: 'q', kind: 'decision', label: 'Fixed "yet"?', after: 'a', current: 1, future: 1 },
        { id: 'p', catalogue_id: 'au-paige', after: 'q', edge_label: 'No' },
      ],
      flows: [{ name: 'Main', steps: ['a', 'p'], color: '#2fbf71' }],
    })
    const m = toMermaid(d, 'future')
    expect(m.startsWith('flowchart LR')).toBe(true)
    expect(m).toContain('{"Fixed #quot;yet#quot;?')
    expect(m).toContain('-->|"No"|')
    expect(m).toContain('linkStyle 0 stroke:#2fbf71')
    expect(m).toContain('class s2 ai')
    expect(toMermaid(d, 'current')).not.toContain('Paige') // future-only steps are hidden today
  })
})
