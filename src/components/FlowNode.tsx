import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import clsx from 'clsx'
import type { DwellNode } from '../types'
import { useDwell } from '../store'
import { fmt, fmtDelta, longestStep, presenceState } from '../lib/time'
import { NodeIcon } from '../lib/icons'
import { TimeBar } from './TimeBar'

const SIDES = [
  ['t', Position.Top],
  ['r', Position.Right],
  ['b', Position.Bottom],
  ['l', Position.Left],
] as const

/** Current state shows what a step takes today. Future shows the same figure and what comes off it. */
function Times({ node }: { node: DwellNode['data'] }) {
  const mode = useDwell((s) => s.mode)
  if (node.current === 0 && node.future === 0) return null
  if (mode === 'current') return <span className="t">{fmt(node.current)}</span>
  if (node.presence === 'future-only') return <span className="t t--added">{fmtDelta(node.future)}</span>
  const delta = node.presence === 'current-only' ? -node.current : node.future - node.current
  return (
    <>
      <span className="t t--was">{fmt(node.current)}</span>
      {Math.abs(delta) > 0.004 && <span className={clsx('t', delta < 0 ? 't--saved' : 't--added')}>{fmtDelta(delta)}</span>}
    </>
  )
}

function Lever({ lever }: { lever: DwellNode['data']['lever'] }) {
  const mode = useDwell((s) => s.mode)
  if (mode !== 'future' || !lever || lever === 'none') return null
  return <span className={clsx('lever', `lever--${lever}`)}>{lever === 'ai' ? 'AI' : 'Auto'}</span>
}

function FlowNodeImpl({ id, data, selected }: NodeProps<DwellNode>) {
  const target = useDwell((s) => s.hint === id)
  const mode = useDwell((s) => s.mode)
  const max = useDwell((s) => longestStep(s.nodes))
  const ghost = presenceState(data.presence, mode) === 'ghost'
  const { kind } = data

  const shape =
    kind === 'decision' ? (
      <svg className="node__shape" viewBox="0 0 156 108" preserveAspectRatio="none" aria-hidden="true">
        <polygon points="78,0.5 155.5,54 78,107.5 0.5,54" />
      </svg>
    ) : kind === 'input' ? (
      <svg className="node__shape" viewBox="0 0 204 56" preserveAspectRatio="none" aria-hidden="true">
        <polygon points="12,0.5 203.5,0.5 192,55.5 0.5,55.5" />
      </svg>
    ) : kind === 'automation' ? (
      <svg className="node__shape" viewBox="0 0 204 56" preserveAspectRatio="none" aria-hidden="true">
        <polygon points="0.5,0.5 187,0.5 203.5,17 203.5,55.5 0.5,55.5" />
      </svg>
    ) : null

  return (
    <div className={clsx('node', `node--${kind}`, selected && 'is-selected', ghost && 'is-ghost', data.dim && 'is-dim', target && 'is-target', data.brand && 'has-brand')}>
      {shape}
      <div className="node__body">
        {kind === 'decision' ? (
          <>
            <span className="node__label">{data.label}</span>
            <span className="node__times">
              <Times node={data} />
            </span>
            <TimeBar data={data} mode={mode} max={max} />
          </>
        ) : (
          <>
            <div className="node__head">
              <span className="node__tile">
                <NodeIcon name={data.icon} brand={data.brand} size={data.brand ? 15 : 16} className="node__icon" />
              </span>
              <span className="node__label">{data.label}</span>
              {data.share < 100 && (
                <span className="node__share" title="Share of runs that reach this step">
                  {data.share}%
                </span>
              )}
            </div>
            <div className="node__meta">
              <Lever lever={data.lever} />
              <span className="node__tool">{data.tool}</span>
              <span className="node__times">
                <Times node={data} />
              </span>
            </div>
            <TimeBar data={data} mode={mode} max={max} />
          </>
        )}
      </div>
      {SIDES.map(([id, pos]) => (
        <Handle key={id} id={id} type="source" position={pos} isConnectableStart isConnectableEnd />
      ))}
    </div>
  )
}

export const FlowNode = memo(FlowNodeImpl)
