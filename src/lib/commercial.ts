/**
 * The commercial case: what manual incident response costs a year, what each slice of it automated
 * is worth, and when an investment breaks even. Same model as the incident cost calculator decks:
 * incidents raised, a share discarded, the rest worked as types with a share and minutes each, at a
 * rate blended from in-hours and out-of-hours.
 */
export type IncidentType = { id: string; name: string; share: number; minutes: number }

export type Commercial = {
  customer: string
  incidentsPerYear: number
  /** Percent of incidents raised that need no response. */
  discardedPct: number
  types: IncidentType[]
  rateIn: number
  rateOut: number
  /** Percent of worked incidents that fall out of hours. */
  outOfHoursPct: number
  /** The slice of response time the headline is quoted per, in percent. */
  stepPct: number
  /** Annual cost of the PagerDuty investment, 0 when not set. */
  investment: number
}

// Illustrative PagerDuty assumptions from the incident cost calculator: of 87,100 incidents worked,
// 44,200 are quick fixes and 42,900 long-running.
export const DEFAULT_COMMERCIAL: Commercial = {
  customer: '',
  incidentsPerYear: 130000,
  discardedPct: 33,
  types: [
    { id: 't-quick', name: 'Quick fix', share: (44200 / 87100) * 100, minutes: 35 },
    { id: 't-long', name: 'Long-running', share: (42900 / 87100) * 100, minutes: 80 },
  ],
  rateIn: 45,
  rateOut: 55,
  outOfHoursPct: 25,
  stepPct: 10,
  investment: 0,
}

export type TypeCost = IncidentType & { incidents: number; hours: number; cost: number; minutesSaved: number; stepValue: number }

export type CommercialResult = {
  worked: number
  hours: number
  blendedRate: number
  perMinute: number
  annualCost: number
  /** Annual cost at the in-hours rate alone, the deck's first figure. */
  inHoursCost: number
  types: TypeCost[]
  /** Saved a year, and hours returned, for every `stepPct` of response time automated. */
  stepValue: number
  stepHours: number
  /** Share of types that is not 100%, so the sheet can say so. */
  shareTotal: number
  /** Percent of response time that must be automated to cover the investment, or null without one. */
  breakEvenPct: number | null
  /** At the diagram's saving. */
  atDiagram: { pct: number; value: number; hours: number; roi: number | null; paybackMonths: number | null }
}

const num = (v: unknown, fallback: number, max = Infinity) =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(v, max) : fallback

/** Fills gaps and drops bad values, so a hand-edited or older file still gives a working sheet. */
export function cleanCommercial(c: unknown): Commercial {
  const d = DEFAULT_COMMERCIAL
  if (!c || typeof c !== 'object') return { ...d, types: d.types.map((t) => ({ ...t })) }
  const o = c as Record<string, unknown>
  const types = Array.isArray(o.types)
    ? o.types
        .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
        .map((t, i) => ({
          id: typeof t.id === 'string' && t.id ? t.id : `t-${i}`,
          name: typeof t.name === 'string' ? t.name : `Type ${i + 1}`,
          share: num(t.share, 0, 100),
          minutes: num(t.minutes, 0),
        }))
    : d.types.map((t) => ({ ...t }))
  return {
    customer: typeof o.customer === 'string' ? o.customer : d.customer,
    incidentsPerYear: num(o.incidentsPerYear, d.incidentsPerYear),
    discardedPct: num(o.discardedPct, d.discardedPct, 100),
    types,
    rateIn: num(o.rateIn, d.rateIn),
    rateOut: num(o.rateOut, d.rateOut),
    outOfHoursPct: num(o.outOfHoursPct, d.outOfHoursPct, 100),
    stepPct: num(o.stepPct, d.stepPct, 100) || d.stepPct,
    investment: num(o.investment, 0),
  }
}

/** `diagramPct` is the share of effort the diagram's Future removes. */
export function computeCommercial(c: Commercial, diagramPct: number): CommercialResult {
  const worked = c.incidentsPerYear * (1 - c.discardedPct / 100)
  const blendedRate = c.rateIn * (1 - c.outOfHoursPct / 100) + c.rateOut * (c.outOfHoursPct / 100)
  const perMinute = blendedRate / 60
  const step = c.stepPct / 100
  const types = c.types.map((t) => {
    const incidents = (worked * t.share) / 100
    const hours = (incidents * t.minutes) / 60
    return { ...t, incidents, hours, cost: hours * blendedRate, minutesSaved: t.minutes * step, stepValue: hours * blendedRate * step }
  })
  const hours = types.reduce((a, t) => a + t.hours, 0)
  const annualCost = hours * blendedRate
  const pct = Math.max(0, Math.min(100, diagramPct))
  const value = annualCost * (pct / 100)
  return {
    worked,
    hours,
    blendedRate,
    perMinute,
    annualCost,
    inHoursCost: hours * c.rateIn,
    types,
    stepValue: annualCost * step,
    stepHours: hours * step,
    shareTotal: c.types.reduce((a, t) => a + t.share, 0),
    breakEvenPct: c.investment > 0 && annualCost > 0 ? (c.investment / annualCost) * 100 : null,
    atDiagram: {
      pct,
      value,
      hours: hours * (pct / 100),
      roi: c.investment > 0 ? value / c.investment : null,
      paybackMonths: c.investment > 0 && value > 0 ? (c.investment / value) * 12 : null,
    },
  }
}

/** £3.94M, £394K, £47.50: the way the decks write money. */
export function money(v: number, pence = false): string {
  if (!Number.isFinite(v)) return '£0'
  const a = Math.abs(v)
  if (a >= 1e6) return `£${(v / 1e6).toFixed(2)}M`
  if (a >= 1e4) return `£${Math.round(v / 1e3)}K`
  return `£${v.toLocaleString('en-GB', { minimumFractionDigits: pence ? 2 : 0, maximumFractionDigits: pence ? 2 : 0 })}`
}

export const count = (v: number) => Math.round(v).toLocaleString('en-GB')
