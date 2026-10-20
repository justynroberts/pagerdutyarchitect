import type { NodeData } from '../types'
import { stepMins } from './time'

/** The least a diagram needs to be checked or measured. Both the store and a saved document fit. */
type Shape = {
  nodes: { id: string; data: NodeData }[]
  edges: { id: string; source: string; target: string; data?: { label?: string; flows?: string[] } }[]
  flows: { id: string; name: string }[]
}

export type Issue = { severity: 'warn' | 'info'; step?: string; message: string }

/** Things worth a second look before the diagram goes on a slide. Nothing here blocks anything. */
export function checkDiagram(d: Shape): Issue[] {
  const out: Issue[] = []
  if (!d.nodes.length) return out
  const incoming = new Map<string, number>()
  const outgoing = new Map<string, number>()
  for (const e of d.edges) {
    outgoing.set(e.source, (outgoing.get(e.source) ?? 0) + 1)
    incoming.set(e.target, (incoming.get(e.target) ?? 0) + 1)
  }
  for (const n of d.nodes) {
    const k = n.data.kind
    const i = incoming.get(n.id) ?? 0
    const o = outgoing.get(n.id) ?? 0
    const name = `"${n.data.label}"`
    if (i === 0 && o === 0) out.push({ severity: 'warn', step: n.id, message: `${name} is not connected to anything.` })
    else {
      if (k !== 'input' && i === 0) out.push({ severity: 'warn', step: n.id, message: `Nothing leads into ${name}.` })
      if (k !== 'output' && o === 0) out.push({ severity: 'warn', step: n.id, message: `${name} leads nowhere. End it with an output, or connect it on.` })
    }
    if (k === 'decision') {
      if (o === 1) out.push({ severity: 'warn', step: n.id, message: `Decision ${name} has one exit. A decision needs at least a Yes and a No.` })
      const unlabeled = d.edges.filter((e) => e.source === n.id && !(e.data?.label ?? '').trim()).length
      if (o > 1 && unlabeled > 0) out.push({ severity: 'info', step: n.id, message: `${unlabeled} exit${unlabeled > 1 ? 's' : ''} of ${name} ha${unlabeled > 1 ? 've' : 's'} no label.` })
    }
    if ((k === 'automation' || n.data.presence === 'future-only') && k !== 'output' && (!n.data.lever || n.data.lever === 'none')) {
      out.push({ severity: 'info', step: n.id, message: `${name} is added by automation but is not tagged AI or Automation.` })
    }
    if (k !== 'output' && k !== 'decision' && n.data.current === 0 && n.data.future === 0) {
      out.push({ severity: 'info', step: n.id, message: `${name} has no time on it, so it adds nothing to the totals.` })
    }
    if (n.data.share <= 0 || n.data.share > 100) out.push({ severity: 'warn', step: n.id, message: `${name} has a share of runs of ${n.data.share}%. It should be between 1 and 100.` })
  }
  if (!d.nodes.some((n) => n.data.kind === 'input')) out.push({ severity: 'info', message: 'No signal starts this process. Add one so it is clear what triggers it.' })
  if (!d.nodes.some((n) => n.data.kind === 'output')) out.push({ severity: 'info', message: 'No output ends this process.' })
  for (const f of d.flows) {
    if (!d.edges.some((e) => e.data?.flows?.includes(f.id))) out.push({ severity: 'warn', message: `Flow "${f.name}" has no connectors, so it shows nothing.` })
  }
  const seen = new Map<string, number>()
  for (const n of d.nodes) seen.set(n.data.label.trim().toLowerCase(), (seen.get(n.data.label.trim().toLowerCase()) ?? 0) + 1)
  for (const [label, c] of seen) if (c > 1) out.push({ severity: 'info', message: `${c} steps are called "${label}". Naming steps uniquely makes them easier to refer to.` })
  return out
}

export type FlowTotal = { steps: number; current: number; future: number; saved: number }

/** Time along a flow: every step its connectors touch, counted once, at its full time (not weighted by share of runs). */
export function flowTotals(d: Shape, flowId: string): FlowTotal {
  const ids = new Set<string>()
  for (const e of d.edges) if (e.data?.flows?.includes(flowId)) (ids.add(e.source), ids.add(e.target))
  let current = 0
  let future = 0
  for (const n of d.nodes) {
    if (!ids.has(n.id)) continue
    current += stepMins(n.data, 'current')
    future += stepMins(n.data, 'future')
  }
  return { steps: ids.size, current, future, saved: current - future }
}
