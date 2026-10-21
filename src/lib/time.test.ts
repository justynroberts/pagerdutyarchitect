import { describe, expect, it } from 'vitest'
import { fmt, fmtDelta, presenceState, summarise, topSavings, parseMinutes, parseAmount, cleanOverrides } from './time'
import { buildSample } from './seed'

describe('fmt', () => {
  it('formats seconds, minutes and hours', () => {
    expect(fmt(0)).toBe('0m')
    expect(fmt(0.5)).toBe('30s')
    expect(fmt(14)).toBe('14m')
    expect(fmt(1.5)).toBe('1.5m')
    expect(fmt(59.7)).toBe('59.7m')
    expect(fmt(59.97)).toBe('1h')
    expect(fmt(135)).toBe('2h 15m')
  })
  it('uses a real minus sign for deltas', () => {
    expect(fmtDelta(-10)).toBe('−10m')
    expect(fmtDelta(1.5)).toBe('+1.5m')
  })
})

describe('presenceState', () => {
  it('hides future-only steps in Current and ghosts current-only steps in Future', () => {
    expect(presenceState('future-only', 'current')).toBe('hidden')
    expect(presenceState('current-only', 'future')).toBe('ghost')
    expect(presenceState('both', 'current')).toBe('live')
    expect(presenceState('both', 'future')).toBe('live')
  })
})

describe('sample diagram', () => {
  const { nodes } = buildSample()
  const s = summarise(nodes, 320, 75)

  it('saves time overall and gives a consistent breakdown', () => {
    expect(s.future).toBeLessThan(s.current)
    expect(s.saved).toBeCloseTo(s.current - s.future, 6)
    expect(s.pct).toBeGreaterThan(50)
    expect(s.hoursPerMonth).toBeCloseTo((s.saved * 320) / 60, 6)
    expect(s.valuePerYear).toBeCloseTo(s.hoursPerMonth * 12 * 75, 4)
  })

  it('does not count a future-only step in the current total', () => {
    const paige = nodes.find((n) => n.data.label.startsWith('Paige'))!
    const without = summarise(
      nodes.map((n) => (n.id === paige.id ? { ...n, data: { ...n.data, current: 99 } } : n)),
      320,
      75,
    )
    expect(without.current).toBeCloseTo(s.current, 6)
  })

  it('ranks the biggest savings first', () => {
    const top = topSavings(nodes)
    expect(top.length).toBeGreaterThan(2)
    for (let i = 1; i < top.length; i++) expect(top[i - 1].saved).toBeGreaterThanOrEqual(top[i].saved)
  })
})

import { ICON_KEYS } from './icons'
import { BRANDS } from './brands'
import { ICON_NAMES, BRAND_NAMES } from './iconKeys'
describe('icon name lists', () => {
  it('match what the app can draw', () => {
    expect([...ICON_NAMES].sort()).toEqual([...ICON_KEYS].sort())
    expect([...BRAND_NAMES].sort()).toEqual(Object.keys(BRANDS).sort())
  })
})

describe('ledger overrides', () => {
  it('reads minutes the way people type them', () => {
    expect(parseMinutes('87')).toBe(87)
    expect(parseMinutes('87m')).toBe(87)
    expect(parseMinutes('1h 27m')).toBe(87)
    expect(parseMinutes('1.5h')).toBe(90)
    expect(parseMinutes('1:27')).toBe(87)
    expect(parseMinutes('90s')).toBe(1.5)
    expect(parseMinutes('soon')).toBeNull()
  })

  it('reads amounts with currency, units and k/m', () => {
    expect(parseAmount('£283.0K')).toBe(283000)
    expect(parseAmount('314 h')).toBe(314)
    expect(parseAmount('1,250')).toBe(1250)
    expect(parseAmount('£1.2m')).toBe(1200000)
    expect(parseAmount('lots')).toBeNull()
  })

  it('uses typed-over figures and recalculates what follows from them', () => {
    const { nodes } = buildSample()
    const calc = summarise(nodes, 100, 50)
    const s = summarise(nodes, 100, 50, { future: 30 })
    expect(s.current).toBe(calc.current)
    expect(s.saved).toBeCloseTo(calc.current - 30, 6)
    expect(s.hoursPerMonth).toBeCloseTo(((calc.current - 30) * 100) / 60, 6)
    expect(s.valuePerYear).toBeCloseTo(s.hoursPerMonth * 12 * 50, 4)
    expect(summarise(nodes, 100, 50, { current: 60, future: 20 })).toMatchObject({ saved: 40, hoursPerMonth: (40 * 100) / 60 })
    expect(summarise(nodes, 100, 50, { future: 30, hoursPerMonth: 10 }).valuePerYear).toBe(10 * 12 * 50)
    expect(summarise(nodes, 100, 50, { valuePerYear: 1234 }).valuePerYear).toBe(1234)
  })

  it('drops overrides that are not usable numbers', () => {
    expect(cleanOverrides({ current: 10, future: -1, hoursPerMonth: 'x', valuePerYear: Infinity, junk: 3 })).toEqual({ current: 10 })
  })
})
