import type { ReactNode } from 'react'
import { useDwell } from '../store'
import { fmt, presenceState, stepSaved } from '../lib/time'
import { KIND_LABEL, LEVER_LABEL } from '../types'

export type Hovered = { type: 'node' | 'edge'; id: string } | null

/**
 * While presenting, the step or connector under the pointer is spelled out across the top, like a subtitle:
 * its full name, who owns it and, with times on, what it takes today and after. Nothing shows until something is hovered.
 */
export function Caption({ hovered }: { hovered: Hovered }) {
  const nodes = useDwell((s) => s.nodes)
  const edges = useDwell((s) => s.edges)
  const mode = useDwell((s) => s.mode)
  const showTimes = useDwell((s) => s.showTimes)
  if (!hovered) return null

  if (hovered.type === 'edge') {
    const e = edges.find((x) => x.id === hovered.id)
    const from = e && nodes.find((n) => n.id === e.source)
    const to = e && nodes.find((n) => n.id === e.target)
    if (!e || !from || !to) return null
    return (
      <div className="caption" role="status" aria-live="polite">
        <p className="caption__title">
          {from.data.label} <span className="caption__arrow">→</span> {to.data.label}
        </p>
        {e.data?.label && <p className="caption__line">{e.data.label}</p>}
      </div>
    )
  }

  const n = nodes.find((x) => x.id === hovered.id)
  if (!n) return null
  const d = n.data
  const state = presenceState(d.presence, mode)
  const lever = d.lever && d.lever !== 'none' ? d.lever : null
  const saved = stepSaved(d)

  let figures: ReactNode = null
  if (showTimes) {
    if (mode === 'current') figures = <span className="caption__fig">{fmt(d.current)} today</span>
    else if (state === 'ghost')
      figures = (
        <span className="caption__fig">
          Removed. <b className="caption__saved">{fmt(d.current)} saved</b>
        </span>
      )
    else if (d.presence === 'future-only')
      figures = (
        <span className="caption__fig">
          Added: <b>{fmt(d.future)}</b> per run
        </span>
      )
    else
      figures = (
        <span className="caption__fig">
          <s>{fmt(d.current)}</s> today → <b>{fmt(d.future)}</b> after
          {saved > 0 && <b className="caption__saved"> · {fmt(saved)} saved</b>}
        </span>
      )
  }

  return (
    <div className="caption" role="status" aria-live="polite">
      <p className="caption__title">
        {d.label}
        {d.tool && <span className="caption__tool"> · {d.tool}</span>}
      </p>
      <p className="caption__line">
        <span className="caption__kind">{KIND_LABEL[d.kind]}</span>
        {lever && mode === 'future' && <span className={`caption__lever caption__lever--${lever}`}>{LEVER_LABEL[lever]}</span>}
        {figures}
        {d.share < 100 && <span className="caption__share">{d.share}% of runs</span>}
      </p>
      {d.note && <p className="caption__note">{d.note}</p>}
    </div>
  )
}
