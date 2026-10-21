import { useEffect, useMemo, useState, type DragEvent } from 'react'
import {
  ConnectionMode,
  Panel,
  ReactFlow,
  SelectionMode,
  useReactFlow,
  type NodeChange,
  type NodeTypes,
  type EdgeTypes,
} from '@xyflow/react'
import { ArrowsOut, BoundingBox, CaretLeft, CaretRight, Cursor, MagnifyingGlassMinus, MagnifyingGlassPlus, Selection, TextT, Timer, X } from '@phosphor-icons/react'
import { useDwell } from '../store'
import { DIMS, nearestNode } from '../lib/layout'
import { fmt, longestStep, presenceState } from '../lib/time'
import { flowTotals } from '../lib/check'
import type { DwellEdge, DwellNode } from '../types'
import { FlowNode } from './FlowNode'
import { FlowEdge } from './FlowEdge'
import { Tip } from './ui'
import { Logo } from './Logo'
import { ZoneBox } from './Zone'
import { Swatches } from './Inspector'

const nodeTypes = { flow: FlowNode, zone: ZoneBox } as unknown as NodeTypes
const edgeTypes = { flow: FlowEdge } as unknown as EdgeTypes

export const DRAG_MIME = 'application/x-dwell-item'

function Legend() {
  const mode = useDwell((s) => s.mode)
  const flow = useDwell((s) => s.flows.find((f) => f.id === s.activeFlow))
  const setActiveFlow = useDwell((s) => s.setActiveFlow)
  const max = useDwell((s) => longestStep(s.nodes))
  const showTimes = useDwell((s) => s.showTimes)
  if (!showTimes && !flow) return null
  return (
    <div className="legend" aria-label="Legend">
      {showTimes && (
        <>
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
        </>
      )}
      {flow && (
        <span className="legend__flow">
          Flow: {flow.name}
          <button className="legend__clear" onClick={() => setActiveFlow(null)} aria-label="Clear flow highlight">
            Clear
          </button>
        </span>
      )}
    </div>
  )
}

function FlowKey() {
  const flows = useDwell((s) => s.flows)
  const edges = useDwell((s) => s.edges)
  const active = useDwell((s) => s.activeFlow)
  const setActive = useDwell((s) => s.setActiveFlow)
  const nodes = useDwell((s) => s.nodes)
  const mode = useDwell((s) => s.mode)
  const showTimes = useDwell((s) => s.showTimes)
  const deleteFlow = useDwell((s) => s.deleteFlow)
  const used = flows.filter((f) => edges.some((e) => e.data?.flows?.includes(f.id)))
  return (
    <div className="flowkey" role="group" aria-label="Flows">
      <span className="flowkey__title">Flows</span>
      {used.map((f) => {
        const t = flowTotals({ nodes, edges, flows }, f.id)
        return (
          <div key={f.id} className="flowkey__row">
            <button className="flowkey__item" aria-pressed={active === f.id} onClick={() => setActive(active === f.id ? null : f.id)}>
              <i style={{ background: f.color }} />
              <span className="flowkey__name">{f.name}</span>
              {showTimes && (
                <span className="flowkey__time" title="Time along this flow, every step at its full time">
                  {mode === 'current' || Math.abs(t.saved) < 0.05 ? fmt(t.current) : `${fmt(t.current)} → ${fmt(t.future)}`}
                </span>
              )}
            </button>
            <button className="flowkey__delete" aria-label={`Delete flow ${f.name}`} title="Delete flow (undo brings it back)" onClick={() => deleteFlow(f.id)}>
              <X size={12} weight="bold" />
            </button>
          </div>
        )
      })}
    </div>
  )
}


