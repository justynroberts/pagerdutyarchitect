import type { DwellNode, Mode, NodeData, Presence } from '../types'

/** 0.5 -> "30s", 14 -> "14m", 1.5 -> "1.5m", 135 -> "2h 15m". */
export function fmt(mins: number): string {
  if (!Number.isFinite(mins) || mins <= 0) return '0m'
  if (mins < 1) return `${Math.max(1, Math.round(mins * 60))}s`
  if (mins < 60) {
    const r = Math.round(mins * 10) / 10
    if (r < 60) return `${Number.isInteger(r) ? r : r.toFixed(1)}m`
  }
  const total = Math.round(mins)
  const h = Math.floor(total / 60)
  const m = total - h * 60
  return m ? `${h}h ${m}m` : `${h}h`
}

/** Signed, with a real minus sign. */
export function fmtDelta(mins: number): string {
  if (Math.abs(mins) < 0.005) return '0m'
  return `${mins < 0 ? '−' : '+'}${fmt(Math.abs(mins))}`
}

export function fmtHours(hours: number): string {
  if (hours >= 1000) return `${(hours / 1000).toFixed(1)}k h`
  if (hours >= 100) return `${Math.round(hours)} h`
  return `${(Math.round(hours * 10) / 10).toString()} h`
}

export function fmtMoney(value: number): string {
  if (!Number.isFinite(value)) return '£0'
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    notation: Math.abs(value) >= 100000 ? 'compact' : 'standard',
    maximumFractionDigits: Math.abs(value) >= 100000 ? 1 : 0,
  }).format(value)
}

export type RenderState = 'live' | 'ghost' | 'hidden'

/** Current hides things that only exist after automation. Future ghosts things automation removes. */
export function presenceState(presence: Presence, mode: Mode): RenderState {
  if (mode === 'current') return presence === 'future-only' ? 'hidden' : 'live'
  return presence === 'current-only' ? 'ghost' : 'live'
}

/** Minutes this step contributes in the given state of the process. */
export function stepMins(d: NodeData, mode: Mode): number {
  if (mode === 'current') return d.presence === 'future-only' ? 0 : d.current
  return d.presence === 'current-only' ? 0 : d.future
}

/** Expected effort per run, weighting each step by the share of runs that reach it. */
export function expectedEffort(nodes: DwellNode[], mode: Mode): number {
  return nodes.reduce((sum, n) => sum + (stepMins(n.data, mode) * n.data.share) / 100, 0)
}

/** Positive = time given back. Negative = time added by an automated step. */
export function stepSaved(d: NodeData): number {
  return stepMins(d, 'current') - stepMins(d, 'future')
}

export function longestStep(nodes: DwellNode[]): number {
  let max = 1
  for (const n of nodes) max = Math.max(max, n.data.current, n.data.future)
  return max
}

export type Summary = {
  current: number
  future: number
  saved: number
  pct: number
  hoursPerMonth: number
  valuePerYear: number
}

export function summarise(nodes: DwellNode[], runsPerMonth: number, ratePerHour: number): Summary {
  const current = expectedEffort(nodes, 'current')
  const future = expectedEffort(nodes, 'future')
  const saved = current - future
  const hoursPerMonth = (saved * runsPerMonth) / 60
  return {
    current,
    future,
    saved,
    pct: current > 0 ? (saved / current) * 100 : 0,
    hoursPerMonth,
    valuePerYear: hoursPerMonth * 12 * ratePerHour,
  }
}

export type Saving = { id: string; label: string; saved: number }

/** Steps ranked by expected minutes given back per run. */
export function topSavings(nodes: DwellNode[], limit = 6): Saving[] {
  return nodes
    .filter((n) => n.data.kind !== 'input' && n.data.kind !== 'output')
    .map((n) => ({ id: n.id, label: n.data.label, saved: (stepSaved(n.data) * n.data.share) / 100 }))
    .filter((s) => s.saved > 0.04)
    .sort((a, b) => b.saved - a.saved)
    .slice(0, limit)
}

export function summaryMarkdown(title: string, nodes: DwellNode[], s: Summary): string {
  const rows = nodes
    .filter((n) => n.data.kind !== 'output')
    .map((n) => {
      const d = n.data
      const saved = stepSaved(d)
      return `| ${d.label} | ${fmt(stepMins(d, 'current'))} | ${fmt(stepMins(d, 'future'))} | ${saved === 0 ? '0m' : fmtDelta(-saved)} | ${d.share}% |`
    })
  return [
    `### ${title}`,
    '',
    '| Step | Now | After | Change | Share of runs |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
    '',
    `Expected effort per run: ${fmt(s.current)} now, ${fmt(s.future)} after, ${fmt(s.saved)} saved (${Math.round(s.pct)}%).`,
  ].join('\n')
}
