import { useEffect, useMemo, useState, type DragEvent } from 'react'
import {
  ConnectionMode,
  Panel,
  ReactFlow,
  useReactFlow,
  type NodeTypes,
  type EdgeTypes,
} from '@xyflow/react'
import { ArrowsOut, MagnifyingGlassMinus, MagnifyingGlassPlus } from '@phosphor-icons/react'
import { useDwell } from '../store'
import { DIMS } from '../lib/layout'
import { fmt, longestStep, presenceState } from '../lib/time'
import type { DwellEdge, DwellNode } from '../types'
import { FlowNode } from './FlowNode'
import { FlowEdge } from './FlowEdge'
import { Tip } from './ui'

const nodeTypes = { flow: FlowNode } as unknown as NodeTypes
const edgeTypes = { flow: FlowEdge } as unknown as EdgeTypes

export const DRAG_MIME = 'application/x-dwell-item'

function Legend() {
  const mode = useDwell((s) => s.mode)
  const max = useDwell((s) => longestStep(s.nodes))
  return (
    <div className="legend" aria-label="Legend">
      <span className="legend__key">
        <i className="sw sw--solid" />
        {mode === 'current' ? 'Time taken' : 'Time that remains'}
      </span>
      {mode === 'future' && (
        <>
          <span className="legend__key">
            <i className="sw sw--saved" />
            Time removed
          </span>
          <span className="legend__key">
            <i className="sw sw--added" />
            Time added
          </span>
        </>
      )}
      <span>Full bar is {fmt(max)}</span>
    </div>
  )
}

function Empty() {
  const loadSample = useDwell((s) => s.loadSample)
  return (
    <div className="empty">
      <h2>Drag a step from the catalogue to start</h2>
      <p>
        Pick a step and it lands with its time already attached. Select a step first and clicking the next one will
        chain it on. Switch to Future to see what automation gives back.
      </p>
      <button className="btn btn--outline" onClick={loadSample}>
        Open the alert engagement sample
      </button>
    </div>
  )
}

export function Canvas() {
  const rf = useReactFlow<DwellNode, DwellEdge>()
  const nodes = useDwell((s) => s.nodes)
  const edges = useDwell((s) => s.edges)
  const mode = useDwell((s) => s.mode)
  const catalogue = useDwell((s) => s.catalogue)
  const fitTick = useDwell((s) => s.fitTick)
  const onNodesChange = useDwell((s) => s.onNodesChange)
  const onEdgesChange = useDwell((s) => s.onEdgesChange)
  const onConnect = useDwell((s) => s.onConnect)
  const checkpoint = useDwell((s) => s.checkpoint)
  const addFromItem = useDwell((s) => s.addFromItem)
  const [connecting, setConnecting] = useState(false)

  const viewNodes = useMemo(
    () => nodes.map((n) => ({ ...n, hidden: presenceState(n.data.presence, mode) === 'hidden' })),
    [nodes, mode],
  )

  const viewEdges = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]))
    return edges.map((e) => {
      const s = byId.get(e.source)
      const t = byId.get(e.target)
      const presence = e.data?.presence ?? 'both'
      let hidden = false
      let ghost = false
      if (!s || !t) hidden = true
      else if (mode === 'current') {
        hidden = [s.data.presence, t.data.presence, presence].includes('future-only')
      } else if (s.data.presence === 'current-only' || t.data.presence === 'current-only') {
        ghost = true
      } else if (presence === 'current-only') {
        hidden = true
      }
      return { ...e, hidden, data: { presence, label: e.data?.label ?? '', ghost } }
    })
  }, [nodes, edges, mode])

  useEffect(() => {
    if (!fitTick) return
    const t = setTimeout(() => rf.fitView({ duration: 300, padding: 0.12, minZoom: 0.45 }), 90)
    return () => clearTimeout(t)
  }, [fitTick, rf])

  const onDragOver = (e: DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    const id = e.dataTransfer.getData(DRAG_MIME)
    const item = catalogue.find((c) => c.id === id)
    if (!item) return
    const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })
    const d = DIMS[item.kind]
    addFromItem(item, { position: { x: Math.round((p.x - d.w / 2) / 8) * 8, y: Math.round((p.y - d.h / 2) / 8) * 8 } })
  }

  return (
    <div className="stage" id="stage">
      <ReactFlow<DwellNode, DwellEdge>
        className={connecting ? 'is-connecting' : undefined}
        nodes={viewNodes}
        edges={viewEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={() => setConnecting(true)}
        onConnectEnd={() => setConnecting(false)}
        onNodeDragStart={checkpoint}
        onBeforeDelete={async () => {
          checkpoint()
          return true
        }}
        onDrop={onDrop}
        onDragOver={onDragOver}
        connectionMode={ConnectionMode.Loose}
        deleteKeyCode={['Backspace', 'Delete']}
        snapToGrid
        snapGrid={[8, 8]}
        fitView
        fitViewOptions={{ padding: 0.12, minZoom: 0.45 }}
        minZoom={0.2}
        maxZoom={1.8}
        selectNodesOnDrag={false}
        elevateEdgesOnSelect
        aria-label="Process diagram"
      >
        <Panel position="top-left">
          <Legend />
        </Panel>
        <Panel position="top-right">
          <div className="zoom" role="group" aria-label="View">
            <Tip label="Zoom out">
              <button className="btn btn--icon" aria-label="Zoom out" onClick={() => rf.zoomOut({ duration: 160 })}>
                <MagnifyingGlassMinus size={18} weight="light" />
              </button>
            </Tip>
            <Tip label="Zoom in">
              <button className="btn btn--icon" aria-label="Zoom in" onClick={() => rf.zoomIn({ duration: 160 })}>
                <MagnifyingGlassPlus size={18} weight="light" />
              </button>
            </Tip>
            <Tip label="Fit to screen">
              <button className="btn btn--icon" aria-label="Fit to screen" onClick={() => rf.fitView({ duration: 300, padding: 0.12, minZoom: 0.45 })}>
                <ArrowsOut size={18} weight="light" />
              </button>
            </Tip>
          </div>
        </Panel>
      </ReactFlow>
      {nodes.length === 0 && <Empty />}
    </div>
  )
}
