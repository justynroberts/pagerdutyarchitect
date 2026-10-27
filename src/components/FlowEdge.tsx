import { BaseEdge, EdgeLabelRenderer, Position, getBezierPath, getSmoothStepPath, getStraightPath, type EdgeProps } from '@xyflow/react'
import clsx from 'clsx'
import type { DwellEdge } from '../types'
import { laneRoute, roundedPath, routeMiddle } from '../lib/route'

const ANGLE: Record<Position, number> = {
  [Position.Left]: 0,
  [Position.Right]: 180,
  [Position.Top]: 90,
  [Position.Bottom]: -90,
}

/** Pixels off line within which a connector is drawn straight instead of with a small step. */
const NEAR = 12

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
  // Two steps of different heights side by side sit a few pixels off centre. Rather than a tiny kink, start
  // the line level with the target: it still leaves from the source's side, just off its middle.
  const across = (p: Position) => p === Position.Left || p === Position.Right
  if (across(sourcePosition) && across(targetPosition) && Math.abs(sourceY - targetY) <= NEAR) sourceY = targetY
  else if (!across(sourcePosition) && !across(targetPosition) && Math.abs(sourceX - targetX) <= NEAR) sourceX = targetX
  const args = { sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition }
  const line = data?.line ?? 'step'
  // Following a lane the layout kept clear: out, along the lane past the steps in between, and in.
  const laned = data?.lane && line === 'step' ? laneRoute({ x: sourceX, y: sourceY }, { x: targetX, y: targetY }, data.lane, data.dir ?? 'LR') : null
  const [path, labelX, labelY] = laned
    ? [roundedPath(laned), routeMiddle(laned).x, routeMiddle(laned).y]
    : line === 'curve'
      ? getBezierPath(args)
      : line === 'straight'
        ? getStraightPath({ sourceX, sourceY, targetX, targetY })
        : getSmoothStepPath({ ...args, borderRadius: 10, offset: 20 })
  const ghost = !!data?.ghost
  const state = clsx(selected && 'is-selected', ghost && 'is-ghost', data?.lit && 'is-lit', data?.dim && 'is-dim')
  return (
    <g className={clsx('edge', state)}>
      {(data?.ribbons ?? []).map((color, i, all) => (
        <path
          key={color + i}
          d={path}
          className="edge-ribbon"
          stroke={color}
          strokeWidth={7 + (all.length - i) * 5}
        />
      ))}
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
