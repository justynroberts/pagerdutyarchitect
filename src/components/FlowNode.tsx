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

function Times({ node }: { node: DwellNode['data'] }) {
  const mode = useDwell((s) => s.mode)
  if (node.current === 0 && node.future === 0) return null
  if (mode === 'current') return <span className="t">{fmt(node.current)}</span>
  if (node.presence === 'current-only') return <span className="t t--saved">{fmtDelta(-node.current)}</span>
  if (node.presence === 'future-only') return <span className="t t--added">{fmtDelta(node.future)}</span>
  const delta = node.future - node.current
  return (
    <>
      {Math.abs(delta) > 0.004 && <span className={clsx('t', delta < 0 ? 't--saved' : 't--added')}>{fmtDelta(delta)}</span>}
      <span className="t">{fmt(node.future)}</span>
    </>
  )
}

function FlowNodeImpl({ data, selected }: NodeProps<DwellNode>) {
  const mode = useDwell((s) => s.mode)
  const max = useDwell((s) => longestStep(s.nodes))
  const ghost = presenceState(data.presence, mode) === 'ghost'
  const { kind } = data

  const shape =
    kind === 'decision' ? (
      <svg className="node__shape" viewBox="0 0 188 132" preserveAspectRatio="none" aria-hidden="true">
        <polygon points="94,0.5 187.5,66 94,131.5 0.5,66" />
      </svg>
    ) : kind === 'input' ? (
      <svg className="node__shape" viewBox="0 0 232 64" preserveAspectRatio="none" aria-hidden="true">
        <polygon points="14,0.5 231.5,0.5 218,63.5 0.5,63.5" />
      </svg>
    ) : kind === 'automation' ? (
      <svg className="node__shape" viewBox="0 0 232 64" preserveAspectRatio="none" aria-hidden="true">
        <polygon points="0.5,0.5 213,0.5 231.5,19 231.5,63.5 0.5,63.5" />
      </svg>
    ) : null

  return (
    <div className={clsx('node', `node--${kind}`, selected && 'is-selected', ghost && 'is-ghost')}>
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
              <NodeIcon name={data.icon} size={16} className="node__icon" />
              <span className="node__label">{data.label}</span>
              {data.share < 100 && (
                <span className="node__share" title="Share of runs that reach this step">
                  {data.share}%
                </span>
              )}
            </div>
            <div className="node__meta">
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
