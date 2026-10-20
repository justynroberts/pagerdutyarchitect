import { useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useReactFlow } from '@xyflow/react'
import { ArrowsLeftRight, Copy, Crosshair, PencilSimple, Trash } from '@phosphor-icons/react'
import { useDwell } from '../store'
import { DIMS } from '../lib/layout'
import { fmt, fmtDelta, savedByLever, stepSaved, topSavings } from '../lib/time'
import {
  KIND_LABEL,
  KIND_ORDER,
  type DwellEdge,
  type Lever,
  type LineStyle,
  type DwellNode,
  type Kind,
  type Presence,
} from '../types'
import { Field, IconPicker, NumberInput, Segmented } from './ui'

const PRESENCE_OPTIONS: { value: Presence; node: string }[] = [
  { value: 'both', node: 'Both' },
  { value: 'current-only', node: 'Current' },
  { value: 'future-only', node: 'Future' },
]

function NodePanel({ node }: { node: DwellNode }) {
  const { updateNode, checkpoint, deleteSelected, duplicateSelected, mode, setMode, traceFlow } = useDwell()
  const d = node.data
  const set = (p: Partial<typeof d>) => updateNode(node.id, p)
  const saved = stepSaved(d)
  const pct = d.current > 0 ? Math.round((saved / d.current) * 100) : 0

  const setPresence = (presence: Presence) => {
    checkpoint()
    set({ presence })
    if (presence === 'future-only' && mode === 'current') setMode('future')
    if (presence === 'current-only' && mode === 'future') setMode('current')
  }

  return (
    <div className="insp">
      <h2 className="insp__title">{KIND_LABEL[d.kind]}</h2>

      <Field label="Label" htmlFor="n-label">
        <input id="n-label" className="input" value={d.label} onFocus={checkpoint} onChange={(e) => set({ label: e.target.value })} />
      </Field>
      <Field label="Tool or system" htmlFor="n-tool">
        <input id="n-tool" className="input" value={d.tool} onFocus={checkpoint} onChange={(e) => set({ tool: e.target.value })} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Kind" htmlFor="n-kind">
          <select
            id="n-kind"
            className="select"
            value={d.kind}
            onChange={(e) => {
              checkpoint()
              set({ kind: e.target.value as Kind })
            }}
          >
            {KIND_ORDER.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Icon">
          <IconPicker value={d.icon} onStart={checkpoint} onChange={(icon) => set({ icon })} />
        </Field>
      </div>

      <hr className="insp__rule" />

      <div className="timepair">
        <Field label="Takes now (min)" htmlFor="n-now">
          <NumberInput id="n-now" value={d.current} onStart={checkpoint} onValue={(current) => set({ current })} />
        </Field>
        <Field label="Takes after (min)" htmlFor="n-after">
          <NumberInput id="n-after" value={d.future} onStart={checkpoint} onValue={(future) => set({ future })} />
        </Field>
      </div>

      <div className="change" aria-live="polite">
        <span>Change per run</span>
        <span className={`t ${saved > 0 ? 't--saved' : saved < 0 ? 't--added' : ''}`}>
          {saved === 0 ? 'none' : `${fmtDelta(-saved)}${d.current > 0 && d.presence === 'both' ? ` (${pct > 0 ? '−' : '+'}${Math.abs(pct)}%)` : ''}`}
        </span>
      </div>

      <Field
        label="Share of runs"
        htmlFor="n-share"
        aside={<span className="t">{d.share}%</span>}
      >
        <input
          id="n-share"
          type="range"
          min={0}
          max={100}
          step={1}
          value={d.share}
          onPointerDown={checkpoint}
          onKeyDown={(e) => e.key.startsWith('Arrow') && checkpoint()}
          onChange={(e) => set({ share: Number(e.target.value) })}
        />
      </Field>

      <Field label="Appears in">
        <Segmented<Presence> label="Appears in" fill value={d.presence} options={PRESENCE_OPTIONS} onChange={setPresence} />
      </Field>

      {(d.kind === 'step' || d.kind === 'automation' || d.kind === 'decision') && (
        <Field label="Benefit comes from">
          <Segmented<Lever>
            label="Benefit comes from"
            fill
            value={d.lever ?? 'none'}
            options={[
              { value: 'none', node: 'Not set' },
              { value: 'ai', node: 'AI' },
              { value: 'automation', node: 'Automation' },
            ]}
            onChange={(lever) => {
              checkpoint()
              set({ lever })
            }}
          />
        </Field>
      )}

      <Field label="Highlight a flow">
        <div className="grid grid-cols-3 gap-2">
          <button className="btn btn--outline btn--wide" onClick={() => traceFlow(node.id, 'down')}>
            From here
          </button>
          <button className="btn btn--outline btn--wide" onClick={() => traceFlow(node.id, 'up')}>
            To here
          </button>
          <button className="btn btn--outline btn--wide" onClick={() => traceFlow(node.id, 'through')}>
            Through
          </button>
        </div>
      </Field>

      <Field label="Notes" htmlFor="n-note">
        <textarea id="n-note" className="textarea" value={d.note} onFocus={checkpoint} onChange={(e) => set({ note: e.target.value })} />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <button className="btn btn--outline btn--wide" onClick={duplicateSelected}>
          <Copy size={16} weight="light" />
          Duplicate
        </button>
        <button className="btn btn--outline btn--wide btn--danger" onClick={deleteSelected}>
          <Trash size={16} weight="light" />
          Delete
        </button>
      </div>
    </div>
  )
}

const SIDES: { value: string; label: string }[] = [
  { value: 't', label: 'Top' },
  { value: 'r', label: 'Right' },
  { value: 'b', label: 'Bottom' },
  { value: 'l', label: 'Left' },
]

function EdgePanel({ edge }: { edge: DwellEdge }) {
  const { updateEdge, checkpoint, deleteSelected, nodes, mode, setMode, reverseEdge, setEdgeSides, flows, setEdgesInFlow, createFlow } =
    useDwell()
  const from = nodes.find((n) => n.id === edge.source)
  const to = nodes.find((n) => n.id === edge.target)
  const presence = edge.data?.presence ?? 'both'
  const mine = edge.data?.flows ?? []
  return (
    <div className="insp">
      <h2 className="insp__title">Connector</h2>
      <p style={{ margin: 0, color: 'var(--muted)' }}>
        {from?.data.label ?? 'Unknown'} to {to?.data.label ?? 'unknown'}
      </p>
      <Field label="Label" htmlFor="e-label">
        <input
          id="e-label"
          className="input"
          value={edge.data?.label ?? ''}
          placeholder="Yes, No, High"
          onFocus={checkpoint}
          onChange={(e) => updateEdge(edge.id, { label: e.target.value })}
        />
      </Field>

      <Field label="Line">
        <Segmented<LineStyle>
          label="Line"
          fill
          value={edge.data?.line ?? 'step'}
          options={[
            { value: 'step', node: 'Elbow' },
            { value: 'curve', node: 'Curve' },
            { value: 'straight', node: 'Straight' },
          ]}
          onChange={(line) => {
            checkpoint()
            updateEdge(edge.id, { line })
          }}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Leaves from" htmlFor="e-from">
          <select
            id="e-from"
            className="select"
            value={edge.sourceHandle ?? 'r'}
            onChange={(e) => {
              checkpoint()
              setEdgeSides(edge.id, e.target.value, edge.targetHandle ?? 'l')
            }}
          >
            {SIDES.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Arrives at" htmlFor="e-to">
          <select
            id="e-to"
            className="select"
            value={edge.targetHandle ?? 'l'}
            onChange={(e) => {
              checkpoint()
              setEdgeSides(edge.id, edge.sourceHandle ?? 'r', e.target.value)
            }}
          >
            {SIDES.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <button className="btn btn--outline btn--wide" onClick={() => reverseEdge(edge.id)}>
        <ArrowsLeftRight size={16} weight="light" />
        Reverse direction
      </button>
      <p style={{ margin: 0, color: 'var(--muted)', fontSize: 12.5 }}>Drag either end of the line onto another step to reconnect it.</p>

      <hr className="insp__rule" />

      <Field label="Flows">
        {flows.length === 0 && <p style={{ margin: 0, color: 'var(--muted)', fontSize: 12.5 }}>No flows yet.</p>}
        <ul className="flowlist">
          {flows.map((f) => (
            <li key={f.id}>
              <label className="check">
                <input type="checkbox" checked={mine.includes(f.id)} onChange={(e) => setEdgesInFlow(f.id, [edge.id], e.target.checked)} />
                {f.name}
              </label>
            </li>
          ))}
        </ul>
        <button className="btn btn--outline btn--wide" onClick={() => createFlow('', [edge.id])}>
          New flow from this connector
        </button>
      </Field>

      <hr className="insp__rule" />

      <Field label="Appears in">
        <Segmented<Presence>
          label="Appears in"
          fill
          value={presence}
          options={PRESENCE_OPTIONS}
          onChange={(p) => {
            checkpoint()
            updateEdge(edge.id, { presence: p })
            if (p === 'future-only' && mode === 'current') setMode('future')
          }}
        />
      </Field>
      <p style={{ margin: 0, color: 'var(--muted)', fontSize: 12.5 }}>
        A route that only exists after automation stays hidden in Current. A current route that automation replaces is hidden in Future.
      </p>
      <button className="btn btn--outline btn--wide btn--danger" onClick={deleteSelected}>
        <Trash size={16} weight="light" />
        Delete connector
      </button>
    </div>
  )
}

function ManyEdges({ edges }: { edges: DwellEdge[] }) {
  const { flows, createFlow, setEdgesInFlow, deleteSelected } = useDwell()
  const ids = edges.map((e) => e.id)
  const [target, setTarget] = useState('')
  const [name, setName] = useState('')
  const flowId = target || flows[0]?.id || ''
  return (
    <div className="insp">
      <h2 className="insp__title">{edges.length} connectors selected</h2>
      <p style={{ margin: 0, color: 'var(--muted)' }}>Shift click connectors to build a path, then save it as a flow to highlight it later.</p>
      <Field label="New flow" htmlFor="m-name">
        <div className="flex gap-2">
          <input id="m-name" className="input" value={name} placeholder="Quick fix path" onChange={(e) => setName(e.target.value)} />
          <button
            className="btn btn--primary"
            onClick={() => {
              createFlow(name, ids)
              setName('')
            }}
          >
            Create
          </button>
        </div>
      </Field>
      {flows.length > 0 && (
        <Field label="Existing flow" htmlFor="m-flow">
          <select id="m-flow" className="select" value={flowId} onChange={(e) => setTarget(e.target.value)}>
            {flows.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn btn--outline btn--wide" onClick={() => setEdgesInFlow(flowId, ids, true)}>
              Add to flow
            </button>
            <button className="btn btn--outline btn--wide" onClick={() => setEdgesInFlow(flowId, ids, false)}>
              Remove from flow
            </button>
          </div>
        </Field>
      )}
      <button className="btn btn--outline btn--wide btn--danger" onClick={deleteSelected}>
        <Trash size={16} weight="light" />
        Delete connectors
      </button>
    </div>
  )
}

function Flows() {
  const { flows, edges, activeFlow, setActiveFlow, renameFlow, deleteFlow, checkpoint } = useDwell()
  const [editing, setEditing] = useState<string | null>(null)
  if (flows.length === 0) {
    return (
      <section style={{ display: 'grid', gap: 6 }}>
        <h2 className="insp__title">Flows</h2>
        <p style={{ margin: 0, color: 'var(--muted)', fontSize: 12.5 }}>
          A flow is a named path of connectors. Select a step and choose From here, To here or Through, or shift click several connectors and save them.
        </p>
      </section>
    )
  }
  return (
    <section style={{ display: 'grid', gap: 6 }}>
      <h2 className="insp__title">Flows</h2>
      <ul className="flowlist flowlist--rows">
        {flows.map((f) => {
          const count = edges.filter((e) => e.data?.flows?.includes(f.id)).length
          const on = activeFlow === f.id
          return (
            <li key={f.id} className={on ? 'is-on' : undefined}>
              {editing === f.id ? (
                <span className="flowrow__go">
                  <Crosshair size={16} weight="light" />
                  <input
                    className="input input--sm"
                    aria-label={`Name of ${f.name}`}
                    value={f.name}
                    autoFocus
                    onFocus={checkpoint}
                    onBlur={() => setEditing(null)}
                    onKeyDown={(e) => e.key === 'Enter' && setEditing(null)}
                    onChange={(e) => renameFlow(f.id, e.target.value)}
                  />
                </span>
              ) : (
                <button className="flowrow__go" aria-pressed={on} onClick={() => setActiveFlow(on ? null : f.id)}>
                  <Crosshair size={16} weight="light" />
                  <span>
                    <span className="flowrow__name">{f.name}</span>
                    <span className="flowrow__meta">{count} connectors</span>
                  </span>
                </button>
              )}
              <button className="btn btn--icon" aria-label={`Rename ${f.name}`} title="Rename" onMouseDown={(e) => e.preventDefault()} onClick={() => setEditing(editing === f.id ? null : f.id)}>
                <PencilSimple size={16} weight="light" />
              </button>
              <button
                className="btn btn--icon"
                aria-label={`Select the connectors in ${f.name}`}
                title="Select its connectors"
                onClick={() =>
                  useDwell.setState((s) => ({
                    nodes: s.nodes.map((n) => ({ ...n, selected: false })),
                    edges: s.edges.map((e) => ({ ...e, selected: !!e.data?.flows?.includes(f.id) })),
                  }))
                }
              >
                <ArrowsLeftRight size={16} weight="light" />
              </button>
              <button className="btn btn--icon" aria-label={`Delete flow ${f.name}`} onClick={() => deleteFlow(f.id)}>
                <Trash size={16} weight="light" />
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function Overview() {
  const nodes = useDwell((s) => s.nodes)
  const select = useDwell((s) => s.select)
  const setMode = useDwell((s) => s.setMode)
  const rf = useReactFlow<DwellNode, DwellEdge>()
  const savings = useMemo(() => topSavings(nodes), [nodes])
  const levers = useMemo(() => savedByLever(nodes), [nodes])
  const leverTotal = levers.reduce((a, b) => a + b.saved, 0) || 1
  const top = savings[0]?.saved ?? 1

  const go = (id: string) => {
    select(id)
    setMode('future')
    const n = rf.getNode(id)
    if (n) rf.setCenter(n.position.x + DIMS[n.data.kind].w / 2, n.position.y + DIMS[n.data.kind].h / 2, { zoom: Math.max(rf.getZoom(), 0.9), duration: 300 })
  }

  return (
    <div className="insp">
      <section style={{ display: 'grid', gap: 4 }}>
        <h2 className="insp__title">Where the time comes back</h2>
        <p style={{ margin: 0, color: 'var(--muted)', fontSize: 12.5 }}>Expected minutes saved per run, weighted by how often each step happens.</p>
        {savings.length === 0 ? (
          <p style={{ margin: '12px 0 0', color: 'var(--muted)' }}>
            No savings yet. Give a step a lower &ldquo;Takes after&rdquo; time and it will show up here.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, borderTop: '1px solid var(--line)' }}>
            {savings.map((s) => (
              <li key={s.id}>
                <button className="saving" onClick={() => go(s.id)}>
                  <span className="saving__name">{s.label}</span>
                  <span className="t t--saved">{fmtDelta(-s.saved)}</span>
                  <span className="saving__bar">
                    <i className="hatch" style={{ width: `${Math.max(3, (s.saved / top) * 100)}%` }} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {levers.length > 0 && (
        <>
          <hr className="insp__rule" />
          <section style={{ display: 'grid', gap: 6 }}>
            <h2 className="insp__title">Where the benefit is made</h2>
            <ul className="levers">
              {levers.map((l) => (
                <li key={l.lever}>
                  <span>{l.lever === 'ai' ? 'AI' : l.lever === 'automation' ? 'Automation' : 'Not set'}</span>
                  <span className="t t--saved">{fmtDelta(-l.saved)}</span>
                  <span className="saving__bar">
                    <i className={`lever-bar lever-bar--${l.lever}`} style={{ width: `${Math.max(3, (l.saved / leverTotal) * 100)}%` }} />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <hr className="insp__rule" />
      <Flows />

      <hr className="insp__rule" />

      <section style={{ display: 'grid', gap: 10 }}>
        <h2 className="insp__title">Shortcuts</h2>
        <dl className="dl">
          <dt>Show current</dt>
          <dd><kbd>1</kbd></dd>
          <dt>Show future</dt>
          <dd><kbd>2</kbd></dd>
          <dt>Tidy layout</dt>
          <dd><kbd>T</kbd></dd>
          <dt>Search catalogue</dt>
          <dd><kbd>/</kbd></dd>
          <dt>Undo, redo</dt>
          <dd><kbd>Ctrl Z</kbd><kbd>Ctrl Shift Z</kbd></dd>
          <dt>Duplicate</dt>
          <dd><kbd>Ctrl D</kbd></dd>
          <dt>Delete</dt>
          <dd><kbd>Del</kbd></dd>
          <dt>Select several</dt>
          <dd><kbd>Shift</kbd> drag</dd>
        </dl>
        <p style={{ margin: 0, color: 'var(--muted)', fontSize: 12.5 }}>
          Drag from the edge handle of one step to another to connect them. Handles appear when you hover a step.
        </p>
      </section>
    </div>
  )
}

function Many({ count }: { count: number }) {
  const { duplicateSelected, deleteSelected } = useDwell()
  return (
    <div className="insp">
      <h2 className="insp__title">{count} steps selected</h2>
      <p style={{ margin: 0, color: 'var(--muted)' }}>Drag to move them together.</p>
      <div className="grid grid-cols-2 gap-2">
        <button className="btn btn--outline btn--wide" onClick={duplicateSelected}>
          <Copy size={16} weight="light" />
          Duplicate
        </button>
        <button className="btn btn--outline btn--wide btn--danger" onClick={deleteSelected}>
          <Trash size={16} weight="light" />
          Delete
        </button>
      </div>
    </div>
  )
}

export function Inspector({ open }: { open: boolean }) {
  const nodes = useDwell((s) => s.nodes)
  const edges = useDwell((s) => s.edges)
  const reduce = useReducedMotion()
  const selNodes = nodes.filter((n) => n.selected)
  const selEdges = edges.filter((e) => e.selected)

  let key = 'overview'
  let body = <Overview />
  if (selNodes.length === 1) {
    key = selNodes[0].id
    body = <NodePanel node={selNodes[0]} />
  } else if (selNodes.length > 1) {
    key = 'many'
    body = <Many count={selNodes.length} />
  } else if (selEdges.length > 1) {
    key = 'many-edges'
    body = <ManyEdges edges={selEdges} />
  } else if (selEdges.length === 1) {
    key = selEdges[0].id
    body = <EdgePanel edge={selEdges[0]} />
  }

  return (
    <aside className="inspector" data-open={open} aria-label="Inspector">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={key}
          initial={reduce ? false : { opacity: 0, x: 6 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduce ? undefined : { opacity: 0 }}
          transition={{ duration: 0.14, ease: [0.23, 1, 0.32, 1] }}
        >
          {body}
        </motion.div>
      </AnimatePresence>
    </aside>
  )
}

export { fmt }