/** Presenting: step through the flows with the arrow keys, flip Current and Future with space. */
function PresentBar() {
  const flows = useDwell((s) => s.flows)
  const edges = useDwell((s) => s.edges)
  const active = useDwell((s) => s.activeFlow)
  const mode = useDwell((s) => s.mode)
  const setMode = useDwell((s) => s.setMode)
  const setActive = useDwell((s) => s.setActiveFlow)
  const setPresenting = useDwell((s) => s.setPresenting)
  const showTimes = useDwell((s) => s.showTimes)
  const setShowTimes = useDwell((s) => s.setShowTimes)
  const used = useMemo(() => flows.filter((f) => edges.some((e) => e.data?.flows?.includes(f.id))), [flows, edges])
  const pos = used.findIndex((f) => f.id === active) // -1 means showing everything
  const step = (dir: 1 | -1) => {
    if (!used.length) return
    const next = pos + dir
    setActive(next < 0 || next >= used.length ? null : used[next].id)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown') (e.preventDefault(), step(1))
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') (e.preventDefault(), step(-1))
      else if (e.key === ' ') (e.preventDefault(), setMode(mode === 'current' ? 'future' : 'current'))
      else if (e.key === 'Escape') setPresenting(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const label = pos < 0 ? 'All flows' : used[pos].name
  return (
    <div className="presentbar" role="group" aria-label="Presenting">
      <button className="btn" onClick={() => setMode(mode === 'current' ? 'future' : 'current')} aria-label={`Showing ${mode}. Switch`}>
        {mode === 'current' ? 'Current' : 'Future'}
      </button>
      {used.length > 0 && (
        <>
          <button className="btn btn--icon" aria-label="Previous flow" onClick={() => step(-1)} disabled={pos < 0}>
            <CaretLeft size={16} weight="bold" />
          </button>
          <span className="presentbar__flow" aria-live="polite">
            {pos >= 0 && <i style={{ background: used[pos].color }} />}
            {label}
          </span>
          <button className="btn btn--icon" aria-label="Next flow" onClick={() => step(1)} disabled={pos === used.length - 1}>
            <CaretRight size={16} weight="bold" />
          </button>
        </>
      )}
      <button className="btn" aria-pressed={showTimes} onClick={() => setShowTimes(!showTimes)} title="Show times (M)">
        Times
      </button>
      <button className="btn" onClick={() => setPresenting(false)}>
        Exit
      </button>
    </div>
  )
}

/** Floats over the canvas once two or more steps are picked, so making a flow never needs the side panel. */
function SelectionBar() {
  const nodes = useDwell((s) => s.nodes)
  const ids = useMemo(() => nodes.filter((n) => n.selected && !n.hidden).map((n) => n.id), [nodes])
  const flowCount = useDwell((s) => s.flows.length)
  const createFlowFromNodes = useDwell((s) => s.createFlowFromNodes)
  const areaAround = useDwell((s) => s.areaAround)
  const [name, setName] = useState('')
  const [color, setColor] = useState('')
  const [note, setNote] = useState('')
  if (ids.length < 2) return null
  const make = () => {
    if (createFlowFromNodes(ids, name, color || undefined)) {
      setName('')
      setNote('')
    } else setNote('None of these steps connect yet.')
  }
  return (
    <div className="selbar" role="group" aria-label="Selected steps">
      <span className="selbar__count">{ids.length} steps</span>
      <input
        className="input selbar__name"
        aria-label="Flow name"
        value={name}
        placeholder={`Flow ${flowCount + 1}`}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && make()}
      />
      <Swatches label="Flow colour" value={color} onPick={setColor} />
      <button className="btn btn--primary" onClick={make}>
        Create flow
      </button>
      <button className="btn btn--outline" onClick={() => areaAround(ids)}>
        Area
      </button>
      {note && <span role="status">{note}</span>}
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
  const showTimes = useDwell((s) => s.showTimes)
  const setShowTimes = useDwell((s) => s.setShowTimes)
  const nodes = useDwell((s) => s.nodes)
  const edges = useDwell((s) => s.edges)
  const mode = useDwell((s) => s.mode)
  const activeFlow = useDwell((s) => s.activeFlow)
  const flows = useDwell((s) => s.flows)
  const zones = useDwell((s) => s.zones)
  const onZonesChange = useDwell((s) => s.onZonesChange)
  const addZone = useDwell((s) => s.addZone)
  const onReconnect = useDwell((s) => s.onReconnect)
  const catalogue = useDwell((s) => s.catalogue)
  const fitTick = useDwell((s) => s.fitTick)
  const onNodesChange = useDwell((s) => s.onNodesChange)
  const onEdgesChange = useDwell((s) => s.onEdgesChange)
  const onConnect = useDwell((s) => s.onConnect)
  const checkpoint = useDwell((s) => s.checkpoint)
  const connectNear = useDwell((s) => s.connectNear)
  const setHint = useDwell((s) => s.setHint)
  const logoCorner = useDwell((s) => s.logoCorner)
  const presenting = useDwell((s) => s.presenting)
  const title = useDwell((s) => s.title)
  const addFromItem = useDwell((s) => s.addFromItem)
  const [connecting, setConnecting] = useState(false)
  const [marquee, setMarquee] = useState(false)
  const onNodesChangeStore = useDwell((s) => s.onNodesChange)

  // Ctrl or Cmd+A picks every step, like any editor.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'a') return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      e.preventDefault()
      const all = useDwell.getState().nodes.filter((n) => !n.hidden)
      onNodesChangeStore(all.map((n) => ({ type: 'select' as const, id: n.id, selected: true })))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onNodesChangeStore])

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
      const lit = !!activeFlow && !!e.data?.flows?.includes(activeFlow)
      const ribbons = flows.filter((f) => e.data?.flows?.includes(f.id)).map((f) => f.color)
      return {
        ...e,
        hidden,
        data: { presence, label: e.data?.label ?? '', line: e.data?.line, flows: e.data?.flows, ribbons, ghost, lit, dim: !!activeFlow && !lit },
      }
    })
  }, [nodes, edges, mode, activeFlow, flows])

  const viewNodes = useMemo(() => {
    const onFlow = new Set<string>()
    if (activeFlow) for (const e of viewEdges) if (!e.hidden && e.data.lit) (onFlow.add(e.source), onFlow.add(e.target))
    const flowNodes = nodes.map((n) => ({
      ...n,
      position: mode === 'future' && n.data.futurePos ? n.data.futurePos : n.position,
      hidden: presenceState(n.data.presence, mode) === 'hidden',
      data: { ...n.data, dim: !!activeFlow && !onFlow.has(n.id) },
    }))
    // Areas sit behind everything, labels in front of it. Only their label bar drags, so the body never gets in the way of panning.
    const zoneNodes = zones.map((z) => ({
      id: z.id,
      type: 'zone' as const,
      position: { x: z.x, y: z.y },
      data: z,
      selected: !!z.selected,
      zIndex: z.kind === 'area' ? -1 : 20,
      dragHandle: '.zone__label',
      ...(z.kind === 'area' ? { width: z.w, height: z.h } : z.w ? { measured: { width: z.w, height: z.h } } : {}),
    }))
    return [...zoneNodes, ...flowNodes] as unknown as DwellNode[]
  }, [nodes, mode, activeFlow, viewEdges, zones])

  const routeNodeChanges = (changes: NodeChange<DwellNode>[]) => {
    const zoneIds = new Set(zones.map((z) => z.id))
    const mine = changes.filter((c) => 'id' in c && zoneIds.has(c.id))
    const rest = changes.filter((c) => !('id' in c && zoneIds.has(c.id)))
    if (rest.length) onNodesChange(rest)
    if (mine.length) onZonesChange(mine as NodeChange[])
  }

  const withFlows = flows.filter((f) => edges.some((e) => e.data?.flows?.includes(f.id)))
  const addAtCentre = (kind: 'area' | 'label') => {
    const el = document.getElementById('stage')
    if (!el) return
    const r = el.getBoundingClientRect()
    addZone(kind, rf.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 }))
    window.dispatchEvent(new Event('dwell:inspect'))
  }

  useEffect(() => {
    if (!fitTick) return
    const t = setTimeout(() => rf.fitView({ duration: 300, padding: 0.12, minZoom: 0.2 }), 90)
    return () => clearTimeout(t)
  }, [fitTick, rf])

  const onDragOver = (e: DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    // Light up the step the drop would join to.
    const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })
    const d = DIMS.step
    const near = nearestNode(useDwell.getState().nodes, { x: p.x - d.w / 2, y: p.y - d.h / 2, w: d.w, h: d.h })
    setHint(near?.id ?? null)
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setHint(null)
    const id = e.dataTransfer.getData(DRAG_MIME)
    const item = catalogue.find((c) => c.id === id)
    if (!item) return
    const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })
    const d = DIMS[item.kind]
    addFromItem(item, {
      position: { x: Math.round((p.x - d.w / 2) / 8) * 8, y: Math.round((p.y - d.h / 2) / 8) * 8 },
      autoConnect: true,
    })
  }

  return (
    <main className="stage" id="stage">
      <h1 className="sr-only">PagerDuty Architect process diagram: {title}</h1>
      <div className="stage__bg" aria-hidden="true" />
      {logoCorner !== 'off' && <Logo className="stage__logo" data-corner={logoCorner} />}
      <ReactFlow<DwellNode, DwellEdge>
        className={connecting ? 'is-connecting' : undefined}
        nodes={viewNodes}
        edges={viewEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={routeNodeChanges}
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
        onDragLeave={() => setHint(null)}
        onNodeClick={() => window.dispatchEvent(new Event('dwell:inspect'))}
        onEdgeClick={() => window.dispatchEvent(new Event('dwell:inspect'))}
        onNodeDragStop={(_, node) => {
          // A loose step released beside another one joins it.
          const { edges: es } = useDwell.getState()
          if (!es.some((x) => x.source === node.id || x.target === node.id)) connectNear(node.id)
        }}
        connectionMode={ConnectionMode.Loose}
        multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
        edgesReconnectable
        reconnectRadius={18}
        onReconnect={onReconnect}
        deleteKeyCode={['Backspace', 'Delete']}
        snapToGrid
        snapGrid={[8, 8]}
        fitView
        fitViewOptions={{ padding: 0.12, minZoom: 0.2 }}
        minZoom={0.2}
        maxZoom={1.8}
        selectNodesOnDrag={false}
        nodesDraggable={!presenting}
        nodesConnectable={!presenting}
        elementsSelectable={!presenting}
        selectionOnDrag={marquee}
        panOnDrag={marquee ? [1, 2] : true}
        selectionMode={SelectionMode.Partial}
        elevateEdgesOnSelect
        aria-label="Process diagram"
      >
        <Panel position="top-left">
          <Legend />
        </Panel>
        {presenting ? (
          <Panel position="bottom-center" style={{ marginBottom: 24 }}>
            <PresentBar />
          </Panel>
        ) : (
          <Panel position="bottom-center" style={{ marginBottom: 150 }}>
            <SelectionBar />
          </Panel>
        )}
        <Panel position="top-right">
          <div className="zoom" role="group" aria-label="View">
            <Tip label={marquee ? 'Select mode: drag to box-select. Click to go back to panning' : 'Box select: drag over several steps (Shift also works)'}>
              <button className="btn btn--icon" aria-label="Box select" aria-pressed={marquee} onClick={() => setMarquee((m) => !m)}>
                {marquee ? <Selection size={18} weight="fill" /> : <Cursor size={18} weight="light" />}
              </button>
            </Tip>
            <span className="zoom__sep" aria-hidden="true" />
            <Tip label="Add a highlighted area">
              <button className="btn btn--icon" aria-label="Add area" onClick={() => addAtCentre('area')}>
                <BoundingBox size={18} weight="light" />
              </button>
            </Tip>
            <Tip label="Add a text label">
              <button className="btn btn--icon" aria-label="Add label" onClick={() => addAtCentre('label')}>
                <TextT size={18} weight="light" />
              </button>
            </Tip>
            <span className="zoom__sep" aria-hidden="true" />
            <Tip label={showTimes ? 'Hide times (M)' : 'Show times (M)'}>
              <button className="btn btn--icon" aria-label="Show times" aria-pressed={showTimes} onClick={() => setShowTimes(!showTimes)}>
                <Timer size={18} weight={showTimes ? 'fill' : 'light'} />
              </button>
            </Tip>
            <span className="zoom__sep" aria-hidden="true" />
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
              <button className="btn btn--icon" aria-label="Fit to screen" onClick={() => rf.fitView({ duration: 300, padding: 0.12, minZoom: 0.2 })}>
                <ArrowsOut size={18} weight="light" />
              </button>
            </Tip>
          </div>
        </Panel>
        {withFlows.length > 0 && (
          <Panel position="bottom-right" style={{ marginBottom: 30 }}>
            <FlowKey />
          </Panel>
        )}
      </ReactFlow>
      {nodes.length === 0 && <Empty />}
    </main>
  )
}
