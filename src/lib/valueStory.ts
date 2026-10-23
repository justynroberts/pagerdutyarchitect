import { count, money, type Commercial, type CommercialResult } from './commercial'

export const pct = (v: number) => `${Math.round(v * 10) / 10}%`
const whole = (v: number) => `${Math.round(v)}`

export type Pillar = {
  key: 'productivity' | 'revenue' | 'cost'
  tag: string
  head: string
  body: string
  /** Figure, then what it is. */
  stats: [string, string][]
  /** Shown instead of the stats until the inputs the pillar needs are in. */
  prompt?: string
}

/**
 * The three ways the value is told: time given back, revenue protected, cost removed. Words and figures
 * are shared by the sheet, the slide and the Markdown so they never disagree.
 */
export function valueStory(c: Commercial, r: CommercialResult): Pillar[] {
  const p = r.productivity
  const v = r.revenue
  const k = r.cost
  const out: Pillar[] = []

  if (c.showProductivity)
    out.push({
      key: 'productivity',
      tag: 'Productivity gain',
      head:
        p.returnedPct !== null
          ? `Reclaim ${pct(p.returnedPct)} of engineering time lost to manual incidents`
          : `Reclaim ${count(p.reclaimedHours)} engineering hours lost to manual incidents`,
      body:
        `${count(r.worked)} worked incidents cost ${count(r.hours)} hours a year, the work of ${whole(p.fteLost)} full-time engineers. ` +
        `Automating ${pct(r.atDiagram.pct)} of it gives ${whole(p.fteUnlocked)} engineers' worth of capacity back for feature delivery.`,
      stats: [
        [`${count(p.reclaimedHours)} hrs`, 'reclaimed a year'],
        [whole(p.fteUnlocked), 'FTE capacity unlocked'],
        ...(p.returnedPct !== null ? [[pct(p.returnedPct), `of every engineer's time, across ${count(c.engineers)} engineers`] as [string, string]] : []),
      ],
    })

  if (c.showRevenue)
    out.push({
      key: 'revenue',
      tag: 'Revenue protection',
      head: v.known
        ? `Protect ${money(v.protectedRevenue)} in core operational time${v.peakPerHour > 0 ? `, and up to ${money(v.peakPerHour)}/hr during peak trading` : ''}`
        : 'Protect revenue in core operational time and during peak trading',
      body:
        `Manual incident handling threatens uptime in high-volume trading windows, where downtime losses multiply. ` +
        `Incidents disrupt trading for ${count(v.disruptedHours)} hours a year; the platform takes ${count(v.protectedHours)} of them off.`,
      stats: [
        [money(v.protectedRevenue), `protected a year at ${money(c.revenuePerHour)}/hr average trading`],
        ...(v.peakPerHour > 0 ? [[`${money(v.peakPerHour)}/hr`, 'at stake during peak events'] as [string, string]] : []),
        [`${count(v.protectedHours)} hrs`, 'of trading disruption avoided'],
      ],
      prompt: v.known ? undefined : 'Add average and peak trading revenue on the Assumptions stage to put a figure on it.',
    })

  if (c.showCost) {
    const lines = c.directOn ? c.direct.filter((d) => d.amount > 0) : []
    out.push({
      key: 'cost',
      tag: 'Cost savings',
      head: `Cut ${money(k.total)} in direct incident handling costs across ${count(r.worked)} workflows`,
      body:
        `Eliminate wasted engineering labour${lines.length ? ' and redundant spend' : ''} by automating triage and response: ` +
        `${money(k.labour)} of the ${money(r.annualCost)} a year manual response costs today.`,
      stats: [
        [money(k.labour), 'engineering labour a year'],
        ...lines.map((d): [string, string] => [money(d.amount), d.name.toLowerCase()]),
        ...(lines.length ? [[money(k.total), 'total direct cost reduction'] as [string, string]] : []),
      ],
    })
  }
  return out
}
