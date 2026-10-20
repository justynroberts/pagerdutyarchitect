import type { Mode, NodeData } from '../types'

/**
 * The signature of the app. Bar length is minutes, scaled to the longest step on the sheet.
 * Current: solid. Future: what remains is solid, what automation removed is hatched green,
 * anything it adds is amber.
 */
export function TimeBar({ data, mode, max }: { data: NodeData; mode: Mode; max: number }) {
  const { current: c, future: f, presence } = data
  let solid = 0
  let saved = 0
  let added = 0
  if (mode === 'current') solid = c
  else if (presence === 'current-only') saved = c
  else if (presence === 'future-only') added = f
  else {
    solid = Math.min(c, f)
    saved = Math.max(0, c - f)
    added = Math.max(0, f - c)
  }
  const w = (m: number) => (m > 0 ? `max(2px, ${(m / max) * 100}%)` : '0px')
  return (
    <span className="bar" aria-hidden="true">
      <i className="bar__solid" style={{ width: w(solid) }} />
      <i className="bar__saved" style={{ width: w(saved) }} />
      <i className="bar__added" style={{ width: w(added) }} />
    </span>
  )
}
