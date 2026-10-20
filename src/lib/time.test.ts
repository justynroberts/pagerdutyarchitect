import { describe, expect, it } from 'vitest'
import { fmt, fmtDelta, presenceState, summarise, topSavings } from './time'
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
