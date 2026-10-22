import { describe, expect, it } from 'vitest'
import { DEFAULT_COMMERCIAL, cleanCommercial, computeCommercial, count, money } from './commercial'

describe('commercial model', () => {
  // The Admiral ROI deck's figures, from the same defaults.
  const r = computeCommercial(DEFAULT_COMMERCIAL, 0)

  it('matches the deck', () => {
    expect(count(r.worked)).toBe('87,100')
    expect(count(r.types[0].incidents)).toBe('44,200')
    expect(count(r.types[1].incidents)).toBe('42,900')
    expect(count(r.hours)).toBe('82,983')
    expect(count(r.types[0].hours)).toBe('25,783')
    expect(count(r.types[1].hours)).toBe('57,200')
    expect(money(r.blendedRate, true)).toBe('£47.50')
    expect(money(r.perMinute, true)).toBe('£0.79')
    expect(money(r.annualCost)).toBe('£3.94M')
    expect(money(r.stepValue)).toBe('£394K')
    expect(money(r.types[0].stepValue)).toBe('£122K')
    expect(money(r.types[1].stepValue)).toBe('£272K')
    expect(r.types[0].minutesSaved).toBe(3.5)
    expect(r.types[1].minutesSaved).toBe(8)
    expect(count(r.stepHours)).toBe('8,298')
  })

  it('works out break-even and payback from an investment and the diagram', () => {
    const c = { ...DEFAULT_COMMERCIAL, investment: 394000 }
    const x = computeCommercial(c, 50)
    expect(x.breakEvenPct).toBeCloseTo(10, 1)
    expect(x.atDiagram.value).toBeCloseTo(r.annualCost / 2, 0)
    expect(x.atDiagram.roi).toBeCloseTo(5, 1)
    expect(x.atDiagram.paybackMonths).toBeCloseTo(2.4, 1)
    expect(computeCommercial(DEFAULT_COMMERCIAL, 50).breakEvenPct).toBeNull()
  })

  it('repairs a damaged or missing sheet', () => {
    expect(cleanCommercial(undefined)).toEqual(DEFAULT_COMMERCIAL)
    const c = cleanCommercial({ incidentsPerYear: -5, discardedPct: 400, types: [{ name: 'P1', share: 'x', minutes: 30 }, null] })
    expect(c.incidentsPerYear).toBe(DEFAULT_COMMERCIAL.incidentsPerYear)
    expect(c.discardedPct).toBe(100)
    expect(c.types).toEqual([{ id: 't-0', name: 'P1', share: 0, minutes: 30 }])
  })
})

describe('value assessment export', () => {
  it('copies the figures as a Markdown table', async () => {
    const { valueMarkdown } = await import('./valueSlide')
    const c = { ...DEFAULT_COMMERCIAL, customer: 'Admiral', investment: 250000 }
    const md = valueMarkdown(c, computeCommercial(c, 50))
    expect(md).toContain('## Admiral: Value Assessment')
    expect(md).toContain('| Annual response cost | £3.94M |')
    expect(md).toContain('| Every 10% automated saves | £394K a year, 8,298 hrs |')
    expect(md).toContain('PagerDuty Reliability Platform removes 50% of effort')
    expect(md).toContain('| Break-even | 6.3% of response time automated |')
  })
})
