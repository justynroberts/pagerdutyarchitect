import { BaseEdge, EdgeLabelRenderer, Position, getSmoothStepPath, type EdgeProps } from '@xyflow/react'
import clsx from 'clsx'
import type { DwellEdge } from '../types'

const ANGLE: Record<Position, number> = {
  [Position.Left]: 0,
  [Position.Right]: 180,
  [Position.Top]: 90,
  [Position.Bottom]: -90,
}

export function FlowEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps<DwellEdge>) {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 10,
    offset: 20,
  })
  const ghost = !!data?.ghost
  const state = clsx(selected && 'is-selected', ghost && 'is-ghost')
  return (
    <g className={clsx('edge', state)}>
      <BaseEdge path={path} className="edge-path" interactionWidth={22} />
      <polygon
        className="edge-arrow"
        points="0,0 -9,-4.5 -9,4.5"
        transform={`translate(${targetX} ${targetY}) rotate(${ANGLE[targetPosition]})`}
      />
      {data?.label ? (
        <EdgeLabelRenderer>
          <div
            className={clsx('edge-label nodrag nopan', state)}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </g>
  )
}
