import type { DwellEdge, DwellNode, Flow, Kind, Mode } from '../types'
import { fmt, presenceState, stepMins } from './time'

type Shape = { nodes: Pick<DwellNode, 'id' | 'data'>[]; edges: Pick<DwellEdge, 'id' | 'source' | 'target' | 'data'>[]; flows: Flow[]; direction: 'LR' | 'TB'; hideRemoved?: boolean }

const q = (s: string) => s.replace(/"/g, '#quot;')

/**
 * A Mermaid flowchart, for pasting into GitHub, Notion, Confluence or any Markdown that renders it.
 * Steps tagged AI or Automation get their own colour, and each flow's connectors take the flow's colour.
 */
/** Mermaid's nearest shape for each kind; % is the label. */
const SHAPES: Record<Kind, string> = {
  input: '[/%/]',
  step: '[%]',
  decision: '{%}',
  automation: '[[%]]',
  output: '([%])',
  handoff: '>%]',
  wait: '(%)',
  document: '[\\%/]',
  system: '[(%)]',
  subprocess: '[[%]]',
}

export function toMermaid(d: Shape, mode: Mode): string {
  const live = d.nodes.filter((n) => presenceState(n.data.presence, mode, d.hideRemoved) !== 'hidden')
  const idOf = new Map(live.map((n, i) => [n.id, `s${i}`]))
  const lines: string[] = [`flowchart ${d.direction}`]
  for (const n of live) {
    const t = n.data
    const mins = stepMins(t, mode)
    const text = `${q(t.label)}${t.current || t.future ? `<br/>${fmt(mins)}` : ''}`
    const id = idOf.get(n.id)!
    const shape = SHAPES[t.kind].replace('%', () => `"${text}"`)
    lines.push(`  ${id}${shape}`)
  }
  const styled: string[] = []
  let idx = 0
  for (const e of d.edges) {
    const a = idOf.get(e.source)
    const b = idOf.get(e.target)
    if (!a || !b) continue
    const label = (e.data?.label ?? '').trim()
    lines.push(`  ${a} -->${label ? `|"${q(label)}"|` : ''} ${b}`)
    const flow = d.flows.find((f) => e.data?.flows?.includes(f.id))
    if (flow) styled.push(`  linkStyle ${idx} stroke:${flow.color},stroke-width:4px`)
    idx++
  }
  lines.push(...styled)
  lines.push('  classDef ai fill:#efe9ff,stroke:#6d4bd6,color:#241a4d', '  classDef auto fill:#e3f6ea,stroke:#0a8a3a,color:#0c3320')
  const ai = live.filter((n) => n.data.lever === 'ai').map((n) => idOf.get(n.id))
  const auto = live.filter((n) => n.data.lever === 'automation').map((n) => idOf.get(n.id))
  if (ai.length) lines.push(`  class ${ai.join(',')} ai`)
  if (auto.length) lines.push(`  class ${auto.join(',')} auto`)
  return lines.join('\n')
}
