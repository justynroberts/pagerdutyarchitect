import { memo } from 'react'
import { NodeResizer, type Node, type NodeProps } from '@xyflow/react'
import clsx from 'clsx'
import { useDwell } from '../store'
import { inkOn } from '../lib/palette'
import type { Zone as ZoneData } from '../types'

export type ZoneNode = Node<ZoneData, 'zone'>

/** A coloured area or a label placed by hand to call out part of the sheet. */
function ZoneImpl({ data, selected }: NodeProps<ZoneNode>) {
  const checkpoint = useDwell((s) => s.checkpoint)
  const style = { '--zc': data.color, '--zc-ink': inkOn(data.color) } as React.CSSProperties
  return (
    <div className={clsx('zone', `zone--${data.kind}`, selected && 'is-selected')} style={style}>
      {data.kind === 'area' && <NodeResizer isVisible={selected} minWidth={120} minHeight={72} onResizeStart={checkpoint} lineClassName="zone__line" handleClassName="zone__handle" />}
      <span className="zone__label">{data.label || (data.kind === 'area' ? 'Area' : 'Label')}</span>
    </div>
  )
}

export const ZoneBox = memo(ZoneImpl)
